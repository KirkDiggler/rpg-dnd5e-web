import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  AppearanceSchema,
  CharacterSchema,
  type Appearance,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DnDAppearance } from './DnDAppearance';

function supportedCharacter(
  characterClass: Class,
  appearance?: Appearance,
  race: Race = Race.DWARF
) {
  return create(CharacterSchema, {
    race,
    class: characterClass,
    appearance,
  });
}

describe('DnDAppearance', () => {
  it.each([Class.BARBARIAN, Class.FIGHTER, Class.MONK, Class.ROGUE])(
    'renders generated provider defaults for supported finalized Dwarf class %s',
    (characterClass) => {
      render(<DnDAppearance character={supportedCharacter(characterClass)} />);

      expect(screen.getByText('Scalp: Default (Hair 04)')).not.toBeNull();
      expect(
        screen.getByText('Facial: Default (Facial Hair 02)')
      ).not.toBeNull();
      expect(screen.getByText('Default hair color · #5A3825')).not.toBeNull();
      expect(screen.getByText('Default roughness · 0.72')).not.toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    }
  );

  it.each([
    [Race.DRAGONBORN, Class.FIGHTER],
    [Race.DWARF, Class.WIZARD],
  ])(
    'renders an unsupported state instead of Dwarf defaults for race %s class %s',
    (race, characterClass) => {
      render(
        <DnDAppearance
          character={create(CharacterSchema, {
            race,
            class: characterClass,
          })}
        />
      );

      expect(
        screen.getByText(
          'Hair customization is not supported for this race and class.'
        )
      ).not.toBeNull();
      expect(screen.queryByText(/Hair 04/)).toBeNull();
      expect(screen.queryByText(/#5A3825/)).toBeNull();
    }
  );

  it.each([
    [Race.HUMAN, 'Hair 16'],
    [Race.ELF, 'Hair 01'],
    [Race.HALFLING, 'Hair 16'],
    [Race.GNOME, 'Hair 16'],
    [Race.HALF_ELF, 'Hair 16'],
    [Race.HALF_ORC, 'Hair 08'],
    [Race.TIEFLING, 'Hair 03'],
  ])(
    'renders profile defaults for finalized non-Dwarf race %s',
    (race, scalpLabel) => {
      render(
        <DnDAppearance
          character={supportedCharacter(Class.FIGHTER, undefined, race)}
        />
      );

      expect(screen.getByText(`Scalp: Default (${scalpLabel})`)).not.toBeNull();
      expect(screen.getByText('Facial: Default (None)')).not.toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    }
  );

  it('renders a missing-identity state instead of inferring Dwarf defaults', () => {
    render(<DnDAppearance character={create(CharacterSchema)} />);

    expect(
      screen.getByText(
        'Hair customization unavailable: race and class are required.'
      )
    ).not.toBeNull();
    expect(screen.queryByText(/Hair 04/)).toBeNull();
    expect(screen.queryByText(/#5A3825/)).toBeNull();
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
      <DnDAppearance
        character={supportedCharacter(Class.FIGHTER, appearance)}
      />
    );

    expect(screen.getByText('Scalp: Hair 38')).not.toBeNull();
    expect(screen.getByText('Facial: None')).not.toBeNull();
    expect(screen.getByText('Hair color · #000000')).not.toBeNull();
    expect(screen.getByText('Roughness · 0.00')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
