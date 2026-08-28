/**
 * useCombatLog — accumulates the server-pushed v1alpha2 combat events into a
 * scrolling game log for EncounterView's Combat Log panel (#445). It's the
 * game-grade rendering of the same events PlaytestHarness's dev-log already
 * prints as raw text — reshaped here into typed entries so the CombatLog
 * component can style each event kind (hit/miss/crit, damage, status,
 * turn cycle, action resolution, death, death-save arc, encounter end)
 * instead of dumping one undifferentiated line of text.
 *
 * No derived math: every entry stores the raw proto event verbatim.
 * CombatLog reads fields straight off `entry.event` at render time — nothing
 * here recomputes a roll, total, or hit/miss verdict.
 *
 * `entityMoved` (#738) is the one deliberate exception: the wire carries
 * positions, not narration, so `recordEntityMoved` derives a terse
 * toward/away verb (see `describeEntityMovement` in `utils/combatFormat.ts`)
 * and stores it alongside the raw event. It also gates on mode + entity
 * type — TURN_BASED MONSTER movement only, matching the design's boundary
 * voice (no coordinates/hex counts/HP) and its explicit v1 scope (player
 * movement is silent for now; see the comment inside recordEntityMoved for
 * the one-line change that widens it later).
 *
 * Round tagging: only TurnStarted carries a `round` field on the wire, so
 * this hook tracks the current round internally (updated on every
 * TurnStarted) and stamps it onto every entry recorded afterward — mirrors
 * how useEncounterState.state.round is derived, without requiring every
 * recordX call to also pass a round.
 */

