# Move indicator — live evidence (rpg-dnd5e-web#762 slice 4)

Captured 2026-08-22 against the local dev stack (`rpg-api` `dev` container,
`rpg-deployment/docker-compose.local-dev.yml`) with `npm run dev` running
from this branch's own worktree, driving the real Home -> Lobby -> Ready ->
Start flow headlessly with Playwright (`playerId=toolkit-sandbox-fighter`,
real Chrome via `executablePath: '/usr/bin/google-chrome'`), per the
recipe in `local-dev-loop.md`'s "Driving the session (3D) route
headlessly" section. Every frame is a REAL mouse event (`page.mouse.move`/
`page.mouse.click`) landing on the real invisible ground-plane mesh's
`onPointerMove`/`onClick` handlers — not a fiber-walk shortcut — so this
exercises the actual raycast -> `useHexInteraction` -> `useMoveIndicator` ->
`MoveIndicator` chain exactly as a real player's cursor would.

The character sits near the viewport center because the camera
continuously follows the local player (`SessionScene`'s `focusTarget`),
so a small mouse sweep around center reliably lands on the player's own
cell and its immediate neighbors without needing to reverse-engineer the
orthographic camera's projection matrix.

## Frames

1. **`01-baseline-no-hover.png`** — mouse resting off-canvas. No
   indicator drawn (`selectMoveIndicator` returns `null` when nothing is
   hovered).
2. **`02-hover-self-cell-invalid-red.png`** — hovering the character's own
   hex. Renders a single **red** hex (`MoveIndicator`'s `INVALID_COLOR`,
   `#ef4444`) — `findAtlasPath` returns an empty path for a self-hover
   (same "nothing to walk" convention `useSessionWalk.walkTo` already
   uses), which `selectMoveIndicator` reads as `'invalid'`.
3. **`03-hover-reachable-path-preview-blue.png`** — hovering an adjacent,
   reachable cell. Renders **blue** (`PATH_COLOR`, `#3b82f6`) across BOTH
   the start cell and the destination — the full 2-hex route
   `findAtlasPath` computed, drawn via the reused `PathPreview` leaf.
4. **`04-hover-off-floor-no-indicator.png`** — mouse over the far corner
   of the canvas, off the tomb's floor mask entirely. No indicator
   (`useHexInteraction`'s own floor-membership gate never reports a
   hovered cell here, so `selectMoveIndicator` is never even called).
5. **`05-pre-click-path-preview.png`** — hovering a further, still-
   reachable cell before clicking — same blue preview.
6. **`06-post-click-walking-status.png`** — immediately after clicking
   the previewed cell. `SessionEncounterView`'s real "Walking…" status
   text is visible top-left (the actual `Move` RPC is in flight), the
   character is mid-walk-animation, and the indicator still tracks the
   (now stationary) cursor — showing **red** because the cursor's
   screen position now falls on the character's OWN cell as it walks
   toward/through it.
7. **`07-post-walk-settled-new-position.png`** — walk animation finished,
   `GetWhere` reconciled, character resting at the new position. The
   indicator is still live and correct (red self-cell) with no residual
   "Walking…" text.

Together, frames 5 -> 6 -> 7 are the click -> walk sequence: the exact
path previewed in blue is the path the character is then seen animating
along and arriving at, live against the real server (not a mock).

## What this does NOT show (covered by tests instead, not by live capture)

- **Fight-lock (`'locked'`, purple `#a855f7`)** — forming a real fight in
  this tomb against a monster wasn't attempted in this pass (would need
  deliberately walking into a monster's sight range and is not needed to
  prove the wiring: the fight-lock path is `useSessionWalk`'s
  `isFightLockError`, already exercised end-to-end by
  `useSessionWalk.test.ts`'s fight-lock cases and
  `SessionEncounterView.test.tsx`'s "shows the friendly status line" +
  "fightLocked flows to SessionCanvas" tests). The color itself is
  verified live-rendered by `SessionCanvas.test.tsx`'s "fightLocked
  overrides an otherwise-reachable hover" test, which reads the actual
  `THREE.MeshBasicMaterial.color` off the rendered scene graph and
  asserts `a855f7`.
- **`mode: 'target'` (orange `#f97316`)** — this is a seam for combat,
  which has no UI entry point yet (`SessionCanvas`'s `mode` prop defaults
  to `'move'`; nothing in this slice sets it to `'target'`). Verified the
  same way — `SessionCanvas.test.tsx`'s `mode="target"` test reads the
  rendered material color directly.

## Files

- `src/components/session/moveIndicator.ts` — pure selection logic (unit
  tested in `moveIndicator.test.ts`, 14 cases: valid path, self-cell,
  wall-blocked, disconnected-floor, off-atlas, fight-lock override in
  both directions, target-mode seam, and a direct cross-check that the
  previewed path is byte-identical to what `useSessionWalk.walkTo` would
  send as the `MoveRequest.path`).
- `src/components/session/useMoveIndicator.ts` — the `useMemo` seam
  between React state and the pure selector.
- `src/components/session/MoveIndicator.tsx` — rendering, reusing the old
  `HexGrid` route's own tuned `PathPreview` leaf rather than inventing a
  new hex-highlight visual language.
- `src/components/session/useSessionWalk.ts` — now exposes `fightLocked`
  (derived from the SAME caught Move error `moveError`'s friendly text
  comes from, via `moveErrorMessage.ts`'s newly-exported
  `isFightLockError`) so the indicator needs no new RPC.
- `src/components/session/SessionCanvas.tsx` — wires hover
  (`useHexInteraction`'s existing `hoveredHex`), `pathIndex`,
  `fightLocked`, and `mode` into `useMoveIndicator`/`MoveIndicator`.
