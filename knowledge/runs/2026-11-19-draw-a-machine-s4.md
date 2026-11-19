# Run — 2026-11-19 — draw a machine S4: the drawing reads a step's heard-claim condition

Slice [rpg-project#1012](https://github.com/KirkDiggler/rpg-project/issues/1012) of story [rpg-project#993](https://github.com/KirkDiggler/rpg-project/issues/993). Base: `rpg-dnd5e-web` `dev` at [`1359fc70`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/1359fc70). Branch `drawing-claim-s4`.

## Shipped

- **A step's heard claim is read.** `machineView` reads `{claim, held|failed, asks}` (encounter v0.222.2) into `step.claims`. The label says it in the engine's ids: `on heard: claim failed, topic admitted` — [commit 7148a39b](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/7148a39b4c0d9c99c30f36c1fe42d1dc520ba97a).
- **Every other read is read too.** Every connection on a `routine.wake` whose role is not a shape role (`from`, `to`, `on`, `picks`) is in `step.reads`, in the engine's order. In the label, a `wakes-on` read is its id (`guards-turned`, as before). Any other read is `<kind> <id>` (`claim failed`, `topic admitted`, `weather rain`).
- **The grouping key is conservative.** Every non-`wakes-on` read joins the key, sorted, as `role kind id`. A step with none keeps the edge id it always had, so no castle arrow's id moved except the captain's step on a lie.
- **A row keeps to the studio's width.** A gap whose full label would push its row past 1100 falls back to its short label, widest gap first. The full label stays the mark's tooltip. Without this, the captain's machine would have widened from 1051 to 1163 (pinned) or about 1199 (v0.222.2).

- **Review fixes.** A read the drawing does not know (an unknown role, or a known role on an unknown kind) is said with its role (`asks-not claim held`). A cut label carries the count of its reads (`on heard +2`), so the captain's lie arrow shows that it has a condition. The marker's width is in the gap floor, and the captain's machine is 1072 px wide.

## Decided

- **The label form is `<kind> <id>` for every read but `wakes-on`.** The claim then needs no word of its own (`claim failed` is the generic form), and a read the drawing does not yet know shows the same way. The role is not shown, but it is in the key.
- **The fixture is recorded, not invented.** `fixtures/engineReadBack.claimStep.json` is the one `routine.wake` at `captain-policy…in-hall.transitions[1]`. It comes from `readback.Of` at rpg-toolkit `rulebooks/dnd5e/encounter/v0.222.2` (a53258e4) on the toolkit's `dungeonspec/testdata/world-builder-v4-castle.yaml`. Its sentence is word for word the pinned one; the tag adds only the claim connection.
- **The Behaviours editor is untouched.** `MachineStateEdit` lists a state's steps from the file and shows the engine's sentence by path. It does not use the view's grouping.

## Found

- **The castle already asks a claim.** Issue 1012 says no castle machine uses the condition. The captain's `in-hall → back-to-gate` step on `heard` does (rpg-project#1000). rpg-api `dev` pins encounter v0.222.1, which says it in the sentence but not yet as a connection.
- **The drawing already dropped a read.** That same step carries `{topic, admitted, asks}`. The drawing read only `wakes-on`, so its label was a bare `on heard`. Its full label is now `on heard: topic admitted` (pinned) and `on heard: claim failed, topic admitted` (v0.222.2). After review, its drawn text is `on heard +1` (pinned) or `on heard +2` (v0.222.2), and its row is 21 px wider.
- **A connection carries no polarity.** A `not` keeps the connection it negates. `noted:` and `noted.anyone:` emit the same connection for `eq true` and `eq false`. Either way, opposite steps share a key, and the negative one's label is misleading. The web cannot tell them apart without reading the sentence. This is an engine follow-up.
- **Guard parts with no connection are invisible.** `heard.kind`, loudness, `flag`, `scope` and `rounds` emit no connection, so steps that differ only in one of them still merge. This is an engine follow-up.

## Verified

- Castle before/after: the ten castle machines laid out with the old and new code and compared. Only the captain's lie step changed: its edge label, piece label `full`, and piece id. Grouping, boxes, strokes and drawn text are identical.
- Mutants: dropping the reads from the key fails 4 tests; switching off the row fit fails 3.

## Not verified without a browser

- How the captain's drawing looks at the operator's width, and the tooltip on the arrow.
