import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  AppearanceSchema,
  CharacterSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DnDAppearance } from './DnDAppearance';

describe('DnDAppearance', () => {
  it('renders generated provider defaults when finalized appearance is absent', () => {
    render(<DnDAppearance character={create(CharacterSchema)} />);

    expect(screen.getByText('Scalp: Default (Hair 04)')).not.toBeNull();
    expect(screen.getByText('Facial: Default (Facial Hair 02)')).not.toBeNull();
    expect(screen.getByText('Default hair color · #5A3825')).not.toBeNull();
    expect(screen.getByText('Default roughness · 0.72')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders exact persisted style, none, black, and zero roughness readonly', () => {
    const appearance = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        scalp: create(StyleSelectionSchema, {
          selection: {
            case: 'styleRef',
            value: 'modular-fantasy-hero:hair:38',
          },
        }),
        facialHair: create(StyleSelectionSchema, {
          selection: { case: 'none', value: create(EmptySchema) },
        }),
        colorSrgb: 0,
        roughness: 0,
      }),
    });
    render(
      <DnDAppearance character={create(CharacterSchema, { appearance })} />
    );

    expect(screen.getByText('Scalp: Hair 38')).not.toBeNull();
    expect(screen.getByText('Facial: None')).not.toBeNull();
    expect(screen.getByText('Hair color · #000000')).not.toBeNull();
    expect(screen.getByText('Roughness · 0.00')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
