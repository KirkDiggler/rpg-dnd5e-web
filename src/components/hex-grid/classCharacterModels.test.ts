import { describe, expect, it } from 'vitest';
import type { PlayerCharacterModelResolution } from './classCharacterModels';
import * as classCharacterModels from './classCharacterModels';

const asResolution = (resolution: PlayerCharacterModelResolution) => resolution;

describe('resolveClassCharacterModelUrl', () => {
  const shippedClasses = ['fighter', 'barbarian', 'monk', 'rogue'];

  for (const classRefId of shippedClasses) {
    it(`resolves the standing model for "${classRefId}"`, () => {
      expect(
        classCharacterModels.resolveClassCharacterModelUrl(classRefId, false)
      ).toBe(`/models/synty/characters/${classRefId}.glb`);
    });

    it(`resolves the downed model for "${classRefId}"`, () => {
      expect(
        classCharacterModels.resolveClassCharacterModelUrl(classRefId, true)
      ).toBe(`/models/synty/characters/${classRefId}-downed.glb`);
    });
  }

  it('is case-insensitive', () => {
    expect(
      classCharacterModels.resolveClassCharacterModelUrl('ROGUE', false)
    ).toBe('/models/synty/characters/rogue.glb');
  });

  it('returns undefined for an unmapped class (no dedicated GLB shipped yet)', () => {
    expect(
      classCharacterModels.resolveClassCharacterModelUrl('wizard', false)
    ).toBeUndefined();
    expect(
      classCharacterModels.resolveClassCharacterModelUrl('cleric', true)
    ).toBeUndefined();
  });

  it('returns undefined when classRefId is undefined', () => {
    expect(
      classCharacterModels.resolveClassCharacterModelUrl(undefined, false)
    ).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(
      classCharacterModels.resolveClassCharacterModelUrl('', false)
    ).toBeUndefined();
  });
});

describe('resolveIdleClipName', () => {
  it("falls back to the first clip when none is named 'idle'", () => {
    expect(classCharacterModels.resolveIdleClipName(['Take 001'])).toBe(
      'Take 001'
    );
  });

  it('prefers a clip whose name contains "idle" over an earlier non-idle clip', () => {
    expect(
      classCharacterModels.resolveIdleClipName(['Walk', 'Idle_Loop', 'Attack'])
    ).toBe('Idle_Loop');
  });

  it('matches "idle" case-insensitively', () => {
    expect(classCharacterModels.resolveIdleClipName(['IDLE'])).toBe('IDLE');
  });

  it('falls back to the first clip when multiple exist and none is idle-named', () => {
    expect(
      classCharacterModels.resolveIdleClipName(['Walk', 'Run', 'Attack'])
    ).toBe('Walk');
  });

  it('returns undefined for an empty clip list', () => {
    expect(classCharacterModels.resolveIdleClipName([])).toBeUndefined();
  });

  it('picks the first idle-named clip when multiple clips are idle-named', () => {
    expect(
      classCharacterModels.resolveIdleClipName(['Idle_Alert', 'Idle_Relaxed'])
    ).toBe('Idle_Alert');
  });
});

