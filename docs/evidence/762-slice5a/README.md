# Turn HUD — live evidence (rpg-dnd5e-web#762 slice 5a)

Captured 2026-08-22 against the local dev stack (`rpg-api` `dev` container,
`rpg-deployment/docker-compose.local-dev.yml`) with `npm run dev -- --port
3003` running from this branch's own worktree, driving the real Home ->
Lobby -> Ready -> Start flow headlessly with Playwright
(`playerId=toolkit-sandbox-fighter`, real Chrome via `executablePath:
'/usr/bin/google-chrome'`), per the recipe in `local-dev-loop.md`'s "Driving
the session (3D) route headlessly" section. `redis-cli -p 6380 del
"player:toolkit-sandbox-fighter:lobby"` ran first so the flow builds a
fresh lobby into the reference tomb (old encounters are stale after the api
image swap).

Approaching the skeleton used the same fiber-walk technique
`docs/evidence/762-slice4/README.md` and `local-dev-loop.md` document for
`EncounterMap`, adapted to `SessionCanvas`: walk the React fiber from
`#root`'s `__reactContainer*` key to the `SessionCanvas` fiber and call its
`onHexClick` prop directly with a target several cells away — the exact
callback a real click on the raycast plane would fire, so everything
downstream (pathfind -> `Move` RPC -> server-side sight check -> fight
formation -> `FIGHT_STARTED` event -> Afford refetch -> HUD re-render) is
real; only the raycast itself is skipped. The reference tomb's largest room
put a floor cell 28 hexes from the start position on the candidate list;
the very first attempt (clicking that cell) walked far enough to bring the
skeleton into the server's sight range and form the fight mid-route — no
retry needed.

## Frames

1. **`01-free-roam-pill.png`** — fresh session, before any movement. The
   turn HUD (bottom-left) renders the single quiet "Free roam" pill
   (`turnHud.ts`'s `selectTurnHud`: `clock` came back `CLOCK_KIND_WORLD`
   from the real `Afford` RPC, fired once by `SessionEncounterView`'s
   member-bootstrap effect).
2. **`02-turn-hud-after-approach.png`** — mid-walk-animation, the instant
   the fight forms. The top-left status line still reads "Walking…" (the
   client-side walk animation is still catching up to the last returned
   step — `MoveResponse.steps` came back SHORTER than requested, per
   `useSessionWalk`'s own "a short walk is not an error" contract, because
   the server cut the move short once the fight formed), while the HUD has
   ALREADY switched to the turn clock with the action shape lit and
   "Attack — ready". This is the `FIGHT_STARTED` stream event's Afford
   refetch landing independently of — and faster than — the walk
   animation's own reconciliation; the two are wired to different
   triggers on purpose (`SessionEncounterView.tsx`'s own comments on
   `AFFORD_REFRESH_EVENT_KINDS` and the own-move-round-trip refetch).
3. **`03-turn-hud-turn-clock.png`** — one second later, walk animation
   settled, skeleton visible in frame. The turn HUD: three shapes
   (circle/triangle/diamond for action/bonus/reaction), the action shape
   lit blue, and the declaration row "Attack — ready" — the exact
   `AffordResponse` shape Kirk's ruling on toolkit#1138 asked for ("we
   hand shapes for action, bonus and reaction that lined up with the
   various things we could do").
4. **`04-fight-lock-with-hud.png`** — bonus frame, not required by the
   brief but reachable without an Attack RPC: still in the same page (no
   reload — `GetMyActiveLobby`'s resume path does not carry `characterId`
   back in on a fresh navigation, unrelated to this slice), a click on an
   adjacent floor cell while fight-locked is refused with the friendly
   status line ("In a fight — movement is locked.", `moveErrorMessage.ts`)
   shown top-left AT THE SAME TIME as the turn HUD bottom-left — both
   pieces of UI, and the fight-lock-refusal Afford refetch
   (`SessionEncounterView.tsx`'s `fightLocked` effect), live in one frame.

## What this does NOT show (covered by tests instead, not by live capture)

- **An unaffordable declaration** (`turn-hud-shape-action` dim, a
  shortfall row like "Attack — action: 1 needed, 0 left") — reaching this
  live needs either a second Attack RPC in the same turn (Extra Attack
  budget exhausted) or another verb spending the action first, and there
  is no Attack RPC in the web yet (slice 5b). Covered by `turnHud.test.ts`
  ("turn clock with Attack unaffordable -> action shape unlit + shortfall
  carried verbatim") and `TurnHud.test.tsx`'s shortfall-rendering case.
- **`SLOT_NONE`/`SLOT_UNSPECIFIED` declarations** — both need a server
  response this client cannot provoke live today (a banked Extra Attack
  swing, or a producer bug). Covered by `turnHud.test.ts`'s dedicated
  cases, including the "logs once" assertion for `SLOT_UNSPECIFIED`.
- **The full refetch-trigger matrix** (all seven `AFFORD_REFRESH_EVENT_KINDS`,
  the own-move round-trip, the fight-lock transition, and that `MOVED`
  alone never triggers a refetch) — exercised end-to-end against the real
  `useSessionWalk`/`useSessionEventStream`/`useSessionAfford` hooks (only
  `sessionClient.move`/`.streamEvents`/`.afford` mocked at the `@/api/client`
  boundary) in `SessionEncounterView.test.tsx`'s "turn HUD wiring" describe
  block.

## Files

- `src/api/useSessionAfford.ts` — the `Afford` RPC hook: no mount fetch
  (same reasoning as `useSessionView`), keeps last-good `clock`/
  `declarations` on a refetch error (the slice-4 last-good lesson, unlike
  `useSessionWhere`/`useSessionView` which null out).
- `src/components/session/turnHud.ts` — pure mapping
  (`{clock, declarations} -> {mode:'free-roam'} | {mode:'turn', shapes,
  declarations}`), framework-free, unit tested in `turnHud.test.ts` (19
  cases).
- `src/components/session/useTurnHud.ts` — the `useMemo` seam between
  React state and the pure selector, same shape as `useMoveIndicator`.
- `src/components/session/TurnHud.tsx` — rendering: three CSS-only
  silhouettes (circle/triangle/diamond), lit vs dim, plus the declaration
  rows. HTML overlay, not inside the Canvas. Unit tested in
  `TurnHud.test.tsx` (5 cases, no jest-dom matchers — this repo's vitest
  config has none configured, so assertions use plain DOM properties, per
  `YamlPane.test.tsx`'s own note).
- `src/components/session/SessionEncounterView.tsx` — wiring: the
  member-bootstrap fetch, the `AFFORD_REFRESH_EVENT_KINDS` stream-event
  refetch, the own-move-round-trip refetch
  (`refetchAffordAfterOwnAction`, named for slice 5b's Attack handler to
  reuse), and the fight-lock-transition refetch.
