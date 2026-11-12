# Run — 2026-11-08 — symbol-backed machine inspection reader

processed: 2026-11-12T165555Z

## Shipped

- Implemented the playtest reader for captured configuration/decision/work records and schema1 API JSONL captures; lossless live transport awaits the reviewed R9 proto's publication and consumer adoption, and nothing is released — [Machine inspection S3](https://github.com/KirkDiggler/rpg-project/issues/901).

## Decided

- Keep symbol records independently of the500-row visible ring, and retain available backlinks needed by visible rows; missing older decisions remain explicit rather than creating an unbounded second client log — [R6](https://github.com/KirkDiggler/rpg-project/pull/902).
- Render machine guard verdicts, role dispositions, existing picker evidence and execution status as separate layers; show configured actions/tables without reevaluating them — [R2–R4](https://github.com/KirkDiggler/rpg-project/pull/902).
- Parse captured JSON through the existing YAML JSON schema with integer preservation, after strict JSON grammar validation; render wide integer evidence without conversion to zero or rounded numbers — [R9 evidence](https://github.com/KirkDiggler/rpg-project/pull/902#issuecomment-6727648247).
- Fail closed on precision-unavailable live Struct values until R9 raw-byte adoption is available; this is provisional safety, not adoption of the limited-live option — [R9](https://github.com/KirkDiggler/rpg-project/pull/902#issuecomment-6727648247).
- Refuse malformed/unsupported/mixed-session/conflicting captures, bound imports to32MiB with an explicit refusal, and keep start/gap/end notices visible; a drained export is not complete prior history — [R6–R8](https://github.com/KirkDiggler/rpg-project/pull/902).

## Found

- Independent review W1 is addressed by an own-property/scalar-kind check: missing, null, object, array, fractional or precision-unsafe observations are unavailable; actual0/false/empty/bigint values remain. The real capture with its observed0 removed fails before the fix and reports incomplete evidence afterward — [finding](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1400#discussion_r4508583004).
- Real isolated API capture fixtures include exact configurations, linked weighted picks, partial/completed work and an investigation deferring retained patrol work. Fixture preparation used one actual attack (11,total16,damage4); it is boot/fixture evidence, not the final QA walk — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).
- Focused tests cover symbols beyond the row window, reconnect context, exact captured integers and rolls, original definitions, unknown/rejected/unvisited guards, unavailable symbols, capture import/return-to-live, and server-disabled access without an infinite reconnect loop — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).

## Mistaken

- Known/scalar flags were trusted without checking that a value existed; formatting undefined invented null. The reviewer reproduced it in the actual captured fixture, and the focused regression now distinguishes missing evidence from a recorded value — [W1](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1400#discussion_r4508583004).
- The existing feed mutated previously published row arrays, making memoized readers stale. A RED→GREEN snapshot test now pins fresh arrays and unchanged prior snapshots — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).
- The existing table reader treated captured bigint values as zero; a literal wide-roll/load regression fails without the numeric-union rendering change — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).
- A missing guard operand could have printed as implicit null; malformed guard symbols now refuse rather than inventing that value — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).
- A fixture browser driver waited for the first canvas even when that canvas was hidden. The diagnostic showed only expected StrictMode aborts and a valid active run; selecting a visible canvas corrected setup before any attack was attempted — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).
