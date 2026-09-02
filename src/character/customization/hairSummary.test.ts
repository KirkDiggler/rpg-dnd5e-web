import { create } from '@bufbuild/protobuf';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { summarizeHair } from './hairSummary';

describe('summarizeHair', () => {
  it('shows provider defaults for invalid persisted surfaces and exposes an arm-less slot', () => {
    expect(
      summarizeHair(
        create(HairCustomizationSchema, {
          scalp: create(StyleSelectionSchema),
          colorSrgb: 0x1000000,
          roughness: Number.NaN,
        })
      )
    ).toEqual({
      scalp: 'Unavailable',
      facialHair: 'Default (Facial Hair 02)',
      colorHex: '#5A3825',
      roughness: 0.72,
      colorIsDefault: true,
      roughnessIsDefault: true,
    });
  });
});
