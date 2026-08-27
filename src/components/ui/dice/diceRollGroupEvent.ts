import { isDicePresentationIdentifier } from './dicePresentationRelease';
import {
  parseDiceRollGroupInput,
  type DiceRollGroupDie,
  type DiceRollGroupInput,
  type DiceRollGroupKey,
  type DiceRollModifier,
  type DiceRollRerollStep,
} from './diceRollGroup';
import {
  parseVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export interface DiceRollGroupRequestedEvent {
  readonly schemaVersion: 1;
  readonly type: 'dice-roll-group-requested';
  readonly eventId: string;
  readonly presentationId: string;
  readonly roller: Readonly<{
    memberId: string;
    role: 'player' | 'monster';
  }>;
  readonly group: DiceRollGroupInput;
}

export interface DiceRollGroupRelease {
  readonly schemaVersion: 1;
  readonly presentationId: string;
  readonly groupKey: DiceRollGroupKey;
  readonly throwProfile: VisualThrowProfileV1;
}

export interface DiceRollGroupReleasedEvent {
  readonly schemaVersion: 1;
  readonly type: 'dice-roll-group-released';
  readonly eventId: string;
  readonly presentationId: string;
  readonly release: DiceRollGroupRelease;
}

export type DiceRollGroupEvent =
  | DiceRollGroupRequestedEvent
  | DiceRollGroupReleasedEvent;

const REQUEST_KEYS = [
  'schemaVersion',
  'type',
  'eventId',
  'presentationId',
  'roller',
  'group',
] as const;
const RELEASE_EVENT_KEYS = [
  'schemaVersion',
  'type',
  'eventId',
  'presentationId',
  'release',
] as const;
const ROLLER_KEYS = ['memberId', 'role'] as const;
const RELEASE_KEYS = [
  'schemaVersion',
  'presentationId',
  'groupKey',
  'throwProfile',
] as const;

function sameKeys(actual: readonly PropertyKey[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  );
}

function snapshotExactObject(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== 'string') ||
      !sameKeys(keys, expectedKeys)
    )
      return undefined;
    const record = value as Record<string, unknown>;
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
  | { readonly kind: 'requested'; readonly value: Record<string, unknown> }
  | { readonly kind: 'released'; readonly value: Record<string, unknown> }
  | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) return undefined;
    const expected = sameKeys(keys, REQUEST_KEYS)
      ? REQUEST_KEYS
      : sameKeys(keys, RELEASE_EVENT_KEYS)
        ? RELEASE_EVENT_KEYS
        : undefined;
    if (!expected) return undefined;
    const record = value as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) snapshot[key] = record[key];
    return Object.freeze({
      kind: expected === REQUEST_KEYS ? 'requested' : 'released',
      value: snapshot,
    });
  } catch {
    return undefined;
  }
}

function parseRequestedEvent(
  value: Record<string, unknown>
): DiceRollGroupRequestedEvent | undefined {
  const roller = snapshotExactObject(value.roller, ROLLER_KEYS);
  const group = parseDiceRollGroupInput(value.group);
  if (
    value.schemaVersion !== 1 ||
    value.type !== 'dice-roll-group-requested' ||
    !isDicePresentationIdentifier(value.eventId) ||
    !isDicePresentationIdentifier(value.presentationId) ||
    !roller ||
    !isDicePresentationIdentifier(roller.memberId) ||
    (roller.role !== 'player' && roller.role !== 'monster') ||
    !group
  )
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-roll-group-requested',
    eventId: value.eventId,
    presentationId: value.presentationId,
    roller: Object.freeze({
      memberId: roller.memberId,
      role: roller.role,
    }),
    group,
  });
}

function isDiceRollGroupKey(value: unknown): value is DiceRollGroupKey {
  return value === 'attack' || value === 'damage';
}

function parseRelease(value: unknown): DiceRollGroupRelease | undefined {
  const snapshot = snapshotExactObject(value, RELEASE_KEYS);
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    !isDicePresentationIdentifier(snapshot.presentationId) ||
    !isDiceRollGroupKey(snapshot.groupKey)
  )
    return undefined;

  const throwProfile = parseVisualThrowProfile(snapshot.throwProfile);
  if (!throwProfile) return undefined;

  return Object.freeze({
    schemaVersion: 1,
    presentationId: snapshot.presentationId,
    groupKey: snapshot.groupKey,
    throwProfile,
  });
}

