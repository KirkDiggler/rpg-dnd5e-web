import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  CharacterSchema,
  type Character,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DnDFeatures } from './DnDFeatures';

function makeCharacter(
  overrides: MessageInitShape<typeof CharacterSchema> = {}
): Character {
  return create(CharacterSchema, {
    id: 'char-1',
    features: [
      {
        name: 'Rage',
        description: 'Enter a battle fury.',
        source: 'dnd5e:classes:barbarian',
        level: 1,
      },
    ],
    ...overrides,
  });
}

describe('DnDFeatures', () => {
  it("renders the character's real features instead of the empty stub", () => {
    render(<DnDFeatures character={makeCharacter()} />);
    expect(screen.getByText('Rage')).toBeTruthy();
    expect(screen.getByText('1 features')).toBeTruthy();
  });

  it('shows an empty state when the character has no features', () => {
    render(<DnDFeatures character={makeCharacter({ features: [] })} />);
    expect(screen.getByText(/No features available yet/)).toBeTruthy();
    expect(screen.getByText('0 features')).toBeTruthy();
  });

  it('opens the modal with the same feature data on click', () => {
    const onShowModal = vi.fn();
    render(
      <DnDFeatures character={makeCharacter()} onShowModal={onShowModal} />
    );

    fireEvent.click(screen.getByText('FEATURES & TRAITS'));

    expect(onShowModal).toHaveBeenCalledTimes(1);
    const [title, content] = onShowModal.mock.calls[0];
    expect(title).toBe('Features & Traits');

    const modal = document.createElement('div');
    render(<>{content}</>, { container: modal });
    expect(within(modal).getByText('Rage')).toBeTruthy();
  });
});
