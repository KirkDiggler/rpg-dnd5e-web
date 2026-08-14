import { describe, expect, it } from 'vitest';
import {
  createDicePresentationRelease,
  dicePresentationReleaseKey,
} from './dicePresentationRelease';

describe('dice presentation release', () => {
  it('rejects a blank presentation id and a non-allowlisted preset', () => {
    expect(() =>
      createDicePresentationRelease({
        presentationId: '   ',
        presetId: 'lightning',
        variation: 1,
      })
    ).toThrow(/presentation id/i);
    expect(() =>
      createDicePresentationRelease({
        presentationId: 'attack:7',
        presetId: 'cryptstone',
        variation: 1,
      })
    ).toThrow(/preset/i);
  });

  it.each([
    [1002.9, 5],
    [-1002.9, 5],
    [-0.9, 0],
  ])('normalizes finite variation %s to %s', (variation, normalized) => {
    expect(
      createDicePresentationRelease({
        presentationId: 'attack:7',
        presetId: 'lightning',
        variation,
      }).variation
    ).toBe(normalized);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite variation %s',
    (variation) => {
      expect(() =>
        createDicePresentationRelease({
          presentationId: 'attack:7',
          presetId: 'lightning',
          variation,
        })
      ).toThrow(/variation/i);
    }
  );

  it('creates a frozen compact button release with no authority or transport data', () => {
    const release = createDicePresentationRelease({
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
    });

    expect(release).toEqual({
      schemaVersion: 1,
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      vector: [0, 0],
      shake: 0,
    });
    expect(Object.isFrozen(release)).toBe(true);
    expect(Object.isFrozen(release.vector)).toBe(true);
    expect(JSON.stringify(release)).not.toMatch(
      /result|hit|damage|target|https?:\/\//i
    );
  });

  it('keys a release by presentation id and normalized variation', () => {
    const release = createDicePresentationRelease({
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 1002.9,
    });

    expect(dicePresentationReleaseKey(release)).toBe('attack:7:5');
  });
});
