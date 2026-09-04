import { create } from '@bufbuild/protobuf';
import { OutfitCustomizationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { resolveOutfitPresentation } from './outfitCustomization';

describe('resolveOutfitPresentation', () => {
  it('keeps a supported body stable while absent overrides leave atlas channels enabled', () => {
    expect(
      resolveOutfitPresentation({
        classRefId: 'FIGHTER',
        customization: undefined,
      })
    ).toMatchObject({
      classRef: 'fighter',
      profileKey: 'fighter:16',
      maskUrl:
        '/models/synty/characters/outfit-customization/v1/masks/fighter-16.png',
      primaryColor: undefined,
      secondaryColor: undefined,
      usePrimary: false,
      useSecondary: false,
      meshNames: [
        'Chr_Torso_Male_16',
        'Chr_Hips_Male_16',
        'Chr_ArmUpperLeft_Male_16',
        'Chr_ArmUpperRight_Male_16',
        'Chr_ArmLowerLeft_Male_16',
        'Chr_ArmLowerRight_Male_16',
        'Chr_HandLeft_Male_16',
        'Chr_HandRight_Male_16',
        'Chr_LegLeft_Male_16',
        'Chr_LegRight_Male_16',
      ],
    });
  });

  it('retains explicit black independently from the secondary channel', () => {
    expect(
      resolveOutfitPresentation({
        classRefId: 'fighter',
        customization: {
          outfit: create(OutfitCustomizationSchema, { primaryColorSrgb: 0 }),
        },
      })
    ).toMatchObject({
      classRef: 'fighter',
      primaryColor: '#000000',
      secondaryColor: undefined,
      usePrimary: true,
      useSecondary: false,
    });
  });

  it('rejects invalid colors and unsupported classes without constructing a mask URL', () => {
    expect(
      resolveOutfitPresentation({
        classRefId: 'wizard',
        customization: {
          outfit: create(OutfitCustomizationSchema, {
            primaryColorSrgb: 0x123456,
          }),
        },
      })
    ).toEqual({
      presentation: undefined,
      diagnostic: { code: 'unsupported-class', requestedRef: 'wizard' },
    });
    expect(
      resolveOutfitPresentation({
        classRefId: 'fighter',
        customization: {
          outfit: create(OutfitCustomizationSchema, {
            primaryColorSrgb: 0x1000000,
          }),
        },
      })
    ).toEqual({
      presentation: undefined,
      diagnostic: {
        code: 'invalid-color-srgb',
        channel: 'primary',
        requestedValue: 0x1000000,
      },
    });
  });
});
