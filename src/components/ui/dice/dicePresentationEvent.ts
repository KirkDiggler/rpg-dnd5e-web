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
  /** Numeric recipient-local authority coordinate, separate from the opaque id. */
  authoritySeq?: bigint;
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

const REQUEST_KEYS = [
  'schemaVersion',
  'type',
  'eventId',
  'presentationId',
  'roller',
  'die',
] as const;
const REQUEST_KEYS_WITH_AUTHORITY = [
  'schemaVersion',
  'type',
  'eventId',
  'presentationId',
  'authoritySeq',
  'roller',
  'die',
] as const;
const RELEASE_KEYS = [
  'schemaVersion',
  'type',
  'eventId',
  'presentationId',
  'release',
] as const;

function sameKeys(keys: readonly string[], expected: readonly string[]) {
  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key))
  );
}

function snapshotExactObject(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!sameKeys(keys, expectedKeys)) return undefined;
    const snapshot: Record<string, unknown> = {};
    for (const key of expectedKeys) snapshot[key] = record[key];
    return snapshot;
  } catch {
    return undefined;
  }
}

function snapshotEvent(
  value: unknown
):
  | { kind: 'requested'; value: Record<string, unknown> }
  | { kind: 'released'; value: Record<string, unknown> }
  | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const expected = sameKeys(keys, REQUEST_KEYS_WITH_AUTHORITY)
      ? REQUEST_KEYS_WITH_AUTHORITY
      : sameKeys(keys, REQUEST_KEYS)
        ? REQUEST_KEYS
        : sameKeys(keys, RELEASE_KEYS)
          ? RELEASE_KEYS
          : undefined;
    if (!expected) return undefined;
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) snapshot[key] = record[key];
    return {
      kind: expected === REQUEST_KEYS ? 'requested' : 'released',
      value: snapshot,
    };
  } catch {
    return undefined;
  }
}

function parseRequestedEvent(
  value: Record<string, unknown>
): DicePresentationRequestedEvent | undefined {
  const roller = snapshotExactObject(value.roller, ['entityId', 'role']);
  const die = snapshotExactObject(value.die, [
    'kind',
    'presetId',
    'authoritativeResult',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.type !== 'dice-presentation-requested' ||
    (value.authoritySeq !== undefined &&
      (typeof value.authoritySeq !== 'bigint' || value.authoritySeq < 0n)) ||
    !isDicePresentationIdentifier(value.eventId) ||
    !isDicePresentationIdentifier(value.presentationId) ||
    !roller ||
    !isDicePresentationIdentifier(roller.entityId) ||
    (roller.role !== 'player' && roller.role !== 'monster') ||
    !die ||
    die.kind !== 'd20' ||
    !isDicePresetIdentifier(die.presetId) ||
    !Number.isInteger(die.authoritativeResult) ||
    Number(die.authoritativeResult) < 1 ||
    Number(die.authoritativeResult) > 20
  )
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: value.eventId,
    presentationId: value.presentationId,
    ...(typeof value.authoritySeq === 'bigint'
      ? { authoritySeq: value.authoritySeq }
      : {}),
    roller: Object.freeze({
      entityId: roller.entityId,
      role: roller.role,
    }),
    die: Object.freeze({
      kind: 'd20' as const,
      presetId: die.presetId,
      authoritativeResult: Number(die.authoritativeResult),
    }),
  });
}

function parseReleasedEvent(
  value: Record<string, unknown>
): DicePresentationReleasedEvent | undefined {
  if (
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
  const snapshot = snapshotEvent(value);
  if (!snapshot) return undefined;
  return snapshot.kind === 'requested'
    ? parseRequestedEvent(snapshot.value)
    : parseReleasedEvent(snapshot.value);
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
