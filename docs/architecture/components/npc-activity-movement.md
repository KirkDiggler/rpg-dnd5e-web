# NPC activity and movement presentation

The act supplies movement semantics. `WalkAct.forced=true` means external
physical displacement; false or absent means walking. Cause names, distance,
speed and opportunity-attack behavior are not classifiers.

## Owners

- `useCombatStoryPacing` retains causal presentation order and retires pending
  decorative cue delivery when movement is released. Catch-up does not animate.
- `arrivingWalk` carries the act's path and forced fact. Only voluntary local
  walks are excluded as duplicates of the Move RPC; a local member's forced
  movement is presented from the act stream like another member's movement.
- `useWalkPresentation` correlates the cursor's waiter with the scoped movement
  controller's exact actor/sequence. Cancellation and visibility loss discard
  that route, not a newer route.
- `SessionCanvas` passes route, sequence and forced fact to `HexEntity` for both
  the local character and other members.
- `useHexMovePath` is the sole position writer. Walking waits for the exact
  route's body readiness and takes the existing per-hex pace. Displacement
  bypasses that decorative gate, follows every supplied leg in a nominal
  180ms at presentation speed1, and reports the same exact completion. It
  does not derive a heading from the displacement direction. Authoritative
  end facing is released after settlement by the existing facing policy.
- `ClassCharacterModel` retains the one native mixer. During displacement,
  activity playback invalidates the old phase serial and counted-cue budget
  while holding the evaluated pose with a stopped mixer clock. Settlement
  restarts the configured default, using its Enter when present. Old cue IDs
  cannot revive; a new cue after settlement remains eligible. A late-loaded
  body evaluates its standing pose before holding, rather than freezing in
  bind pose. Unprofiled models hold their existing animation too.

The movement owner continues requesting frames while the mixer is held. No
second scheduler or positional tween owner is introduced. Immediate displacement
means no decorative wait when that act is presented; it does not jump ahead of
causally earlier acts. Neither route painting nor animation completion gates
commands or authoritative gameplay.

## Scope

There is no spell-specific branch, new impact animation, physics calculation or
teleport behavior here. Paths and endpoints remain supplied facts. Hidden or
remembered bodies do not bank motion for later replay. Missing/failed body art
does not hold forced displacement.

## Verification surfaces

`forcedDisplacement.test.tsx` joins generated acts to the real cursor, bridge
and controller. `SessionCanvas.test.tsx` verifies both actor paths to the real
position writer. `HexEntity.activityLifecycle.test.tsx` joins movement with the
native mixer during entry, sustain and exit; `forcedMovePath.test.tsx` checks
corners, large frames, gate bypass, heading and exact-sequence completion.
`activityCuePlayback.test.ts` and `ClassCharacterModel.animation.test.tsx`
cover cue retirement, pose holding, late loading and unprofiled bodies.
