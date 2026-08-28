# Live gate — three combat-turn walk bugs (web#770, web#771, web#772)

**Date:** 2026-08-23. **Environment:** rpg-api `dev` (`docker` container,
same envoy :8080 stack every prior 762 pass used), web on :3003 from
`.worktrees/turn-fixes` (branch `fix/combat-turn-walk-bugs`, off
`origin/dev`). **Player:** `toolkit-sandbox-fighter`.

Umbrella: rpg-project#251. All three found live by Kirk on `dev` (3b57e0c)
after PR #769 merged. TDD throughout: each fix has a failing test written
and watched red before the code changed, per team-lead's ordering
(#772 → #771 → #770).

## web#772 — hovering skeleton-2 reads "downed" until End Turn

**Kirk's report:** "I downed the first skeleton and when I moved to the
new skeleton on hover it said the skeleton was downed until I ended my
turn then it was ok."

**Investigated and ruled out first:** the ticket's own leading hypothesis
— that cf3d149's `attackTargets` DOWNED cross-check (`combatPanel.ts`) or
the hover label are keyed by display NAME rather than member id. Read
every lookup touching `otherMembers`/`sightedMembers`/`Turn.participants`
in `combatPanel.ts`, `SessionCanvas.tsx`, and `participantNames.ts` —
every one is keyed by `subject`/`member`, never `name`. Also checked
`SHORTFALL_REASON_DOWNED` in rpg-toolkit's own source
(`rulebooks/dnd5e/session/errors.go`, `standing.go`) — confirmed it fires
when the ACTING member is downed (ErrDowned), never about a target, so
it can't be misfiring on skeleton-2 as a target-downed signal either.

**Actual root cause, found live:** killed skeleton-1, then read
`Turn.participants` directly off the `CombatPanel` fiber the INSTANT the
"Skeleton is downed." beat landed — `skeleton-1` still reported
`isDowned: false` (stale), even though `GetView`'s own sighting for the
same subject already correctly read `Standing.DOWNED` (cf3d149's own
refetch trigger had already fired). `Turn.participants` — the roster
chips' own data source, and the "isDowned" this ticket's symptom is
actually about — only refetches on `fightStarted`/`fightEnded`, never on
`downed`. A `downed` event changes a participant's `Standing`, exactly
the kind of change the other two sources (Afford, View) already refetch
on since cf3d149 — Turn was simply left out. This is why End Turn "fixed
it": End Turn is one of the triggers that DOES refetch Turn.

**Fix:** `useCombatPanel.ts`'s `handleEvent` now also refetches Turn on a
`downed` event body, alongside the existing `fightStarted`/`fightEnded`
triggers.

**Regression coverage for the ticket's own explicit ask** ("add a test
with two sighted members sharing a name"): two new pure tests in
`combatPanel.test.ts` — one proving `attackTargets` excludes only the
DOWNED one of two same-named sighted members, one proving the roster
`participants` mapping keeps each same-named entry's `isDowned`
independent. Both already passed before this fix (cf3d149's keying was
correct) — they now stand as permanent regression guards.

**Live re-verified:** fresh fight, downed skeleton-1, walked to
skeleton-2, hovered its mesh directly (real `page.mouse` events, not the
fiber shortcut) — `combat-panel-hover` reads **"Attack Skeleton"**, no
stale downed text, no End Turn needed:
`05-772-fix-hover-correct-attack-label.png`.

## web#771 — after the fight, the path preview originates from the downed skeleton

**Kirk's report:** "when it ends the path looks like it continues from
the skeleton and the path follows wherever I go so we end up with a
really long path from the downed skeleton."

**Root cause:** `SessionCanvas.tsx`'s `meshHoveredSubject` — set by
`HexEntity.onPointerOver` when the cursor sits over an entity's OWN mesh
— never got cleared once the fight ended. `effectiveHoveredHex` prefers
`otherMembers.find(m => m.subject === meshHoveredSubject)?.position`
over the floor's own raycast hit whenever `meshHoveredSubject` is
truthy, so once it goes stale it pins the WHOLE indicator (path origin
for hovering-the-model AND, because it feeds `hovered` in
`useMoveIndicator`, every subsequent floor hover too) to that entity's
last-known cell — regardless of where the mouse actually moves next.

`onPointerOut` alone can't be trusted to fire here: a downed monster
typically swaps to a different pose/GLB variant that doesn't occupy the
same screen-space bounds the standing pose did, so the pointer never
technically "leaves" a mesh that effectively isn't there anymore.

**Confirmed live** two ways before touching code:
1. Fresh combat, hovered skeleton-2's mesh mid-fight (setting
   `meshHoveredSubject`), killed it (fight over), then hovered TWO
   different, clearly-separated floor points — both showed the exact
   same red/blue ring at the same fixed cell:
   `03-771-bug-stuck-ring-second-hover.png` (compare against the
   identical prior frame at a different real mouse position — same
   ring, unmoved).
