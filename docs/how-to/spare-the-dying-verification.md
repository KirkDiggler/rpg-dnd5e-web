# Spare the Dying web verification

Verified locally on 2026-09-13 against API PR #983 merge
`e72964ab54882454269d8387069280f762dab75f` and image digest
`sha256:1d4c560d46c490ee4c8e64557caf672daf1c8cfbc83e18e98cee0270e6ae8c37`.
The web consumes proto SDK `v0.1.190`, resolved commit
`efb300b87555caffef26c0d320c69539b3562dfc` (protos #334).

## Implementation

The existing Cast declaration and target-selection flow sends Spare the Dying.
`activation_result.stabilized` now produces an ordered Story result and explicit
Debug fields. Event identity includes source, target, before/after, unchanged HP,
and the complete optional progress graph, preserving zero counters and false flags.
An already-stabilized recipient produces a valid “remains stable” result.

Stabilization refreshes the authenticated owner's CharacterData and the public
Turn, Afford and View reads. It does not patch private data from public events.
The initiative row and owner status show Stable from the provider life state;
the waiting row no longer promises commands when that member's initiative arrives.
The client does not grant healing, infer life state from HP, suppress provider
declarations, or schedule a die for stabilization.

## Browser acceptance

Two disposable characters were copied from an existing local Cleric fixture,
with distinct owner identities and the provider's Spare the Dying cantrip ref.
This proves casting and reconciliation, not native creation or preparation.

- Caster: Mercy Stabilization, `spare-cleric-20260913`, owner `spare-web-cleric`.
- Patient: Robin Stabilization, `spare-patient-20260913`, owner `spare-web-patient`.
- Session: `a8825c81-b38a-47ec-993d-54bbf794ab7b`, Reference Tomb.
- Stack: isolated `cleric-bless-web`, API port 8180, web port 3012.

Both characters joined through the public lobby API and moved into combat using
public movement calls. Once both had initiative slots and were adjacent, fixture
setup set only the disposable patient's HP to zero and death-save state to one
success, one failure, not stabilized and not dead. The API was restarted to reopen
that state. No result or spell outcome was seeded.

1. In separate browser tabs, both players saw Robin's dying progress; Robin's
   own HUD read 0/10 HP. Mercy had the available Spare the Dying target and 2/2 slots.
2. The caster selected Spare the Dying and Robin in the production browser UI.
   Both tabs showed the cast followed by “Robin Stabilization is stabilized” and
   “0 HP (unchanged).” Stable replaced the initiative counters and appeared in
   Robin's owner status. No spell die or healing presentation appeared.
3. The action was spent (action offers reported 1 needed, 0 left); slots remained
   2/2. Owner data and public Turn both reported STABILIZED, zero successes and
   failures, successesNeeded=3, failuresRemaining=3, stabilized=true, dead=false.
4. Clicking End turn advanced through the monsters and Robin back to Mercy in
   round 2. Robin had no death-save offer or roll. Monsters attacked Mercy, so no
   subsequent damage changed Robin's stabilized state.
5. The browser cast was repeated against the already-stable Robin in round 2.
   Both tabs showed “Robin Stabilization remains stable,” still 0 HP, with no
   spell slot or die spent. End turn advanced through Robin to round 3 without
   any death-save event. Slots remained 2/2 and the complete progress stayed intact.
6. Reloading both tabs preserved Stable, 0/10 HP, and exactly one entry for each
   stabilization result. No duplicate narration or death-save narration appeared.

The caster's stabilization result sequences were 29 and 42; the patient's were
27 and 40. Sequence numbers are recipient-local. GetStory and owner-data captures,
plus screenshots, are in ignored `evidence/cleric-runtime/spare-*` files locally.
The fixture's out-of-band injury was first reconciled into a public Downed beat
after the first cast; that beat is preserved in delivered order, not relabeled as
a new injury or hidden by the client.

## Automated coverage and limits

Focused tests cover both before states, source/target narration, replay and
same-sequence deduplication/conflicts for every stabilization/progress field,
zero/false Debug values, no dice presentation, owner/turn/afford refresh, zero HP,
cleared pips, the stable waiting message and removal of the provider death-save
offer. The focused three-file run passed 135 tests.

Preparation, monster stabilization, timed natural recovery and behavior after
fresh damage remain outside this acceptance. No production deployment is claimed.
