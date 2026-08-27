import {
  isDicePresentationIdentifier,
  isDicePresetIdentifier,
} from '../../components/ui/dice/dicePresentationRelease';
import {
  parseDiceRollGroupInput,
  type DiceKind,
  type DiceRollGroupInput,
} from '../../components/ui/dice/diceRollGroup';
import type { DiceMaterialTreatment } from '../../components/ui/dice/materialFreeCarvedMesh';

export const SHARED_TABLE_DICE_SCENARIO_IDS = Object.freeze([
  'single-d20',
  'bless-mixed-attack',
  'ordinary-damage',
  'critical-damage',
  'great-weapon-fighting',
  'duplicate-release',
  'missing-release',
  'reduced-motion',
  'provider-failure',
] as const);

export type SharedTableDiceScenarioId =
  (typeof SHARED_TABLE_DICE_SCENARIO_IDS)[number];

export interface SharedTableDicePlayerFixture {
  readonly memberId: string;
  readonly name: string;
  readonly setId: string;
}

export interface SharedTableDiceSetFixture {
  readonly id: string;
  readonly displayName: string;
  readonly treatment: DiceMaterialTreatment;
  readonly presetByKind: Readonly<Record<DiceKind, string>>;
}

export interface SharedTableDiceScenario {
  readonly id: SharedTableDiceScenarioId;
  readonly label: string;
  readonly rollerMemberId: string;
  readonly witnessMemberId: string;
  readonly players: readonly SharedTableDicePlayerFixture[];
  readonly sets: readonly SharedTableDiceSetFixture[];
  readonly attack: DiceRollGroupInput;
  readonly damage?: DiceRollGroupInput;
  readonly hit: boolean;
  readonly impactLabel?: string;
  readonly exercise?:
    | 'duplicate-release'
    | 'missing-release'
    | 'provider-failure';
}

export type SharedTableDiceScenarioRecord = Readonly<
  Record<SharedTableDiceScenarioId, SharedTableDiceScenario>
>;

const DICE_KINDS = Object.freeze([
  'd4',
  'd6',
  'd8',
  'd10',
  'd12',
  'd20',
] as const satisfies readonly DiceKind[]);
const PRESET_BY_KIND = Object.freeze({
  d4: 'dice.original.carved.d4',
  d6: 'dice.original.carved.d6',
  d8: 'dice.original.carved.d8',
  d10: 'dice.original.carved.d10',
  d12: 'dice.original.carved.d12',
  d20: 'dice.original.carved.d20',
} satisfies Readonly<Record<DiceKind, string>>);
const PLAYER_KEYS = Object.freeze(['memberId', 'name', 'setId'] as const);
const TREATMENT_KEYS = Object.freeze([
  'bodyColor',
  'numeralColor',
  'roughness',
  'metalness',
] as const);
const SET_KEYS = Object.freeze([
  'id',
  'displayName',
  'treatment',
  'presetByKind',
] as const);
const SCENARIO_KEYS = Object.freeze([
  'id',
  'label',
  'rollerMemberId',
  'witnessMemberId',
  'players',
  'sets',
  'attack',
  'damage',
  'hit',
  'impactLabel',
  'exercise',
] as const);
const REQUIRED_SCENARIO_KEYS = Object.freeze([
  'id',
  'label',
  'rollerMemberId',
  'witnessMemberId',
  'players',
  'sets',
  'attack',
  'hit',
] as const);
const EXERCISES = Object.freeze({
  'duplicate-release': 'duplicate-release',
  'missing-release': 'missing-release',
  'provider-failure': 'provider-failure',
} as const);
const INVALID_CACHE_ENTRY = Symbol('invalid-shared-table-dice-scenarios');
const recordCache = new WeakMap<
  object,
  SharedTableDiceScenarioRecord | typeof INVALID_CACHE_ENTRY
>();

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
  | Readonly<{
      snapshot: Record<string, unknown>;
      keys: readonly string[];
    }>
  | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== 'string') ||
      !keys.every((key) => allowedKeys.includes(String(key)))
    )
      return undefined;
    const stringKeys = keys.map(String);
    const record = value as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    for (const key of stringKeys) snapshot[key] = record[key];
    return Object.freeze({ snapshot, keys: Object.freeze(stringKeys) });
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
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!keys.includes(String(index))) return undefined;
      snapshot.push(value[index]);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function boundedText(value: unknown, maximumLength = 256) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim().length < 1
  )
    return undefined;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return undefined;
  }
  return value;
}

