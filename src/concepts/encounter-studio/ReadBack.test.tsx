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
import { foldedOfSelection, readBackOfSelection } from './engineReadBack';
import { castleEngineReadBack } from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { ReadBack } from './ReadBack';
import type { StudioReadBack } from './studioPublishing';

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // no storage: nothing to clear
  }
});

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

/** The read-back with no `folded`, as an older api sends it: the panel is
 * the Full view, so the tests of the Full view read it unchanged. */
const fullOnly = () => {
  const readBack = castleEngineReadBack();
  readBack.folded = [];
  return readBack;
};

const current = (): StudioReadBack => ({
  readBack: fullOnly(),
  readBackIsCurrent: true,
  unavailable: null,
});

/** The read-back as the api sends it now, folded and full. */
const folded = (readBackIsCurrent = true): StudioReadBack => ({
  readBack: castleEngineReadBack(),
  readBackIsCurrent,
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

  it('a thing the read-back does not name yet shows the panel with that notice', () => {
    // `purse` is not in the recorded read-back: a prop placed since the last
    // check that compiled.
    const { rerender } = render(
      <ReadBack
        document={castle}
        selection={{ kind: 'prop', id: 'purse' }}
        state={{ ...current(), readBackIsCurrent: false }}
      />
    );
    expect(
      within(panel())
        .getAllByRole('status')
        .map((status) => status.textContent)
    ).toEqual([
      'These sentences are from the last draft that compiled.',
      'The engine has not said this thing yet; it appears after the next check that compiles.',
    ]);
    expect(within(panel()).queryByRole('group')).toBeNull();
    rerender(
      <ReadBack
        document={castle}
        selection={{ kind: 'prop', id: 'purse' }}
        state={current()}
      />
    );
    expect(within(panel()).getByRole('status').textContent).toBe(
      'The engine’s read-back says nothing about this thing.'
    );
  });

  it('while stale, an index path is text, never a jump that a reorder would move', () => {
    // The captain's first statement is set at `room.room.monsterDeclarations[2]`.
    // Swap the captain and the creature before him: that index now names
    // another creature, so the stale sentence must not jump there.
    const declarations = [...castle.draft.room.monsterDeclarations];
    const at = declarations.findIndex((monster) => monster.id === 'captain');
    expect(at).toBe(2);
    [declarations[at - 1], declarations[at]] = [
      declarations[at]!,
      declarations[at - 1]!,
    ];
    const reordered = {
      ...castle,
      draft: {
        ...castle.draft,
        room: { ...castle.draft.room, monsterDeclarations: declarations },
      },
    };
    const onJump = vi.fn();
    const shown = (readBackIsCurrent: boolean) =>
      render(
        <ReadBack
          document={reordered}
          selection={{ kind: 'creature', id: 'captain' }}
          state={{ ...current(), readBackIsCurrent }}
          onJump={onJump}
        />
      );
    const stale = shown(false);
    expect(
      within(panel()).queryByRole('button', {
        name: 'Open room.room.monsterDeclarations[2]',
      })
    ).toBeNull();
    expect(panel().textContent).toContain('room.room.monsterDeclarations[2]');
    // A connection resolves by its id and still jumps.
    expect(
      within(panel()).getAllByRole('button', {
        name: 'Open door gate-wall-door',
      }).length
    ).toBeGreaterThan(0);
    stale.unmount();
    // Current, the same path is a jump (here to whoever stands at [2]).
    shown(true);
    expect(
      within(panel()).getByRole('button', {
        name: 'Open room.room.monsterDeclarations[2]',
      })
    ).toBeTruthy();
  });

  it('a not-yet-said path on the selection is shown', () => {
    const readBack = fullOnly();
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

describe('ReadBack: the engine’s folded read-back (rpg-project#978)', () => {
  const captain = { kind: 'creature', id: 'captain' } as const;
  const disclosure = (text: RegExp) =>
    within(panel()).getByRole('button', { name: text });

  it('folded is the default and says the captain’s troupe line once', () => {
    render(<ReadBack document={castle} selection={captain} state={folded()} />);
    expect(
      within(panel())
        .getByRole('button', { name: 'Folded' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    const entries = within(panel())
      .getAllByRole('listitem')
      .filter((item) => item.dataset.folded !== undefined)
      .map((item) => item.querySelector(':scope > p')?.textContent ?? '');
    // The engine folds the captain's troupe line into the lines he shares
    // with gate-1: named once, in its words.
    expect(entries.filter((text) => text.includes('`troupe`'))).toEqual([
      'Guard Captain (captain) has the same 3 lines as Guard (gate-1): `troupe`, `come-quietly` and `never-alive`.',
    ]);
    // Closed, no full sentence of that line is shown.
    expect(panel().textContent).not.toContain(
      'The line “We’re the troupe for tonight’s feast.” (`troupe`) is offered to a speaker only while the speaker knows the fact `feast-tonight`.'
    );
  });

  it('gate-1’s troupe line is said once with its requirements as an entry under it', () => {
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'creature', id: 'gate-1' }}
        state={folded()}
      />
    );
    const troupe = within(panel())
      .getAllByRole('listitem')
      .filter(
        (item) =>
          item.dataset.folded !== undefined &&
          item.querySelector(':scope > p')?.textContent?.includes('(`troupe`)')
      );
    expect(troupe).toHaveLength(1);
    const under = [...troupe[0]!.querySelectorAll(':scope > ul > li > p')].map(
      (p) => p.textContent
    );
    expect(under[0]).toBe(
      'Offered while: the speaker knows the fact `feast-tonight` and `front-gate` is in `fresh` or `warned-guest`.'
    );
  });

  it('opening the entry shows its full sentences, and fact feast-tonight still jumps', () => {
    const onOpenFact = vi.fn();
    render(
      <ReadBack
        document={castle}
        selection={captain}
        state={folded()}
        onOpenFact={onOpenFact}
        onJump={vi.fn()}
      />
    );
    const open = disclosure(/^Full sentences: .*has the same 3 lines/);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    const text = panel().textContent ?? '';
    expect(text).toContain(
      'The line “We’re the troupe for tonight’s feast.” (`troupe`) is offered to a speaker only while the speaker knows the fact `feast-tonight`.'
    );
    expect(text).toContain(
      'The line “We’re the troupe for tonight’s feast.” (`troupe`) is offered to a speaker only while the conversation `front-gate` is in one of the states `fresh` or `warned-guest`'
    );
    fireEvent.click(
      within(panel()).getAllByRole('button', {
        name: 'Open fact feast-tonight',
      })[0]!
    );
    expect(onOpenFact).toHaveBeenCalledWith('feast-tonight');
  });

  it('every statement the selection shows in full is reachable from the folded view', () => {
    const readBack = castleEngineReadBack();
    for (const selection of [
      captain,
      { kind: 'creature', id: 'gate-1' } as const,
      { kind: 'prop', id: 'grate' } as const,
    ]) {
      const full = readBackOfSelection(
        readBack,
        selection,
        castle
      ).groups.flatMap((group) => group.statements);
      const view = foldedOfSelection(readBack, selection);
      expect(view.unreached).toEqual([]);
      const reached = new Set(
        view.sections.flatMap((section) =>
          section.items.flatMap(function all(item): unknown[] {
            return [...item.statements, ...item.items.flatMap(all)];
          })
        )
      );
      for (const statement of full) expect(reached).toContain(statement);
    }
    // The captain: 75 statements in full, said in 44 folded entries.
    const view = foldedOfSelection(readBack, captain);
    const count = (items: (typeof view.sections)[number]['items']): number =>
      items.reduce((n, item) => n + 1 + count(item.items), 0);
    expect(
      count(view.sections.flatMap((section) => section.items))
    ).toBeLessThan(
      readBackOfSelection(readBack, captain, castle).groups.flatMap(
        (group) => group.statements
      ).length
    );
  });

  it('a statement behind no shown entry is listed under the folded view, never dropped', () => {
    const readBack = castleEngineReadBack();
    const creatures = readBack.folded.find(
      (section) => section.title === 'Creatures'
    )!;
    const captainEntry = creatures.items.find((item) =>
      item.text.startsWith('Guard Captain (captain)')
    )!;
    // The engine's entry for the `greet` line, removed: its two statements
    // are no longer behind any entry.
    captainEntry.items = captainEntry.items.filter(
      (item) => !item.text.includes('(`greet`)')
    );
    render(
      <ReadBack
        document={castle}
        selection={captain}
        state={{ ...folded(), readBack }}
      />
    );
    const unreached = within(panel()).getByRole('list', {
      name: 'Said in full only',
    });
    expect(unreached.textContent).toContain('“Good evening, captain.”');
  });

  it('the grate’s two ways are said once each', () => {
    render(
      <ReadBack
        document={castle}
        selection={{ kind: 'prop', id: 'grate' }}
        state={folded()}
      />
    );
    const entries = within(panel())
      .getAllByRole('listitem')
      .filter((item) => item.dataset.folded !== undefined)
      .map((item) => item.querySelector(':scope > p')?.textContent ?? '');
    expect(
      entries.filter((text) => text.includes('(`to-chapel`)'))
    ).toHaveLength(1);
    expect(
      entries.filter((text) => text.includes('(`to-cells`)'))
    ).toHaveLength(1);
  });

  it('the Full switch shows today’s view, and the choice is remembered', () => {
    const { unmount } = render(
      <ReadBack document={castle} selection={captain} state={folded()} />
    );
    fireEvent.click(within(panel()).getByRole('button', { name: 'Full' }));
    expect(
      within(panel()).getByText('Guard Captain (captain)', {
        selector: 'summary',
      })
    ).toBeTruthy();
    expect(panel().textContent).toContain(
      sentenceOf('creature', 'captain', 'creature.routine')
    );
    unmount();
    render(<ReadBack document={castle} selection={captain} state={folded()} />);
    expect(
      within(panel())
        .getByRole('button', { name: 'Full' })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('with no folded read-back on the wire it falls back to Full', () => {
    render(
      <ReadBack document={castle} selection={captain} state={current()} />
    );
    expect(
      within(panel()).queryByRole('button', { name: 'Folded' })
    ).toBeNull();
    expect(
      within(panel()).getByText('Guard Captain (captain)', {
        selector: 'summary',
      })
    ).toBeTruthy();
  });
});
