// @vitest-environment node
import {
  CHARACTER_CUSTOMIZATION_CATALOG,
  type CharacterCustomizationBody,
} from '@/generated/characterCustomizationCatalog';
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
  const bardModels = [
    ['dwarf', '/models/synty/characters/race-class/dwarf-bard.glb'],
    ['elf', '/models/synty/characters/race-class/elf-bard.glb'],
    ['gnome', '/models/synty/characters/race-class/gnome-bard.glb'],
    ['half-elf', '/models/synty/characters/race-class/half-elf-bard.glb'],
    ['halfling', '/models/synty/characters/race-class/halfling-bard.glb'],
    ['half-orc', '/models/synty/characters/race-class/half-orc-bard.glb'],
    ['human', '/models/synty/characters/race-class/human-bard.glb'],
    ['tiefling', '/models/synty/characters/race-class/tiefling-bard.glb'],
  ] as const;

  it.each(bardModels)(
    'resolves the exact standing %s Bard as a non-customizable modular model',
    (raceRefId, url) => {
      expect(
        classCharacterModels.resolvePlayerCharacterModel(
          raceRefId,
          'bard',
          false
        )
      ).toEqual(
        asResolution({
          url,
          rigFamily: 'modular-fantasy-hero-v1',
          source: 'race-class',
        })
      );
    }
  );

  it('prefers a declared profile body over the legacy standing Bard mapping', () => {
    const profile = CHARACTER_CUSTOMIZATION_CATALOG.profiles.elf;
    const bodies = profile.bodies as unknown as Record<
      string,
      CharacterCustomizationBody
    >;
    bodies.bard = {
      ...profile.bodies.barbarian,
      combination: 'elf:bard',
      classRef: 'bard',
      outfit: 'bard',
      url: '/models/synty/characters/customization/elf-v1/bodies/elf-bard-body.glb',
      fallbackUrl:
        '/models/synty/characters/customization/elf-v1/fallbacks/elf-bard-complete.glb',
    } as unknown as CharacterCustomizationBody;
    try {
      expect(
        classCharacterModels.resolvePlayerCharacterModel('elf', 'bard', false)
      ).toEqual(
        asResolution({
          url: bodies.bard.url,
          rigFamily: 'modular-fantasy-hero-v1',
          source: 'race-class',
          customizationProfileRef: profile.profileRef,
          fallbackUrl: bodies.bard.fallbackUrl,
          fallbackSha256: bodies.bard.fallbackSha256,
        })
      );
    } finally {
      delete bodies.bard;
    }
  });

  it.each(bardModels)(
    'keeps a downed/dead %s Bard unresolved for the established fallback',
    (raceRefId) => {
      expect(
        classCharacterModels.resolvePlayerCharacterModel(
          raceRefId,
          'bard',
          true
        )
      ).toBeUndefined();
    }
  );

  it('does not substitute Human for a missing or unknown Bard race', () => {
    expect(
      classCharacterModels.resolvePlayerCharacterModel(undefined, 'bard', false)
    ).toBeUndefined();
    expect(
      classCharacterModels.resolvePlayerCharacterModel(
        'dragonborn',
        'bard',
        false
      )
    ).toBeUndefined();
  });

  it.each(['barbarian', 'fighter', 'monk', 'rogue'])(
    'resolves the exact standing Elf %s race-class model',
    (classRefId) => {
      const body =
        CHARACTER_CUSTOMIZATION_CATALOG.profiles.elf.bodies[
          classRefId as 'barbarian' | 'fighter' | 'monk' | 'rogue'
        ];
      const expected = asResolution({
        url: body.url,
        rigFamily: 'modular-fantasy-hero-v1',
        source: 'race-class',
        customizationProfileRef: 'modular-fantasy-hero-v1:elf',
        fallbackUrl: body.fallbackUrl,
        fallbackSha256: body.fallbackSha256,
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

  it.each([
    [
      'barbarian',
      'dfd29de0d5a3611f6e92b88e7f706587ef705b332f0a8a949ee23919396a9a7f',
    ],
    [
      'fighter',
      '7e1c611b5b5e02a709e75ed71deeccdc30242e0716da469adc2ddaa559068224',
    ],
    [
      'monk',
      'e44a953e0678b029a379822a0593b21111fb7052c18152750ded94eed7086247',
    ],
    [
      'rogue',
      'a6de5c8247d8fdd8eae3888ee10faa9eddb73b624be92e81c25993b24063cfe7',
    ],
  ] as const)(
    'resolves the generated active and immutable fallback Dwarf %s body',
    (classRefId, fallbackSha256) => {
      const expected = asResolution({
        url: `/models/synty/characters/customization/dwarf-v1/bodies/dwarf-${classRefId}-body.glb`,
        rigFamily: 'modular-fantasy-hero-v1',
        source: 'race-class',
        customizationProfileRef: 'modular-fantasy-hero-v1:dwarf',
        fallbackUrl: `/models/synty/characters/race-class/dwarf-${classRefId}.glb`,
        fallbackSha256,
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
        const profile =
          CHARACTER_CUSTOMIZATION_CATALOG.profiles[
            raceRefId as
              | 'half-elf'
              | 'tiefling'
              | 'halfling'
              | 'gnome'
              | 'half-orc'
          ];
        const body =
          profile.bodies[
            classRefId as 'barbarian' | 'fighter' | 'monk' | 'rogue'
          ];
        const expected = asResolution({
          url: body.url,
          rigFamily: 'modular-fantasy-hero-v1',
          source: 'race-class',
          customizationProfileRef: profile.profileRef,
          fallbackUrl: body.fallbackUrl,
          fallbackSha256: body.fallbackSha256,
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
    'human',
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

  it('resolves the exact Human customization body and generated complete fallback', () => {
    const body =
      CHARACTER_CUSTOMIZATION_CATALOG.profiles.human.bodies.barbarian;
    const expected = asResolution({
      url: body.url,
      rigFamily: 'modular-fantasy-hero-v1',
      source: 'race-class',
      customizationProfileRef: 'modular-fantasy-hero-v1:human',
      fallbackUrl: body.fallbackUrl,
      fallbackSha256: body.fallbackSha256,
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
    expect(
      classCharacterModels.resolvePlayerCharacterModel?.(
        'dwarf',
        '__proto__',
        false
      )
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
