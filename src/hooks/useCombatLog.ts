/**
 * useCombatLog — accumulates the server-pushed v1alpha2 combat events into a
 * scrolling game log for EncounterView's Combat Log panel (#445). It's the
 * game-grade rendering of the same events PlaytestHarness's dev-log already
 * prints as raw text — reshaped here into typed entries so the CombatLog
 * component can style each event kind (hit/miss/crit, damage, status,
 * turn cycle, death, encounter end) instead of dumping one undifferentiated
 * line of text.
 *
 * No derived math: every entry stores the raw proto event verbatim.
 * CombatLog reads fields straight off `entry.event` at render time — nothing
 * here recomputes a roll, total, or hit/miss verdict.
 *
 * Round tagging: only TurnStarted carries a `round` field on the wire, so
 * this hook tracks the current round internally (updated on every
 * TurnStarted) and stamps it onto every entry recorded afterward — mirrors
 * how useEncounterState.state.round is derived, without requiring every
 * recordX call to also pass a round.
 */

import type {
  AttackResolved,
  EncounterEnded,
  EntityDamaged,
  EntityDied,
  EntityRemoved,
  StatusApplied,
  StatusRemoved,
  TurnEnded,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { useCallback, useRef, useState } from 'react';

/** Cap on retained entries — bounds memory for a long fight. Oldest entries drop first. */
const MAX_ENTRIES = 100;

export type CombatLogEntry =
  | { id: number; round: number; kind: 'attack'; event: AttackResolved }
  | { id: number; round: number; kind: 'damage'; event: EntityDamaged }
  | { id: number; round: number; kind: 'statusApplied'; event: StatusApplied }
  | { id: number; round: number; kind: 'statusRemoved'; event: StatusRemoved }
  | { id: number; round: number; kind: 'turnStarted'; event: TurnStarted }
  | { id: number; round: number; kind: 'turnEnded'; event: TurnEnded }
  | { id: number; round: number; kind: 'died'; event: EntityDied }
  | { id: number; round: number; kind: 'removed'; event: EntityRemoved }
  | {
      id: number;
      round: number;
      kind: 'encounterEnded';
      event: EncounterEnded;
    };

export interface UseCombatLogResult {
  entries: CombatLogEntry[];
  recordAttackResolved: (event: AttackResolved) => void;
  recordEntityDamaged: (event: EntityDamaged) => void;
  recordStatusApplied: (event: StatusApplied) => void;
  recordStatusRemoved: (event: StatusRemoved) => void;
  recordTurnStarted: (event: TurnStarted) => void;
  recordTurnEnded: (event: TurnEnded) => void;
  recordEntityDied: (event: EntityDied) => void;
  recordEntityRemoved: (event: EntityRemoved) => void;
  recordEncounterEnded: (event: EncounterEnded) => void;
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

  return {
    entries,
    recordAttackResolved,
    recordEntityDamaged,
    recordStatusApplied,
    recordStatusRemoved,
    recordTurnStarted,
    recordTurnEnded,
    recordEntityDied,
    recordEntityRemoved,
    recordEncounterEnded,
  };
}
