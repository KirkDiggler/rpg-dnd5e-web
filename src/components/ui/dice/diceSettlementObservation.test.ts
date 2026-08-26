import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DiceSettlementEntryV2 } from './diceRuntimeManifest';
import { parseDiceRuntimeManifest } from './diceRuntimeManifest';
import {
  observeUpwardPresetResult,
  observeUpwardResult,
} from './diceSettlementObservation';

type Direction = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

const RESULT_COUNT = 20;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function syntheticDirections(): readonly Direction[] {
  return Array.from({ length: RESULT_COUNT }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / RESULT_COUNT;
    const radius = Math.sqrt(1 - y * y);
    const angle = index * GOLDEN_ANGLE;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)] as const;
  });
}

function rotateDirectionToUp(direction: Direction): Quaternion {
  const unnormalized = [
    -direction[2],
    0,
    direction[0],
    1 + direction[1],
  ] as const;
  const magnitude = Math.hypot(...unnormalized);
  return unnormalized.map(
    (value) => value / magnitude
  ) as unknown as Quaternion;
}

function syntheticEntries(
  directions: readonly Direction[] = syntheticDirections()
): Record<string, DiceSettlementEntryV2> {
  return Object.fromEntries(
    directions.map((readDirection, index) => [
      String(index + 1),
      {
        quaternion: rotateDirectionToUp(readDirection),
        witness: {
          kind: 'runtime-direction',
          readKind: 'face',
          readIndex: index,
          readDirection,
        },
      },
    ])
  );
}

function perpendicularTo(direction: Direction): Direction {
  const unnormalized =
    Math.abs(direction[0]) < 0.9
      ? [0, -direction[2], direction[1]]
      : [-direction[2], 0, direction[0]];
  const magnitude = Math.hypot(...unnormalized);
  return unnormalized.map((value) => value / magnitude) as unknown as Direction;
}

