import {
  parseDicePresentationEvent,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
  type DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { createDicePresentationRelease } from '@/components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';

const PRESET_ID = 'dice.original.carved.d20';

function presentationId(attackId: string): string {
  return `concept:session-combat:${attackId}`;
}

function seedOf(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function createSessionCombatDiceRequest(
  attackId: string,
  result: number
): readonly [DicePresentationRequestedEvent] {
  if (!Number.isInteger(result) || result < 1 || result > 20) {
    throw new Error('session combat d20 result must be an integer from 1–20');
  }
  const id = presentationId(attackId);
  return Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      type: 'dice-presentation-requested',
      eventId: `${id}:request`,
      presentationId: id,
      roller: Object.freeze({ entityId: 'aldric', role: 'player' }),
      die: Object.freeze({
        kind: 'd20',
        presetId: PRESET_ID,
        authoritativeResult: result,
      }),
    }),
  ]);
}

export function createSessionCombatNeutralRelease(
  events: readonly DicePresentationEvent[]
): DicePresentationReleasedEvent {
  const request = events.find(
    (event): event is DicePresentationRequestedEvent =>
      event.type === 'dice-presentation-requested'
  );
  if (!request) throw new Error('dice request required before release');
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId: `${request.presentationId}:release`,
    presentationId: request.presentationId,
    release: createDicePresentationRelease({
      presentationId: request.presentationId,
      presetId: request.die.presetId,
      throwProfile: createNeutralVisualThrowProfile(
        seedOf(request.presentationId)
      ),
    }),
  });
}

export function appendSessionCombatDiceEvent(
  current: readonly DicePresentationEvent[],
  input: unknown
): readonly DicePresentationEvent[] {
  const event = parseDicePresentationEvent(input);
  if (!event || current.some((entry) => entry.eventId === event.eventId)) {
    return current;
  }
  if (event.type === 'dice-presentation-released') {
    const request = current.find(
      (entry): entry is DicePresentationRequestedEvent =>
        entry.type === 'dice-presentation-requested'
    );
    const alreadyReleased = current.some(
      (entry) => entry.type === 'dice-presentation-released'
    );
    if (
      !request ||
      alreadyReleased ||
      event.presentationId !== request.presentationId ||
      event.release.presentationId !== request.presentationId ||
      event.release.presetId !== request.die.presetId
    ) {
      return current;
    }
  }
  return Object.freeze([...current, event]);
}
