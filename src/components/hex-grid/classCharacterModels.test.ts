import { describe, expect, it } from 'vitest';
import {
  resolveClassCharacterModelUrl,
  resolveIdleClipName,
} from './classCharacterModels';

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

describe('resolveIdleClipName', () => {
  it("falls back to the first clip when none is named 'idle' (today's real shipped case — every class GLB has one clip named 'Take 001')", () => {
    expect(resolveIdleClipName(['Take 001'])).toBe('Take 001');
  });

  it('prefers a clip whose name contains "idle" over an earlier non-idle clip', () => {
    expect(resolveIdleClipName(['Walk', 'Idle_Loop', 'Attack'])).toBe(
      'Idle_Loop'
    );
  });

  it('matches "idle" case-insensitively', () => {
    expect(resolveIdleClipName(['IDLE'])).toBe('IDLE');
  });

  it('falls back to the first clip when multiple exist and none is idle-named', () => {
    expect(resolveIdleClipName(['Walk', 'Run', 'Attack'])).toBe('Walk');
  });

  it('returns undefined for an empty clip list (downed variants, or a model shipped with no animation)', () => {
    expect(resolveIdleClipName([])).toBeUndefined();
  });
});
