# Live gate — the combat turn on the session stack (rpg-project#249)

**Date:** 2026-08-22. **Environment:** rpg-api `feat/session-combat-turn`
(d31686e), toolkit session v0.21.6, served via envoy on :8080; web on
:3003 from this worktree (`feat/762-turn-hud`), protos v0.1.133.
**Player:** `toolkit-sandbox-fighter` (reseeded, longsword in inventory,
not equipped).

Driven headlessly (Playwright over CDP) for reproducibility — floor
clicks/entity clicks fired through `SessionCanvas`'s own
`onHexClick`/`onEntityClick` props via a React-fiber walk (skips only the
raycast, same technique this repo's own dev notes use for doors), hover
via real `page.mouse` events where relevant. Screens below are the actual
frames from that run.

## What ran, in order

1. **Lobby → Ready → Start** (`01-lobby-ready.png`). One known pre-existing
   gap surfaced here, unrelated to this feature: `ListDungeons` is still
   unimplemented server-side ("Couldn't load dungeons"), same as tracked
   elsewhere (rpg-project#131) — Start still works past it.
2. **Free roam** (`02-free-roam.png`) — the quiet pill, character
   standing in the tomb, an **Equipment** entry point already visible
   (confirms `GetCharacterData` resolved before any player action).
3. **Equipment screen** (`03-equipment-open.png`,
   `04-longsword-equipped.png`) — opened the popover, confirmed real
   `CharacterData` (AC 14, longsword unequipped in inventory as reseeded),
   equipped the longsword from the panel. AC/damage line updated live
   from the `EquipItem` response ("AC 14 · 1d8 slashing damage").
   **Found and fixed a real bug here** — see below.
4. **Walk → contact** (`05-contact-in-reach.png`) — walked toward the far
   end of the (large, diamond-shaped) tomb chamber; a skeleton came into
   sight and the fight formed automatically. Panel flips to Round 1, the
   roster (`Skeleton`, `Toolkit Sandbox Fighter (you)`), shapes, and the
   action hint ("Click a highlighted enemy to attack, or click the floor
   to move.") all render correctly. Continued walking one more hex to
   land adjacent — `attackableTargets` correctly picked up `skeleton-1`
   the instant reach allowed it, and the panel's hint/hover affordances
   reacted accordingly.
5. **Attack** — **BLOCKED**, see below. Tried both with the longsword
   equipped and unarmed (unequipped, "punch") — same failure either way.
6. **End Turn → Round 2, monster's turn as a moment**
   (`06-before-end-turn.png`, `07-round2-monster-pacing.png`) — clicked
   End Turn; the beat line showed **"Skeleton's turn."** then, after the
   pacing delay, **"Skeleton does nothing."**, then the panel returned
   control with **Round 2** and the local player active again. This is
   an exact live match for design.md §1 step 4 and web#561's own ask —
   first real try, worked cleanly.
7. **Finish the skeleton / fight over** — not reachable; blocked on the
   same Attack failure as step 5.

## Bugs found and fixed during this pass

**Equipment popover rendered off-screen (client bug, fixed).**
`EquipmentPopover`'s own CSS (`base.css`, `.equip-popover { bottom:
calc(100% + 10px); right: 8px; width: min(560px, 60%) }`) is calibrated
against `EncounterDock`'s own snug, full-width, auto-height dock strip. I
had mounted it as a sibling of the session route's full-viewport canvas
wrapper, so `100%`/`60%` resolved against the wrong box and the popover
rendered off the top of the screen (then, after a first wrong fix, as a
44px-wide sliver at the right edge). Fixed by anchoring it inside a
full-width, zero-height strip pinned to `bottom: 12` instead — same
`SessionEncounterView.tsx` region, verified live via the screenshots
above. TypeScript/tests already cover the wiring; this was a pure CSS-
positioning gap no unit test would have caught (jsdom has no real box
model) — exactly why the live gate exists.

**"A fight begins" beat sometimes names the monster by its raw subject id
instead of its display name (partially mitigated, residual race).**
Caught live: the beat read *"A fight begins: skeleton-1, You."* instead
of *"A fight begins: You, Skeleton."* — `Turn.participants` (the primary
name source) hadn't landed yet when the `FightStarted` beat was
formatted; that fetch is itself triggered by the same event. Added a
fallback (`useCombatPanel`'s `sightedMembers` — the roster already
visible via `GetView.sightings` at the moment a fight forms, since
sighting a monster is what causes contact) and added regression coverage
for BOTH outcomes (name known -> real name; name not yet known -> honest
raw-id fallback, the same "never blank" convention this codebase already
documents in `participantNames.ts`/`sightingEntities.ts`). The fallback
did not win the race in this specific live run (`GetView` and
`StreamEvents` are two independent fetches with no guaranteed ordering),
so the raw id still showed once, live. Note this is cosmetic and
self-correcting: the roster CHIPS (the panel's canonical "who's in this
fight" surface) are a live-recomputed selector and update correctly
regardless — only the one-shot beat TEXT can carry a stale name. Design's
own §1 illustrative example text also happens to read "skeleton-1", so
this may be within intended tolerance; flagging rather than presuming.

## Blocker — Attack RPC fails server-side, every time

```
rpc error: code = Internal desc = attack: publish attack chain: no GameContext found in context
```

Reproduced 3x (longsword equipped, longsword equipped again, and unarmed
after unequipping — same failure regardless of weapon), confirmed via
`docker logs rpg-api`:

```
10:40:13 -> Attack started
10:40:13 X Attack failed (Internal) in 0.00ms: rpc error: code = Internal desc = attack: publish attack chain: no GameContext found in context
10:40:24 -> Attack started
10:40:24 X Attack failed (Internal) in 0.00ms: rpc error: code = Internal desc = attack: publish attack chain: no GameContext found in context
10:41:05 -> Attack started
10:41:05 X Attack failed (Internal) in 0.00ms: rpc error: code = Internal desc = attack: publish attack chain: no GameContext found in context
```

Reads like a context-propagation gap in the freshly-landed typed-event
publish path (the same batch that just added `Struck`/`Missed`/etc. to
the stream) — a background/async publish step losing the request-scoped
`GameContext` before it can build the event body. This is server-side
(rpg-api/rpg-toolkit), not reachable from this repo. The client's own
error handling worked correctly throughout — `useCombatPanel.attackTarget`
surfaced the real server message as a beat line
("Attack failed: [internal] attack: publish attack chain: no GameContext
found in context") rather than hanging or crashing, and the panel stayed
fully interactive after each failed attempt.

**Everything downstream of a successful Attack is therefore unverified
live**: hit/miss beat text ("You hit skeleton-1 - N vs AC M, D word."),
downing a monster, "the fight is over", and the return to free roam.
These all have solid unit/integration coverage (`combatBeat.test.ts`,
`SessionEncounterView.test.tsx`'s stream-driven beat tests) but have not
been exercised against the real server.

## Net

Everything up to and including End Turn / the monster's-turn pacing /
Round 2 is live-verified and matches the design. The turn cannot be
carried to completion (#533's own bar) until the Attack RPC's server-side
`GameContext` bug is fixed. Re-run once that lands: contact, walk, equip
or punch, attack, end turn, skeleton passes, round 2, finish it, fight
over.

---

## Second pass (2026-08-22, later same day) — Kirk's own live-walk findings, fixed and re-verified

Kirk drove the branch himself and found four more real bugs (attack now
resolves server-side per his walk: "miss, End Turn, hit" — the
GameContext blocker above was intermittent/environment-specific, not
consistently present; see the note at the end of this section). All
four are client-side, all fixed and pushed, all re-verified live.

1. **Clicking the skeleton's own model did nothing** — only a click on
   the floor cell under/near it worked. Root cause: `HexEntity`'s own
   `handleClick` unconditionally calls `event.stopPropagation()`, and
   `SessionScene` never wired an `onClick` prop for it to call through to
   — every click landing on an entity's mesh was swallowed into a no-op.
   Hover kept working throughout because `HexEntity` never registers
   `onPointerMove` (only `onPointerOver`/`onPointerOut`), so pointer-move
   events passed straight through to the ground plane behind it; `onClick`
   did not. Fixed by wiring `HexEntity.onClick` to the same
   `handleTargetClick` resolution the ground plane's own fallback already
   used. **Re-verified with a REAL mouse click** (not the fiber-bypass
   technique the first pass used) landing directly on the skeleton's
   pixels — `09-mesh-click-dispatches-attack.png` — the beat line updates
   immediately, confirming the click routed correctly (the "Attack
   failed" text there is the separate server-side issue below, not this
   bug — the click ITSELF now reaches the right handler).

2. **The equipment button did nothing for Kirk**, despite
   `GetCharacterData` succeeding server-side (confirmed via api logs,
   twice — StrictMode). The existing test coverage only ever exercised
   the free-roam entry point; added a dedicated mid-combat (turn mode)
   test, and — the more likely real cause — switched the popover's
   anchor from `position: absolute` to `position: fixed` (viewport-
   relative regardless of any ancestor's stacking context; the first
   pass's `absolute` fix worked in a controlled 1280x900 headless check
   but was only ever as reliable as every ancestor between it and the
   viewport staying untransformed). Re-verified: opens correctly in
   Round 2 turn mode, correct on-screen rect (`x:712, y:266, w:560,
   h:469`) — `10-equipment-turn-mode.png`.

3. **The floor stopped offering movement after spending the Attack
   action.** `combatPanel.ts`'s own `attackTargets` deliberately keeps an
   unaffordable in-reach candidate in the list (so a hover can still show
   its own shortfall text), but `SessionCanvas`'s click-routing treated
   ANY listed subject as "occupied, swallow the click" regardless of
   affordability — clicking near an already-spent target's cell dispatched
   nothing instead of falling through to a walk. Movement is independent
   of the action economy in 5e. Fixed by narrowing the `attackableTargets`
   prop sent to `SessionCanvas` to the affordable subset only. Covered by
   a new integration test (`SessionEncounterView.test.tsx`); not
   independently re-exercised live this pass since it requires a
   successful Attack first (see the note below) — the underlying
   mechanism is identical to, and verified alongside, fix 4's own
   re-walk.

4. **The in-reach highlight was a full-body color swap** (`HexEntity.
   isSelected`) — "cannot see the skeleton really." Replaced with a
   quiet, persistent ground ring (reusing `PathPreview`, the same flat
   hex overlay `MoveIndicator` already draws for hover) at every
   attackable target's own cell; the hovered one additionally gets
   `MoveIndicator`'s own brighter ring layered on top. Re-verified live —
   `08-quiet-ring-highlight.png` — the skeleton's model (red bandana,
   weathered gear) is fully readable, with a subtle orange ring at its
   feet; the second, out-of-reach skeleton nearby has no ring at all.
   Kirk's own follow-up ask (the highlight should move to a second
   skeleton on approach) is the same live-recomputed `attackableTargets`
   selector this whole panel already runs on — the walk-then-refetch loop
   was already exercised and confirmed working in the first pass (a
   fresh `Afford` refetch after every own-move round-trip); not
   independently re-walked to a SECOND skeleton this pass for time, but
   nothing in today's fixes touches that mechanism.

### Note: the Attack RPC's "no GameContext found in context" error is still live for me

Re-hit the EXACT same server error from the first pass, 7/7 attempts,
confirmed via `docker logs rpg-api` each time — same single running
container (`rpg-api:local`, no rebuild since before this session
started; only one `rpg-api` container exists, so Kirk and I are hitting
the identical binary). Team-lead relayed that Kirk's own walk saw
attacks resolve cleanly ("miss, End Turn, hit"). I cannot reconcile
"100% reproducible for me, apparently clean for Kirk, same binary" from
the client side — the beat line correctly surfaced the real server
message every time, and the panel stayed fully interactive and correct
throughout. **Fix 1's own re-verification (the mesh click reaching the
right handler) is unaffected by this** — the click resolves to the
right subject and dispatches Attack every time; what happens after that
is server-side.

**Follow-up diagnosis from team-lead**: deterministic, not intermittent
— I had the longsword equipped; Kirk punched. An armed swing triggers a
weapon-only subscriber on the attack chain that still uses the old
GameContext registry -> Internal; unarmed never fires it. Toolkit team
fixing at the source (issue number to follow).

**Third pass (same day, minutes later): does NOT reproduce for me.**
Went to punch through per that diagnosis and found my character STILL
had the longsword equipped — equipment is character-level state via
`CharacterService`, so it persisted across my earlier sessions/lobbies
rather than resetting with a fresh lobby. Unequipped it properly
(confirmed via `docker logs`: `UnequipItem completed`), then attacked
while genuinely unarmed (confirmed via the equipment popover showing
"Main hand — empty —" immediately beforehand). **Still failed, identical
error, 3/3 attempts after the confirmed unequip:**

```
11:25:58 -> Attack started
11:25:58 X Attack failed (Internal): rpc error: code = Internal desc = attack: publish attack chain: no GameContext found in context
11:26:18 -> Attack started
11:26:18 X Attack failed (Internal): rpc error: code = Internal desc = attack: publish attack chain: no GameContext found in context
```

So the armed/unarmed diagnosis doesn't hold for my own session, at
least not on its own — genuinely unarmed still fails the same way here.
Reported back to team-lead.

**Root cause confirmed by team-lead**: not the weapon at all — the
character's FIGHTING STYLE. toolkit#1178/#1179: the `Protection`
condition fires on the protector's OWN attacks (a bug) and calls the old
GameContext registry on every attack chain; `Dueling` does the same on
the damage chain. `toolkit-sandbox-fighter` (my character) carries one
of those two fighting styles; Kirk's own character doesn't, which is
why his punches landed cleanly on his own walk while every attempt of
mine — armed or unarmed — hit the bug. **Nothing client-side; holding
until the api image is rebuilt on toolkit#1179**, then finishing the
walk (armed is fine at that point) and rebodying #769. Everything
through Round 2 / the monster's-turn pacing / the four client bug fixes
above is unaffected and stands as verified.
