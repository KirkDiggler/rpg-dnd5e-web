import type { DiceRollGroupKey } from '../../components/ui/dice/diceRollGroup';
import {
  parseDiceRollGroupEvent,
  type DiceRollGroupEvent,
} from '../../components/ui/dice/diceRollGroupEvent';
import { createNeutralVisualThrowProfile } from '../../components/ui/dice/visualThrowProfile';

export interface SharedTableDiceDeliveryHost {
  readonly events: () => readonly DiceRollGroupEvent[];
  readonly append: (event: DiceRollGroupEvent) => boolean;
  readonly scheduleMissingRelease: (
    input: Readonly<{
      presentationId: string;
      groupKey: DiceRollGroupKey;
      presetSeed: number;
      graceMs: 3_000;
    }>
  ) => () => void;
  readonly reset: () => void;
}

function timerKey(presentationId: string, groupKey: DiceRollGroupKey) {
  return `${presentationId}:${groupKey}`;
}

export function createSharedTableDiceDeliveryHost(
  onChange: (events: readonly DiceRollGroupEvent[]) => void
): SharedTableDiceDeliveryHost {
  let currentEvents: readonly DiceRollGroupEvent[] = Object.freeze([]);
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTimer = (
    key: string,
    expected?: ReturnType<typeof setTimeout>
  ) => {
    const timer = pendingTimers.get(key);
    if (timer === undefined || (expected !== undefined && timer !== expected))
      return;
    clearTimeout(timer);
    pendingTimers.delete(key);
  };

  const publish = (next: readonly DiceRollGroupEvent[]) => {
    currentEvents = Object.freeze([...next]);
    onChange(currentEvents);
  };

  const append = (event: DiceRollGroupEvent) => {
    const parsed = parseDiceRollGroupEvent(event);
    if (!parsed) return false;
    if (currentEvents.some((value) => value.eventId === parsed.eventId))
      return false;

    if (parsed.type === 'dice-roll-group-requested') {
      if (
        currentEvents.some(
          (value) =>
            value.type === 'dice-roll-group-requested' &&
            value.presentationId === parsed.presentationId
        )
      )
        return false;
      publish([...currentEvents, parsed]);
      return true;
    }

    const request = currentEvents.find(
      (value) =>
        value.type === 'dice-roll-group-requested' &&
        value.presentationId === parsed.presentationId
    );
    if (
      !request ||
      request.type !== 'dice-roll-group-requested' ||
      request.group.key !== parsed.release.groupKey
    )
      return false;
    if (
      currentEvents.some(
        (value) =>
          value.type === 'dice-roll-group-released' &&
          value.presentationId === parsed.presentationId &&
          value.release.groupKey === parsed.release.groupKey
      )
    )
      return false;
    clearTimer(timerKey(parsed.presentationId, parsed.release.groupKey));
    publish([...currentEvents, parsed]);
    return true;
  };

  return {
    events: () => currentEvents,
    append,
    scheduleMissingRelease: (input) => {
      const key = timerKey(input.presentationId, input.groupKey);
      clearTimer(key);
      const timer = setTimeout(() => {
        pendingTimers.delete(key);
        append({
          schemaVersion: 1,
          type: 'dice-roll-group-released',
          eventId: `shared-table:missing-release:${input.presentationId}:${input.groupKey}`,
          presentationId: input.presentationId,
          release: {
            schemaVersion: 1,
            presentationId: input.presentationId,
            groupKey: input.groupKey,
            throwProfile: createNeutralVisualThrowProfile(input.presetSeed),
          },
        });
      }, input.graceMs);
      pendingTimers.set(key, timer);
      return () => clearTimer(key, timer);
    },
    reset: () => {
      for (const key of pendingTimers.keys()) clearTimer(key);
      if (currentEvents.length === 0) return;
      publish([]);
    },
  };
}
