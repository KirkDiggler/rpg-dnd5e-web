import { describe, expect, it } from 'vitest';
import { CHARACTER_CUSTOMIZATION_CATALOG } from '../../generated/characterCustomizationCatalog';
import { resolveCharacterCustomizationModel } from './characterCustomization';

const classes = ['barbarian', 'fighter', 'monk', 'rogue'] as const;

describe('profile-driven customization model resolution', () => {
  it.each(CHARACTER_CUSTOMIZATION_CATALOG.profileOrder)(
    'resolves all four exact active %s bodies and complete fallbacks',
    (raceRef) => {
      for (const classRef of classes) {
        const result = resolveCharacterCustomizationModel(raceRef, classRef);
        const body =
          CHARACTER_CUSTOMIZATION_CATALOG.profiles[raceRef].bodies[classRef];
        expect(result).toMatchObject({
          url: body.url,
          rigFamily: 'modular-fantasy-hero-v1',
          source: 'race-class',
          customizationProfileRef: `modular-fantasy-hero-v1:${raceRef}`,
          fallbackUrl: body.fallbackUrl,
          fallbackSha256: body.fallbackSha256,
        });
      }
    }
  );

  it('normalizes refs and returns undefined rather than borrowing an unsupported profile', () => {
    expect(
      resolveCharacterCustomizationModel(' HUMAN ', ' FIGHTER ')
    ).toMatchObject({
      customizationProfileRef: 'modular-fantasy-hero-v1:human',
    });
    expect(
      resolveCharacterCustomizationModel('HALF_ORC', 'ROGUE')
    ).toMatchObject({
      customizationProfileRef: 'modular-fantasy-hero-v1:half-orc',
    });
    expect(resolveCharacterCustomizationModel('dragonborn', 'fighter')).toBe(
      undefined
    );
    expect(resolveCharacterCustomizationModel('human', 'wizard')).toBe(
      undefined
    );
  });
});
