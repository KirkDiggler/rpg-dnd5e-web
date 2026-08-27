# Crypt shell leaf registration — issue #828

Public-safe evidence summary for the approved closed crypt door registration. Raw
capture records and runtime identifiers are intentionally excluded.

## Scope and verdict

- Issue: https://github.com/KirkDiggler/rpg-dnd5e-web/issues/828
- Base: `origin/dev` at `548f561bf8ddab41da53a174e5b69a08358b11e1`
- Provider review: `rpg-game-assets#68`
  - reviewed head: `2facea936b47dd0a5750668be6bfa9a664bcc71d`
  - reviewed-and-merge tree: `46e41c26e39f0b1434e1282379bd2cad06f7fd7f`
  - merge: `f183c96d6d89ecdaf9a2f5dd2c452de485882ed3`
  - profile SHA-256: `d02e6398b06f8b347fbe2e68d91d83bfeccd389ea412be5774d34454c2d164a7`
  - surround SHA-256: `bd4d0a9ca3da8fcee72f8cfaf72d51040f6754920649b9e30c8c8a2e44093cc0`
  - leaf SHA-256: `c1445b4dae6a02127be15fcbd59e6f02f207de28a3461cf95a1ceba18f8d4c15`
- Verdict: **door is pretty thin but no gaps**.
- Thinness is a non-blocking authored-source observation. The leaf depth is
  unchanged, and no ad-hoc consumer scale was added.

## Registration formula

Provider measurements (in source coordinates) are:

- opening X: `[-0.66627635917071, 0.6408623012743637]`
- opening top: `2.1852569580078125`
- leaf X: `[-0.03624606132507324, 1.2874064445495605]`
- leaf height: `2.455683946609497`
- leaf depth scale: `0.75`
- hinge local X (`gapStart`): `-0.5`

With `c = requiredCover + float32Guard = 0.02 + 0.000001`, the fitted
opening is:

```text
frameScaleX = 1 / (surroundMaxX - surroundMinX)
frameScaleY = (wallHeight + capTop * 0.75) / surroundHeight
fitMinX = openingMinX * frameScaleX - c
fitMaxX = openingMaxX * frameScaleX + c
fitFloor = openingMinY * frameScaleY
fitTop = openingTop * frameScaleY + c
leafScale = ((fitMaxX - fitMinX) / leafWidth,
             (fitTop - fitFloor) / leafHeight,
             0.75)
childOffsetX = fitMinX - hingeLocalX - leafMinX * leafScaleX
childOffsetY = fitFloor
```

The placement root remains at the exact authored hinge for all four facings;
the measured child translation supplies the asymmetric registration. The leaf
rests on the floor (`floorOffset = 0`) at both tested heights, with hinge local
X `-0.5`.

## Cover measurements

Each row reports the minimum measured cover across east, north, west, and south
facings. Covers are measured after placement, rotation, and the float32
round-trip; the contract is at least `0.02`.

| Authored wall height | Left cover | Right cover | Top cover | Floor offset |
| ---: | ---: | ---: | ---: | ---: |
| `2.4` (standard) | `0.020000988483133975` | `0.020000996574498664` | `0.020001064242389788` | `0` |
| `3.6` (raised) | `0.020000988483133975` | `0.020000996574498664` | `0.020000901363700585` | `0` |

The scale-only mutation leaves a right-side cover of `-0.145659`, which is
below the contract and is the regression this registration closes.

## Route-independent proof

- Authored YAML fixture: `240` cells, `44` boundaries, `2` regions, `94` lines,
  `3593` bytes, SHA-256
  `1b5effb21b3ccc5c26153714cff62d7a08041808a1782cd79d9999b3755fca25`.
- HTTP capture: `75/75` responses were HTTP 200, comprising `62` RPC responses
  and `13` asset responses; page errors: `0`.
- The two known development StrictMode abort logs and one aborted request are
  non-blocking lifecycle noise; they do not change the all-200 result.

## Screenshots

All screenshots are `1600x900` PNG frames.

| Frame | SHA-256 |
| --- | --- |
| `close-door.png` | `07b7eda475ed812bad3ae8801071a568dd1cec13579c2559931b0b0b27010236` |
| `builder-full.png` | `6365360061dd9087dca5ccc9b62de79bd3f4e123e296e7a8701eee95a710e561` |
| `game-full.png` | `683501ed8983e89acdc9d514ccef467557a17d8f0e4b99b01b26a5bace033943` |

`builder-full.png` shows the complete authored shell and closed gate;
`game-full.png` shows the same shell after Save and Play in free roam;
`close-door.png` shows the closed leaf covering both posts and the lintel.

## Verification

- Focused wall/Atlas/DungeonShell suites: **21 files, 372 tests passed**.
- Full `npm run test:run`: **231 files passed, 1 skipped; 3653 tests passed,
  1 skipped**.
- `npm run ci-check`: all seven gates passed.

The implementation is limited to the leaf registration path and its regression
coverage; no unrelated project documentation or runtime capture records are
part of this evidence set.

## Review correction

- Copilot inline finding `3868059306` corrected the provider merge pin to
  `f183c96d6d89ecdaf9a2f5dd2c452de485882ed3`.
- Every SHA token in this report is now 40 or 64 characters, and the provider
  review, merge, tree, profile, surround, and leaf pins match PR #829.
