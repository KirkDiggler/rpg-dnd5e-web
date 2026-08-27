# Task 5 — approved crypt lighting

## Approval and calibration

Kirk's exact verdict: **"approved calibration `0.20/0.10` and said torches make it perfect, conditional on the region slider working."**

The approved calibration commit is [`1571a8f`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/1571a8ff60a22a7eaad9927fd5c1b4eaae5cccc6), `feat(rendering): calibrate crypt shadow fill`.
The immutable branch/evidence commit that introduced the three exact PNG bytes is `8dc75e356938155a681daf888c3a2a0b7f51bf71`.
It changes only the six rendering source/test files that assert the crypt fill:

- `src/rendering/dungeonLighting.ts`
- `src/rendering/dungeonLighting.test.ts`
- `src/author/preview3d/DungeonPreview3D.render.test.tsx`
- `src/components/session/DungeonEnvironment.test.tsx`
- `src/components/session/DungeonSceneLights.test.tsx`
- `src/components/session/SessionCanvas.test.tsx`

The fixed crypt global fill is ambient `0.20` and directional `0.10`.
It is not author-adjustable in v1. The region slider tunes **per-region unlit-floor exposure**; it does not change the global fill.

Unchanged authored fixture values are region exposure `[0.60, 0.40, 0.15]` for Entrance, Hall, and Tomb. Unchanged source-prop specs are: lantern `1.3 / 3.0 / 0.65 / 0.65`, torch-ornate `1.6 / 3.6 / 1.4 / 0.85`, glowing-orb `2.0 / 4.5 / 1.2 / 0.9`, and rune-marker `0.7 / 2.2 / 0.15 / 0.45` (intensity / distance / height / floor-pool strength). Source props illuminate the 3D geometry; the floor exposure and source pools remain separate authored/rendering inputs.

Fixture/YAML:

- Fixture key: `crypt-lighting-showcase`
- Fixture URL: `http://127.0.0.1:3013/?concept=dungeon-builder&authorFixture=crypt-lighting`
- YAML: `/tmp/crypt-lighting-showcase.yaml`
- YAML SHA-256: `ff63379eebf954a80c44078d02d59336c953b87f3dcea35755ff489903fe3425`

## Live region-slider proof

Verified against the existing Vite service on `127.0.0.1:3013` using `/usr/bin/google-chrome`, viewport `1600x900`. The `Entrance` region was selected in the actual builder, the existing `lighting intensity` slider was changed, and the shared 3D preview was captured without editing the fixture file.

- Authored value before the probe: `0.60`
- Low: slider `0.05`; full temporary frame `/tmp/crypt-lighting-slider-low.png`, `1600x900`, SHA-256 `5ff041d85139faaf220a551b654a93a08345c79dbc3402f9c6e9065bde326096`; preview canvas `/tmp/crypt-lighting-slider-low-canvas.png`, `696x646`, SHA-256 `acbed70c3fec8eeadfb3a95872fab656f48b6a027329b0aa655034a6f41f5f92`
- High: slider `0.95`; full temporary frame `/tmp/crypt-lighting-slider-high.png`, `1600x900`, SHA-256 `2618f6815086d0eef354fa7c5066dd3d2b0b1ae39f54a7923b6eb5ad69dc2b2`; preview canvas `/tmp/crypt-lighting-slider-high-canvas.png`, `696x646`, SHA-256 `386dde1ad2740c44cfeb3ea3bc1564f25a3b0119f3cb1c19a7b11cf94244f77b`
- The low/high full-frame and canvas hashes are distinct, proving the compiled atlas/3D floor exposure updated in the shared preview.
- Reload verification restored the authored values exactly: Entrance `0.60`, Hall `0.40`, Tomb `0.15`.

Browser diagnostics for the live probe: zero console errors, zero page errors, zero failed requests, and zero HTTP responses at or above 400. The preview also showed zero shell-fallback, stale-atlas, and lighting-diagnostics notices.

## Approved visual evidence

All committed images are PNG, `1600x900`:

| Image | SHA-256 |
| --- | --- |
| [`builder.png`](./builder.png) — approved round-1 builder frame | `4ea30c19af7a6f435da2486675d5672e534cf49b0493d908736cfdf760c8b631` |
| [`game.png`](./game.png) — approved round-1 playable game frame | `5bc90463e9f4f34085a2bb4c690f073e62fddeb1328aaa1b5248343c7aa6cd34` |
| [`source-close.png`](./source-close.png) — approved round-1 game close frame | `625aa23b64133fe10da81882c7e3b9f1102b0721c20dedbe2933f07677ec90fb` |

The builder and game use the shared dungeon scene renderer. The builder frame demonstrates the crypt shell, mixed warm/cool pools, and dark unpooled floor; the game frame demonstrates the same authored scene in a real Save & Play session. These are parity boundaries, not pixel-identical screenshots: camera framing and game HUD/story state differ, and the game SessionCanvas bitmap was `1598x724` within the `1600x900` viewport. The close frame makes the lantern source and nearby floor/character response judgeable. The frames do not claim that every source origin/facing relationship is conclusively visible.

## Verification commands

The branch Vite service was already running; it was not stopped or restarted. Focused verification after calibration:

```bash
npx vitest run \
  src/rendering/dungeonLighting.test.ts \
  src/author/preview3d/DungeonPreview3D.render.test.tsx \
  src/components/session/DungeonSceneLights.test.tsx \
  src/components/session/DungeonEnvironment.test.tsx \
  src/components/session/SessionCanvas.test.tsx
npm run typecheck
```

Result: 5 test files passed, 58 tests passed, and typecheck exited 0. The temporary live probe was run with `node /tmp/verify-crypt-slider.mjs`.

The evidence-only commit is recorded separately as `docs(rendering): record approved crypt lighting`.
