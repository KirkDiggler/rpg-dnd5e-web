import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { StudioConcealments } from './StudioConcealments';
import type { EncounterStudioSession } from './studioSession';

afterEach(cleanup);

function populated(): EncounterStudioSession {
  return {
    ...createFakeStudioSession(),
    document: createPopulatedStudioDocument(),
  };
}
const panel = () =>
  within(screen.getByRole('group', { name: 'Concealment studio-secret' }));

describe('StudioConcealments (rpg-project#578)', () => {
  it('a concealment needs one search check', () => {
    const session = populated();
    render(
      <StudioConcealments
        session={session}
        onArmMembers={vi.fn()}
        onOpenIntel={vi.fn()}
      />
    );
    const remove = panel().getByRole('button', {
      name: 'Remove check 1 from studio-secret search',
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.click(
      panel().getByRole('button', { name: 'Add check to studio-secret search' })
    );
    expect(session.concealments.update).toHaveBeenLastCalledWith(
      'studio-secret',
      expect.objectContaining({
        checks: [
          { ability: 'perception', dc: 15 },
          { ability: 'investigation', dc: 15 },
        ],
      })
    );
  });

  it('notice checks and attempts edit the spec, and lifetime is not offered', () => {
    const session = populated();
    render(
      <StudioConcealments
        session={session}
        onArmMembers={vi.fn()}
        onOpenIntel={vi.fn()}
      />
    );
    fireEvent.click(
      panel().getByRole('button', { name: 'Add check to studio-secret notice' })
    );
    expect(session.concealments.update).toHaveBeenLastCalledWith(
      'studio-secret',
      expect.objectContaining({ notice: [{ ability: 'perception', dc: 15 }] })
    );
    fireEvent.change(panel().getByLabelText('Max attempts for studio-secret'), {
      target: { value: '2' },
    });
    expect(session.concealments.update).toHaveBeenLastCalledWith(
      'studio-secret',
      expect.objectContaining({ attempts: { max: 2 } })
    );
    fireEvent.change(panel().getByLabelText('Reset hexes for studio-secret'), {
      target: { value: '3' },
    });
    expect(session.concealments.update).toHaveBeenLastCalledWith(
      'studio-secret',
      expect.objectContaining({ attempts: { reset_hexes: 3 } })
    );
    const region = screen.getByRole('region', { name: 'Concealments' });
    expect(region.textContent).not.toMatch(/lifetime/i);
    expect(within(region).queryByLabelText(/lifetime/i)).toBeNull();
  });

  it('members list cells and props in words, each with Remove', () => {
    const session = populated();
    render(
      <StudioConcealments
        session={session}
        onArmMembers={vi.fn()}
        onOpenIntel={vi.fn()}
      />
    );
    const members = within(
      panel().getByRole('list', { name: 'Members of studio-secret' })
    );
    expect(
      members
        .getAllByRole('listitem')
        .map((item) => item.firstChild?.textContent)
    ).toEqual(['Hex q 1, r 0', 'Door: the door in Studio north wall']);
    fireEvent.click(
      members.getByRole('button', {
        name: 'Remove the door in Studio north wall from studio-secret',
      })
    );
    expect(session.concealments.update).toHaveBeenLastCalledWith(
      'studio-secret',
      {
        cells: [{ q: 1, r: 0 }],
        checks: [{ ability: 'perception', dc: 15 }],
      }
    );
  });

  it('revealed by lists the intel that names it', () => {
    const onOpenIntel = vi.fn();
    render(
      <StudioConcealments
        session={populated()}
        onArmMembers={vi.fn()}
        onOpenIntel={onOpenIntel}
      />
    );
    fireEvent.click(
      within(
        panel().getByRole('list', { name: 'Intel revealing studio-secret' })
      ).getByRole('button', { name: 'intel studio-map' })
    );
    expect(onOpenIntel).toHaveBeenCalledExactlyOnceWith('studio-map');
  });

  it('Add members on the map arms this concealment', () => {
    const onArmMembers = vi.fn();
    render(
      <StudioConcealments
        session={populated()}
        onArmMembers={onArmMembers}
        onOpenIntel={vi.fn()}
      />
    );
    fireEvent.click(
      panel().getByRole('button', { name: 'Add members on the map' })
    );
    expect(onArmMembers).toHaveBeenCalledExactlyOnceWith('studio-secret');
  });

  it('rename and remove go through their intents', () => {
    const session = populated();
    render(
      <StudioConcealments
        session={session}
        onArmMembers={vi.fn()}
        onOpenIntel={vi.fn()}
      />
    );
    fireEvent.click(
      panel().getByRole('button', { name: 'Rename concealment' })
    );
    fireEvent.change(panel().getByLabelText('Concealment id'), {
      target: { value: 'stash' },
    });
    fireEvent.click(panel().getByRole('button', { name: 'Apply rename' }));
    expect(session.concealments.rename).toHaveBeenCalledExactlyOnceWith(
      'studio-secret',
      'stash'
    );
    fireEvent.click(
      panel().getByRole('button', { name: 'Remove concealment' })
    );
    expect(session.concealments.update).toHaveBeenLastCalledWith(
      'studio-secret',
      undefined
    );
  });
});
