import {
  isDicePresentationIdentifier,
  isDicePresetIdentifier,
} from './dicePresentationRelease';

export type DiceRollGroupKey = 'attack' | 'damage';
export type DiceKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
export type DiceRollDisposition = 'counted' | 'discarded';
export type DiceRollPurpose =
  | 'base'
  | 'critical'
  | 'feature'
  | 'condition'
  | 'granted';

export interface DiceRollRerollStep {
  readonly before: number;
  readonly after: number;
  readonly reasonRef: string;
  readonly displayLabel: string;
}

export interface DiceRollGroupDie {
  readonly id: string;
  readonly kind: DiceKind;
  readonly presetId: string;
  readonly setId: string;
  readonly originalFace: number;
  readonly finalFace: number;
  readonly rerolls: readonly DiceRollRerollStep[];
  readonly disposition: DiceRollDisposition;
  readonly sourceRef: string;
  readonly sourceLabel: string;
  readonly contributorMemberId: string;
  readonly purpose: DiceRollPurpose;
}

interface DiceRollModifierBase {
  readonly id: string;
  readonly sourceRef: string;
  readonly displayLabel: string;
  readonly sourceMemberId?: string;
  readonly order: number;
}

export type DiceRollModifier = DiceRollModifierBase &
  (
    | { readonly value: number; readonly text?: never }
    | { readonly value?: never; readonly text: string }
  );

export interface DiceRollGroupInput {
  readonly key: DiceRollGroupKey;
  readonly dice: readonly DiceRollGroupDie[];
  readonly modifiers: readonly DiceRollModifier[];
  readonly suppliedFinalTotal?: number;
  readonly verdictLabel?: string;
  readonly impactLabel?: string;
}

const GROUP_KEYS = [
  'key',
  'dice',
  'modifiers',
  'suppliedFinalTotal',
  'verdictLabel',
  'impactLabel',
] as const;
const DIE_KEYS = [
  'id',
  'kind',
  'presetId',
  'setId',
  'originalFace',
  'finalFace',
  'rerolls',
  'disposition',
  'sourceRef',
  'sourceLabel',
  'contributorMemberId',
  'purpose',
] as const;
const REROLL_KEYS = ['before', 'after', 'reasonRef', 'displayLabel'] as const;
const MODIFIER_KEYS = [
  'id',
  'sourceRef',
  'displayLabel',
  'sourceMemberId',
  'order',
  'value',
  'text',
] as const;

const DIE_FACE_LIMITS: Record<DiceKind, number> = Object.freeze({
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
});

const DISPOSITIONS: readonly DiceRollDisposition[] = ['counted', 'discarded'];
const PURPOSES: readonly DiceRollPurpose[] = [
  'base',
  'critical',
  'feature',
  'condition',
  'granted',
];

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

function snapshotKnownObject(
  value: unknown,
  allowedKeys: readonly string[]
):
  | {
      readonly snapshot: Record<string, unknown>;
      readonly keys: readonly string[];
    }
  | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== 'string') ||
      !keys.every((key) => allowedKeys.includes(key as string))
    )
      return undefined;
    const record = value as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) snapshot[key as string] = record[key as string];
    return Object.freeze({
      snapshot,
      keys: Object.freeze(keys.map((key) => key as string)),
    });
  } catch {
    return undefined;
  }
}

function snapshotDenseArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== 'string') ||
      keys.length !== value.length + 1 ||
      !keys.includes('length')
    )
      return undefined;
    for (let index = 0; index < value.length; index++) {
      if (!keys.includes(String(index))) return undefined;
    }
    const snapshot = new Array<unknown>(value.length);
    for (let index = 0; index < value.length; index++)
      snapshot[index] = value[index];
    return snapshot;
  } catch {
    return undefined;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function boundedText(
  value: unknown,
  minimumLength = 1,
  maximumLength = 256
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length < minimumLength || value.length > maximumLength)
    return undefined;
  if (value.trim().length < minimumLength) return undefined;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return undefined;
  }
  return value;
}

