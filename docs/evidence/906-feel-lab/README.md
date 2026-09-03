# Feel dials drawer — live over a real session (#906 batch 2, step 4)

**Date:** 2026-09-03. **Environment:** `rpg-local--feel` docker compose
stack (envoy on host port 8084, rpg-api healthy), web dev server on
`:3011` from this worktree (`feel/camera-dice`), player `local--feel`
resumed into its existing lobby/encounter ("The Reference Tomb", Round
4, Hopkins vs. a skeleton) via the app's own resume-after-refresh flow.
`.env.local`:

```
VITE_API_HOST=http://localhost:8084
VITE_DEV_PLAYER_ID=local--feel
```

Driven headlessly (Playwright), navigated straight to `/`, waited for
`GetMyActiveLobby` to resume into the live session, then pressed the
backtick key — the new keyboard shortcut this step adds — rather than
clicking the wrench (the wrench sits at `fixed bottom-4 right-4`, which
overlaps the combat HUD's End Turn button at this viewport size; a real
player has an unobstructed wrench most of the time, since that overlap
is a pre-existing dev-tool/HUD coincidence, not something this step
introduced).

## Screenshots

- `01-drawer-open-over-session.png` — the drawer open, scrolled to the
  top: Camera group (rotate/pan speed, orbit pivot, pitch far/near,
  pitch curve, the three zoom dials) and the start of the Dice group.
- `02-drawer-scrolled-debug-section.png` — scrolled to the bottom: the
  rest of the Dice group, the Reset all / Copy as URL footer, and the
  Debug section (the former `DiscordDebugPanel` content) rendering
  second, below the dials, inside the same drawer.
- `prod-flag-on.png` / `prod-flag-off.png` (#906 round 5 addendum) — a
  real `npm run build` served via `npm run preview`, with and without
  `VITE_FEEL_LAB=1`: the wrench is present on the landing page with the
  flag, absent without it. This is the flag the deployed image now sets
  (`Dockerfile`, `.github/workflows/docker.yml`), so the playtest
  surface ships with the drawer on.

## A real bug found and fixed here

`SessionEncounterView` portals its entire view straight into
`document.body` at `zIndex: 100`. The drawer's first draft used
`z-[100]` too — a tie that DOM order resolves in the portal's favor, so
the drawer was mounting, toggling its own open/closed class correctly,
and occupying the right on-screen rect, but painting invisibly *behind*
the live session view every time. Unit tests (jsdom) never catch this —
there's no real paint order to check — so this only showed up against
the live server. Fixed by raising the drawer to `z-[5000]`, clearing
both that portal and its "run ended" overlay (`zIndex: 1000`) while
staying below the app's real toast layer (`zIndex: 99999`, so a
critical toast still wins). A regression test now pins the drawer's
z-index above `1000` in `FeelDialsDrawer.test.tsx`.

## Every registered dial (`src/feel/dials.ts`)

Defaults below are current as of #906 round 4 (Kirk's second live pass).
**The two screenshots above predate this round** — they were captured
against the round-3 defaults (rotate speed 70, pan speed 18, roll flash
off) and still show those on-screen values; the drawer's own layout,
sections, and every other behavior they demonstrate are unchanged.

**Camera**

| Dial | Default | Range | Notes |
| --- | --- | --- | --- |
| Rotate speed | 25°/s | 10–300, step 5 | Q/E; Kirk's second live keeper ("that feels much better"), down from 70 |
| Pan speed | 40 u/s | 2–100, step 1 | WASD; Kirk's second live keeper, up from 18 |
| Orbit pivot | auto | auto / view / me | auto = pans off the view center until you move, then follows you |
| Pitch (far / overview) | 28° | 0–89, step 1 | |
| Pitch (near / detail) | 62° | 0–89, step 1 | |
| Pitch curve | on | on / off | new `on`/`off` tokens — the legacy `?pitchCurve=0/1` URL convention is a documented, deliberate divergence (`dialStore.test.ts`) |
| Zoom (min / overview) | 35 | 10–100, step 1 | |
| Zoom (max / detail) | 140 | 50–400, step 5 | |
| Zoom (start / tactical) | 80 | 10–400, step 5 | |

Middle-drag speed still derives from Rotate speed, not its own dial —
`dragRotate = rotateSpeed × DRAG_SECONDS_PER_PIXEL`, and
`DRAG_SECONDS_PER_PIXEL` is a FROZEN literal (`1/175`, from the round-3
anchor 0.4°/px at 70°/s), not a live re-derivation from whatever the
current default is. At the round-4 default this now works out to
`25 × 1/175 ≈ 0.143°/px` — a 175px drag still moves the camera exactly
as far as one second of held Q, at whatever `rotateSpeed` is dialed to.

**Dice**

| Dial | Default | Range | Notes |
| --- | --- | --- | --- |
| Die scale | 2× | 0.25–4, step 0.25 | Kirk's first-pass keeper default; a negative URL value clamps to the 0.25 floor rather than falling back to 2 — also a documented divergence |
| Roll flash | both | off / die / toast / both | Kirk's second live keeper ("that feels much better"), up from off |

**URL-only escape hatch, not in the drawer** (per spec): `?camera=persp`
switches the camera to perspective projection (`fovDeg`, `minDistance`,
`maxDistance` ride along) — `perspectiveOverrides()` in
`cameraDials.ts` reads it directly from the URL, independent of the
dial store, so it still works from a shared link even though there's no
control for it here.

## Tuning URL

Any combination of the dials above can be shared as a link — this is
exactly what the drawer's own "Copy as URL" button produces (only the
non-default dials are included). Example, tuned for a faster camera and
a bigger die on top of the round-4 defaults:

```
http://localhost:3011/?rotateSpeed=60&dieScale=3
```

(`rollFlash` is omitted since `both` is now the default — only the two
dials that diverge from it need to ride along.) Opening that URL
applies those overrides on top of the registry defaults and this
browser's own saved values (URL wins, per the documented precedence in
`dialStore.ts`); every other dial keeps its default or whatever was
last saved locally.
