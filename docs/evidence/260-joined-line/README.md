# Live gate — debug log renders who joined (rpg-project#260 slice 4, final item)

**Date:** 2026-08-24. **Environment:** rpg-api built from PR #826's branch
(session stack, `RPG_AUTHORING_ENABLED=1` — `content registry: "/content"
(authoring enabled: true)`), containers renamed to `rpg-deployment-*` on
this rebuild (redis is `rpg-deployment-redis-1`, no host `:6380` this time —
`docker exec rpg-deployment-redis-1 redis-cli …`), reachable via envoy
`:8080` exactly as before; web from this worktree (`feat/260-joined-line`)
on `:3002` (`:3001` was already held by another checkout's `npm run dev`,
so Vite's own fallback picked the next free port — confirmed this instance
served the branch's code via `curl localhost:3002/src/.../debugLogLine.ts |
grep '"joined"'` before trusting any of the below, per this repo's own
stale-dev-server trap). Driven headlessly via `chromium.launch({
executablePath: '/usr/bin/google-chrome', headless: true })` and real
Playwright UI interaction (clicks, form fills) — no fiber-walk or raycast
skip needed this run, since the whole point was to drive the ordinary
Home → Play → Party → Start UI, not the 3D canvas.

## A route substitution, and why (the resume-after-refresh gap)

First attempt used the `?toolkitSandbox=1` sandbox page's "Fighter then
Barbarian" fixed-arrangement button, which calls `createLobby` /
`joinLobby` / `setReady` / `startEncounter` directly as unary RPCs,
bypassing `LobbyFlow`'s own UI. That left both `toolkit-sandbox-fighter`
and `toolkit-sandbox-barbarian` with a real RUNNING encounter, but no
client-side record of which character belongs to which player — and
`GameView`'s own doc comment says exactly why that is a dead end for
entering play: "only the `initialEncounterId` path (a RUNNING encounter,
no lobby to read) still reaches `SessionEncounterView` without one, and it
shows a clear 'no character selected' state there." Confirmed live: both
identities landed on that exact screen when navigated to fresh.

The recovery is also by design: `SessionEncounterView`'s "no character
selected" screen has a **Back** button, and `handleBackToHome` sets
`currentView` to `'home'` without re-running the resume effect (its
dependency is the fetched `myActiveLobby.data` reference, not
`currentView`), so `Back` reaches an ordinary Home screen with the
character carousel populated. From there the **normal** Home → select
character → Play → Create/Join lobby → Ready up → Start walk — same one
`docs/evidence/779-rule6/README.md` and `docs/evidence/785-typed-catchup/README.md`
both used — runs clean and lets `LobbyFlow` bind `characterId` from the
roster the way it's meant to. This substitution is a pre-existing,
documented app behavior unrelated to #260's scope, flagged honestly per
this repo's own evidence convention rather than skipped silently.

## What ran, in order

1. **Fighter tab** (`?playerId=toolkit-sandbox-fighter`): landed on the
   resume-gap screen (prior run's leftover session) → **Back** → Home →
   select "Toolkit Sandbox Fighter" → Play → **Create lobby**, captured
   the join code.
2. **Barbarian tab** (`?playerId=toolkit-sandbox-barbarian`, separate
   browser context): same Back recovery → Home → select "Toolkit Sandbox
   Barbarian" → Play → pasted the fighter's join code → **Join**.
3. Both tabs' roster synced live over `useLobbyStream` —
   `00-party-roster.png`, the fighter's (host's) own view, "0/2 ready",
   both members listed by name, before anyone readied up.
4. Fighter **Ready up**, Barbarian **Ready up**, fighter (host) clicks
   **Start** (`start-encounter-button`) once enabled.
5. Both tabs transition into `SessionEncounterView`, this time WITH a
   bound `characterId` (`LobbyFlow`'s `onEncounterStarted` reporting the
   roster's answer), and both immediately show the debug combat log's
   catch-up feed from `seq=0` — `01-fighter-joined.png`, the fighter's own
   view:

   ```
   seq=2 clock=0 joined member=char_17130d25-6eb4-4ed9-baaa-41502e800eff
   seq=3 clock=0 joined member=Toolkit Sandbox Barbarian
   seq=4 clock=0 joined member=skeleton-1
   seq=5 clock=0 joined member=skeleton-2
   seq=6 clock=0 joined member=skeleton-captain-1
   ```

   This is the acceptance gate from rpg-project#260 itself ("the debug feed
   shows 'joined \<name\>'") — `seq=3`'s line resolves the teammate's raw
   member id to its display name, `Toolkit Sandbox Barbarian`, through
   `formatDebugLine`'s new `joined` case, exactly the way `struck`/`downed`/
   etc. already resolve names. `seq=2` (the fighter's own join) renders its
   raw id instead of a name — expected and pre-existing: `names` is built
   from sighted-member data the same way every other kind on this route
   resolves ids (`combatBeat.ts`'s own `participantNameMap`), and a member
   never "sights" itself; `moved`/`struck`/`downed` would show the same raw-id
   fallback for a self-referencing id. Not a defect introduced by this PR.
6. `02b-barbarian-view.png` — the barbarian's own tab, same encounter, its
   own catch-up starting at `seq=3` (its own join) rather than `seq=2`: its
   stream subscription begins at its own join point, not an absolute
   `from_seq=0` — a catch-up scoping detail, not a `joined`/`exited`
   rendering defect (the `joined member=...` lines it DOES show, including
   the three skeletons, render identically to the fighter's view).
7. Closed the barbarian tab's whole browser context outright (the "second
   tab, closed" evidence team-lead asked for) and polled the fighter tab's
   feed for 5s afterward — `03-after-barbarian-exit.png` — **no `exited`
   line appeared**. Consistent with `Exited` being for an explicit
   "leave the encounter" game action (issue #260's `Exited{member}` doc
   comment: "a member left the encounter"), not a bare TCP/tab disconnect;
   team-lead's own brief allowed for this ("or just capture joined"), so
   this is reported as a finding, not treated as a failure to chase further.

## Screenshots

- `00-party-roster.png` — both members in the lobby roster before Start.
- `01-fighter-joined.png` — fighter's live view, full `joined` catch-up
  feed, `Toolkit Sandbox Barbarian` resolved by name (the acceptance
  frame).
- `02b-barbarian-view.png` — barbarian's own live view, same encounter.
- `03-after-barbarian-exit.png` — fighter's view 5s after the barbarian's
  browser context was closed outright; feed unchanged, no `exited` line
  (see point 7 above).