function parseReleasedEvent(
  value: Record<string, unknown>
): DiceRollGroupReleasedEvent | undefined {
  if (
    value.schemaVersion !== 1 ||
    value.type !== 'dice-roll-group-released' ||
    !isDicePresentationIdentifier(value.eventId) ||
    !isDicePresentationIdentifier(value.presentationId)
  )
    return undefined;

  const release = parseRelease(value.release);
  if (!release || release.presentationId !== value.presentationId)
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-roll-group-released',
    eventId: value.eventId,
    presentationId: value.presentationId,
    release,
  });
}

export function parseDiceRollGroupEvent(
  value: unknown
): DiceRollGroupEvent | undefined {
  const snapshot = snapshotEvent(value);
  if (!snapshot) return undefined;
  return snapshot.kind === 'requested'
    ? parseRequestedEvent(snapshot.value)
    : parseReleasedEvent(snapshot.value);
}

function sameRerollStep(first: DiceRollRerollStep, later: DiceRollRerollStep) {
  return (
    first.before === later.before &&
    first.after === later.after &&
    first.reasonRef === later.reasonRef &&
    first.displayLabel === later.displayLabel
  );
}

function sameDie(first: DiceRollGroupDie, later: DiceRollGroupDie) {
  return (
    first.id === later.id &&
    first.kind === later.kind &&
    first.presetId === later.presetId &&
    first.setId === later.setId &&
    first.originalFace === later.originalFace &&
    first.finalFace === later.finalFace &&
    first.rerolls.length === later.rerolls.length &&
    first.rerolls.every((step, index) =>
      sameRerollStep(step, later.rerolls[index])
    ) &&
    first.disposition === later.disposition &&
    first.sourceRef === later.sourceRef &&
    first.sourceLabel === later.sourceLabel &&
    first.contributorMemberId === later.contributorMemberId &&
    first.purpose === later.purpose
  );
}

function sameModifier(first: DiceRollModifier, later: DiceRollModifier) {
  return (
    first.id === later.id &&
    first.sourceRef === later.sourceRef &&
    first.displayLabel === later.displayLabel &&
    first.sourceMemberId === later.sourceMemberId &&
    first.order === later.order &&
    'value' in first === 'value' in later &&
    'text' in first === 'text' in later &&
    ('value' in first
      ? first.value ===
        (later as Extract<DiceRollModifier, { value: number }>).value
      : true) &&
    ('text' in first
      ? first.text ===
        (later as Extract<DiceRollModifier, { text: string }>).text
      : true)
  );
}

function sameGroup(first: DiceRollGroupInput, later: DiceRollGroupInput) {
  return (
    first.key === later.key &&
    first.dice.length === later.dice.length &&
    first.dice.every((die, index) => sameDie(die, later.dice[index])) &&
    first.modifiers.length === later.modifiers.length &&
    first.modifiers.every((modifier, index) =>
      sameModifier(modifier, later.modifiers[index])
    ) &&
    first.suppliedFinalTotal === later.suppliedFinalTotal &&
    first.verdictLabel === later.verdictLabel &&
    first.impactLabel === later.impactLabel
  );
}

function sameRequestFacts(
  first: DiceRollGroupRequestedEvent,
  later: DiceRollGroupRequestedEvent
) {
  return (
    first.presentationId === later.presentationId &&
    first.roller.memberId === later.roller.memberId &&
    first.roller.role === later.roller.role &&
    sameGroup(first.group, later.group)
  );
}

export function projectDiceRollGroupEvents(values: readonly unknown[]) {
  const acceptedEvents: DiceRollGroupEvent[] = [];
  let request: DiceRollGroupRequestedEvent | undefined;
  let release: DiceRollGroupReleasedEvent | undefined;

  for (const value of values) {
    const event = parseDiceRollGroupEvent(value);
    if (!event) continue;

    if (event.type === 'dice-roll-group-requested') {
      if (!request) {
        request = event;
        acceptedEvents.push(event);
        continue;
      }
      if (
        event.presentationId !== request.presentationId ||
        !sameRequestFacts(request, event)
      )
        continue;
      continue;
    }

    if (
      !request ||
      event.presentationId !== request.presentationId ||
      release ||
      event.release.groupKey !== request.group.key
    )
      continue;
    release = event;
    acceptedEvents.push(event);
  }

  return Object.freeze({
    request,
    release,
    acceptedEvents: Object.freeze(acceptedEvents),
  });
}
