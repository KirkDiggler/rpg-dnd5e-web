# Live verification: lobby dungeon picker (#662, rpg-project#131)

Driven via a Playwright script (`game-dev/tools/browser/`'s harness) against
a real `rpg-api` server built from `origin/dev` at the moment S1
(rpg-api#750, `PutDungeon` + shared registry) and S2 (rpg-api#752,
`dungeon_key` plumbing on `StartEncounter`) were both merged — **not** the
long-running `rpg-api` container, which predated both and would have
silently masked this slice's actual behavior.

## Server-side proof first (protocol level)

Before touching the UI, `ListDungeons` and `StartEncounter` were exercised
directly via `grpcurl` against the freshly-rebuilt container:

- `LobbyService/ListDungeons` returned the two embedded dungeons the
  compiled server now carries: `reference-tomb` ("The Tomb of the Captain")
  and `fog-lab` ("Fog Lab").
- A lobby was created and `StartEncounter` called with
  `dungeon_key: "fog-lab"` (a non-default key). `GetEncounter` on the
  resulting encounter showed a hex zone named `pillars` — a room id that
  only exists in `fog-lab.yaml` (`internal/content/dungeons/fog-lab.yaml`),
  not the default `reference-tomb`. This confirms `dungeon_key` reaches the
  orchestrator's key-resolution precedence end to end, independent of any
  UI bug.

## UI walk

Player identity: `qa-walker` (an already-finalized level-1 barbarian from
an earlier QA session — real characters only, per `CharacterCarousel`'s
`level > 0` filter). `player:qa-walker:lobby` was cleared in Redis first so
`GetMyActiveLobby` resume-after-refresh didn't short-circuit straight back
into a prior encounter.

1. Home → selected **QA Walker** → **Play** → **Create lobby**.
2. **I viewed this frame** (`dungeon-picker-open-662.png`): the party
   roster (host: QA Walker) with the new **Dungeon** dropdown open,
   populated with the exact two keys `ListDungeons` returned server-side —
   `Fog Lab` and `The Tomb of the Captain`. No hardcoded/stubbed data; this
   is the live `useListDungeons` hook rendering a real RPC response.
3. Selected **Fog Lab** (the non-default option).
   **I viewed this frame** (`dungeon-picker-fog-lab-selected-662.png`): the
   dropdown now shows `Fog Lab` as the selected value, with **Ready up**
   and **Start** visible below.
4. Clicked **Ready up**, then **Start** (host-only, all-ready gated —
   unchanged server-side behavior, no new client auth logic).
5. **I viewed this frame** (`dungeon-picker-encounter-started-662.png`):
   the encounter loaded into the free-roam scene showing the `fog-lab`
   pillar room (the same distinctive pillar layout confirmed via `grpcurl`
   above) — QA Walker's HUD in the corner (HP 8/14, AC 11, Barbarian). This
   is the `dungeon_key` selected in step 3 reaching `StartEncounter` through
   the real UI, not just the protocol-level proof in the previous section.

(Some GLB/texture 404s appear in the console during this walk — this
worktree's `public/models/synty/` assets aren't synced from
`rpg-game-assets`; unrelated to this slice, geometry still renders as
placeholder boxes/cylinders.)

## What this does not cover

Discord auth itself was not exercised (dev `?playerId=` override, per this
repo's documented local-dev pattern) — S3 adds no new auth logic, and
`StartEncounter`'s host-only/all-ready gating is unchanged pre-existing
server behavior.
