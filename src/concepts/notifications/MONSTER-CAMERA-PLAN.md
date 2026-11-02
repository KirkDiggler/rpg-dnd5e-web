# Monster-turn camera plan

Spec: rpg-project#799; operator approved toggle next to debug controls, off by default, visible monsters only, preserve zoom/angle. Stack on notification S1, separate worktree/branch.

## Shape

Paced playing beat → session focus selector (dial + current sighting + monster kind) → SessionCanvas → separate presentation focus request in useCameraControls → existing camera interpolation. The normal viewer focusTarget is untouched, so F/Center on me and orbit keep their meaning. Turn start centers once; later snapshots do not chase an actor or replay a completed request. No forced camera return at end of turn. Authority/pacing sequencing is unchanged.

## Tasks

1. Add default-off `followMonsterTurns` enum dial in existing notification controls; pin default and validation.
2. Add `useMonsterTurnFocus` with scoped actor/turn token, consuming TurnBeat and current SightedMember[]. Tests: off, on, visible monster, missing/remembered/player, repeated turn starts, scope reset. Result is a typed presentation focus with cube position and unique key.
3. Add optional keyed `presentationFocus` to SessionCanvas and the shared camera hook (THREE position there). Test real R3F hook: tactical band centers, keeps zoom/orientation, no retrigger on same key, Center on me still uses viewer, clearing stops the outstanding automatic interpolation.
4. Wire session onTurnBeat to both existing turn-order owner and focus selector. Use current revealedMembers; no roster-position substitution.
5. Mount real SessionCombatMap in notification Concepts, extend it to pass focus request and explicit fixture sightings. Use same focus selector and real pacing for sample monster turns. Controls remain debug only.
6. Focused tests, typecheck/lint, browser check, then full ci-check at PR boundary. Do not merge S1 or S2 automatically.
