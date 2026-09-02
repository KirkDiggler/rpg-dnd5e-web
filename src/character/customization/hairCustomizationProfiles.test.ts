import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { AppearanceSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { describe, expect, it } from 'vitest';
import { CHARACTER_CUSTOMIZATION_CATALOG } from '../../generated/characterCustomizationCatalog';
import { resolveHairPresentation } from './hairCustomization';

const defaults = {
  human: ['16'],
  elf: ['01'],
  dwarf: ['04', 'facial:02'],
  'half-elf': ['16'],
  tiefling: ['03'],
  halfling: ['16'],
  gnome: ['16'],
  'half-orc': ['08'],
} as const;

function style(styleRef: string) {
  return create(StyleSelectionSchema, {
    selection: { case: 'styleRef', value: styleRef },
  });
}

describe('profile-driven hair presentation', () => {
  it.each(CHARACTER_CUSTOMIZATION_CATALOG.profileOrder)(
    'resolves provider style-or-none defaults for %s',
    (raceRef) => {
      const result = resolveHairPresentation({
        raceRefId: raceRef,
        classRefId: 'fighter',
      });

      expect(result.profileRef).toBe(`modular-fantasy-hero-v1:${raceRef}`);
      expect(result.diagnostics).toEqual([]);
      const expected = defaults[raceRef];
      expect(result.accessories).toHaveLength(expected.length);
      expect(result.accessories[0]?.url).toBe(
        `/models/synty/characters/customization/${raceRef}-v1/scalp/hair-${expected[0]}.glb`
      );
      if (raceRef === 'dwarf') {
        expect(result.accessories[1]?.url).toBe(
          '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-02.glb'
        );
      }
    }
  );

  it.each(CHARACTER_CUSTOMIZATION_CATALOG.profileOrder)(
    'uses %s-specific bytes for the same two explicit opaque refs',
    (raceRef) => {
      const customization = create(AppearanceSchema, {
        hair: create(HairCustomizationSchema, {
          scalp: style('modular-fantasy-hero:hair:38'),
          facialHair: style('modular-fantasy-hero:facial-hair:18'),
          colorSrgb: 0x123456,
          roughness: 0.25,
        }),
      });

      const result = resolveHairPresentation({
        raceRefId: raceRef,
        classRefId: 'rogue',
        customization,
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.accessories.map((value) => value.url)).toEqual([
        `/models/synty/characters/customization/${raceRef}-v1/scalp/hair-38.glb`,
        `/models/synty/characters/customization/${raceRef}-v1/facial-hair/facial-hair-18.glb`,
      ]);
      expect(result.accessories[0]?.treatment).toEqual({
        baseColorSrgb: '#123456',
        roughness: 0.25,
        metalness: 0,
      });
    }
  );

  it('mounts nothing without diagnostics when a profile default is none', () => {
    const result = resolveHairPresentation({
      raceRefId: 'human',
      classRefId: 'fighter',
      customization: create(AppearanceSchema, {
        hair: create(HairCustomizationSchema, {
          scalp: create(StyleSelectionSchema, {
            selection: { case: 'none', value: create(EmptySchema) },
          }),
        }),
      }),
    });

    expect(result.accessories).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('ignores unsupported races and classes without borrowing another profile', () => {
    expect(
      resolveHairPresentation({
        raceRefId: 'dragonborn',
        classRefId: 'fighter',
      })
    ).toEqual({
      profileRef: undefined,
      accessories: [],
      diagnostics: [{ code: 'unsupported-race', requestedRef: 'dragonborn' }],
    });
    expect(
      resolveHairPresentation({ raceRefId: 'human', classRefId: 'wizard' })
    ).toEqual({
      profileRef: 'modular-fantasy-hero-v1:human',
      accessories: [],
      diagnostics: [{ code: 'unsupported-class', requestedRef: 'wizard' }],
    });
  });
});
