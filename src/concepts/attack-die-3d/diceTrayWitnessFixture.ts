import {
  parseDicePresentationEvent,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
  type DicePresentationRequestedEvent,
} from '../../components/ui/dice/dicePresentationEvent';
import {
  createDicePresentationRelease,
  dicePresentationReleaseKey,
  isDicePresetIdentifier,
} from '../../components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '../../components/ui/dice/visualThrowProfile';

export type DiceTrayWitnessMode = 'player' | 'monster';

export const MONSTER_FIXTURE_RELEASE_DELAY_MS = 250;
const ORIGINAL_CARVED_D20_PRESET_ID = 'dice.original.carved.d20';

function boundedToken(token: number) {
  if (!Number.isSafeInteger(token))
    throw new Error('dice tray witness token must be a safe integer');
  return String(token);
}

function boundedResult(result: number) {
  if (!Number.isInteger(result) || result < 1 || result > 20)
    throw new Error('dice tray witness result must be an integer from 1–20');
  return String(result);
}

function boundedPresetId(presetId: string) {
  if (!isDicePresetIdentifier(presetId))
    throw new Error('dice tray witness preset must be a safe identifier');
  return presetId;
}

function presentationId(
  token: number,
  mode: DiceTrayWitnessMode,
  result: number
) {
  return `concept:witness:${mode}:${boundedToken(token)}:result:${boundedResult(result)}`;
}

function presentationHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function createDiceTrayWitnessInitialEvents(
  token: number,
  mode: DiceTrayWitnessMode,
  result: number,
  presetId = ORIGINAL_CARVED_D20_PRESET_ID
): readonly [DicePresentationRequestedEvent] {
  const tokenId = boundedToken(token);
  const resultId = boundedResult(result);
  const checkedPresetId = boundedPresetId(presetId);
  const request: DicePresentationRequestedEvent = Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: `concept:witness:request:${mode}:${tokenId}:result:${resultId}`,
    presentationId: presentationId(token, mode, result),
    roller: Object.freeze({
      entityId: `concept:${mode}`,
      role: mode,
    }),
    die: Object.freeze({
      kind: 'd20',
      presetId: checkedPresetId,
      authoritativeResult: result,
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
  result: number,
  append: (event: DicePresentationReleasedEvent) => void,
  presetId = ORIGINAL_CARVED_D20_PRESET_ID
): () => void {
  const tokenId = boundedToken(token);
  const resultId = boundedResult(result);
  const checkedPresetId = boundedPresetId(presetId);
  const monsterPresentationId = presentationId(token, 'monster', result);
  const timer = window.setTimeout(() => {
    append(
      Object.freeze({
        schemaVersion: 1,
        type: 'dice-presentation-released',
        eventId: `concept:witness:release:monster:${tokenId}:result:${resultId}`,
        presentationId: monsterPresentationId,
        release: createDicePresentationRelease({
          presentationId: monsterPresentationId,
          presetId: checkedPresetId,
          throwProfile: createNeutralVisualThrowProfile(
            presentationHash(monsterPresentationId)
          ),
        }),
      })
    );
  }, MONSTER_FIXTURE_RELEASE_DELAY_MS);

  return () => window.clearTimeout(timer);
}