describe('resolvePlayerCharacterModel', () => {
  it.each(['barbarian', 'fighter', 'monk', 'rogue'])(
    'resolves the exact standing Elf %s race-class model',
    (classRefId) => {
      const expected = asResolution({
        url: `/models/synty/characters/race-class/elf-${classRefId}.glb`,
        rigFamily: 'modular-fantasy-hero-v1',
        source: 'race-class',
      });

      expect(
        classCharacterModels.resolvePlayerCharacterModel?.(
          ' Elf ',
          ` ${classRefId.toUpperCase()} `,
          false
        )
      ).toEqual(expected);
    }
  );

  it.each(['barbarian', 'fighter', 'monk', 'rogue'])(
    'resolves the exact standing Dwarf %s race-class model',
    (classRefId) => {
      const expected = asResolution({
        url: `/models/synty/characters/race-class/dwarf-${classRefId}.glb`,
        rigFamily: 'modular-fantasy-hero-v1',
        source: 'race-class',
      });

      expect(
        classCharacterModels.resolvePlayerCharacterModel?.(
          ' Dwarf ',
          ` ${classRefId.toUpperCase()} `,
          false
        )
      ).toEqual(expected);
    }
  );

  it.each(['half-elf', 'tiefling', 'halfling', 'gnome', 'half-orc'])(
    'resolves every exact standing %s starter-class model',
    (raceRefId) => {
      for (const classRefId of ['barbarian', 'fighter', 'monk', 'rogue']) {
        const expected = asResolution({
          url: `/models/synty/characters/race-class/${raceRefId}-${classRefId}.glb`,
          rigFamily: 'modular-fantasy-hero-v1',
          source: 'race-class',
        });

        expect(
          classCharacterModels.resolvePlayerCharacterModel?.(
            ` ${raceRefId.toUpperCase()} `,
            ` ${classRefId.toUpperCase()} `,
            false
          )
        ).toEqual(expected);
      }
    }
  );

  it.each([
    'elf',
    'dwarf',
    'half-elf',
    'tiefling',
    'halfling',
    'gnome',
    'half-orc',
  ])('falls back to the class model for a downed %s Fighter', (raceRefId) => {
    const expected = asResolution({
      url: '/models/synty/characters/fighter-downed.glb',
      rigFamily: 'townfolk-v1',
      source: 'class',
    });

    expect(
      classCharacterModels.resolvePlayerCharacterModel?.(
        raceRefId,
        'fighter',
        true
      )
    ).toEqual(expected);
  });

  it('falls back to the class model for unpromoted known race-class combinations', () => {
    const expected = asResolution({
      url: '/models/synty/characters/barbarian.glb',
      rigFamily: 'townfolk-v1',
      source: 'class',
    });

    expect(
      classCharacterModels.resolvePlayerCharacterModel?.(
        ' human ',
        ' barbarian ',
        false
      )
    ).toEqual(expected);
  });

  it('falls back to the class model when raceRefId is missing', () => {
    const expected = asResolution({
      url: '/models/synty/characters/fighter.glb',
      rigFamily: 'townfolk-v1',
      source: 'class',
    });

    expect(
      classCharacterModels.resolvePlayerCharacterModel?.(
        undefined,
        'fighter',
        false
      )
    ).toEqual(expected);
  });

  it('treats a blank raceRefId as missing and falls back to the class model', () => {
    const expected = asResolution({
      url: '/models/synty/characters/fighter.glb',
      rigFamily: 'townfolk-v1',
      source: 'class',
    });

    expect(
      classCharacterModels.resolvePlayerCharacterModel?.(
        '   ',
        'fighter',
        false
      )
    ).toEqual(expected);
  });

  it('returns undefined for an unknown class', () => {
    expect(
      classCharacterModels.resolvePlayerCharacterModel?.('elf', 'wizard', false)
    ).toBeUndefined();
  });
});

describe('resolveWalkClipName', () => {
  it('resolves the exact merged Townfolk standing release shape', () => {
    const releaseClipNames = ['Idle_Relaxed', 'Walk_Forward'];

    expect(classCharacterModels.resolveIdleClipName(releaseClipNames)).toBe(
      'Idle_Relaxed'
    );
    expect(classCharacterModels.resolveWalkClipName(releaseClipNames)).toBe(
      'Walk_Forward'
    );
  });

  it('matches "walk" case-insensitively', () => {
    expect(classCharacterModels.resolveWalkClipName(['WALK_FORWARD'])).toBe(
      'WALK_FORWARD'
    );
  });

  it('returns undefined when no clip is walk-named — unlike resolveIdleClipName, does NOT fall back to the first available clip', () => {
    expect(
      classCharacterModels.resolveWalkClipName([
        'Idle_Relaxed',
        'Idle_Drinking',
      ])
    ).toBeUndefined();
  });

  it('returns undefined for an empty clip list (downed variants, or any clip-less model)', () => {
    expect(classCharacterModels.resolveWalkClipName([])).toBeUndefined();
  });

  it('DOES match a clip whose name merely contains "walk" as a substring of an unrelated word — documents /walk/i is a substring test, not word-boundary-aware', () => {
    // "Boardwalk" isn't a real clip name this pipeline would ever produce,
    // but the point is /walk/i really is a plain substring test, not a
    // word-boundary one — this is documenting the actual (intentional)
    // behavior, not a bug to fix.
    expect(
      classCharacterModels.resolveWalkClipName([
        'Idle_Relaxed',
        'Boardwalk_Loop',
      ])
    ).toBe('Boardwalk_Loop');
  });
});
