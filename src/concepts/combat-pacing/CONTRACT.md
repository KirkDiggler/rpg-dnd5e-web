# Combat-pacing contract log — evidence, not asks yet (rpg-dnd5e-web#561)

Produced by the fixture-first combat-pacing concept (`/concepts` →
Combat Pacing). Borrows `src/concepts/equipment/CONTRACT.md`'s
STRUCTURE (numbered observations, each with a why) — but unlike that
file (which is already ask-shaped because it was committed AFTER Kirk's
review confirmed real gaps), THIS file records evidence, observations,
and candidate gaps during the concept, before any such review — it is
explicitly NOT a pre-authored feature request. Filing anything on the
Platform lane of board #19 happens only after Kirk reviews this concept
and confirms a candidate is a real, scoped need (design.md §6 intro) —
at which point a LATER revision of this file would read like the
equipment one does today.

Almost all of round one is client-side and fixture-driven — there is
nothing to ask the platform team for yet.

## 1. Correlation/cardinality/completeness (candidate, not a request)

The event spine supports several real shapes, and this concept's
fixtures are deliberately authored to match each one rather than assume
a single fixed triple (design.md §"What we know about the wire"):

- A declared strike: `ActionResolved` → `AttackResolved` → `EntityDamaged`
  (hit only — a miss has no damage event at all).
- An opportunity attack: `AttackResolved` (+ optional `EntityDamaged`),
  with **no** `ActionResolved` — the `opportunity-attack` fixture
  (`fixtures.ts`) models exactly this shape.
- A non-attack `ActionResolved` (dodge, dash, potion, …) can have no
  attack event at all — not exercised by a round-one fixture (round one
  is attack-only per design.md §7's case list), flagged here as a gap in
  fixture COVERAGE, not a wire gap.
- No documented, universal completion marker for a correlation group —
  only the actor-only, TakeAction-only `TurnStateChanged` that can
  incidentally close a declared strike's group. This concept's own
  `groupByCorrelation` (`fixtures.ts`) sidesteps the question entirely by
  relying on a closed, authored fixture list — explicitly a
  scenario-boundary convenience, NOT a production reassembler (design.md
  §7's own caveat). Whether `TurnStateChanged` is reliable enough for a
  REAL reassembler to build on is exactly what a later round's
  CONTRACT.md work would need to verify against live behavior — this
  round observes nothing new here beyond what design.md already logged.

## 2. The dispatch layer discards the envelope (already-logged, re-confirmed)

`dispatchEncounterStreamEvent` (`src/api/encounterStreamDispatch.ts`)
passes only `payload.value` to each callback — `correlation_id`,
`sequence`, and `timestamp` on `EncounterEvent` are dropped before they
reach any combat callback. Real, observed, **not a round-one
prerequisite** — round one plays fixtures, not the live stream, so
nothing here blocks the concept (design.md §6.2). This concept's own
`PacingFixtureEvent` type (`fixtures.ts`) carries `sequence`/
`correlationId` precisely so a future reassembler round has a fixture
shape to promote against once this dispatch gap is closed.

## 3. Roll-metadata gaps (flag, don't ask yet)

- `AttackResolved` already carries everything this concept's beat
  sequencer needs (`attackRoll`, `attackBonus`, `targetAc`, `hit`,
  `critical`, `hasAdvantage`/`hasDisadvantage` + source refs) — no gap
  here, confirmed by this concept's own fixture types matching the wire
  field-for-field with zero invented fields.
- **Not** carried: raw damage-dice faces (`EntityDamaged.damage_breakdown`
  is by source, not by die). Not relevant round one (d20-only, design.md
  "Decided this revision") — `EntityDamagedLike` in this concept
  deliberately has no per-die breakdown field.
- **Not** carried: the discarded die on advantage/disadvantage. Flag
  only, not asked for — this concept's `advantageSources`/
  `disadvantageSources` fixture fields already match what the wire DOES
  carry; showing the dropped die itself is future work (design.md §6.3).

## 4. Do NOT ask for two-phase (roll-started/roll-resolved) events

Restated from design.md §6.4: true two-phase rolls would double event
volume, add server-side hold-and-emit-twice latency, and buy nothing in
co-op (no player has secret information anyway). This concept's entire
beat model is built as theater over an already-resolved event
specifically to avoid needing this — every fixture's `AttackResolved`
already carries a final, resolved roll.

## No Platform issue filed

Nothing above is a request. It restates design.md §6's candidates in the
numbered-with-a-why STRUCTURE the equipment concept's (now-ask-shaped)
CONTRACT.md uses, adding only the concrete confirmation that this
concept's own fixture/hook/component code needed no invented wire field
to build the round-one bench — filing anything on Platform's board-#19
lane happens only after Kirk reviews this concept, at which point this
file's next revision would read like the equipment one does today.
