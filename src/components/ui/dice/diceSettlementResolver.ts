import type { QuaternionTuple } from './attackDieContract';
import type {
  DiceRuntimePreset,
  DiceSettlementEntryV2,
  RuntimeResultWitnessV2,
} from './diceRuntimeManifest';

export interface DiceSettlementResolution {
  readonly presetId: string;
  readonly authoritativeResult: number;
  readonly target: QuaternionTuple;
  readonly entry: DiceSettlementEntryV2;
}

const UNIT_TOLERANCE = 0.000001;

function settlementKeysMatch(
  supportedResults: readonly number[],
  entries: Readonly<Record<string, DiceSettlementEntryV2>>
): boolean {
  if (
    supportedResults.some(
      (result, index) =>
        !Number.isInteger(result) || supportedResults.indexOf(result) !== index
    )
  ) {
    return false;
  }

  const expectedKeys = supportedResults.map(String);
  const actualKeys = Reflect.ownKeys(entries);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key) => typeof key === 'string' && expectedKeys.includes(key)
    )
  );
}

function snapshotQuaternion(value: unknown): QuaternionTuple | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const [x, y, z, w] = value;
  if (![x, y, z, w].every(Number.isFinite)) return undefined;
  const magnitude = Math.hypot(x, y, z, w);
  if (Math.abs(magnitude - 1) > UNIT_TOLERANCE) return undefined;
  return Object.freeze([x, y, z, w] as QuaternionTuple);
}

function snapshotWitness(
  witness: RuntimeResultWitnessV2
): RuntimeResultWitnessV2 | undefined {
  const readDirection = Object.freeze([
    witness.readDirection[0],
    witness.readDirection[1],
    witness.readDirection[2],
  ] as const);

  if (witness.kind === 'runtime-face-triangles') {
    return Object.freeze({
      kind: witness.kind,
      readKind: witness.readKind,
      readIndex: witness.readIndex,
      readDirection,
      triangleIndices: Object.freeze([...witness.triangleIndices]),
      triangleSignatureSha256: witness.triangleSignatureSha256,
    });
  }
  if (witness.kind === 'runtime-direction') {
    return Object.freeze({
      kind: witness.kind,
      readKind: witness.readKind,
      readIndex: witness.readIndex,
      readDirection,
    });
  }
  return undefined;
}

export function resolveRuntimeDiceSettlement(input: {
  readonly preset: DiceRuntimePreset;
  readonly expectedPresetId: string;
  readonly authoritativeResult: unknown;
}): DiceSettlementResolution | undefined {
  try {
    const { preset, expectedPresetId, authoritativeResult } = input;
    if (
      preset.presetId !== expectedPresetId ||
      !Number.isInteger(authoritativeResult)
    ) {
      return undefined;
    }

    const result = authoritativeResult as number;
    const { supportedResults, entries } = preset.faceSettlementMap;
    if (
      !settlementKeysMatch(supportedResults, entries) ||
      !supportedResults.includes(result)
    ) {
      return undefined;
    }

    const sourceEntry = entries[String(result)];
    if (!sourceEntry) return undefined;
    const target = snapshotQuaternion(sourceEntry.quaternion);
    const witness = snapshotWitness(sourceEntry.witness);
    if (!target || !witness) return undefined;

    const entry = Object.freeze({
      quaternion: target,
      witness,
    });
    return Object.freeze({
      presetId: preset.presetId,
      authoritativeResult: result,
      target,
      entry,
    });
  } catch {
    return undefined;
  }
}
