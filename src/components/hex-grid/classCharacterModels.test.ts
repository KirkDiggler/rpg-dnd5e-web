import { describe, expect, it } from 'vitest';
import { resolveClassCharacterModelUrl } from './classCharacterModels';

describe('resolveClassCharacterModelUrl', () => {
  const shippedClasses = ['fighter', 'barbarian', 'monk', 'rogue'];

  for (const classRefId of shippedClasses) {
    it(`resolves the standing model for "${classRefId}"`, () => {
      expect(resolveClassCharacterModelUrl(classRefId, false)).toBe(
        `/models/synty/characters/${classRefId}.glb`
      );
    });

    it(`resolves the downed model for "${classRefId}"`, () => {
      expect(resolveClassCharacterModelUrl(classRefId, true)).toBe(
        `/models/synty/characters/${classRefId}-downed.glb`
      );
    });
  }

  it('is case-insensitive', () => {
    expect(resolveClassCharacterModelUrl('ROGUE', false)).toBe(
      '/models/synty/characters/rogue.glb'
    );
  });

  it('returns undefined for an unmapped class (no dedicated GLB shipped yet)', () => {
    expect(resolveClassCharacterModelUrl('wizard', false)).toBeUndefined();
    expect(resolveClassCharacterModelUrl('cleric', true)).toBeUndefined();
  });

  it('returns undefined when classRefId is undefined', () => {
    expect(resolveClassCharacterModelUrl(undefined, false)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(resolveClassCharacterModelUrl('', false)).toBeUndefined();
  });
});