describe('observeUpwardPresetResult', () => {
  it.each([
    ['d4', [1, 2, 3, 4]],
    ['d6', [1, 2, 3, 4, 5, 6]],
    ['d8', [1, 2, 3, 4, 5, 6, 7, 8]],
    ['d10', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['d12', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
  ] as const)(
    'resolves every supported result for %s',
    (_kind, supportedResults) => {
      const directions = syntheticDirections();
      const entries = Object.fromEntries(
        supportedResults.map((result, index) => [
          String(result),
          {
            quaternion: rotateDirectionToUp(directions[index]),
            witness: {
              kind: 'runtime-direction',
              readKind: 'face',
              readIndex: index,
              readDirection: directions[index],
            },
          },
        ])
      ) as Record<string, DiceSettlementEntryV2>;

      for (const result of supportedResults) {
        const observation = observeUpwardPresetResult(
          entries,
          supportedResults,
          entries[String(result)].quaternion
        );
        expect(observation.result).toBe(result);
        expect(observation.upDot).toBeGreaterThan(0.999999);
        expect(observation.margin).toBeGreaterThan(0.2);
      }
    }
  );

  it('requires the generic entry keys to match the supported result list exactly', () => {
    const entries = syntheticEntries();
    expect(() =>
      observeUpwardPresetResult(entries, [1, 2, 3], [0, 0, 0, 1])
    ).toThrow(/result set/i);
  });
});

describe('observeUpwardResult', () => {
  it('independently resolves every result in a complete synthetic d20', () => {
    const entries = syntheticEntries();

    for (let result = 1; result <= RESULT_COUNT; result += 1) {
      const observation = observeUpwardResult(
        entries,
        entries[String(result)].quaternion
      );

      expect(observation.result).toBe(result);
      expect(observation.upDot).toBeGreaterThan(0.999999);
      expect(observation.margin).toBeGreaterThan(0.2);
      expect(observation.runnerUpDot).toBeLessThan(observation.upDot);
    }
  });

  it('never reads the settlement target quaternions while resolving witnesses', () => {
    const directions = syntheticDirections();
    const entries = syntheticEntries(directions);
    const poisoned = Object.fromEntries(
      Object.entries(entries).map(([result, entry]) => [
        result,
        Object.defineProperty({ witness: entry.witness }, 'quaternion', {
          enumerable: true,
          get() {
            throw Error('settlement target was consulted');
          },
        }),
      ])
    ) as Readonly<Record<string, DiceSettlementEntryV2>>;

    expect(
      observeUpwardResult(poisoned, rotateDirectionToUp(directions[11]))
    ).toMatchObject({ result: 12 });
  });

  it('discriminates the historical result-3 pose as observed result 5', () => {
    const filler: Direction[] = Array.from(
      { length: RESULT_COUNT },
      () => [0, -1, 0] as const
    );
    // Direct corrected provider witnesses for the historically confused pair.
    filler[2] = [0.57735025, 0.57735043, -0.57735013];
    filler[4] = [-0.57735022, 0.57735044, 0.57735015];
    const oldResult3Pose = [-0.32505761, 0, -0.32505764, 0.8880738] as const;

    const observation = observeUpwardResult(
      syntheticEntries(filler),
      oldResult3Pose
    );

    expect(observation.result).toBe(5);
    expect(observation.upDot).toBeGreaterThan(0.999999);
    expect(observation.margin).toBeGreaterThan(0.2);
  });

  it('rejects an incomplete result set', () => {
    const entries = syntheticEntries();
    delete entries['20'];

    expect(() => observeUpwardResult(entries, [0, 0, 0, 1])).toThrow(
      /complete.*1.*20|result set/i
    );
  });

  it.each([
    ['wrong length', [0, 0, 1]],
    ['zero', [0, 0, 0, 0]],
    ['non-unit', [0, 0, 0, 2]],
    ['NaN', [0, Number.NaN, 0, 1]],
    ['infinity', [0, 0, Number.POSITIVE_INFINITY, 1]],
  ])('rejects a %s actual world quaternion', (_name, quaternion) => {
    expect(() =>
      observeUpwardResult(
        syntheticEntries(),
        quaternion as unknown as Quaternion
      )
    ).toThrow(/quaternion/i);
  });

  it.each([
    ['nonfinite', [Number.NaN, 0, 1] as const],
    ['nonunit', [0, 0, 2] as const],
  ])('rejects %s witness direction data', (_name, readDirection) => {
    const entries = syntheticEntries();
    entries['7'] = {
      ...entries['7'],
      witness: { ...entries['7'].witness, readDirection },
    };

    expect(() => observeUpwardResult(entries, entries['1'].quaternion)).toThrow(
      /direction/i
    );
  });

  it('rejects a tie for the upward result', () => {
    const entries = syntheticEntries();
    entries['2'] = {
      ...entries['2'],
      witness: {
        ...entries['2'].witness,
        readDirection: entries['1'].witness.readDirection,
      },
    };

    expect(() => observeUpwardResult(entries, entries['1'].quaternion)).toThrow(
      /tie|separation|margin/i
    );
  });

  it('rejects distinct results with insufficient upward separation', () => {
    const entries = syntheticEntries();
    const winner = entries['1'].witness.readDirection;
    const perpendicular = perpendicularTo(winner);
    const competitor = winner.map(
      (value, axis) =>
        0.9 * value + Math.sqrt(1 - 0.9 ** 2) * perpendicular[axis]
    ) as unknown as Direction;
    entries['2'] = {
      ...entries['2'],
      witness: { ...entries['2'].witness, readDirection: competitor },
    };

    expect(() => observeUpwardResult(entries, entries['1'].quaternion)).toThrow(
      /separation|margin/i
    );
  });
});

const ignoredManifestPath = resolve(
  process.cwd(),
  'public/models/custom-dice/dice-tray-presets.json'
);

describe.runIf(existsSync(ignoredManifestPath))(
  'ignored corrected real-provider observation integration',
  () => {
    it('independently observes all 20 real carved-d20 result poses', () => {
      const parsed = parseDiceRuntimeManifest(
        JSON.parse(readFileSync(ignoredManifestPath, 'utf8')) as unknown
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const preset = parsed.manifest.presets.find(
        (candidate) => candidate.presetId === 'dice.original.carved.d20'
      );
      expect(preset).toBeDefined();
      if (!preset) return;

      const observed = preset.faceSettlementMap.supportedResults.map(
        (requestedResult) => {
          const observation = observeUpwardResult(
            preset.faceSettlementMap.entries,
            preset.faceSettlementMap.entries[String(requestedResult)].quaternion
          );
          expect(observation.result).toBe(requestedResult);
          expect(observation.upDot).toBeGreaterThan(0.999999);
          expect(observation.margin).toBeGreaterThan(0.2);
          return observation.result;
        }
      );

      expect(observed).toEqual(
        Array.from({ length: RESULT_COUNT }, (_, index) => index + 1)
      );
    });
  }
);
