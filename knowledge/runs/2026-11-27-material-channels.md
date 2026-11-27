# Run — 2026-11-27 — Courtyard S7 material-channel foundation

Slice [rpg-project#1192](https://github.com/KirkDiggler/rpg-project/issues/1192) of [Courtyard#867](https://github.com/KirkDiggler/rpg-project/issues/867).

## Shipped

- Shared channel value/copier and native metadata-retention wrapper are implemented; controls and captured rendering are not yet delivered — [slice](https://github.com/KirkDiggler/rpg-project/issues/1192).
- Adopted published SDKv0.1.293 from generated37f124a after operator merge of Protos456; source typing and84 focused/regression tests passed, not a complete Web-gate claim — [Protos#456](https://github.com/KirkDiggler/rpg-api-protos/pull/456).

## Decided

- Default, Off and explicit positive multiplier remain distinct; native metadata is preserved while captured copies retain known facts only — [approved contract](https://github.com/KirkDiggler/rpg-project/pull/1189).
- Normal dev reconciliation retains upstream item/status work and the descriptor rename rather than recreating that fix in this feature — [upstream Web#1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).

## Found

- SDKv0.1.293 includes the earlier npcDescriptor rename; adopting it on the old branch exposed six type errors until current dev was normally merged — [upstream Protos#457](https://github.com/KirkDiggler/rpg-api-protos/pull/457).

## Mistaken

- The first copier used Array.map, which skips sparse slots; a failing invalid-row test drove Array.from so every entry is validated — [T1 evidence](https://github.com/KirkDiggler/rpg-project/issues/1192).
