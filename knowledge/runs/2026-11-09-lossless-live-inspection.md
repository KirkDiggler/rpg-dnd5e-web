# Run — 2026-11-09 — exact live and captured inspection

## Shipped

- Adopted the real v0.1.263 generated record binding and replaced approximate Struct decoding with the same lossless raw JSON parser used by captures — [R9 provider](https://github.com/KirkDiggler/rpg-api-protos/pull/426).

## Decided

- Refuse absent/malformed UTF-8/JSON or non-object raw payloads while keeping record identity, because a plausible deprecated Struct cannot restore exact evidence — [R9](https://github.com/KirkDiggler/rpg-project/pull/902).
- Keep the row-limit constant with the buffer so live decoding can share capture parsing without a runtime import cycle — [reader ownership](https://github.com/KirkDiggler/rpg-project/pull/902).

## Found

- New live decoding tests fail on the old Struct path and preserve9007199254740993, zero, false and empty strings on the raw path; malformed/missing controls never fall back to a valid Struct — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).
- Live and captured readers produce equal record values through the actual generated event type and shared integer-aware parser; existing symbol/cache/backlink/inspection tests remain — [#901](https://github.com/KirkDiggler/rpg-project/issues/901).

## Mistaken

- The provisional unsafe-number guard was only a refusal, not the exact-live implementation. It is replaced rather than retained as a competing decoder or claimed as fulfillment of R9 — [#902](https://github.com/KirkDiggler/rpg-project/pull/902).
