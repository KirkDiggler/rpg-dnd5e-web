import { describe, expect, it } from 'vitest';
import type { DiceRuntimePreset } from './diceRuntimeManifest';
import { parseDiceRuntimeManifest } from './diceRuntimeManifest';
import { validDiceRuntimeManifest } from './diceRuntimeTestFixtures';
import { resolveRuntimeDiceSettlement } from './diceSettlementResolver';

function validPreset(): DiceRuntimePreset {
  const parsed = parseDiceRuntimeManifest(validDiceRuntimeManifest());
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.manifest.presets[0];
}

function withSettlementMap(
  preset: DiceRuntimePreset,
  supportedResults: readonly number[],
  entries: DiceRuntimePreset['faceSettlementMap']['entries']
): DiceRuntimePreset {
  return {
    ...preset,
    faceSettlementMap: { supportedResults, entries },
  };
}

describe('resolveRuntimeDiceSettlement', () => {
  it('returns a fresh, deeply frozen provider-backed settlement snapshot', () => {
    const preset = validPreset();
    const sourceEntry = preset.faceSettlementMap.entries['7'];

    const resolution = resolveRuntimeDiceSettlement({
      preset,
      expectedPresetId: preset.presetId,
      authoritativeResult: 7,
    });

    expect(resolution).toEqual({
      presetId: preset.presetId,
      authoritativeResult: 7,
      target: [0, 0, 0, 1],
      entry: sourceEntry,
    });
    expect(resolution?.target).not.toBe(sourceEntry.quaternion);
    expect(resolution?.entry).not.toBe(sourceEntry);
    expect(resolution?.entry.witness).not.toBe(sourceEntry.witness);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution?.target)).toBe(true);
    expect(Object.isFrozen(resolution?.entry)).toBe(true);
    expect(Object.isFrozen(resolution?.entry.witness)).toBe(true);
    if (resolution?.entry.witness.kind === 'runtime-face-triangles') {
      expect(Object.isFrozen(resolution.entry.witness.readDirection)).toBe(
        true
      );
      expect(Object.isFrozen(resolution.entry.witness.triangleIndices)).toBe(
        true
      );
    }
  });

  it('requires exact preset identity without an Original-d20 exception', () => {
    const original = validPreset();
    const custom = { ...original, presetId: 'dice.custom.carved.d20' };

    expect(
      resolveRuntimeDiceSettlement({
        preset: original,
        expectedPresetId: 'dice.custom.carved.d20',
        authoritativeResult: 7,
      })
    ).toBeUndefined();
    expect(
      resolveRuntimeDiceSettlement({
        preset: custom,
        expectedPresetId: custom.presetId,
        authoritativeResult: 7,
      })
    ).toMatchObject({ presetId: custom.presetId, authoritativeResult: 7 });
  });

  it.each([undefined, null, '7', 7.5, Number.NaN, 0, 21])(
    'rejects missing, malformed, or unsupported authoritative result %s',
    (authoritativeResult) => {
      const preset = validPreset();
      expect(
        resolveRuntimeDiceSettlement({
          preset,
          expectedPresetId: preset.presetId,
          authoritativeResult,
        })
      ).toBeUndefined();
    }
  );

  it('rejects missing or extra supported-result and entry facts', () => {
    const preset = validPreset();
    const entries = { ...preset.faceSettlementMap.entries };
    const { ['7']: _missing, ...withoutSeven } = entries;
    void _missing;

    const malformedPresets = [
      withSettlementMap(
        preset,
        preset.faceSettlementMap.supportedResults.filter(
          (result) => result !== 7
        ),
        entries
      ),
      withSettlementMap(
        preset,
        [...preset.faceSettlementMap.supportedResults, 21],
        entries
      ),
      withSettlementMap(
        preset,
        preset.faceSettlementMap.supportedResults,
        withoutSeven
      ),
      withSettlementMap(preset, preset.faceSettlementMap.supportedResults, {
        ...entries,
        '21': entries['7'],
      }),
    ];

    for (const malformed of malformedPresets) {
      expect(
        resolveRuntimeDiceSettlement({
          preset: malformed,
          expectedPresetId: malformed.presetId,
          authoritativeResult: 7,
        })
      ).toBeUndefined();
    }
  });

  it.each([
    { quaternion: [Number.NaN, 0, 0, 1] },
    { quaternion: [Number.POSITIVE_INFINITY, 0, 0, 1] },
    { quaternion: [0, 0, 0, 0] },
    { quaternion: [0, 0, 0, 2] },
    { quaternion: [0, 0, 0, 1, 0] },
  ])(
    'rejects a malformed or non-unit selected quaternion $quaternion',
    ({ quaternion }) => {
      const preset = validPreset();
      const entries = {
        ...preset.faceSettlementMap.entries,
        '7': {
          ...preset.faceSettlementMap.entries['7'],
          quaternion,
        },
      } as unknown as DiceRuntimePreset['faceSettlementMap']['entries'];
      const malformed = withSettlementMap(
        preset,
        preset.faceSettlementMap.supportedResults,
        entries
      );

      expect(
        resolveRuntimeDiceSettlement({
          preset: malformed,
          expectedPresetId: malformed.presetId,
          authoritativeResult: 7,
        })
      ).toBeUndefined();
    }
  );
});
