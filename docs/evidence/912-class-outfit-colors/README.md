# #912 class outfit colors evidence

This directory records the accepted normal-game proof for character-owned class outfit colors.

- `creation-gear-blue-red.png` — real Chrome creation preview for Half-Orc Fighter 16. The 680px modal shows blue primary and red secondary regions, preserved authored metal/skin/hair, and Gear Colors without inner overflow.
- `creation-four-class-mask-proof.png` — compact real-Chrome proof that the fixed Barbarian 01, Fighter 16, Monk 08, and Rogue 10 creation bodies all expose nonzero primary and secondary provider regions.
- `session-blue-red.png` — real Chrome normal-game session after finalization. Hopkins renders the same persisted outfit while encounter movement is present.
- `receipt.json` — source heads, screenshot hashes, exact RGB24 values, UI persistence, owner/roster equality, renderer-regression witnesses, pixel checks, final CI, and the human verdict.

## Result

The normal creation UI successfully persisted `#1A98FF` / `#D25151`. Live `GetCharacter` Appearance and Session roster Customization returned identical RGB24 values. Real-input Chrome probes changed the preview to `#FF00FF` / `#00FF00`; all four fixed classes produced nonzero primary/secondary body pixels with no shader/program errors.

The final synced-asset command passed:

```text
RPG_REQUIRE_SYNCED_CUSTOMIZATION_ASSETS=1 npm run ci-check
```

Human verdict: **“confirmed, it works and looks great”**.
