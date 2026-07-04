---
name: PlaytestHarness
description: Dev-only verification harness for the v1alpha2 encounter stream — now with a clickable hex grid alongside the raw dev panel
updated: 2026-07-04
confidence: high — verified by reading PlaytestHarness.tsx + PlaytestMap.tsx and the vitest suite
---

# PlaytestHarness

`src/components/playtest/PlaytestHarness.tsx` — dev-only verification UI mounted at `?encounterId=…&playerId=…`. Drives the v1alpha2 encounter stream end-to-end so backend changes can be exercised without the full game UI.

The harness is **the** path Kirk uses to validate backend behavior between wave deliveries. The original harness was coordinate-input shaped (type Q/R/S into spinbuttons, type entity ids into target inputs). That worked for verifying RPC contracts but was too technical to use as the canonical playtest flow.

This file documents the **visual + dev panel** shape introduced 2026-05-18.

## View modes

Top toolbar exposes three modes; default is **Map + Dev panel** so backend visibility never disappears mid-verification:

| Mode                        | When to use                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Map + Dev panel` (default) | Normal verification. Drive the game by clicking the map; keep the event log + entity table visible to debug backend behavior.                      |
| `Map only`                  | UX demos. Hides the dev panel — just the visual layer.                                                                                             |
| `Dev panel only`            | No WebGL (low-end browser, screen-reader testing, or backend regression that needs raw event inspection). Mirrors the pre-visual-harness behavior. |

The choice is local component state; no URL persistence. Switching modes does not tear down the stream subscription or the local encounter state — both layers consume the same `useEncounterState` store.

## Visual layer — `PlaytestMap`

`src/components/playtest/PlaytestMap.tsx` wraps the existing `HexGrid` (from `src/components/hex-grid/`). It is the same Three.js / React Three Fiber map the production game routes use; the harness owns only the adapter, not the rendering.

### Adapter responsibilities

1. **Floor tiles from per-hex reveals.** The playtest accumulates v1alpha2 `revealedHexes: Set<string>` via the `GeometryRevealed` event; production game routes accumulate v1alpha1 `Room`-shaped `floorTiles` via `useDungeonMap`. `synthesizeFloorTiles` joins reveals + every entity's cell into the `Map<string, AbsoluteFloorTile>` HexGrid expects, with `roomId: ''` (the playtest does not track room-level reveal aggregation).
2. **RenderableEntity[] from v2 state.** v2 `EntityState` stubs carry only `entityId` + `position`; identity (CHARACTER/MONSTER + monsterRefId) and HP live in separate stores (`entityMeta`, `entityHP`). `buildRenderableEntities` joins all three.
3. **Click routing.** HexGrid's `onMoveComplete` / `onEntityClick` callbacks are forwarded to the harness, which translates to `moveEntity` / `takeAction` RPCs.

### Why not BattleMapPanel?

`BattleMapPanel` (the production wrapper) consumes `useDungeonMap`'s `DungeonMapState` and `mapEntitiesForRender` (which reads `entity.details` for name/type — fields the playtest's stubs do not populate). Synthesizing a fake `DungeonMapState` and decorating EntityState stubs with synthetic `details` would add more surface than the small adapter above. `PlaytestMap` uses `HexGrid` directly.

### Movement budget

Defaults to `30` ft for the path-preview overlay. The server is source of truth for the actual movement budget and will reject over-budget paths with the existing `moveError` surface; per `feedback_no_logic_in_web` the web does not compute the budget. The 30 ft default is just enough range for HexGrid to draw the in-range boundary and clip the path preview.

### isMyTurn semantics

`isMyTurn = mode === TURN_BASED ? activeEntityId === entityId : true`.

Outside TURN_BASED mode (FREE_ROAM or UNSPECIFIED) `isMyTurn` is forced to `true` so clicks dispatch. FREE_ROAM moves don't require an active turn server-side; suppressing them client-side would hide bugs. In TURN_BASED the server is still the gate — clicks dispatched outside the local player's turn surface as `moveError`.

## Click routing — harness-level handlers

| Map event                               | Harness handler                          | Result                                                                                                             |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Click hex (path preview lands)          | `handleVisualMove(path)`                 | `moveEntity(encounterId, entityId, path)` + log `VisualMove → (x,y,z) via N-step path`                             |
| Click monster entity                    | `handleVisualEntityClick(targetId)`      | Populates dev-panel attack-target input + dispatches `takeAction(attack, target)` + logs `VisualAttack → targetId` |
| Click character entity (including self) | `handleVisualEntityClick(targetId)`      | Logs `Selected …` — no RPC. Visual selection only.                                                                 |
| Click any entity after EncounterEnded   | `handleVisualEntityClick` (gated branch) | Logs `Selected … (encounter ended; no attack dispatched)` — no RPC.                                                |
| Click hex after EncounterEnded          | `handleVisualMove` (gated branch)        | No RPC, no log. The server would reject anyway; the courtesy gating prevents the error surface flashing.           |

The `attackTargetId` state is shared with the dev panel's existing "Target id" input. A visual entity click populates the dev panel input, which is helpful when cross-referencing the click landed on the intended entity.

## Dev panel layer

When `showDev` is true, the harness renders the pre-visual layout below the map:

- Entities table (id, type, HP, AC, x/y/z, ghost flag, **status**) — populated from `useEncounterState`
- Revealed hexes summary
- Move controls (Q/R/S spinbuttons + Move button) — still functional, useful for exact-coordinate verification
- Open door input + button
- Skill check prompt modal (Wave 2.9)
- Combat controls (Attack target id + Attack/End turn buttons; "Statuses (N)" summary for the local player)
- Recent events log (right column)

Both layers consume the same hooks; switching mode is a render-only toggle.

### Status effects + attack advantage/disadvantage (Beat 2, #430)

The entities table's **status** column renders every entity's active conditions (from
`useEncounterState`'s `entityStatuses`, populated by `StatusApplied` events) as icon+label badges,
e.g. `🏃 Dodging`, `🫥 Hidden`, `🙌 Helped`. Display metadata is resolved entirely web-side via
`src/utils/conditionIcons.ts`'s `getConditionDisplay(refId)` — keyed by the condition ref's `id`
string (e.g. `"dodging"`), never the wire's `StatusEffect.display_name`/`icon_hint`, which may be
empty (rpg-api does not author display strings — Invariant 2). This is the same lookup table
`onStatusApplied`'s log line and the `AttackResolved` combat-log line below both use — a single
ref-keyed source of truth, not three parallel ones.

The combat log's `AttackResolved` line appends `[advantage: <names>]` / `[disadvantage: <names>]`
when `has_advantage`/`has_disadvantage` are true, naming the granting/imposing condition(s) from
`advantage_sources`/`disadvantage_sources` (both `repeated Ref`, resolved through the same
`getConditionDisplay` lookup). These booleans and refs are copied verbatim from the toolkit's
resolved `AttackResult` at every hop (toolkit → rpg-api → wire) — the web never recomputes or infers
advantage/disadvantage from other fields (Invariant 1: web computes nothing).

## Test coverage

`src/components/playtest/PlaytestHarness.test.tsx` — 55 vitest cases. The new visual-layer coverage adds 13 cases under `visual harness — view-mode toggle + click routing`:

- View mode mount default + toggle to visual-only + toggle to dev-only
- Props passed to PlaytestMap (entityId, fallbackPosition, isMyTurn) including TURN_BASED active-actor branch
- Click hex → moveEntity RPC with full computed path
- Click hex after EncounterEnded → no RPC (courtesy gating)
- Click monster entity → takeAction RPC + dev-panel input populated
- Click self (character) → no attack, logs selection
- Click monster after EncounterEnded → no RPC, logs gating

`PlaytestMap` itself is mocked in the harness tests — the real component renders a Three.js Canvas which needs `ResizeObserver` (not available in jsdom). The mock exposes data-attributes for prop assertions plus stub buttons that simulate hex/entity clicks. The PlaytestMap's pure helpers (`synthesizeFloorTiles`, `entityTypeToDisplay`, `buildRenderableEntities`) are covered independently by `src/components/playtest/playtestMapHelpers.test.ts` (17 cases). This matches the pattern in `src/components/hex-grid/useHexInteraction.test.ts`: pure logic tested directly, WebGL rendering tested by manual + MCP playtest.

## Boundary rule compliance

The visual harness follows `feedback_no_logic_in_web` — no client-side game logic:

- Path computation runs in `useHexInteraction` (existing game-route hook); the hook is pure pathfinding and treats every cell as walkable except for client-derived "is blocked" checks (other entities + closed doors). The server is the authority on move legality; the hook only constrains what the click-to-move preview shows.
- `isMyTurn` derivation is a UX gate, not a game-rule gate. Outside TURN_BASED clicks dispatch; in TURN_BASED + my turn clicks dispatch; otherwise clicks are no-ops. Server rejects bad requests; the gate is courtesy UX.
- Movement budget defaults to 30 ft for preview purposes only. Real budget enforcement is server-side.
- Monster vs character entity classification reads `entityMeta.type` from server events; the web never infers type.

## Known limitations

- **No door interactions on the map.** Doors are still opened via the dev-panel input + button. The playtest does not track v1alpha1 `DoorInfo` (the v2 stream emits `DoorOpened` events with only the door entity id; the harness applies them to `openDoors: Set<string>` but doesn't synthesize a `DoorInfo[]` for HexGrid's `onDoorClick`). Adding door click support requires either accumulating a `DoorInfo[]`-equivalent on the v2 stream or extending HexGrid's door surface.
- **Reaction modal not wired.** The v1alpha2 reaction UI (rpg-dnd5e-web#408, currently held open) is on a separate branch. When #408 merges to main, the reaction modal + ready-reactions panel will naturally compose with the visual layer (both render inside the dev panel; modal is a `pendingPrompt`-driven branch).
- **No turn-order overlay** on the playtest map. `HexGrid` accepts a `combatState` for the turn-order carousel; the playtest currently passes `null` because we don't have a v1alpha1 `CombatState` shape. Could synthesize one from `initiativeOrder` + `activeEntityId` if/when useful.
