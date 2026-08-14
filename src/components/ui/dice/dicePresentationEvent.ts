import {
  isDicePresentationIdentifier,
  isDicePresetIdentifier,
  parseDicePresentationRelease,
  type DicePresentationRelease,
} from './dicePresentationRelease';

export interface DicePresentationRequestedEvent {
  schemaVersion: 1;
  type: 'dice-presentation-requested';
  eventId: string;
  presentationId: string;
  roller: Readonly<{
    entityId: string;
    role: 'player' | 'monster';
  }>;
  die: Readonly<{
    kind: 'd20';
    presetId: string;
    authoritativeResult: number;
  }>;
}

export interface DicePresentationReleasedEvent {
  schemaVersion: 1;
  type: 'dice-presentation-released';
  eventId: string;
  presentationId: string;
  release: DicePresentationRelease;
}

export type DicePresentationEvent =
  | DicePresentationRequestedEvent
  | DicePresentationReleasedEvent;

export interface DicePresentationProjection {
  readonly request?: DicePresentationRequestedEvent;
  readonly release?: DicePresentationReleasedEvent;
  readonly acceptedEvents: readonly DicePresentationEvent[];
}

const plainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[]
) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

function parseRequestedEvent(
  value: Record<string, unknown>
): DicePresentationRequestedEvent | undefined {
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'type',
      'eventId',
      'presentationId',
      'roller',
      'die',
    ]) ||
    value.schemaVersion !== 1 ||
    value.type !== 'dice-presentation-requested' ||
    !isDicePresentationIdentifier(value.eventId) ||
    !isDicePresentationIdentifier(value.presentationId) ||
    !plainObject(value.roller) ||
    !hasExactKeys(value.roller, ['entityId', 'role']) ||
    !isDicePresentationIdentifier(value.roller.entityId) ||
    (value.roller.role !== 'player' && value.roller.role !== 'monster') ||
    !plainObject(value.die) ||
    !hasExactKeys(value.die, ['kind', 'presetId', 'authoritativeResult']) ||
    value.die.kind !== 'd20' ||
    !isDicePresetIdentifier(value.die.presetId) ||
    !Number.isInteger(value.die.authoritativeResult) ||
    Number(value.die.authoritativeResult) < 1 ||
    Number(value.die.authoritativeResult) > 20
  )
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: value.eventId,
    presentationId: value.presentationId,
    roller: Object.freeze({
      entityId: value.roller.entityId,
      role: value.roller.role,
    }),
    die: Object.freeze({
      kind: 'd20' as const,
      presetId: value.die.presetId,
      authoritativeResult: Number(value.die.authoritativeResult),
    }),
  });
}

function parseReleasedEvent(
  value: Record<string, unknown>
): DicePresentationReleasedEvent | undefined {
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'type',
      'eventId',
      'presentationId',
      'release',
    ]) ||
    value.schemaVersion !== 1 ||
    value.type !== 'dice-presentation-released' ||
    !isDicePresentationIdentifier(value.eventId) ||
    !isDicePresentationIdentifier(value.presentationId)
  )
    return undefined;

  const release = parseDicePresentationRelease(value.release);
  if (!release || release.presentationId !== value.presentationId)
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId: value.eventId,
    presentationId: value.presentationId,
    release,
  });
}

export function parseDicePresentationEvent(
  value: unknown
): DicePresentationEvent | undefined {
  if (!plainObject(value)) return undefined;
  if (value.type === 'dice-presentation-requested')
    return parseRequestedEvent(value);
  if (value.type === 'dice-presentation-released')
    return parseReleasedEvent(value);
  return undefined;
}

function sameRequestFacts(
  first: DicePresentationRequestedEvent,
  later: DicePresentationRequestedEvent
) {
  return (
    first.presentationId === later.presentationId &&
    first.roller.entityId === later.roller.entityId &&
    first.roller.role === later.roller.role &&
    first.die.kind === later.die.kind &&
    first.die.presetId === later.die.presetId &&
    first.die.authoritativeResult === later.die.authoritativeResult
  );
}

export function projectDicePresentationEvents(
  values: readonly unknown[]
): DicePresentationProjection {
  const requests = new Map<string, DicePresentationRequestedEvent>();
  const releases = new Map<string, DicePresentationReleasedEvent>();
  const acceptedEvents: DicePresentationEvent[] = [];
  let request: DicePresentationRequestedEvent | undefined;

  for (const value of values) {
    const event = parseDicePresentationEvent(value);
    if (!event) continue;

    if (event.type === 'dice-presentation-requested') {
      const first = requests.get(event.presentationId);
      if (first) {
        if (!sameRequestFacts(first, event)) continue;
        continue;
      }
      requests.set(event.presentationId, event);
      acceptedEvents.push(event);
      request = event;
      continue;
    }

    const matchingRequest = requests.get(event.presentationId);
    if (
      !matchingRequest ||
      releases.has(event.presentationId) ||
      event.release.presetId !== matchingRequest.die.presetId
    )
      continue;
    releases.set(event.presentationId, event);
    acceptedEvents.push(event);
  }

  return Object.freeze({
    request,
    release: request ? releases.get(request.presentationId) : undefined,
    acceptedEvents: Object.freeze(acceptedEvents),
  });
}