export function isSharedTableDiceScenarioId(
  value: unknown
): value is SharedTableDiceScenarioId {
  return SHARED_TABLE_DICE_SCENARIO_IDS.includes(
    value as SharedTableDiceScenarioId
  );
}

function parsePlayer(value: unknown): SharedTableDicePlayerFixture | undefined {
  const snapshot = snapshotExactObject(value, PLAYER_KEYS);
  const name = boundedText(snapshot?.name, 80);
  if (
    !snapshot ||
    !isDicePresentationIdentifier(snapshot.memberId) ||
    !name ||
    !isDicePresentationIdentifier(snapshot.setId)
  )
    return undefined;
  return Object.freeze({
    memberId: snapshot.memberId,
    name,
    setId: snapshot.setId,
  });
}

function unitInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function parseTreatment(value: unknown): DiceMaterialTreatment | undefined {
  const snapshot = snapshotExactObject(value, TREATMENT_KEYS);
  if (
    !snapshot ||
    typeof snapshot.bodyColor !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(snapshot.bodyColor) ||
    typeof snapshot.numeralColor !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(snapshot.numeralColor) ||
    !unitInterval(snapshot.roughness) ||
    !unitInterval(snapshot.metalness)
  )
    return undefined;
  return Object.freeze({
    bodyColor: snapshot.bodyColor,
    numeralColor: snapshot.numeralColor,
    roughness: snapshot.roughness,
    metalness: snapshot.metalness,
  });
}

function parsePresetByKind(
  value: unknown
): Readonly<Record<DiceKind, string>> | undefined {
  const snapshot = snapshotExactObject(value, DICE_KINDS);
  if (!snapshot) return undefined;
  for (const kind of DICE_KINDS) {
    if (
      !isDicePresetIdentifier(snapshot[kind]) ||
      snapshot[kind] !== PRESET_BY_KIND[kind]
    )
      return undefined;
  }
  return Object.freeze({ ...PRESET_BY_KIND });
}

function parseSet(value: unknown): SharedTableDiceSetFixture | undefined {
  const snapshot = snapshotExactObject(value, SET_KEYS);
  const displayName = boundedText(snapshot?.displayName);
  const treatment = parseTreatment(snapshot?.treatment);
  const presetByKind = parsePresetByKind(snapshot?.presetByKind);
  if (
    !snapshot ||
    !isDicePresentationIdentifier(snapshot.id) ||
    !displayName?.includes('Fixture / simulated') ||
    !treatment ||
    !presetByKind
  )
    return undefined;
  return Object.freeze({
    id: snapshot.id,
    displayName,
    treatment,
    presetByKind,
  });
}

function expectedExercise(id: SharedTableDiceScenarioId) {
  return Object.hasOwn(EXERCISES, id)
    ? EXERCISES[id as keyof typeof EXERCISES]
    : undefined;
}

function groupsAreConsistent(
  groups: readonly DiceRollGroupInput[],
  playersById: ReadonlyMap<string, SharedTableDicePlayerFixture>,
  setsById: ReadonlyMap<string, SharedTableDiceSetFixture>
) {
  for (const group of groups) {
    for (const die of group.dice) {
      const contributor = playersById.get(die.contributorMemberId);
      const set = setsById.get(die.setId);
      if (
        !contributor ||
        !set ||
        contributor.setId !== die.setId ||
        set.presetByKind[die.kind] !== die.presetId
      )
        return false;
    }
    for (const modifier of group.modifiers) {
      if (
        modifier.sourceMemberId !== undefined &&
        !playersById.has(modifier.sourceMemberId)
      )
        return false;
    }
  }
  return true;
}

