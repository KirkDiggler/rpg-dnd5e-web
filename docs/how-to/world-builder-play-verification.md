# World Builder single-room Play verification

Issue #1112 / PR #1116; approved contract in rpg-project#169.

## Boundary

World Builder Rooms owns complete RoomDraft v3 authoring. The room document
wrapper is v2; canonical dungeon YAML is separately v3. Old local v2/v1 bytes
are upgraded explicitly and preserved. Invalid current records never silently
fall back or get autosaved over. Prop compositions remain their own mode.

Room setup markers snap to hexes; scenery stays freely positioned. Publishing
uses existing AuthoringService validation/save and the Home-selected character's
existing create-lobby → ready → start-encounter flow. The key belongs to canonical
YAML, not the room draft. Overwriting an existing key requires explicit intent.
Server errors leave the draft intact. Request ownership includes source, key,
room, character and client; stale continuations cannot save or launch new state.

The session atlas names the dungeon it was launched from (dungeonKey); the play
view fetches that authored file by key through GetDungeon and reads the room out
of it with the World Building codec (rpg-project#479). No key, or a dungeonspec
(v2) dungeon, is legacy and draws exactly what it drew before. A single-room file
this build cannot read whole, and a key whose file cannot be fetched, are visible
refusals, never a fallback. Shared prop/floor/light renderers retain full poses,
relationships and grounded height. Authored rooms suppress duplicate legacy
scenery/shell walls and editor guides. Actual actors/visibility and rules remain
session-owned.

## Local integrated evidence (2026-09-17)

A separate test stack used API PR1004 head423e7cd8 with encounter v0.87.0,
session v0.94.0 and published proto artifacts; existing user environments were
not restarted or reset.

- A real Human Fighter was created through the normal browser creation flow,
  not inserted as a raw character/Redis fixture.
- Read the existing saved authoring room without changing it:18 props,4 groups,
  139 painted cells. Imported its complete room JSON into the candidate, placed
  a party start and skeleton through real controls/canvas clicks, validated and
  used Save & Play. Scene/frame/workspace in member GetAtlas matched the saved
  source exactly; all rendered assets loaded without page/model errors.
- Game UI movement changed the character's position. The skeleton used its
  default Shortsword opportunity attack, visible in actual story/dice output.
- A public Move intent crossing the declared altar footprint was refused by the
  server, naming the contributor; there was no partial move. Moving around it
  then behind it changed the skeleton's sighting from current/sight to held/no
  current channel. No mesh-derived blocking was added: the room's other visual
  walls kept their actual authored flags.
- Saving a changed authoring source affected future launches only. The running
  atlas stayed identical. Restarting only the isolated API and reloading the
  browser resumed the same encounter, original full scene and moved position.

The walk caught two bugs which now have regressions: StrictMode effect replay
must restore useSaveDungeon's live lifetime (while retiring old requests), and a
canonical room must not display the hardcoded legacy Reference Tomb caption.
Earlier M1 browser proof caught raw skinned cloning; setup markers now reuse the
existing skeleton-safe ClassCharacterModel.

Private local receipts/screenshots are under game-dev's
`.runtime/local/dungeon-playtest/evidence/`; model bytes and the user's actual
room export are not committed here. M1's separate pinned setup preview evidence
is under `.runtime/local/dungeon-authoring/setup-preview/evidence/`.

## Limits

This is one real-character/monster full-room walk, not multiplayer, doors,
loadout editing, theme selection or height physics acceptance. Rich supported
lights and generated/legacy leaf combinations have focused fixture tests; the
copied room itself was not modified to add lights. Normal full CI and the
independent feature review are recorded on the PR. No merge/deployment authority
follows from this proof.
