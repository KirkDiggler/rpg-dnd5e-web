# Shared-table dice contract log — evidence, not asks yet (web #826)

This file records what the fixture-first shared-table feel lab can demonstrate.
It is deliberately in **evidence-not-asks** form, following
`src/concepts/combat-pacing/CONTRACT.md`. Nothing here is a Platform request, a
production transport contract, or proof that the candidate feels fun.

The reproducible concept route is
`/?concept=attack-die-3d&attackDieStage=tray`. Kirk's live feel gate remains
pending until he throws the candidates himself.

## 1. Fixture roll truth (concept evidence, not a production contract)

`sharedTableDiceFixtures.ts` authors complete attack/damage groups with original
faces, final faces, reroll steps, ordered modifiers, verdict labels, impact
labels, and supplied final totals. The stage passes those facts through the
shared `DiceTrayPresentation` roll-group mode. It does not derive a face, hit,
critical, damage amount, or resource consequence.

The scenarios cover a single d20, a mixed-contributor Bless roll, ordinary and
critical damage, Great Weapon Fighting rerolls, duplicate/missing delivery,
reduced motion, and provider failure. These fixtures are examples for reviewing
presentation behavior; they do not establish API cardinality or authorize the
web client to calculate game rules.

## 2. Local release scheduling (concept evidence, not a transport ask)

The Roller can emit one local fixture release. The Witness consumes the same
frozen event list and has no release control. `sharedTableDiceDelivery.ts` is
the sole owner of the missing-release grace timer; it emits one neutral fixture
release after 3,000 ms and cancels that timer on a real release, reset, replay,
or unmount. The duplicate exercise proves a second release is rejected locally.

This is simulated delivery for feel review. It makes no claim about production
streaming, reconnect, ordering, persistence, latency, or server ownership.

## 3. Two-witness completion and attachment evidence

Both literal `DiceTrayPresentation mode="roll-group"` instances report their
own renderer generation. `sharedTableDiceState.ts` advances only after exact
presentation/group/generation completions from both Roller and Witness. A timer
never substitutes for either rendering completion.

The separate `window.__sharedTableDiceEvidence` bridge publishes only a
monotonic revision plus presentation, group, witness, renderer-generation, die,
projected rendered anchor, held-pose, and frame-sequence facts. Scenario change,
candidate change, replay, and unmount clear its generation fences. It contains
no pointer samples, result/damage facts, URLs, Canvas/WebGL objects, or renderer
resources. This is a development measurement surface, not production telemetry.

## 4. Contributor sets (concept evidence, not identity/loadout ownership)

The fixture names Aria and Bram and maps their contributed dice to the Obsidian
and Ivory carved treatments. This demonstrates mixed contributors and stable
set appearance during one authored roll group. It does not claim Discord member
resolution, character ownership, inventory, equipped-set projection, asset
entitlement, or persistence.

## 5. Non-d20 assurance is explicitly provisional

The lab labels non-d20 assets **Provisional non-d20 assets**. They are sufficient
to review group spacing, mixed shapes, reroll cues, modifier toast timing, and
supplied totals. They are not final art approval, a provider-manifest guarantee,
or evidence that every engraved face has passed the Original d20's Stone 0/1
asset gate.

## No Platform issue or production contract claimed

The stage is fixture data plus local scheduling around an existing shared UI
boundary. No Platform issue is filed from this document, and no production API,
session, combat, generated-proto, or network-client dependency is introduced.
Any ask must follow live review and a separately scoped production decision.

**Kirk feel gate: pending live review.**
