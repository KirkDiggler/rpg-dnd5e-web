import type {
  DicePresentationReleasedEvent,
  DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { createDicePresentationRelease } from '@/components/ui/dice/dicePresentationRelease';
import type { VisualThrowProfileV1 } from '@/components/ui/dice/visualThrowProfile';

function hash(value: string) {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

export function localWorldDieReleaseEvent(
  request: DicePresentationRequestedEvent,
  profile: VisualThrowProfileV1
): DicePresentationReleasedEvent {
  const readableId = `${request.presentationId}:release`;
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId:
      readableId.length <= 128
        ? readableId
        : `release:${hash(request.presentationId).toString(16)}`,
    presentationId: request.presentationId,
    release: createDicePresentationRelease({
      presentationId: request.presentationId,
      presetId: request.die.presetId,
      throwProfile: profile,
    }),
  });
}
