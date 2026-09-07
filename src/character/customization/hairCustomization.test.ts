import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { CustomizationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { AppearanceSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { describe, expect, it } from 'vitest';
import { CHARACTER_CUSTOMIZATION_CATALOG } from '../../generated/characterCustomizationCatalog';
import {
  resolveHairColorSrgb,
  resolveHairPresentation,
  resolveHairRoughness,
  rgb24ToHex,
} from './hairCustomization';

const DWARF_CUSTOMIZATION_CATALOG =
  CHARACTER_CUSTOMIZATION_CATALOG.profiles.dwarf;

function style(styleRef: string) {
  return create(StyleSelectionSchema, {
    selection: { case: 'styleRef', value: styleRef },
  });
}

function none() {
  return create(StyleSelectionSchema, {
    selection: { case: 'none', value: create(EmptySchema) },
  });
}

const dwarfFighter = {
  raceRefId: 'dwarf',
  classRefId: 'fighter',
} as const;

describe('rgb24ToHex', () => {
  it.each([
    [0, '#000000'],
    [0x5a3825, '#5A3825'],
    [0xffffff, '#FFFFFF'],
  ] as const)(
    'converts RGB24 %s to exact uppercase #RRGGBB',
    (value, expected) => {
      expect(rgb24ToHex(value)).toBe(expected);
    }
  );
});

describe('provider surface normalization', () => {
  it('keeps inclusive valid values and defaults invalid values without clamping', () => {
    expect(resolveHairColorSrgb(0)).toBe(0);
    expect(resolveHairColorSrgb(0xffffff)).toBe(0xffffff);
    expect(resolveHairColorSrgb(0x1000000)).toBe(
      DWARF_CUSTOMIZATION_CATALOG.surface.defaultColorSrgb
    );
    expect(resolveHairRoughness(0)).toBe(0);
    expect(resolveHairRoughness(1)).toBe(1);
    expect(resolveHairRoughness(Number.NaN)).toBe(
      DWARF_CUSTOMIZATION_CATALOG.surface.defaultRoughness
    );
    expect(resolveHairRoughness(-0.01)).toBe(
      DWARF_CUSTOMIZATION_CATALOG.surface.defaultRoughness
    );
  });
});

describe('resolveHairPresentation', () => {
  it('uses exact provider defaults when the shared proto container is absent', () => {
    const result = resolveHairPresentation(dwarfFighter);

    expect(result.profileRef).toBe('modular-fantasy-hero-v1:dwarf');
    expect(result.diagnostics).toEqual([]);
    expect(result.accessories).toEqual([
      {
        slot: 'scalp',
        styleRef: 'modular-fantasy-hero:hair:04',
        url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-04.glb',
        treatment: {
          baseColorSrgb: '#5A3825',
          roughness: 0.72,
          metalness: 0,
        },
      },
      {
        slot: 'facial-hair',
        styleRef: 'modular-fantasy-hero:facial-hair:02',
        url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-02.glb',
        treatment: {
          baseColorSrgb: '#5A3825',
          roughness: 0.72,
          metalness: 0,
        },
      },
    ]);
  });

  it('normalizes Appearance hair with explicit none, exact ref, black, and zero roughness', () => {
    const appearance = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        scalp: none(),
        facialHair: style('modular-fantasy-hero:facial-hair:18'),
        colorSrgb: 0,
        roughness: 0,
      }),
    });

    const result = resolveHairPresentation({
      ...dwarfFighter,
      customization: appearance,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.accessories).toEqual([
      {
        slot: 'facial-hair',
        styleRef: 'modular-fantasy-hero:facial-hair:18',
        url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-18.glb',
        treatment: {
          baseColorSrgb: '#000000',
          roughness: 0,
          metalness: 0,
        },
      },
    ]);
  });

  it('normalizes session Customization through the same renderer input', () => {
    const hair = create(HairCustomizationSchema, {
      scalp: style('modular-fantasy-hero:hair:38'),
      facialHair: none(),
      colorSrgb: 0xffffff,
      roughness: 1,
    });
    const appearance = create(AppearanceSchema, { hair });
    const sessionCustomization = create(CustomizationSchema, { hair });

    expect(
      resolveHairPresentation({
        ...dwarfFighter,
        customization: sessionCustomization,
      })
    ).toEqual(
      resolveHairPresentation({
        ...dwarfFighter,
        customization: appearance,
      })
    );
  });

  it('diagnoses unknown and path-like refs without interpolating either into a URL', () => {
    const malicious =
      '/models/synty/characters/customization/dwarf-v1/scalp/hair-01.glb';
    const customization = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        scalp: style(malicious),
        facialHair: style('modular-fantasy-hero:facial-hair:99'),
      }),
    });

    const result = resolveHairPresentation({
      ...dwarfFighter,
      customization,
    });

    expect(result.accessories).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: 'unknown-style-ref',
        slot: 'scalp',
        requestedStyleRef: malicious,
      },
      {
        code: 'unknown-style-ref',
        slot: 'facial-hair',
        requestedStyleRef: 'modular-fantasy-hero:facial-hair:99',
      },
    ]);
    expect(JSON.stringify(result.accessories)).not.toContain(malicious);
  });

  it('keeps valid facial hair when an unknown scalp ref is rejected', () => {
    const customization = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        scalp: style('modular-fantasy-hero:hair:missing'),
        facialHair: style('modular-fantasy-hero:facial-hair:18'),
      }),
    });

    const result = resolveHairPresentation({
      ...dwarfFighter,
      customization,
    });

    expect(result.accessories).toEqual([
      {
        slot: 'facial-hair',
        styleRef: 'modular-fantasy-hero:facial-hair:18',
        url: '/models/synty/characters/customization/dwarf-v1/facial-hair/facial-hair-18.glb',
        treatment: {
          baseColorSrgb: '#5A3825',
          roughness: 0.72,
          metalness: 0,
        },
      },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: 'unknown-style-ref',
        slot: 'scalp',
        requestedStyleRef: 'modular-fantasy-hero:hair:missing',
      },
    ]);
  });

  it('reports a missing provider default as a contract diagnostic without guessing a URL', () => {
    const mutableScalp = DWARF_CUSTOMIZATION_CATALOG.slots.scalp as {
      defaultSelection: { kind: 'style'; styleRef: string };
    };
    const originalDefault = mutableScalp.defaultSelection.styleRef;
    mutableScalp.defaultSelection.styleRef =
      'modular-fantasy-hero:hair:not-declared';
    try {
      const result = resolveHairPresentation(dwarfFighter);
      expect(result.accessories).toHaveLength(1);
      expect(result.accessories[0]?.slot).toBe('facial-hair');
      expect(result.diagnostics).toEqual([
        {
          code: 'unknown-style-ref',
          slot: 'scalp',
          requestedStyleRef: 'modular-fantasy-hero:hair:not-declared',
        },
      ]);
      expect(JSON.stringify(result.accessories)).not.toContain('not-declared');
    } finally {
      mutableScalp.defaultSelection.styleRef = originalDefault;
    }
  });

  it('diagnoses a present selection with no oneof arm and mounts no accessory for that slot', () => {
    const customization = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        scalp: create(StyleSelectionSchema),
        facialHair: none(),
      }),
    });

    expect(resolveHairPresentation({ ...dwarfFighter, customization })).toEqual(
      {
        profileRef: 'modular-fantasy-hero-v1:dwarf',
        accessories: [],
        diagnostics: [{ code: 'invalid-selection', slot: 'scalp' }],
      }
    );
  });

  it('diagnoses unsupported race and class without borrowing provider truth', () => {
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
      resolveHairPresentation({ raceRefId: 'dwarf', classRefId: 'wizard' })
    ).toEqual({
      profileRef: 'modular-fantasy-hero-v1:dwarf',
      accessories: [],
      diagnostics: [{ code: 'unsupported-class', requestedRef: 'wizard' }],
    });
  });

  it('diagnoses invalid server surface values and uses provider defaults without clamping', () => {
    const customization = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        colorSrgb: 0x1000000,
        roughness: Number.NaN,
      }),
    });

    const result = resolveHairPresentation({
      ...dwarfFighter,
      customization,
    });

    expect(result.diagnostics).toEqual([
      { code: 'invalid-color-srgb', requestedValue: 0x1000000 },
      { code: 'invalid-roughness', requestedValue: Number.NaN },
    ]);
    expect(result.accessories).toHaveLength(2);
    expect(result.accessories[0]?.treatment).toEqual({
      baseColorSrgb: '#5A3825',
      roughness: 0.72,
      metalness: 0,
    });
  });
});
