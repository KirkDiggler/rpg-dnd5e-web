# Equipment contract request — what the wire needs (rpg-dnd5e-web#531)

Produced by the fixture-first equipment concept (`/concepts` → Equipment).
Every type in `fixtures.ts` is written the way the web wants the wire to
look; this file enumerates the deltas. After Kirk's design review this
becomes the feature request to the platform team on board #19,
coordinating with rpg-project#94 (rules-side equip design) and
rpg-api-protos#183 (CharacterData gaps).

Boundary rule throughout: the web sends **References** and renders
**server-composed display fields**. No rules math client-side.

## 1. Equipment + inventory on the character (protos#183 gap)

`CharacterData` today carries no equipment or inventory. Needed:

- `equipped: map<string, Ref>` — slot key → item Reference (what's worn/
  wielded). Slot keys are opaque strings to the web.
- `inventory: repeated Item` — everything carried (equipped items may be
  included with a flag, or excluded; pick one and document it).

## 2. Equip/Unequip intent RPCs

Character-scoped (out of combat) and/or encounter-scoped (in combat — the
action-economy question is the toolkit's to answer; see rpg-project#94):

- `EquipItem { character_id, item: Ref, slot_key: string }`
- `UnequipItem { character_id, slot_key: string }`

Response / snapshot push carries the recomputed character (AC, damage
display, encumbrance if any). The concept's intent log shows exactly
these shapes being emitted.

## 3. Slot taxonomy as data

- `slots: repeated SlotDef { key, display_label, accepts: repeated string }`
  on the character (class/module-driven). The web renders whatever slots
  arrive — adding a slot must never require a web release.
- Per-item slot compatibility: `Item.slot_keys: repeated string` and
  `Item.kind: string` (weapon/shield/armor/gear — also open vocabulary).

## 4. Display-ready item fields

- `Item.name: string`
- `Item.stat_line: string` — server-composed (e.g. "1d8 slashing ·
  versatile", "AC 16 · heavy"). The web must never assemble this from
  rules data.
- `Item.icon_key: string` — reference key into the asset-owned manifest
  (keys-not-enums, per the web#523 props convention).

## 5. Server-computed effect display

After any equip change the server pushes recomputed values the sheet and
HUD display verbatim:

- AC with a composed note (e.g. "16 chain mail + 2 shield", "10 + DEX +
  CON (Unarmored Defense)") — the note is a server string.
- Main-hand damage display (including versatile/two-handed/off-hand
  variants — the fixture demonstrates all three).

## 6. Two-handed / occupancy semantics (server-side)

Equipping a two-handed weapon clears/blocks `off_hand`; equipping into an
occupied slot returns the occupant to inventory. The concept's fixture
reducer mimics these exact semantics as the acceptance spec — the real
implementation lives in the toolkit; the web only renders the resulting
snapshot.

## 7. Already-logged neighbor gap

Turn-start speed (for the movement depletion gauge) — recorded during the
combat-panel rounds (PR web#538 discussion); batch it with this request.

## 8. Delivery: equipment rides the encounter hydration, not a fetch

Round 2 added the in-combat popover (equipment chip on the dock), which
forces the delivery question. Position: **equipment/inventory must be on
the character data the encounter already hydrates** (the same
CharacterData the snapshot carries), with equip-change events pushed on
the encounter stream like any other state change.

Why not a CharacterService fetch on popover open:

- The popover must open instantly mid-combat — a fetch adds a spinner to
  a 200 ms interaction.
- A separate fetch is a second source of truth that can disagree with
  the encounter's view of the character (the #516/#544 class of bug).
- Spectators benefit too: allies' equipment can render from the same
  snapshot data with zero extra calls.

A standalone CharacterService surface can exist for out-of-encounter
sheet editing, but the in-encounter surface reads only hydrated state.
