# #912 class outfit colors evidence

This directory records the accepted normal-game proof for character-owned class outfit colors.

- `creation-gear-blue-red.png` — real Chrome creation preview for Half-Orc Fighter 16. The 680px modal shows blue primary and red secondary regions, preserved authored metal/skin/hair, and Gear Colors without inner overflow.
- `session-blue-red.png` — real Chrome normal-game session after finalization. Hopkins renders the same persisted outfit while encounter movement is present.
- `receipt.json` — source heads, screenshot hashes, exact RGB24 values, UI persistence, owner/roster equality, renderer-regression witnesses, pixel checks, final CI, and the human verdict.

## Result

The normal creation UI successfully persisted `#1A98FF` / `#D25151`. Live `GetCharacter` Appearance and Session roster Customization returned identical RGB24 values. A separate real-input Chrome probe changed the preview to `#FF00FF` / `#00FF00` and measured 7,775 magenta and 1,282 green body pixels with no shader/program errors.

The final synced-asset command passed:

```text
RPG_REQUIRE_SYNCED_CUSTOMIZATION_ASSETS=1 npm run ci-check
```

Human verdict: **“confirmed, it works and looks great”**.