function isDiceKind(value: unknown): value is DiceKind {
  return (
    value === 'd4' ||
    value === 'd6' ||
    value === 'd8' ||
    value === 'd10' ||
    value === 'd12' ||
    value === 'd20'
  );
}

function faceFits(kind: DiceKind, value: unknown): value is number {
  return (
    isFiniteNumber(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= DIE_FACE_LIMITS[kind]
  );
}

function isDiceRollDisposition(value: unknown): value is DiceRollDisposition {
  return DISPOSITIONS.includes(value as DiceRollDisposition);
}

function isDiceRollPurpose(value: unknown): value is DiceRollPurpose {
  return PURPOSES.includes(value as DiceRollPurpose);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child as never);
    Object.freeze(value);
  }
  return value;
}

function parseRerollStep(
  value: unknown,
  kind: DiceKind
): DiceRollRerollStep | undefined {
  const snapshot = snapshotExactObject(value, REROLL_KEYS);
  const reasonRef = snapshot?.reasonRef;
  const displayLabel = boundedText(snapshot?.displayLabel);
  if (
    !snapshot ||
    !faceFits(kind, snapshot.before) ||
    !faceFits(kind, snapshot.after) ||
    !isDicePresentationIdentifier(reasonRef) ||
    !displayLabel
  )
    return undefined;

  return Object.freeze({
    before: Number(snapshot.before),
    after: Number(snapshot.after),
    reasonRef,
    displayLabel,
  });
}

function parseDice(value: unknown): DiceRollGroupDie | undefined {
  const snapshot = snapshotExactObject(value, DIE_KEYS);
  if (!snapshot) return undefined;

  const kind = snapshot.kind;
  const sourceLabel = boundedText(snapshot.sourceLabel);
  const rerollsSnapshot = snapshotDenseArray(snapshot.rerolls);
  if (
    !isDicePresentationIdentifier(snapshot.id) ||
    !isDiceKind(kind) ||
    !isDicePresetIdentifier(snapshot.presetId) ||
    !isDicePresentationIdentifier(snapshot.setId) ||
    !faceFits(kind, snapshot.originalFace) ||
    !faceFits(kind, snapshot.finalFace) ||
    !rerollsSnapshot ||
    !isDiceRollDisposition(snapshot.disposition) ||
    !isDicePresentationIdentifier(snapshot.sourceRef) ||
    !sourceLabel ||
    !isDicePresentationIdentifier(snapshot.contributorMemberId) ||
    !isDiceRollPurpose(snapshot.purpose)
  )
    return undefined;

  const rerolls: DiceRollRerollStep[] = [];
  let currentFace = Number(snapshot.originalFace);
  for (const stepValue of rerollsSnapshot) {
    const step = parseRerollStep(stepValue, kind);
    if (!step || step.before !== currentFace) return undefined;
    currentFace = step.after;
    rerolls.push(step);
  }
  if (rerolls.length > 0 && currentFace !== Number(snapshot.finalFace))
    return undefined;

  return Object.freeze({
    id: snapshot.id,
    kind,
    presetId: snapshot.presetId,
    setId: snapshot.setId,
    originalFace: Number(snapshot.originalFace),
    finalFace: Number(snapshot.finalFace),
    rerolls: Object.freeze(rerolls),
    disposition: snapshot.disposition,
    sourceRef: snapshot.sourceRef,
    sourceLabel,
    contributorMemberId: snapshot.contributorMemberId,
    purpose: snapshot.purpose,
  });
}

