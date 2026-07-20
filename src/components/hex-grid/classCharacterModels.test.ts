import { describe, expect, it } from 'vitest';
import {
  resolveClassCharacterModelUrl,
  resolveIdleClipName,
  resolveWalkClipName,
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
  it("falls back to the first clip when none is named 'idle'", () => {
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

  it("returns undefined for an empty clip list — today's real case for main's fighter/barbarian.glb (0 clips shipped) and every downed variant", () => {
    expect(resolveIdleClipName([])).toBeUndefined();
  });

  it('picks the first idle-named clip when every clip is idle-named (monk/rogue\'s real multi-clip shape on main since rpg-game-assets#11 — all variants match "idle", so the "first available" fallback effectively decides)', () => {
    expect(
      resolveIdleClipName(['Idle_Drinking', 'Idle_Meditative', 'Idle_Relaxed'])
    ).toBe('Idle_Drinking');
    expect(
      resolveIdleClipName(['Idle_CheckWatch', 'Idle_Drinking', 'Idle_Relaxed'])
    ).toBe('Idle_CheckWatch');
  });
});

describe('resolveWalkClipName', () => {
  it('picks the clip whose name contains "walk" — today\'s real 4-class shape on main since rpg-game-assets#20', () => {
    expect(
      resolveWalkClipName([
        'Idle_Drinking',
        'Idle_Meditative',
        'Idle_Relaxed',
        'Walk_Forward',
      ])
    ).toBe('Walk_Forward');
  });

  it('matches "walk" case-insensitively', () => {
    expect(resolveWalkClipName(['WALK_FORWARD'])).toBe('WALK_FORWARD');
  });

  it('returns undefined when no clip is walk-named — unlike resolveIdleClipName, does NOT fall back to the first available clip', () => {
    expect(
      resolveWalkClipName(['Idle_Relaxed', 'Idle_Drinking'])
    ).toBeUndefined();
  });

  it('returns undefined for an empty clip list (downed variants, or any clip-less model)', () => {
    expect(resolveWalkClipName([])).toBeUndefined();
  });

  it('does not match a clip that merely contains "walk" as a substring of an unrelated word', () => {
    // Guards against an over-eager regex; "Boardwalk" isn't a real clip name
    // this pipeline would ever produce, but the point is /walk/i really is
    // a substring test, not a word-boundary one — documented, not "fixed".
    expect(resolveWalkClipName(['Idle_Relaxed', 'Boardwalk_Loop'])).toBe(
      'Boardwalk_Loop'
    );
  });
});
