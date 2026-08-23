# Live gate — catch-up consumes typed Events (rpg-dnd5e-web#785)

**Date:** 2026-08-24. **Environment:** rpg-api dev (#824, session stack) on
`:50051` via envoy `:8080`, reseeded, `AuthoringService` gate off
(`content registry: "content" (authoring enabled: false)` — expected local
config, not a regression: see "A route substitution, and why" below); web
from this worktree (`feat/785-typed-catchup`) on `:3003`. Driven headlessly
via a persistent CDP-attached `google-chrome --headless=new`, real mouse
clicks on the canvas (no React-fiber shortcut needed this run — the floor
raycasting itself worked headlessly), same general technique
`docs/evidence/779-rule6/README.md` and `docs/evidence/254-monster-turn/README.md`
both used.

## A route substitution, and why

The brief's `toolkit-sandbox-fighter` route (`?toolkitSandbox=1`) saves a
dungeon via `AuthoringService.PutDungeon` before it will enable its "Fighter"
party button. This rpg-api dev build has authoring gate-off
(`RPG_AUTHORING_ENABLED` unset — `useAuthoringGate`'s own doc comment
confirms `Unimplemented` is the registered-or-not answer, not a connection
failure), so that route's Save is permanently disabled here — a pre-existing,
deliberate local-dev configuration state, unrelated to #785's scope. This
pass instead used the already-seeded default character ("Standrew Garfield",
Lv1 Half-Orc Barbarian, player `test-player`) through the ordinary
Home → Play → Create lobby → Ready up → Start flow, which never touches
`AuthoringService` and starts the server's default dungeon (the reference
tomb) exactly as `docs/evidence/254-monster-turn/` did. Flagging honestly
per this repo's own convention rather than skipping the live gate silently.

## What ran, in order

