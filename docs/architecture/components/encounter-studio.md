# Encounter Studio

## Ownership

Encounter Studio is a presentation over `WorldBuildingConcept`'s document,
history, selection, gesture and persistence owner. It does not own a second draft
or implement monster rules. Load the UI/UX charter and this repository's
instructions; the detailed authoring contract is
[`world-building/CONTRACT.md`](../../../src/concepts/world-building/CONTRACT.md).

## Separate responsibilities

- **Site management:** one surface for world/reference/file opening and
  world/copy/file saving. Local browser recovery is not a world save. Play is
  separate navigation but retains save-before-launch semantics.
- **Cast management:** one member per monster ref found in templates, palette
  defaults or placements. Adding a standard monster or changing its cast label
  and look does not create a template. A zombie can look human without changing
  its rules identity.
- **Placed NPC:** one hex-bound instance with its own look, bindings and name.
  Removing it does not delete its cast member; Undo restores the whole placement.
- **Props:** retain their existing scene/free-placement controls, not NPC hex
  placement semantics.

Equipment and stat customization belong to separate rules contracts. The
advanced editor exposes existing capabilities; its presence does not imply the
toolkit can derive templates from every monster offered in a UI list. The
rulebook template-base registry is distinct from its monster constructors. Do not
repair a rejected template by silently changing its base.

## The studio loads whatever the engine runs

The studio loads whatever the engine runs: the dungeonspec compiler is the
validator; fields the studio does not author are preserved, never refused
(rpg-project#857). A dungeon file's unknown keys are set aside on read and the
export splices only the studio's changes into the file as read, so an
unedited Download or Save is byte-identical and an edit changes only its own
lines (`world-building/yamlSplice.ts`).

## Creature state recipes

Creature Behaviour and Factions share `StatesEditor`: the canonical `states:`
YAML, with explicit Apply/Cancel. A placement's recipe replaces its faction's
whole recipe; clearing it restores inheritance, then the engine's default.
The editor carries initial state, ordered transitions, scoped beats, guards,
acts and reasons. It does not execute a machine or infer what an NPC will do.

The document codec gathers recipe `pick` keys before reading tables. Custom
keys such as `march` use the same row vocabulary as `time`; unknown keys are
not globally enabled. Complete saves validate each creature's resolved recipe
against its layered table. Table controls and read-back include custom keys.
JSON recovery, YAML import/export and unrelated binding edits preserve recipes.

A state may carry a post (rpg-project#836, #852, #857): `blocks: true`, and
`holds: { door, at, against, pass }`. The Posts fields under the YAML edit
them: a blocks toggle, a door from the site's wall-bound and bound doors, the
post cells as `{ q, r }`, `against` (both, the default, writes no word), and
the pass fact. The server judges the door, the cells and the pass. A state
field or a `holds` field this codec does not read is carried as written, in the
draft as well as in the file. States and transitions keep the
author's key order, so an untouched recipe writes back exactly as it was read.

An option without `check` is a plain line, not an empty check. Its success rows
are carried without inventing a roll; a failure on a plain line is refused.

## Appearance and lifetime

`scene.creaturePalette` is editor metadata, not rulebook content. `ref` is monster
identity; optional `modelRef` is the default appearance family for new instances.
A placed declaration's optional `appearanceRef` is an exact appearance override.
The appearance catalog supplies looks, never monster identity or stats.

An absent appearance override uses existing standard-model resolution, when
available. An explicit unavailable ref remains explicit and is not substituted.
Custom templates without a standard model need an explicit appearance.

Imported sites can have looks on every placed creature and no cast defaults.
The placement picker offers those existing published looks without synthesizing
or persisting a default. The author commits the chosen look only by placing.
Changing defaults does not restyle old placements. A placement can be removed
without losing a cast member inferred from that last imported instance.

## Source map

| Concern                                         | Owner / entry                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Studio navigation and publishing composition    | `src/concepts/encounter-studio/EncounterStudioWorkspace.tsx`                                                         |
| Site presentation slot                          | `StudioSitePanel.tsx` in that directory                                                                              |
| File and world operations                       | `StudioDraftFile.tsx`, `StudioOpen.tsx`, `StudioPublish.tsx`; existing `useRoomPublishing` remains transaction owner |
| Cast list and appearance editor                 | `StudioCast.tsx`, `StudioCastAppearance.tsx`                                                                         |
| Placement look choices                          | `StudioCreaturePalette.tsx`, `NpcLookPicker.tsx`                                                                     |
| Derived cast and edits                          | `src/concepts/world-building/cast.ts`                                                                                |
| Editor recipe codec                             | `src/concepts/world-building/creaturePalette.ts`                                                                     |
| Document, selection, arming and mutation guards | `src/concepts/world-building/WorldBuildingConcept.tsx`                                                               |
| Selected noun intents / controls                | `world-building/studioArrange.ts`, `encounter-studio/StudioArrangePanel.tsx`                                         |
| Standard monster/model vocabulary               | `src/author/paletteData.ts`, `src/components/hex-grid/monsterModels.ts`                                              |
| Explicit appearance metadata                    | `src/npc-appearances/`, generated provider catalog                                                                   |

## Verification and continuing work

Use the [Studio verification guide](../../how-to/encounter-studio-verification.md)
and a disposable browser context against the real app. Tests must distinguish
new standard cast members from imported template members lacking defaults. Drive
the visible palette, then assert committed declaration ref/look, preserved scope
and Undo; owner-only calls do not prove that a button is enabled.

For persistence, cover imported/owned/reference destinations, key sharing,
overwrite cancellation, YAML roundtrip, and unchanged bytes on refusal. The
case files are [site management](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1327)
and [cast/placement](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1332),
including the imported-cast regression and operator acceptance.

Layout/2D placement, the selected-NPC presentation overhaul, and equipment/stat
customization are separate follow-ups, not claims made by this slice. Consult the
linked issues and actual code before extending those paths.
