import { create } from '@bufbuild/protobuf';
import {
  RaceInfoSchema,
  RacialTraitSchema,
  type RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RaceSelectionModal } from './RaceSelectionModal';

const hoisted = vi.hoisted(() => ({
  useListRaces: vi.fn(),
}));

vi.mock('../../api/hooks', () => ({
  useListRaces: hoisted.useListRaces,
}));

function race(name: string, traits: RaceInfo['traits']): RaceInfo {
  return create(RaceInfoSchema, { name, traits });
}

function renderModal(races: RaceInfo[]) {
  hoisted.useListRaces.mockReturnValue({
    data: races,
    loading: false,
    error: null,
  });

  render(<RaceSelectionModal isOpen onClose={vi.fn()} onSelect={vi.fn()} />);
}

describe('RaceSelectionModal racial traits', () => {
  it('keeps populated traits in the existing collapsible disclosure without an inner scrollbar', async () => {
    renderModal([
      race('Elf', [
        create(RacialTraitSchema, {
          name: 'Darkvision',
          description: 'You can see in dim light within 60 feet of you.',
        }),
      ]),
    ]);

    const disclosure = screen.getByRole('button', { name: /racial traits/i });
    expect(disclosure).toBeTruthy();
    expect(screen.getByText('Darkvision')).toBeTruthy();

    const traitContainer = screen.getByText('Darkvision').parentElement
      ?.parentElement as HTMLDivElement;
    expect(traitContainer.style.overflowY).toBe('');
    expect(traitContainer.style.maxHeight).toBe('');

    fireEvent.click(disclosure);
    await waitFor(() => {
      expect(screen.queryByText('Darkvision')).toBeNull();
    });
  });

  it('omits the entire racial traits disclosure and fallback for Human with no traits', () => {
    renderModal([race('Human', [])]);

    expect(screen.queryByRole('button', { name: /racial traits/i })).toBeNull();
    expect(screen.queryByText('Racial Traits')).toBeNull();
    expect(screen.queryByText('No racial traits available')).toBeNull();
  });
});
