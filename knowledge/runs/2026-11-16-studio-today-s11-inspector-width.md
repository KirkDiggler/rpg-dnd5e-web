# Run — 2026-11-16 — Studio today S11 inspector width

Slice [rpg-project#979](https://github.com/KirkDiggler/rpg-project/issues/979) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`d888eeb4`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/d888eeb4).

## Shipped

- A focusable separator ("Resize inspector") on the inspector's inner edge: drag, arrows in 16 px steps, Home/End to the limits, double-click to the default; the width is kept per viewer in browser storage — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).
- Above 800 px the map stops at the inspector's edge, so the map and the 3D scene tree take the rest instead of running under the inspector — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).

## Decided

- Default 384 px, today's `24rem`, so an author who never drags sees no change; min 320 px, near today's, below which the inspector's forms wrap badly; max half the window, so the map keeps the larger half — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).
- The workspace width is `window.innerWidth`: the studio is a fixed full-window surface, and jsdom measures elements at 0, which would pin every test to the minimum — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).
- The width is stored through the studio's injected `storage` under `rpg.concepts.encounter-studio.inspector-width.v1`, beside the publication record, every read and write in try/catch; it never enters the draft or the session, so it is not an edit and not undone — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).
- A drag previews by setting `--es-inspector-width` on the studio root and commits once on release, so the workspace re-renders once per drag, not per pointer move — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).
- The inspector stays where it is in the JSX (an overlay positioned from the toolbar); the map's right inset follows the same variable instead, so the diff stays in the shell and CSS and does not move the inspector's contents another PR edits — [rpg-dnd5e-web#1438](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1438).
- At 800 px and below the inspector keeps overlaying the map as before, since half of a narrow window leaves the map too little — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).

## Found

- The inspector is an absolutely positioned overlay from the toolbar, not a column; the map ran under it, which is what made it cover the 3D scene tree at 1280 px — [rpg-dnd5e-web#1278](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1278).
- The 2D Layout viewport re-measures through a ResizeObserver and the 3D canvas through react-three-fiber's own, so a narrower map needs no extra wiring — [LayoutViewport.tsx](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/d888eeb4/src/concepts/encounter-studio/LayoutViewport.tsx).

## Mistaken

- The first studio test run was started in the background and the builder went idle waiting on it; the gates were re-run in the foreground per the build-slice skill — [`b10fadd6`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b10fadd6).
