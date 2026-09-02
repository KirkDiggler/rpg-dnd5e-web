import { CHARACTER_CUSTOMIZATION_CATALOG } from '@/generated/characterCustomizationCatalog';
import { create } from '@bufbuild/protobuf';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterCustomizationControls } from './CharacterCustomizationControls';

describe('CharacterCustomizationControls defensive persisted values', () => {
  it('shows provider surface defaults and drops invalid fields on the next edit', () => {
    const onChange = vi.fn();
    render(
      <CharacterCustomizationControls
        profile={CHARACTER_CUSTOMIZATION_CATALOG.profiles.dwarf}
        hair={create(HairCustomizationSchema, {
          scalp: create(StyleSelectionSchema),
          colorSrgb: 0x1000000,
          roughness: Number.NaN,
        })}
        onChange={onChange}
      />
    );

    expect(
      (screen.getByLabelText('Hair color') as HTMLInputElement).value
    ).toBe('#5a3825');
    expect(
      (screen.getByLabelText('Hair roughness') as HTMLInputElement).value
    ).toBe('0.72');
    expect(screen.getByText('0.72')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Hair color'), {
      target: { value: '#102030' },
    });
    const updated = onChange.mock.lastCall?.[0];
    expect(updated?.colorSrgb).toBe(0x102030);
    expect(updated?.roughness).toBeUndefined();
    expect(updated?.scalp).toBeUndefined();
  });
});