export function parseSharedTableDiceScenario(
  value: unknown,
  expectedId?: SharedTableDiceScenarioId
): SharedTableDiceScenario | undefined {
  const known = snapshotKnownObject(value, SCENARIO_KEYS);
  if (!known) return undefined;
  const { snapshot, keys } = known;
  if (!REQUIRED_SCENARIO_KEYS.every((key) => keys.includes(key)))
    return undefined;

  const id = snapshot.id;
  const label = boundedText(snapshot.label);
  const playersSnapshot = snapshotDenseArray(snapshot.players);
  const setsSnapshot = snapshotDenseArray(snapshot.sets);
  const attack = parseDiceRollGroupInput(snapshot.attack);
  const hasDamage = keys.includes('damage');
  const damage = hasDamage
    ? parseDiceRollGroupInput(snapshot.damage)
    : undefined;
  const impactLabel = keys.includes('impactLabel')
    ? boundedText(snapshot.impactLabel)
    : undefined;
  const exercise = keys.includes('exercise') ? snapshot.exercise : undefined;
  const parsedExercise = isSharedTableDiceScenarioId(id)
    ? expectedExercise(id)
    : undefined;
  if (
    !isSharedTableDiceScenarioId(id) ||
    (expectedId !== undefined && id !== expectedId) ||
    !label?.includes('Fixture / simulated') ||
    !isDicePresentationIdentifier(snapshot.rollerMemberId) ||
    !isDicePresentationIdentifier(snapshot.witnessMemberId) ||
    snapshot.rollerMemberId === snapshot.witnessMemberId ||
    !playersSnapshot ||
    playersSnapshot.length < 2 ||
    !setsSnapshot ||
    setsSnapshot.length < 2 ||
    !attack ||
    attack.key !== 'attack' ||
    typeof snapshot.hit !== 'boolean' ||
    (hasDamage && (!damage || damage.key !== 'damage')) ||
    (keys.includes('impactLabel') && !impactLabel) ||
    keys.includes('exercise') !== (parsedExercise !== undefined) ||
    exercise !== parsedExercise
  )
    return undefined;

  const players: SharedTableDicePlayerFixture[] = [];
  const playerIds = new Set<string>();
  const playerNames = new Set<string>();
  const playerSetIds = new Set<string>();
  for (const playerValue of playersSnapshot) {
    const player = parsePlayer(playerValue);
    if (
      !player ||
      playerIds.has(player.memberId) ||
      playerNames.has(player.name) ||
      playerSetIds.has(player.setId)
    )
      return undefined;
    players.push(player);
    playerIds.add(player.memberId);
    playerNames.add(player.name);
    playerSetIds.add(player.setId);
  }

  const sets: SharedTableDiceSetFixture[] = [];
  const setIds = new Set<string>();
  for (const setValue of setsSnapshot) {
    const set = parseSet(setValue);
    if (!set || setIds.has(set.id)) return undefined;
    sets.push(set);
    setIds.add(set.id);
  }
  if (
    sets.length !== players.length ||
    !players.every((player) => setIds.has(player.setId)) ||
    !sets.every((set) => playerSetIds.has(set.id)) ||
    !playerIds.has(snapshot.rollerMemberId) ||
    !playerIds.has(snapshot.witnessMemberId)
  )
    return undefined;

  if (
    snapshot.hit
      ? !damage || !impactLabel || damage.impactLabel !== impactLabel
      : damage !== undefined || impactLabel !== undefined
  )
    return undefined;
  if (!attack.verdictLabel) return undefined;

  const playersById = new Map(
    players.map((player) => [player.memberId, player])
  );
  const setsById = new Map(sets.map((set) => [set.id, set]));
  if (
    !groupsAreConsistent(
      damage ? [attack, damage] : [attack],
      playersById,
      setsById
    )
  )
    return undefined;

  return Object.freeze({
    id,
    label,
    rollerMemberId: snapshot.rollerMemberId,
    witnessMemberId: snapshot.witnessMemberId,
    players: Object.freeze(players),
    sets: Object.freeze(sets),
    attack,
    ...(damage ? { damage } : {}),
    hit: snapshot.hit,
    ...(impactLabel ? { impactLabel } : {}),
    ...(parsedExercise ? { exercise: parsedExercise } : {}),
  });
}

export function parseSharedTableDiceScenarioRecord(
  value: unknown
): SharedTableDiceScenarioRecord | undefined {
  if (value !== null && typeof value === 'object') {
    const cached = recordCache.get(value);
    if (cached) return cached === INVALID_CACHE_ENTRY ? undefined : cached;
  }
  const snapshot = snapshotExactObject(value, SHARED_TABLE_DICE_SCENARIO_IDS);
  if (!snapshot) {
    if (value !== null && typeof value === 'object')
      recordCache.set(value, INVALID_CACHE_ENTRY);
    return undefined;
  }
  const parsed = {} as Record<
    SharedTableDiceScenarioId,
    SharedTableDiceScenario
  >;
  for (const id of SHARED_TABLE_DICE_SCENARIO_IDS) {
    const scenario = parseSharedTableDiceScenario(snapshot[id], id);
    if (!scenario) {
      if (value !== null && typeof value === 'object')
        recordCache.set(value, INVALID_CACHE_ENTRY);
      return undefined;
    }
    parsed[id] = scenario;
  }
  const frozen = Object.freeze(parsed);
  if (value !== null && typeof value === 'object')
    recordCache.set(value, frozen);
  return frozen;
}
