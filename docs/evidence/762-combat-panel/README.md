# Combat panel — live evidence (rpg-dnd5e-web#762, "grow the HUD into a panel")

Captured 2026-08-22 against the local dev stack (`rpg-api` `dev` container,
`rpg-deployment/docker-compose.local-dev.yml`) with `npm run dev -- --port
3003` running from this branch's own worktree, driving the real Home ->
Lobby -> Ready -> Start flow headlessly with Playwright
(`playerId=toolkit-sandbox-barbarian`, real Chrome via `executablePath:
'/usr/bin/google-chrome'`), per the recipe `docs/evidence/762-slice5a/README.md`
and `docs/evidence/762-slice4/README.md` already document.
`redis-cli -p 6380 del "player:<id>:lobby"` ran first for a fresh lobby into
the reference tomb. Approaching the skeleton used the same fiber-walk
technique those two READMEs describe (walk the React fiber to the
`SessionCanvas` node and call its `onHexClick`/`onEntityClick` props
directly — the exact callbacks a real click on the raycast plane/a sighted
entity would fire); the panel's own `Attack`/`End Turn` buttons are real
HTML, clicked directly with `page.click`, no fiber-walk needed for those.

Two Playwright runs were needed: the first (with `toolkit-sandbox-fighter`)
rolled the SKELETON first in initiative — a legitimate, honest outcome the
panel handled correctly (`Attack` disabled "Not your turn.", canvas stayed
in `'move'` mode since targeting never activates on someone else's turn),
but not the sequence the brief asked to capture. A second run (with
`toolkit-sandbox-barbarian`) rolled the local player first; its four frames
are what's below.

## Frames

1. **`01-panel-on-fight-start.png`** — the instant the fight forms and the
   panel first renders on the turn clock. Round 1, the order strip
   (`char_...(you)` highlighted blue/active, `skeleton-1` dim), both shapes
   drawn (action lit blue — Afford says Attack is affordable and it's your
   turn), the declaration row "Attack — ready", "No target selected", and
   `Attack` correctly disabled with `title="Pick a target."` — `End Turn`
   enabled (it IS your turn).
2. **`02-target-selected.png`** — after a click on the skeleton (target
   mode: `SessionCanvas`'s `mode` prop is `'target'` here because it's your
   turn and Attack is affordable, per `combatPanel.ts`'s own `targeting`
   field). "Target: skeleton-1" now shown, and `Attack` is enabled (every
   gate satisfied: your turn, affordable, a target picked).
3. **`03-after-attack.png`** — after clicking `Attack`. The beat line at
   the bottom shows the REAL server response, verbatim:
   `Attack failed: [failed_precondition] attack: attacker "char_...": attack cannot be made: resolution: unreadable attack: nothing equipped in "main_hand"`.
   **This is a pre-existing, already-tracked gap in the dev fixtures**
   (`toolkit-sandbox-fighter` AND `toolkit-sandbox-barbarian` both have no
   weapon equipped server-side — matches `local-dev-loop.md`'s own note,
   "UI-created chars get equipment_slots:null → fight unarmed; devseed
   masks it"), not a bug in this PR — it is entirely outside session/combat-
   panel scope (character creation/equipment). What this frame DOES prove:
   the `Attack` RPC dispatch, the real server round-trip, and the
   catch-and-display-verbatim error path all work correctly end to end —
   `useCombatPanel`'s `attackSelectedTarget` caught the rejection and
   rendered `err.message` exactly as the "Attack failed: ..." doc comment
   on that function says it will. Because the swing never actually
   resolved, the economy was never spent — the action shape and
   declaration row are UNCHANGED from frame 2 ("Attack — ready", shape
   lit), which is the correct behavior for a refused (not merely missed)
   attack. The "shape goes dim, shortfall shows" path for a SUCCESSFUL
   spend is instead covered by `combatPanel.test.ts`'s "turn clock with
   Attack unaffordable" cases and `turnHud.test.ts`'s own — see those for
   the assertion, since a real successful swing needs the equipment gap
   fixed first.
4. **`04-after-end-turn.png`** — after clicking `End Turn`. `skeleton-1` is
   now the active order chip, both shapes read dim (not your turn — the
   panel dims them itself even though Afford's own answer never changed;
   see `combatPanel.ts`'s doc comment on why), and the line
   "Waiting on skeleton-1." is shown — exactly the honest "nothing more to
   do, the monster has no driver yet" state `SessionEncounterView.tsx`'s own
   module doc comment describes (toolkit work item B, in flight). Both
   buttons correctly disabled.

## What this does NOT show (covered by tests instead, not by live capture)

- **A successful Attack spending the economy** (shape -> dim, declaration
  row -> the shortfall) — blocked live by the equipment-fixture gap above.
  `combatPanel.test.ts`'s attack-gate and shape-gating describe blocks, plus
  `SessionEncounterView.test.tsx`'s "clicking Attack dispatches..." test
  (mocked `sessionClient.attack` returning a real hit), cover it fully.
- **A missed (not refused) Attack's beat line** — same equipment blocker;
  covered by `SessionEncounterView.test.tsx`'s "a missed Attack shows the
  miss beat line" test.
- **A DOWNED beat line** — the reference tomb's skeleton was never
  successfully struck in this pass. Covered by
  `SessionEncounterView.test.tsx`'s two DOWNED-event tests. **Gate review
  correction (rpg-dnd5e-web#769)**: the first version of this attributed
  the beat to the panel's currently selected target ("skeleton-1 is
  downed") — a guess rendered as a fact, which violates this panel's own
  "render only what the API said" contract. The wire has no typed "who"
  for DOWNED anywhere today: `Event` carries only the opaque passthrough
  payload (never decoded — see `useCombatPanel.ts`'s own doc comment), and
  `Sighting` has no downed state either. That gap is toolkit#1137 (open:
  "a cold client cannot learn who is DOWNED — the state exists only as a
  stream beat"). Fixed to render the honestly-anonymous "A member is
  downed." until that lands.
- **The full refetch-trigger matrix** (Afford's 7 kinds vs Turn's narrower
  3, `MOVED` triggering neither, the own-move/own-Attack/own-EndTurn round-
  trips, the fight-lock transition) — exercised end-to-end against the real
  `useSessionWalk`/`useSessionEventStream`/`useSessionAfford`/
  `useSessionTurn`/`useCombatPanel` hooks (only `sessionClient.*` mocked at
  the boundary) in `SessionEncounterView.test.tsx`'s "combat panel wiring"
  describe block.

## Files

- `src/api/useSessionTurn.ts` — the `Turn` RPC hook, same no-mount-fetch/
  last-good-on-error discipline as `useSessionAfford`.
- `src/api/useSessionAttack.ts`, `src/api/useSessionEndTurn.ts` — thin
  imperative-action hooks (`useEquipItem`'s own established pattern), one
  file per verb.
- `src/components/session/combatPanel.ts` — pure selector composing
  `turnHud.ts` with turn-ownership gating; 27 unit tests
  (`combatPanel.test.ts`).
- `src/components/session/useCombatPanel.ts` — the hook seam owning target
  selection, the beat line, and Attack/End Turn dispatch.
- `src/components/session/CombatPanel.tsx` — rendering; reuses
  `Shape.tsx`/`turnShapeText.ts` (split out of the old `turnShapes.tsx` so
  neither file breaks React Fast Refresh) so the three shapes are drawn
  identically to `TurnHud.tsx`, which still exists standalone underneath.
- `src/components/session/SessionCanvas.tsx` — new `onEntityClick` prop;
  `'target'` mode now selects the clicked entity instead of walking there
  (a floor click in that mode does nothing — a fight member can't walk).
- `src/components/session/SessionEncounterView.tsx` — wires the whole
  panel in, owns every Afford/Turn fetch.