1. Character select (Standrew Garfield) → Create lobby → Ready up → Start
   → free roam in the tomb. The debug log panel already showed FOUR lines
   recovered by rule 6's initial `GetStory{from_seq:0}` catch-up —
   `785-00-catchup-on-connect-typed-kinds.png`:

   ```
   seq=2 clock=0 kind=JOINED body=null
   seq=3 clock=0 kind=JOINED body=null
   seq=4 clock=0 kind=JOINED body=null
   seq=5 clock=0 kind=JOINED body=null
   ```

   Before this PR these four lines rendered `kind=UNKNOWN body=null` —
   `storyEntryToEvent`'s synthesized stand-in, the exact defect
   `docs/evidence/740-debug-log/740-01-free-roam.png` shows live
   ("FIVE lines... `kind=UNKNOWN body=null`... synthesized honestly as
   `UNKNOWN`"). Here, `GetStoryResponse.entries` is `repeated Event`
   (v0.1.135) and rendered its REAL kind, `JOINED`, straight through —
   `JOINED` has no typed body member so `body=null` is still correct
   (`debugLogLine.ts`'s own `default` branch), but the **kind** is no
   longer a synthetic placeholder.
2. Walked the entrance corridor and through a door (real mouse clicks on
   the canvas — `SessionCanvas`'s raycasting resolved every click to the
   correct hex headlessly). A fight formed mid-path: `seq=12 fight_started
   order=[Standrew Garfield, Skeleton, Skeleton]`.
3. End Turn → the skeleton's driven turn played out (moved ×4, `struck`),
   then back to the player's turn (Round 2) —
   `785-01-mid-fight-before-restart.png` is the immediately-pre-restart
   frame, full typed feed seq 2–23, "Skeleton hits you — 12 vs AC 11, 4
   piercing." in the Story-line footer.
4. **Restarted the rpg-api container** with the fight live and the stream
   subscribed:
   `docker compose -f rpg-deployment/docker-compose.local-dev.yml restart rpg-api`.
5. Polled the panel every second for 8s after the restart command returned;
   every poll already read **`Combat log — live`** — the reconnect
   (`Reconnecting…` → `Resyncing…` → `live`) completed faster than the 1s
   polling cadence caught an intermediate frame (same outcome
   `docs/evidence/779-rule6/README.md`'s own `779-03-resyncing.png` note
   describes — the harder evidence is the trace below). The feed itself was
   byte-identical to the pre-restart frame: same 22 lines, no duplicates,
   no gaps, **no `kind=UNKNOWN` rows anywhere**.
6. Clicked End Turn once more, live, post-restart, to prove ordinary
   delivery (not just the catch-up snapshot) survived the reconnect intact
   — `785-02-after-restart-typed-feed-no-unknown.png`, the acceptance
   frame: seq 2 through 27 in one continuous, fully-typed feed spanning
   before-restart, the catch-up, and resumed live delivery, Round 3 now
   active, zero `UNKNOWN` rows. This is this PR's own re-capture of
   `docs/evidence/740-debug-log/740-03-skeleton-turn-in-log.png`'s point,
   now against a restarted server instead of a same-session gap.

## The server-side trace — rpg-api's per-recipient send log

```
21:39:17 → EndTurn started
21:39:17 ✓ EndTurn completed in 0.00ms
21:39:17 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=16 kind=turn_ended
21:39:17 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=17 kind=turn_ended
21:39:17 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=22 kind=struck
21:39:17 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=23 kind=turn_ended

--- docker compose restart rpg-api issued here (21:39:39) ---

21:39:39 Received shutdown signal, gracefully stopping...
21:39:39 Shutting down gRPC server...
21:39:50 ⚠️  AUTH_DEV_MODE enabled - Dev authentication scheme allowed
21:39:50 INFO connecting to Redis address=redis:6379
21:39:50 INFO successfully connected to Redis address=redis:6379
21:39:50 content registry: "content" (authoring enabled: false)
21:39:50 gRPC server starting on port 50051...
21:39:52 → GetStory started
21:39:52 → StreamEvents started
21:39:52 ✓ GetStory completed in 0.00ms

--- live resumes; a second End Turn confirms ordinary delivery, unaffected ---

21:40:55 → EndTurn started
21:40:55 ✓ EndTurn completed in 0.00ms
21:40:55 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=24 kind=turn_ended
21:40:55 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=25 kind=turn_ended
21:40:55 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=26 kind=struck
21:40:55 DEBUG session stream: forwarded event session=7080211c-... recipient=char_8eb44095-... seq=27 kind=turn_ended
```

Read together with the client-side feed: the client re-subscribed
`StreamEvents` **and** re-ran `GetStory` within 2 seconds of the process
coming back up (rule 6's every-(re)connect catch-up, unchanged by this PR),
`GetStory` answered `entries: []` (`0.00ms`, nothing new since seq 23 was
already delivered before the restart), and the client's own feed shows
zero duplicates and zero `UNKNOWN` rows across the whole reconnect boundary
— exactly the outcome `useSessionEventStream.test.ts`'s own "gap detection"
and "very first connect" cases assert against a fake stream, now confirmed
against a real server restart.

## What this satisfies

- Catch-up entries render with their real `kind` (`JOINED`, `moved`,
  `fight_started`, `turn_ended`, `struck`, ...) instead of the old
  synthetic `UNKNOWN` stand-in — shown live at both the very first connect
  (`785-00`) and after a mid-fight server restart (`785-02`).
- No `kind=UNKNOWN` rows anywhere in the post-restart feed — the direct
  re-capture of `docs/evidence/740-debug-log/740-03`'s acceptance case,
  now against a real reconnect instead of pre-existing session history.
- Catch-up and live are the same shape end to end: the feed across the
  restart boundary is one continuous, gapless, non-duplicated seq run
  (2 → 27), narration and raw fields identical in form whether a line came
  from `GetStory` or `StreamEvents`.
- Ordinary live delivery resumes normally after the reconnect (seq 24–27,
  an ordinary End Turn with no special-casing needed).

## Files

- `785-00-catchup-on-connect-typed-kinds.png` — the very first connect's
  own `GetStory{from_seq:0}` catch-up, four pre-existing `JOINED` events
  rendering with their real kind (not `UNKNOWN`).
- `785-01-mid-fight-before-restart.png` — mid-fight state immediately
  before the container restart, full typed feed seq 2–23.
- `785-02-after-restart-typed-feed-no-unknown.png` — the acceptance frame:
  seq 2–27 in one continuous typed feed spanning the restart, catch-up, and
  resumed live delivery, zero `UNKNOWN` rows.
