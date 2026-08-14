import {
  parseDicePresentationEvent,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
  type DicePresentationRequestedEvent,
} from '../../components/ui/dice/dicePresentationEvent';
import {
  createDicePresentationRelease,
  dicePresentationReleaseKey,
} from '../../components/ui/dice/dicePresentationRelease';

export type DiceTrayWitnessMode = 'player' | 'monster';

export const MONSTER_FIXTURE_RELEASE_DELAY_MS = 250;

function boundedToken(token: number) {
  if (!Number.isSafeInteger(token))
    throw new Error('dice tray witness token must be a safe integer');
  return String(token);
}

function presentationId(token: number, mode: DiceTrayWitnessMode) {
  return `concept:witness:${mode}:${boundedToken(token)}`;
}

export function createDiceTrayWitnessInitialEvents(
  token: number,
  mode: DiceTrayWitnessMode
): readonly [DicePresentationRequestedEvent] {
  const tokenId = boundedToken(token);
  const request: DicePresentationRequestedEvent = Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: `concept:witness:request:${mode}:${tokenId}`,
    presentationId: presentationId(token, mode),
    roller: Object.freeze({
      entityId: `concept:${mode}`,
      role: mode,
    }),
    die: Object.freeze({
      kind: 'd20',
      presetId: 'lightning',
      authoritativeResult: 10,
    }),
  });

  return Object.freeze([request]);
}

export function appendDiceTrayWitnessEvent(
  current: readonly DicePresentationEvent[],
  input: unknown
): readonly DicePresentationEvent[] {
  const event = parseDicePresentationEvent(input);
  if (!event || current.some((value) => value.eventId === event.eventId))
    return current;

  if (
    event.type === 'dice-presentation-released' &&
    current.some(
      (value) =>
        value.type === 'dice-presentation-released' &&
        dicePresentationReleaseKey(value.release) ===
          dicePresentationReleaseKey(event.release)
    )
  )
    return current;

  return Object.freeze([...current, event]);
}

export function scheduleMonsterDiceTrayWitnessRelease(
  token: number,
  append: (event: DicePresentationReleasedEvent) => void
): () => void {
  const tokenId = boundedToken(token);
  const monsterPresentationId = presentationId(token, 'monster');
  const timer = window.setTimeout(() => {
    append(
      Object.freeze({
        schemaVersion: 1,
        type: 'dice-presentation-released',
        eventId: `concept:witness:release:monster:${tokenId}`,
        presentationId: monsterPresentationId,
        release: createDicePresentationRelease({
          presentationId: monsterPresentationId,
          presetId: 'lightning',
          variation: 0,
        }),
      })
    );
  }, MONSTER_FIXTURE_RELEASE_DELAY_MS);

  return () => window.clearTimeout(timer);
}