import type {
  ActionResolved,
  AttackResolved,
  DeathSaveRolled,
  EncounterEnded,
  EntityDamaged,
  EntityDied,
  EntityMoved,
  EntityRemoved,
  EntityStabilized,
  StatusApplied,
  StatusRemoved,
  TurnEnded,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import {
  EncounterMode,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useRef, useState } from 'react';
import type { CubeCoord } from '../components/hex-grid/hexMath';
import {
  describeEntityMovement,
  type MovementNarration,
} from '../utils/combatFormat';

/** Cap on retained entries — bounds memory for a long fight. Oldest entries drop first. */
const MAX_ENTRIES = 100;

export type CombatLogEntry =
  | { id: number; round: number; kind: 'attack'; event: AttackResolved }
  | { id: number; round: number; kind: 'damage'; event: EntityDamaged }
  | { id: number; round: number; kind: 'statusApplied'; event: StatusApplied }
  | { id: number; round: number; kind: 'statusRemoved'; event: StatusRemoved }
  | { id: number; round: number; kind: 'turnStarted'; event: TurnStarted }
  | { id: number; round: number; kind: 'turnEnded'; event: TurnEnded }
  | {
      id: number;
      round: number;
      kind: 'actionResolved';
      event: ActionResolved;
      /**
       * D&D-voice targeting rationale ref (e.g. `dnd5e:targeting:lowest-hp`,
       * Monster AI slice 1, rpg-dnd5e-web#733). Read defensively off the raw
       * event rather than `event.targetRationale` because the generated
       * `ActionResolved` type doesn't carry `target_rationale` yet
       * (rpg-api-protos#215) — this field works both before and after the
       * proto bump, and flips to typed access once it lands. Undefined
       * (pre-bump) and empty string (post-bump, no rationale) both mean "no
       * rationale" to CombatLog.
       */
      targetRationale?: string;
    }
  | { id: number; round: number; kind: 'died'; event: EntityDied }
  | { id: number; round: number; kind: 'removed'; event: EntityRemoved }
  | {
      id: number;
      round: number;
      kind: 'encounterEnded';
      event: EncounterEnded;
    }
  | {
      id: number;
      round: number;
      kind: 'deathSaveRolled';
      event: DeathSaveRolled;
    }
  | {
      id: number;
      round: number;
      kind: 'entityStabilized';
      event: EntityStabilized;
    }
  | {
      id: number;
      round: number;
      kind: 'entityMoved';
      event: EntityMoved;
      /** Derived toward/away verb — see the module doc comment's "one
       * deliberate exception" note. */
      narration: MovementNarration;
    };

/**
 * Everything `recordEntityMoved` needs to decide whether an `EntityMoved`
 * event produces a log entry, and to derive its narration if so. All of it
 * is cheaply available at the `onEntityMoved` call site (EncounterView
 * already tracks entity positions/types/mode for rendering) — this hook
 * does no lookups of its own, only the gating + derivation.
 */
export interface EntityMovedContext {
  /** EntityType of the entity that moved. */
  movingEntityType: EntityType;
  /** Current encounter mode — movement is narrated only during TURN_BASED
   * combat; FREE_ROAM wandering produces no entry. */
  mode: EncounterMode;
  /** The mover's position before this move. Undefined (a just-appeared
   * entity, or a cache miss) degrades the narration to a neutral "moves"
   * rather than fabricating a direction. */
  from: CubeCoord | undefined;
  /** The mover's resolved destination for this move (actualPath's last
   * hex — the same value the position-cache update uses). */
  to: CubeCoord;
  /** Other CHARACTER entities' current positions, used to find whichever
   * one this move brought the mover closer to or further from. */
  characterPositions: Array<{ entityId: string; position: CubeCoord }>;
}

export interface UseCombatLogResult {
  entries: CombatLogEntry[];
  recordAttackResolved: (event: AttackResolved) => void;
  recordEntityDamaged: (event: EntityDamaged) => void;
  recordStatusApplied: (event: StatusApplied) => void;
  recordStatusRemoved: (event: StatusRemoved) => void;
  recordTurnStarted: (event: TurnStarted) => void;
  recordTurnEnded: (event: TurnEnded) => void;
  recordActionResolved: (event: ActionResolved) => void;
  recordEntityDied: (event: EntityDied) => void;
  recordEntityRemoved: (event: EntityRemoved) => void;
  recordEncounterEnded: (event: EncounterEnded) => void;
  recordDeathSaveRolled: (event: DeathSaveRolled) => void;
  recordEntityStabilized: (event: EntityStabilized) => void;
  recordEntityMoved: (event: EntityMoved, context: EntityMovedContext) => void;
}

export function useCombatLog(): UseCombatLogResult {
  const [entries, setEntries] = useState<CombatLogEntry[]>([]);
  // Monotonic id for entries — a stable React key independent of array
  // position (mirrors PlaytestHarness's logIdRef pattern).
  const idRef = useRef(0);
  const roundRef = useRef(0);

  const pushEntry = useCallback((entry: CombatLogEntry) => {
    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES
        ? next.slice(next.length - MAX_ENTRIES)
        : next;
    });
  }, []);

  const recordAttackResolved = useCallback(
    (event: AttackResolved) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'attack',
        event,
      });
    },
    [pushEntry]
  );

  const recordEntityDamaged = useCallback(
    (event: EntityDamaged) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'damage',
        event,
      });
    },
    [pushEntry]
  );

  const recordStatusApplied = useCallback(
    (event: StatusApplied) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'statusApplied',
        event,
      });
    },
    [pushEntry]
  );

  const recordStatusRemoved = useCallback(
    (event: StatusRemoved) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'statusRemoved',
        event,
      });
    },
    [pushEntry]
  );

  const recordTurnStarted = useCallback(
    (event: TurnStarted) => {
      roundRef.current = event.round;
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'turnStarted',
        event,
      });
    },
    [pushEntry]
  );

  const recordTurnEnded = useCallback(
    (event: TurnEnded) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'turnEnded',
        event,
      });
    },
    [pushEntry]
  );

  const recordActionResolved = useCallback(
    (event: ActionResolved) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'actionResolved',
        event,
        // Defensive read: target_rationale (rpg-api-protos#215) isn't on the
        // generated ActionResolved type yet. Absent/empty both mean "no
        // rationale" — see the CombatLogEntry doc comment above.
        targetRationale: (event as { targetRationale?: string })
          .targetRationale,
      });
    },
    [pushEntry]
  );

  const recordEntityDied = useCallback(
    (event: EntityDied) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'died',
        event,
      });
    },
    [pushEntry]
  );

  const recordEntityRemoved = useCallback(
    (event: EntityRemoved) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'removed',
        event,
      });
    },
    [pushEntry]
  );

  const recordEncounterEnded = useCallback(
    (event: EncounterEnded) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'encounterEnded',
        event,
      });
    },
    [pushEntry]
  );

  // Death-save arc (rpg-toolkit#742, wave KirkDiggler/rpg-project#75): mirrors
  // PlaytestHarness's log-only onDeathSaveRolled/onEntityStabilized handling,
  // reshaped into typed entries like every other event here. Derived fields
  // (is_critical_fail/success, stabilized, dead, ...) are copied verbatim by
  // CombatLog's render — never recomputed.
  const recordDeathSaveRolled = useCallback(
    (event: DeathSaveRolled) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'deathSaveRolled',
        event,
      });
    },
    [pushEntry]
  );

  const recordEntityStabilized = useCallback(
    (event: EntityStabilized) => {
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'entityStabilized',
        event,
      });
    },
    [pushEntry]
  );

  // #738: narrate monster movement so a decisive positioning choice (walking
  // past a closer target to reach a farther, more urgent one) isn't invisible
  // in the log. Gated here rather than at the call site so the whole
  // "should this produce an entry, and what does it say" decision lives in
  // one tested place.
  const recordEntityMoved = useCallback(
    (event: EntityMoved, context: EntityMovedContext) => {
      if (context.mode !== EncounterMode.TURN_BASED) return;
      // v1 scope: only monster movement is narrated — a line per player
      // step is noise the in-fiction voice doesn't want (design call,
      // rpg-dnd5e-web#738). Widen to
      // `context.movingEntityType === EntityType.MONSTER ||
      //  context.movingEntityType === EntityType.CHARACTER`
      // to narrate player movement too.
      if (context.movingEntityType !== EntityType.MONSTER) return;
      const narration = describeEntityMovement(
        context.from,
        context.to,
        context.characterPositions
      );
      pushEntry({
        id: idRef.current++,
        round: roundRef.current,
        kind: 'entityMoved',
        event,
        narration,
      });
    },
    [pushEntry]
  );

  return {
    entries,
    recordAttackResolved,
    recordEntityDamaged,
    recordStatusApplied,
    recordStatusRemoved,
    recordTurnStarted,
    recordTurnEnded,
    recordActionResolved,
    recordEntityDied,
    recordEntityRemoved,
    recordEncounterEnded,
    recordDeathSaveRolled,
    recordEntityStabilized,
    recordEntityMoved,
  };
}