2. Ruled out a competing hypothesis first: initially suspected
   `useSessionWalk.walkTo`'s own `busy` guard or a stale `displayPosition`
   (a genuinely FAILED walk attempt right after the fight produced zero
   server log lines). Root-caused with a temporary debug log in
   `walkTo`: `busy` was `false`, all guards passed, and
   `findAtlasPath(pathIndex, displayPosition, target)` legitimately
   returned an empty path — my own test target was simply outside the
   known atlas, not a bug. A retry at a verified-reachable coordinate
   (`9,-12,3`) walked correctly (`Move started`/`completed` in the
   server log, `myPosition` updated) — walking itself was never broken.
   Debug log removed before the real fix.

**Fix:** `SessionCanvas.tsx` now tracks (via a `prevAttackableRef`,
across renders) whether the currently mesh-hovered subject WAS an
offered attack target on the previous render. The moment it stops being
one — subject dropped from `attackableTargets` mid-fight, OR
`attackableTargets` itself goes from a real array to `undefined` (the
fight ending) — `meshHoveredSubject` clears. Deliberately NOT "clear
whenever not currently attackable": that condition also fires for a
plain free-roam hover where `attackableTargets` was never defined at
all, which must keep reporting via `onHoverEntity` exactly as before (a
first attempt at this fix broke that case — caught by the existing
`onHoverEntity` "over the model" test, fixed by keying on the
was-attackable-now-isn't transition instead of bare non-attackability).

**Live re-verified:** same fresh-fight-then-kill sequence, hovered a
NEW, distinct floor cell after the fight — the preview now correctly
draws a short blue path to THAT cell, not the corpse's:
`04-771-fix-follows-new-hover.png`.

## web#770 — the walk path preview disappears once combat starts

**Kirk's report:** "I lose the path highlighting once combat starts...
even though Move is affordable and the floor walks."

**Root cause, found via a temporary debug log in `useSessionAfford.ts`**
(reverted before the fix): right after the contact-forming walk, the
server's `Afford` response for the local player's turn contained a
`Declaration{verb: MOVE, slot: NONE, affordable: true, shortfall: ""}`
— with **no `remaining` field at all** (not `0` — genuinely absent from
the decoded object, confirmed via `optional int32 remaining = 5` in the
proto: bufbuild's JSON serialization only omits a field with real
explicit-presence tracking when the producer never set it). Confirmed
this wasn't "movement actually at zero" by dispatching a real `Move` RPC
to a nearby cell immediately after — it succeeded (`Move started` /
`completed` in the server log, position updated). So the server itself
says movement is affordable; it just didn't say how much.

`combatPanel.ts`'s existing code read a missing `remaining` as "nothing
to report" (`movement: null`), and `moveMaxCells` defaulted that to `0`
— which `moveIndicator.ts` then read as "zero cells available," turning
every hover more than zero cells away into a false `'invalid'` (red),
even though the floor's own click-to-walk (which never consults
`moveMaxCells`, only the real server response) kept working — exactly
matching "the floor walks" in Kirk's own report.

This looks like a genuine server-side wire gap (a Move declaration can
apparently be `affordable: true` without a `remaining` figure under some
condition not yet understood) worth a toolkit/rpg-api follow-up, but the
CLIENT's own reading of that gap was also wrong: a missing currency
figure should never be interpreted as "0 left" when the server's own
`affordable` flag says otherwise.

**Fix:** `combatPanel.ts`'s `moveMaxCells` is now `number | undefined`.
When a Move declaration exists, is `affordable: true`, but carries no
`remaining`, `moveMaxCells` is `undefined` (unbounded) rather than `0` —
`moveIndicator.ts` already documents `undefined` as its own "no known
bound, don't restrict" reading, so no downstream change was needed. An
UNaffordable Move with no `remaining` still reads `0`, unchanged — only
`affordable: true` earns the unbounded reading.

**Live re-verified**, same scene as the original repro (fresh contact,
Round 1, hovering an empty reachable cell): before the fix, red invalid
(`01-770-bug-red-invalid-on-empty-floor.png`); after, a clean blue path
through the exact same cells (`02-770-fix-blue-path-same-scene.png`).
Confirmed the fiber-level state directly too:
`selection.movement === null` (still nothing to show in the "Movement: X
ft" row — genuinely unknown) but `selection.moveMaxCells === undefined`
(not `0`).

## Tests

11 new (TDD, watched red before each fix): 3 pure in `combatPanel.test.ts`
(two same-name regression tests for #772's explicit ask, one for #770's
affordable-but-unbounded case, one companion unaffordable-stays-zero
case — 4 total), 1 integration in `SessionEncounterView.test.tsx` (Turn
also refetches on Downed — #772), 1 in `SessionCanvas.test.tsx` (stale
mesh-hover clears on the attackable transition — #771). Also split one
existing test (`STRUCK/MISSED/DOWNED/ENDED` → `STRUCK/MISSED/ENDED`) now
that `DOWNED` has its own, different (Turn-refetching) behavior.

Full suite: 3728 passed, 2 skipped. `npm run ci-check` green.
