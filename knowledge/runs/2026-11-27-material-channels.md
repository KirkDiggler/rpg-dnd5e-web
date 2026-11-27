# Run — 2026-11-27 — Courtyard S7 material-channel foundation

Slice [rpg-project#1192](https://github.com/KirkDiggler/rpg-project/issues/1192) of [Courtyard#867](https://github.com/KirkDiggler/rpg-project/issues/867).

## Shipped

- Shared channel value/copier and native metadata-retention wrapper are implemented; controls and captured rendering are not yet delivered — [slice](https://github.com/KirkDiggler/rpg-project/issues/1192).
- Adopted published SDKv0.1.293 from generated37f124a after operator merge of Protos456; source typing and84 focused/regression tests passed, not a complete Web-gate claim — [Protos#456](https://github.com/KirkDiggler/rpg-api-protos/pull/456).

- Added the pure effective-material arithmetic kernel; 104 focused/regression tests, eslint and typing passed. Material-owner wiring, controls and captured rendering remain unfinished — [plan T6](https://github.com/KirkDiggler/rpg-project/blob/design/material-channels/ideas/material-channels/plan.md#task-6-shared-arithmetic-with-existing-material-owners-t6).

- Added strict schema4 channel metadata reading, generation, pinned/preview projection and current-representation hash checks in preview staging;182 focused tests and typing pass. Published data stays on its existing pin with no live channels enrolled — [slice](https://github.com/KirkDiggler/rpg-project/issues/1192).

- Complete Web gate passed with the unchanged source restricted to two CPUs:11,834 passed/31 skipped,916 test files passed/1 skipped; configured assertions/timeouts stayed unchanged — [slice](https://github.com/KirkDiggler/rpg-project/issues/1192).

## Decided

- Default, Off and explicit positive multiplier remain distinct; native metadata is preserved while captured copies retain known facts only — [approved contract](https://github.com/KirkDiggler/rpg-project/pull/1189).
- Normal dev reconciliation retains upstream item/status work and the descriptor rename rather than recreating that fix in this feature — [upstream Web#1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).

- Resolve from immutable effective defaults, preserve normal signs/emissive tint, and reject results that overflow shader floats rather than clamp them; the kernel does not own or mutate material resources — [design R8](https://github.com/KirkDiggler/rpg-project/blob/design/material-channels/ideas/material-channels/design.md#law).

- One shared metadata parser serves Node and browser consumers; NPC preview staging receives the existing generated NPC authority instead of inventing body identities or reading a new registry — [design](https://github.com/KirkDiggler/rpg-project/pull/1189).

## Found

- SDKv0.1.293 includes the earlier npcDescriptor rename; adopting it on the old branch exposed six type errors until current dev was normally merged — [upstream Protos#457](https://github.com/KirkDiggler/rpg-api-protos/pull/457).

- The first complete run under heavy shared-host load had three15-second timeouts and a save-button readiness timeout; all four passed unchanged in isolation, and the complete two-CPU run passed. That first run is retained as failed, not relabeled green — [slice](https://github.com/KirkDiggler/rpg-project/issues/1192).

## Mistaken

- The first copier used Array.map, which skips sparse slots; a failing invalid-row test drove Array.from so every entry is validated — [T1 evidence](https://github.com/KirkDiggler/rpg-project/issues/1192).
