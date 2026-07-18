# Live verification: ability-score confirm no longer fails (#460)

Driven directly via the Chrome DevTools Protocol (raw CDP over the `9222`
remote-debugging port — the Chrome DevTools MCP tools were not available in
this session) against a real `rpg-api` server built from `main`
(`AUTH_DEV_MODE=true`), the `rpg-envoy-dev` container, and this branch's
`vite` dev server.

## Sequence

1. Created a fresh character draft as dev player `charcreate460test` and
   worked through the wizard: Name (`CDP Test Hero`) → Race (Human, extra
   language Dwarvish) → Class (Rogue: 4 skills, primary/secondary weapon,
   equipment pack, expertise) → Background (Hermit). All four steps
   round-tripped through the real server and showed green checkmarks.
2. On the Ability Scores step, assigned all six standard-array values
   (15/14/13/12/10/8) to the six abilities and clicked **Confirm Ability
   Scores**.
3. **I viewed this frame** (`ability-scores-confirmed-460.png`): the section
   switched from the assignment grid to its read-only "already set" view,
   showing `Ability scores have been assigned` and the six scores rendered
   from the server's response (`response.draft.baseAbilityScores`) — Strength
   14, Dexterity 15, Constitution 12, Intelligence 13, Wisdom 8, Charisma 10.
   No error banner, no `NOT_FOUND`. This is the exact call
   (`UpdateAbilityScoresRequest` with the `ability_scores` oneof case) that
   always failed with `NOT_FOUND: dice session not found` before this fix —
   it now succeeds and persists.
4. Continued through the wizard: the Name field required an explicit
   `blur` to save (test-harness detail, not a bug — the input's `onBlur`
   calls `draft.setName`), after which **Begin Adventure!** enabled. Clicked
   it to finalize the draft into a real character.
5. **I viewed this frame** (`character-in-lobby-picker-460.png`): back on
   the Home screen, the character carousel now shows a second card next to
   `CREATE` — `CDP TEST H...`, `Lv1 Rogue`, selected, with `HP 9`, `AC 13`,
   full name `CDP TEST HERO`, `Level 1 Human Rogue`, and working `Play` /
   `View Sheet` / `Delete` actions. The character is a real, finalized,
   playable entity — not stuck mid-draft.
6. Clicked **View Sheet**.
7. **I viewed this frame** (`character-sheet-final-stats-460.png`): the full
   character sheet for `CDP TEST HERO` (Level 1 Human Rogue), Ability Scores
   section reading `STR 15 (+2)`, `DEX 16 (+3)`, `CON 13 (+1)`,
   `INT 14 (+2)`, `WIS 9 (−1)`, `CHA 11 (+0)` — exactly the base values
   assigned in step 2 plus Human's +1-to-every-ability racial bonus, applied
   correctly server-side. Proves the persisted data is not just "accepted"
   but computed correctly end to end.

## Additional failure mode this fix also avoids

Per review discussion on this PR: the server's `roll_assignments` validation
(`SetAbilityScoresFromRolls`) resolves roll IDs against dice-service sessions
keyed by `draft.PlayerID`, while the section's dice-session `entityId` was
computed independently client-side
(`propPlayerId || discord.user?.id || 'test-player'`). The dev `?playerId=`
override patches the gRPC auth header but not that client-side `entityId`
computation, so even a correctly-issued roll could reference the wrong
session under `?playerId=` dev testing — a second, independent way the old
`roll_assignments` path could fail. The `ability_scores` direct-value branch
used by this fix has no session/identity dependency at all, so it sidesteps
this failure mode too.

Also confirmed via `rpg-api` review: `CharacterService.RollAbilityScores` is
itself `Unimplemented` server-side today
(`internal/handlers/dnd5e/v1alpha1/handler.go:749-755`) — "Roll mode" is
dead at both ends of the stack, not just unwired on the client. Tracked
separately as
[rpg-api#660](https://github.com/KirkDiggler/rpg-api/issues/660).
