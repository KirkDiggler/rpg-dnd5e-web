# Live gate — rule 6 (rpg-dnd5e-web#779)

**Date:** 2026-08-23. **Environment:** rpg-api dev (#821, session stack) on
`:50051` via envoy `:8080`, reseeded; player `toolkit-sandbox-fighter`; web
from this worktree (`feat/779-stream-rule6`) on `:3003`. Driven headlessly
via `google-chrome --headless=new` (Playwright's `chrome` channel) and a
React-fiber walk for the movement click (`SessionCanvas.onHexClick`), same
technique `docs/evidence/254-monster-turn/README.md` used — skips only the
raycast, everything downstream (Move RPC, pathfinding, the stream itself)
is real.

## What ran, in order

1. Character select (Toolkit Sandbox Fighter) → Create lobby → Ready up →
   Start → free roam in the tomb.
2. Walked the entrance corridor (the `z=3` cube-coordinate line, same
   corridor `docs/evidence/254-monster-turn/` walked) until a fight formed.
   This run's roll of the dice was rough: the skeleton's driven turn — six
   `moved` beats, then `struck`, `downed`, `fight_ended` — downed the
   player before their own first action (`779-01-mid-fight-before-restart.png`,
   showing the resulting `[failed_precondition] move: member "...": member
   is downed` status line — an existing, unrelated Move refusal, not a
   rule-6 concern; it's just what's on screen at the moment the container
   gets restarted next).
3. **Restarted the rpg-api container** with the session already open and
   the stream subscribed (`docker restart rpg-api` — the container is
   standalone in this box's local-dev setup, not part of a running
   `docker compose` project here, so `docker restart rpg-api` is the
   equivalent kill used in place of the brief's compose-restart form).
4. The client's `stream-state` indicator flipped to **`Reconnecting…`**,
   captured live (`779-02-reconnecting.png`) — `useSessionEventStream`'s
   backoff loop noticing the dropped connection and scheduling a retry.
5. `779-03-resyncing.png` — a poll taken moments later; by this frame the
   indicator had already cleared (state back to `live`) faster than the
   polling cadence caught a clean `Resyncing…` frame — the RPC trace below
   is the harder evidence for that specific transition, and the unit
   suite's own `useSessionEventStream.test.ts` asserts the `resyncing`
   state directly (`gap detection` and `aged-out` tests both assert
   `result.current === 'resyncing'` mid-catch-up).

## The server-side trace — rpg-api's per-recipient send log

```
07:13:06 → GetStory started
07:13:06 ✓ GetStory completed in 0.00ms
07:13:06 → StreamEvents started
07:13:10 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=6  kind=moved
07:13:10 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=7  kind=moved
07:13:10 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=8  kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=9  kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=10 kind=fight_started
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=11 kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=12 kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=13 kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=14 kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=15 kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=16 kind=moved
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=17 kind=struck
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=18 kind=downed
07:13:13 DEBUG session stream: forwarded event session=2bd6c674-... recipient=char_a4fa00b3-... seq=19 kind=fight_ended

--- docker restart rpg-api issued here ---

07:14:08 INFO connecting to Redis address=redis:6379
07:14:08 INFO successfully connected to Redis address=redis:6379
07:14:08 gRPC server starting on port 50051...
07:14:10 → StreamEvents started
07:14:10 → GetStory started
07:14:10 ✓ GetStory completed in 0.00ms
```

Read together with the screenshots: the container's own restart log
(`gRPC server starting on port 50051...` at 07:14:08) lands squarely
between the pre-restart screenshot and the `Reconnecting…` one, and within
two seconds of the process coming back up, the client had already
re-subscribed `StreamEvents` **and** re-run `GetStory` — the (re)connect
catch-up rule 6 requires on every reconnect, not just a genuine mid-stream
gap. `GetStory` answers `entries: []` here (`0.00ms`) because this
particular fight had already fully resolved — struck/downed/fight_ended
all landed and were forwarded to seq 19 *before* the restart, so there was
nothing left for the client to have missed; the resync call still fires
unconditionally per (re)connect, which is exactly what proves the rule
runs on every connection, not only when there happens to be a gap to fill.

## What this satisfies

- Reconnect with backoff after a non-abort stream end: shown live
  (`Reconnecting…`) and in the server trace (a fresh `StreamEvents`
  RPC after the restart, no client crash, no manual reload).
- GetStory catch-up on every (re)connect: shown in the trace (`GetStory`
  immediately alongside every `StreamEvents started`, both the very first
  connect at 07:13:06 and the post-restart reconnect at 07:14:10).
- Stream state surfaced to the UI: `779-02-reconnecting.png`.

Gap detection, catch-up ordering/de-dupe, and the aged-out resync path are
each covered by a dedicated `useSessionEventStream.test.ts` case (a
push-driven fake stream gives deterministic control over event timing
relative to the `GetStory` call, which a live rpg-api container restart
cannot — this run currently has no in-flight beats to interrupt with a
genuine mid-stream *gap*, since the fight had already concluded by the
time of the restart). The live run above is the reconnect-after-drop half
of the picture; the unit suite is the gap/aged-out half.

## Files

- `779-01-mid-fight-before-restart.png` — mid-encounter state immediately
  before the container restart.
- `779-02-reconnecting.png` — the `stream-state` indicator reading
  `Reconnecting…`, captured live during the restart window.
- `779-03-resyncing.png` — a poll frame moments later, already back to
  `live` (indicator cleared) — see the note above on why the harder
  evidence for the resync transition itself is the RPC trace and the unit
  suite, not this particular frame.
