# Live gate — the debug combat log (rpg-dnd5e-web#740, rescoped 2026-08-23)

**Date:** 2026-08-23. **Environment:** rpg-api dev (session stack) on
`:50051` via envoy `:8080`, reseeded; player `toolkit-sandbox-barbarian`
(the fighter identity from this session's own #779 live check was left
`downed` — no revive verb exists on the wire — so this pass uses the
barbarian identity, which was untouched); web from this worktree
(`feat/740-debug-log`, stacked on #779/#783) on `:3003`. Driven headlessly
via `google-chrome --headless=new` (Playwright's `chrome` channel) and a
React-fiber walk for the movement click, same technique
`docs/evidence/254-monster-turn/README.md` and `docs/evidence/779-rule6/`
both used.

## What ran, in order

1. Character select (Toolkit Sandbox Barbarian) → Create lobby → Ready up
   → Start → free roam in the tomb (`740-01-free-roam.png`). The debug
   log panel is already visible, top-right, header reading "Combat log —
   live" — and already shows FIVE lines (`seq=2`..`seq=6`,
   `kind=UNKNOWN body=null`) from BEFORE this browser tab ever connected:
   rule 6's own initial `GetStory{from_seq:0}` catch-up recovering this
   session's pre-existing history, synthesized honestly as `UNKNOWN`
   since `GetStoryResponse.StoryEntry` carries no typed body (see
   `useSessionEventStream.ts`'s own doc comment) — the debug log and rule
   6 working together exactly as designed, not a defect.
2. Walked the entrance corridor two steps; the second step's approach
   brought the barbarian into sight range and formed a fight mid-path —
   `740-02-fight-formed-debug-log.png` shows the log picking up `moved`
   (four real steps, real coordinates) then `fight_started` with the full
   initiative order, live, the instant it happened.
3. Ended the local player's own turn so the skeleton's driven turn played
   out. `740-03-skeleton-turn-in-log.png` — **the acceptance case, read
   straight off the panel**: seq 11-18 is the skeleton's WHOLE turn,
   legible end to end from the feed alone —
   `moved to=(9,3)…(4,4)` six times, `missed attacker=Skeleton
   target=Toolkit Sandbox Barbarian roll=2 total=6 against=12
   attack.ref=melee attack.name="shortsword" type=PIERCING`, then
   `turn_ended`. Every seq visible in the panel (2 through 21 in that
   frame, 2 through 22 by the end of the run) is CONTIGUOUS — no gaps,
   confirmed by extracting every `seq=` token from the rendered DOM and
   diffing consecutive values in the driving script.
4. Toggled to Story mode — `740-04-story-mode.png`: the feed collapses to
   exactly one line, `Skeleton misses you — 6 vs AC 12.`, the SAME
   sentence `combatBeat.ts`'s `formatBeat` already produces for
   `CombatPanel`'s own beat line (`combatPanel.selection.lastBeat`,
   `DebugCombatLog`'s `storyLine` prop) — confirming Story mode is
   exactly "today's beat line," not a second narration system.

## Two-browser cross-visibility (fighter + barbarian) — not attempted

The brief's "ideally two browsers... showing each other's turns" is
explicitly a nice-to-have, not the acceptance bar. Given the fighter
identity is currently stuck `downed` in an un-revivable encounter (no v1
revive verb — see above) and the added setup cost of a second concurrent
lobby-join flow, this pass stopped at the single-browser acceptance case,
which the rescoped issue's own acceptance line ("a skeleton's whole turn
readable from the feed on :3003") does not require a second browser for.
Flagging honestly rather than skipping silently.

## What this satisfies

- Persistent, scrollable feed on the 3D route, one line per stream event
  in arrival order, with seq + clock + every raw fact the rescoped issue
  lists: names (from `Participants`, id on hover — see the component
  test for the exact assertion), `moved` coordinates, `struck`/`missed`
  roll/total/against/damage/type/crit/attack ref+name verbatim, `downed`,
  `turn_ended`+`next`, `fight_started`/`fight_ended`+order.
- Unknown bodies as JSON — the pre-existing `UNKNOWN` catch-up entries in
  `740-01` are the live proof, not just the unit test.
- Stream state (rule 6, #779) in the feed header — "Combat log — live" in
  every screenshot here.
- Debug default with a Story toggle, Story = today's beat line — both
  screenshots above.
- A skeleton's whole turn readable end to end, seqs contiguous —
  `740-03-skeleton-turn-in-log.png`.

## Files

- `740-01-free-roam.png` — free roam, debug log already showing
  pre-connection history recovered via rule 6.
- `740-02-fight-formed-debug-log.png` — the fight forming, captured live
  in the feed.
- `740-03-skeleton-turn-in-log.png` — the acceptance case: the skeleton's
  whole driven turn, legible end to end, contiguous seqs.
- `740-04-story-mode.png` — the Story toggle collapsing to today's beat
  line.
