/**
 * THE INSPECTOR SPEAKS THE ENGINE'S SENTENCES (rpg-project#968, R25). The
 * read-back is the engine's, recorded from the served castle; the panel
 * shows the selection's statements word for word and turns their
 * connections and paths into jumps.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import { castleEngineReadBack } from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { ReadBack } from './ReadBack';
import type { StudioReadBack } from './studioPublishing';

afterEach(cleanup);

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

const current = (): StudioReadBack => ({
  readBack: castleEngineReadBack(),
  readBackIsCurrent: true,
  unavailable: null,
});

const sentenceOf = (kind: string, id: string, statementKind: string) => {
  for (const section of castleEngineReadBack().sections)
    for (const group of section.groups)
      for (const statement of group.statements)
        if (
          statement.about?.kind === kind &&
          statement.about.id === id &&
          statement.kind === statementKind
        )
          return statement.sentence;
  throw new Error(`no ${statementKind} about ${kind} ${id} in the fixture`);
};

const panel = () => screen.getByRole('region', { name: 'Read back' });

describe('ReadBack: the engine’s sentences for the selection', () => {
  it('renders the captain’s routine statements from the recorded castle read-back', () => {
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={current()}
      />
    );
    const text = panel().textContent ?? '';
    // His own group, under the engine's title, word for word.
    expect(
      within(panel()).getByText('Guard Captain (captain)', {
        selector: 'summary',
      })
    ).toBeTruthy();
    expect(text).toContain(
      sentenceOf('creature', 'captain', 'creature.routine')
    );
    // The routine he uses, and its states, in the engine's words.
    expect(
      within(panel()).getByText('Routine `captain-policy`', {
        selector: 'summary',
      })
    ).toBeTruthy();
    expect(text).toContain(sentenceOf('routine', 'captain-policy', 'routine'));
    expect(text).toContain(
      'In the state `ready`, Guard Captain (captain) listens for 7 beats.'
    );
    // gate-1's sentences are not his.
    expect(text).not.toContain('Guard (gate-1) is a');
  });

  it('a fact connection is a button that calls the jump', () => {
    const onOpenFact = vi.fn();
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={current()}
        onOpenFact={onOpenFact}
        onJump={vi.fn()}
      />
    );
    fireEvent.click(
      within(panel()).getAllByRole('button', {
        name: 'Open fact guards-turned',
      })[0]!
    );
    expect(onOpenFact).toHaveBeenCalledWith('guards-turned');
  });

  it('a door connection selects the door through the one path map', () => {
    const onJump = vi.fn();
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={current()}
        onJump={onJump}
      />
    );
    fireEvent.click(
      within(panel()).getAllByRole('button', {
        name: 'Open door gate-wall-door',
      })[0]!
    );
    expect(onJump).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'door',
        target: expect.objectContaining({ doorId: 'gate-wall-door' }),
      })
    );
  });

  it('the grate says where each option sets the doer down, and the region is a jump', () => {
    const onJump = vi.fn();
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'prop', id: 'grate' }}
        state={current()}
        onJump={onJump}
      />
    );
    const text = panel().textContent ?? '';
    expect(text).toContain('is set down on the first free cell of Chapel');
    expect(text).toContain('is set down on the first free cell of Cells');
    // The altar's statements sit in the same site group; they are not the
    // grate's.
    expect(text).not.toContain('Altar (altar)');
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Open region region-cells' })
    );
    expect(onJump).toHaveBeenCalledWith({ kind: 'region', id: 'region-cells' });
  });

  it('the stale notice shows when the sentences are not current', () => {
    const { rerender } = render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={current()}
      />
    );
    expect(within(panel()).queryByRole('status')).toBeNull();
    rerender(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={{ ...current(), readBackIsCurrent: false }}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'These sentences are from the last draft that compiled.'
    );
    expect(panel().textContent).toContain(
      sentenceOf('creature', 'captain', 'creature.routine')
    );
  });

  it('with no read-back it says none is available, and why', () => {
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={{
          readBack: null,
          readBackIsCurrent: false,
          unavailable: 'The server is not accepting authored encounters.',
        }}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'No read-back is available: The server is not accepting authored encounters.'
    );
  });

  it('nothing renders for a subject with no group', () => {
    const { container } = render(
      <ReadBack
        document={castle}
        selection={{ kind: 'prop', id: 'purse' }}
        state={current()}
      />
    );
    expect(container.textContent).toBe('');
  });

  it('a not-yet-said path on the selection is shown', () => {
    const readBack = castleEngineReadBack();
    readBack.notYetSaid = [
      {
        $typeName: 'dnd5e.api.authoring.v1alpha1.ReadBackUnsaid',
        path: 'room.room.monsterBindings.captain.somethingNew',
        kind: 'binding field',
        why: 'the read-back has no sentence for it yet',
      },
      {
        $typeName: 'dnd5e.api.authoring.v1alpha1.ReadBackUnsaid',
        path: 'room.room.monsterBindings.gate-1.somethingNew',
        kind: 'binding field',
        why: 'not the captain’s',
      },
    ];
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'captain' }}
        state={{ ...current(), readBack }}
      />
    );
    const text = panel().textContent ?? '';
    expect(text).toContain('room.room.monsterBindings.captain.somethingNew');
    expect(text).toContain('the read-back has no sentence for it yet');
    expect(text).not.toContain('not the captain’s');
  });
});
