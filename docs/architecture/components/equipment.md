---
name: equipment
description: The equipment chip + popover on the live game screen — wire-shaped components shared with the /concepts bench
updated: 2026-07-22
confidence: high — verified by reading the components/hooks in full and by a live MCP playtest against a running rpg-api/rpg-toolkit stack
---

# Equipment (rpg-dnd5e-web#571)

The equipment chip + popover on `EncounterDock`, letting a player equip/
unequip mid-run and see server-computed AC/damage update. Originated as
the `/concepts` fixture-first bench (rpg-dnd5e-web#531/#557 — see
[concepts-route.md](concepts-route.md) and `src/concepts/equipment/
CONTRACT.md`), then promoted to production once the wire contract landed
(`rpg-api-protos#188`, `rpg-toolkit#812`, `rpg-api#682`).

## Where things live

Production components: `src/components/game/equipment/`

- `equipmentTypes.ts` — `RefLike`/`SlotDefLike`/`ItemLike`/`EquippedMap`/
  `EquipIntent`, matching the wire's `Ref`/`SlotDef`/`Item`/
  `CharacterData.equipped` field-for-field (not imported proto classes —
  a thin interface `/concepts` can satisfy with plain fixture data, no
  proto message construction needed). Also `resolveIconUrl` (manifest key
  -> URL, or `undefined` for a graceful no-icon fallback) and
  `targetSlotFor` (UI affordance: which slot an inventory-row click
  targets — prefers an empty compatible slot, else a swap).
- `EquipmentSlots.tsx` — the worn/wielded picture, one HUD-framed socket
  per `SlotDef`. Click an occupied socket -> `UnequipItem` intent.
- `InventoryLight.tsx` — the carried-items list (a compact list, not a
  grid). Click an equippable row -> `EquipItem` intent targeting
  `targetSlotFor`'s pick.
- `EquipmentPopover.tsx` — composes the two above plus the AC/damage
  readout header. Fully prop-driven: no fixture dependency, no internal
  equip-simulation state — the caller owns `equipped`/`items`/`slots`/
  `armorClass`/`mainHandDamage` and reacts to `onIntent`.

Concept bench: `src/concepts/equipment/fixtures.ts` (typed to the same
`equipmentTypes.ts` interfaces) + `EquipmentConcept.tsx` (imports the
production `EquipmentSlots`/`InventoryLight` directly, feeds them
fixtures, and adds the concept-only cast switcher + intent log).
`src/concepts/combat-panel/ComfortBar.tsx` (round-1 IA bench) also
imports the production `EquipmentPopover` with its own small
"plays-the-server" local state — same promotion, different concept page.

Wire client: `src/api/client.ts`'s `characterV2Client`
(`dnd5e.api.v1alpha2.character.CharacterService` — distinct from the
v1alpha1 `characterClient` used by character creation/sheet, unrelated
proto package). Hooks: `src/api/useEquipItem.ts` / `useUnequipItem.ts`,
one file per verb, mirroring `useTakeAction`/`useInteract`.

## Live wiring

`EncounterView.tsx`:

