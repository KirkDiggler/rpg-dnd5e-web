# Minimal Live Combat Pacing Design

**Issue:** KirkDiggler/rpg-dnd5e-web#581

**Goal:** Put the accepted d20 pacing visualization on the real `EncounterView` attack path without adding server contracts or solving future NPC-specific timing.

## Scope

The first production slice begins presentation from each real `AttackResolved` event. It uses only the existing attack payload; it adds no proto, toolkit, API, entity, event, or stream metadata.

Every attack uses one default timing profile. Boss, elite, unique-monster, and per-player pace selection are deferred without deciding where that future classification belongs.

The slice retains the interaction that makes the accepted concept useful:

- The local player's attack pauses on an armed die and accepts a tap to throw.
- The die throws automatically after the existing timeout.
- Attacks by another player or an NPC autoplay.
- Hit and miss always render from `AttackResolved`.
- Crit and natural-1 treatments render only from fields already present on `AttackResolved`; they require no additional contract and do not block the base visualization.
- System reduced-motion preference preserves cue, verdict, and impact semantics while removing nonessential motion.

## Architecture

### Production-owned presentation components

Move the reusable beat sequencer and verdict stage from the concept directory into a production-owned combat-presentation directory. Keep `DiceTray` in its existing shared UI location. The `/concepts` route imports these same production components so it remains a fixture bench rather than a fork.

The production sequencer consumes one presentation-ready attack at a time. It must not import concept scenarios, fixture grouping, impact tiers, tuning controls, or event inspectors.

### Attack-first presentation queue

Add a small FIFO presentation queue owned by `EncounterView`. Its unit is one resolved attack:

```ts
interface CombatPresentationAttack {
  id: number;
  attack: AttackResolved;
  isViewerAttack: boolean;
}
```

`AttackResolved` creates and enqueues this unit immediately in callback arrival order. The local `id` exists only as a stable React/queue identity; it is not sent by the server and carries no game meaning. The queue does not wait for `ActionResolved`, `EntityDamaged`, `TurnStateChanged`, correlation metadata, or a correlation-complete marker. This naturally supports misses, hits, opportunity attacks, and repeated attacks as independent presentations.

`EntityDamaged`, `ActionResolved`, `EntityDied`, and every other stream event remain outside this first presentation queue. The client never derives damage, hit state, critical state, impact severity, or attack grouping.

### Encounter integration

`EncounterView` keeps every existing authoritative reducer call synchronous:

- `EntityDamaged` updates HP immediately.
- Mode, economy, turn, death, and removal events update state immediately.
- No stream callback awaits a timer or animation.
- Targeting, movement, menus, and End Turn remain enabled during presentation.

The live presentation overlay mounts inside the map's existing `position: relative` container. It is absolute, map-centered, and `pointer-events: none`; only the armed die's explicit throw control may opt into pointer input. It must not block map targeting outside that control.

### Combat log

The combat log remains unchanged in this slice. It continues recording `ActionResolved`, `AttackResolved`, `EntityDamaged`, and `EntityDied` immediately. This means a visible log or immediate HP change can reveal a hit before theater finishes; that is an accepted first-slice limitation. Delaying narrative is a separate presentation decision to make after the live tray has been exercised, not a prerequisite for proving the tray belongs on the game screen.

## Timing And Outcomes

Use the accepted default Cinematic timing for the first attack presentation. Do not inspect monster references, entity IDs, HP, region archetypes, or challenge rating to choose timing. Do not add boss or unique timing in this slice.

The existing resolved fields are authoritative:

- `attackRoll` supplies the settled d20 face.
- `attackBonus` and `targetAc` supply the displayed comparison.
- `hit` selects HIT or MISS and determines whether Impact is eligible.
- `critical` selects CRIT when present.
- `attackRoll === 1 && !hit` selects the existing natural-1 presentation.

Damage is not part of this presentation slice. A hit still runs the sequencer's existing Impact beat, where the verdict remains visible, but no damage amount or qualitative impact tier is shown.

## Discontinuities And Cleanup

Immediately flush active and queued presentation and cancel timers on:

- `SnapshotDelivered`, including reconnect snapshots;
- leaving turn-based mode;
- encounter end;
- component unmount.

Do not flush on `TurnStarted` or `TurnEnded`. The server's normal NPC loop publishes an NPC attack and then immediately advances to the next turn; a destructive turn-boundary flush would erase witnessed NPC theater before it becomes visible. Authoritative turn state still advances immediately while the independent attack presentation finishes.

This slice does not inspect sequence metadata. Snapshot and lifecycle boundaries provide its explicit reset signals. A later reassembly feature may define sequence-discontinuity behavior if live evidence shows it is needed.

Flush behavior prioritizes current screen state over preserving animation. No delayed callback may show stale theater after a flush.

## Accessibility

- Exactly one live `role="status"` verdict is announced per presented attack.
- The tumbling die remains hidden from assistive technology; the verdict contains the readable result.
- Reduced motion comes from the user's system preference and remains live while the view is mounted.
- Reduced motion removes tumble, travel, shake, pulse, and entrance/exit animation but preserves the final die face, verdict, and any authoritative damage text.

## Verification

Unit and integration tests must prove:

- A local-player attack reaches Armed, throws on tap, and auto-throws at the existing timeout.
- Another player or NPC attack autoplays without exposing the throw control.
- A miss presents and releases without `EntityDamaged`.
- A hit presents without consuming or displaying `EntityDamaged`.
- HP changes in the same stream turn that receives `EntityDamaged`, before presentation releases.
- Combat-log entries retain their existing immediate behavior.
- Existing crit and natural-1 fields select their accepted verdicts without new metadata.
- Reduced motion preserves readable outcomes and suppresses motion.
- Snapshot, mode-exit, encounter-end, and unmount flushes cancel theater without affecting authoritative state or the combat log.
- Turn boundaries update authoritative state immediately without clearing an attack presentation that is already active or queued.
- The overlay does not intercept normal map input.
- `/concepts` still exercises the same production-owned sequencer, stage, and tray.

Run targeted Vitest files during development, then `npm run ci-check`. Complete the issue only after a local player-route playtest visibly confirms at least one hit and one miss without state or input blocking.

## Deferred

- NPC grunt versus elite/boss timing, including whether a future role belongs on an entity, a monster definition, an encounter assignment, or somewhere else.
- Per-player Cinematic, Brisk, Instant, or quick/auto preferences.
- Correlated damage presentation, delayed combat-log narrative, and sequence-discontinuity reassembly.
- Final art, audio, damage dice, discarded advantage dice, and 3D physics dice.
- Client inference from monster references, entity IDs, HP, challenge rating, or map regions.