function parseModifier(value: unknown): DiceRollModifier | undefined {
  const snapshot = snapshotKnownObject(value, MODIFIER_KEYS);
  if (!snapshot) return undefined;

  const { snapshot: record, keys } = snapshot;
  const hasValue = keys.includes('value');
  const hasText = keys.includes('text');
  const hasSourceMemberId = keys.includes('sourceMemberId');
  const displayLabel = boundedText(record.displayLabel);
  const sourceMemberId = hasSourceMemberId ? record.sourceMemberId : undefined;
  if (
    !isDicePresentationIdentifier(record.id) ||
    !isDicePresentationIdentifier(record.sourceRef) ||
    !displayLabel ||
    !Number.isInteger(record.order) ||
    Number(record.order) < 0 ||
    (hasSourceMemberId && !isDicePresentationIdentifier(sourceMemberId)) ||
    hasValue === hasText ||
    (hasValue && !isFiniteNumber(record.value)) ||
    (hasText && !boundedText(record.text))
  )
    return undefined;

  return Object.freeze(
    hasValue
      ? {
          id: record.id,
          sourceRef: record.sourceRef,
          displayLabel,
          ...(hasSourceMemberId ? { sourceMemberId } : {}),
          order: Number(record.order),
          value: Number(record.value),
        }
      : {
          id: record.id,
          sourceRef: record.sourceRef,
          displayLabel,
          ...(hasSourceMemberId ? { sourceMemberId } : {}),
          order: Number(record.order),
          text: record.text,
        }
  ) as DiceRollModifier;
}

export function parseDiceRollGroupInput(
  value: unknown
): DiceRollGroupInput | undefined {
  const snapshot = snapshotKnownObject(value, GROUP_KEYS);
  if (!snapshot) return undefined;

  const { snapshot: record, keys } = snapshot;
  const diceSnapshot = snapshotDenseArray(record.dice);
  const modifiersSnapshot = snapshotDenseArray(record.modifiers);
  const suppliedFinalTotal = keys.includes('suppliedFinalTotal')
    ? record.suppliedFinalTotal
    : undefined;
  const verdictLabel = keys.includes('verdictLabel')
    ? boundedText(record.verdictLabel)
    : undefined;
  const impactLabel = keys.includes('impactLabel')
    ? boundedText(record.impactLabel)
    : undefined;

  if (
    !diceSnapshot ||
    !modifiersSnapshot ||
    !isDiceRollGroupKey(record.key) ||
    (keys.includes('suppliedFinalTotal') &&
      !isFiniteNumber(suppliedFinalTotal)) ||
    (keys.includes('verdictLabel') && !verdictLabel) ||
    (keys.includes('impactLabel') && !impactLabel)
  )
    return undefined;

  const dice: DiceRollGroupDie[] = [];
  const seenDieIds = new Set<string>();
  for (const entry of diceSnapshot) {
    const die = parseDice(entry);
    if (!die || seenDieIds.has(die.id)) return undefined;
    seenDieIds.add(die.id);
    dice.push(die);
  }

  const modifiers: DiceRollModifier[] = [];
  const seenModifierIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const entry of modifiersSnapshot) {
    const modifier = parseModifier(entry);
    if (
      !modifier ||
      seenModifierIds.has(modifier.id) ||
      seenOrders.has(modifier.order)
    )
      return undefined;
    seenModifierIds.add(modifier.id);
    seenOrders.add(modifier.order);
    modifiers.push(modifier);
  }
  if (modifiers.length > 0) {
    for (let order = 0; order < modifiers.length; order++) {
      if (!seenOrders.has(order)) return undefined;
    }
  }

  if (record.key === 'attack' && dice.length < 1) return undefined;
  if (
    record.key === 'damage' &&
    dice.length === 0 &&
    modifiers.length === 0 &&
    !impactLabel
  )
    return undefined;

  const group: DiceRollGroupInput = {
    key: record.key,
    dice: Object.freeze(dice),
    modifiers: Object.freeze(modifiers),
    ...(keys.includes('suppliedFinalTotal')
      ? { suppliedFinalTotal: Number(suppliedFinalTotal) }
      : {}),
    ...(verdictLabel ? { verdictLabel } : {}),
    ...(impactLabel ? { impactLabel } : {}),
  };

  return deepFreeze(group);
}

function isDiceRollGroupKey(value: unknown): value is DiceRollGroupKey {
  return value === 'attack' || value === 'damage';
}