- `characterEquipmentFrom(data: CharacterData)` projects the wire's
  `equipped`/`inventory`/`slots`/`armor_class_detail`/`main_hand_damage`
  into the local `CharacterEquipment` shape (see
  [use-encounter-state.md](use-encounter-state.md#equipment-rpg-dnd5e-web571)).
  It's a projection, not a conversion — every field passes through
  verbatim — except one defensive step: `Item.ref` is optional on the
  wire (proto3 sub-message field) but `ItemLike.ref` is required, so
  ref-less items are filtered out (no real server response omits it;
  this only guards a hand-built/partial `CharacterData`). The
  `equipped`/`inventory`/`slots` fields themselves default to `{}`/`[]`
  rather than throwing if a caller omits them entirely — a real bug this
  guards against: the reconnect-badge regression test in
  `EncounterView.test.tsx` (asserts status badges, not equipment) builds
  its snapshot entity with a bare-minimum `CharacterData` missing every
  equipment field, and exercising it without these defaults threw inside
  `onSnapshotDelivered` before the badge assertion ever ran. That test
  proves the defaults prevent the crash; it does not assert on equipment
  output itself — see `useEncounterState.test.ts`'s "snapshot equipment
  hydration" and `applyCharacterEquipment` suites for that.
- Called from both `onSnapshotDelivered` (batch hydration) and
  `onEntityAppeared` (live), keyed on `entity.data.case === 'character'`.
- `handleEquipIntent(intent)` calls the real `EquipItem`/`UnequipItem` RPC
  with `entityId` as `characterId`, then calls
  `encounterState.applyCharacterEquipment(entityId, characterEquipmentFrom(response.character))`
  on success. **Never gated on `isMyTurn`/`combatEnabled`** — equip is
  character-scoped, out of combat (protos#187); encounter-scoped equip
  with an action-economy cost is deferred to rpg-project#94.

`EncounterDock.tsx`:

- New props: `equipment: CharacterEquipment | undefined`,
  `onEquipIntent`, `equipLoading`.
- The chestplate chip (matching `ComfortBar`'s icon) renders only when
  `equipment` is defined — hidden entirely for non-CHARACTER entities or
  before the first snapshot resolves `entityId`, never a broken/empty
  popover.
- One-panel policy: opening the equipment popover hides the floating
  combat log (both anchor bottom-right); the log's own open/hidden
  preference is untouched and restores the instant the popover closes.

## Scope decisions

- **No live push to other clients.** `EquipItem`/`UnequipItem` are
  character-scoped RPCs with no stream event for their effect — only the
  acting client sees the update (via its own RPC response). Spectators
  and other players see the change on their next snapshot. Tracked as
  rpg-api#681.
- **Icons degrade gracefully, by necessity.** The server sends `icon_key`
  empty today (rpg-api#680 Scope-decision: no toolkit/asset-manifest
  source exists yet for a bare sprite key) — verified against a live
  server during the #571 playtest. `src/utils/itemIcons.ts` (rpg-dnd5e-web
  #576) closes most of that gap web-side: `getItemIconUrl(ref, iconKey)`
  resolves a non-empty wire `iconKey` first (unchanged `resolveIconUrl`
  behavior — a future manifest key always wins), else looks `ref.id` up
  in the exhaustive 38-weapon+13-armor `ITEM_ICONS` map, then the small
  non-exhaustive `SUPPLEMENTAL_ITEM_ICONS` map (ammo/pack ids with no wire
  enum), else returns `undefined`. Every icon render stays conditional on
  that `undefined` (never a broken `<img>`) plus the existing `onError`
  fallback for a path that resolves but 404s. See rpg-project's
  `ideas/equipment/item-icons/design.md` for the full coverage boundary
  and tier rationale (dedicated/approximate/generic — recorded metadata,
  not rendered in v1).
- **No drag-and-drop, encumbrance, or stacking** — per the `/concepts`
  bench's original scope decisions (CONTRACT.md), unchanged by
  promotion.

## Tests

- `src/utils/itemIcons.test.ts` — exhaustiveness over the 38+13 canonical
  ids, entry validity, tier-representative resolution, wire override,
  supplemental resolution, unknown-id fallback.
- `src/api/useEquipItem.test.ts` / `useUnequipItem.test.ts` — RPC request
  shape, loading/error state, mirroring `useTakeAction.test.ts`.
- `src/components/game/equipment/{EquipmentSlots,InventoryLight,EquipmentPopover}.test.tsx`
  — prop-driven rendering, intent emission, icon fallback, `busy` gating.
- `src/hooks/useEncounterState.test.ts` — snapshot/appear equipment
  hydration, `applyCharacterEquipment` (including the `entityAC`
  refresh), preservation across entries/characters.
- `src/components/game/EncounterDock.test.tsx` — chip visibility,
  popover open/close, intent forwarding, turn-gating independence,
  one-panel policy with the floating log.
- `src/concepts/equipment/fixtures.test.ts` — the `applyIntent`/
  `targetSlotFor` occupancy-semantics acceptance spec (CONTRACT.md §6),
  now against `EquippedMap`'s `Record<string, RefLike>` shape.
