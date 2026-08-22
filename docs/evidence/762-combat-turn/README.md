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
