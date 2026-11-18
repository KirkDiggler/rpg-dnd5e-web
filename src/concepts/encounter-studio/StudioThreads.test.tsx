/**
 * THREADS FROM A HUB (rpg-project#973, R32): every fact and topic the engine
 * says, each opening to its thread in the engine's words.
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
import { castleThreadsReadBack } from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import type { StudioReadBack } from './studioPublishing';
import { StudioThreads } from './StudioThreads';
import type { ThreadHub } from './threadHubs';

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // no storage
  }
});

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

const state = (readBackIsCurrent = true): StudioReadBack => ({
  readBack: castleThreadsReadBack(),
  readBackIsCurrent,
  unavailable: null,
});

function show(focus: ThreadHub | null, readBack = state()) {
  const onSelect = vi.fn();
  const onOpenFact = vi.fn();
  render(
    <StudioThreads
      document={castle}
      readBack={readBack}
      focus={focus}
      onSelect={onSelect}
      onJump={vi.fn()}
      onOpenFact={onOpenFact}
    />
  );
  return { onSelect, onOpenFact };
}

const threads = () => screen.getByRole('region', { name: 'Threads' });
const row = (list: string, id: string) =>
  within(within(threads()).getByRole('list', { name: list })).getByRole(
    'button',
    { name: new RegExp(`^${id}\\b`) }
  );

describe('StudioThreads', () => {
  it('lists the facts and topics the engine says', () => {
    show(null);
    const ids = (list: string) =>
      within(within(threads()).getByRole('list', { name: list }))
        .getAllByRole('button')
        .map((button) => button.dataset.hub);
    expect(ids('Facts')).toEqual([
      'feast-tonight',
      'guards-turned',
      'king-is-cultist',
      'party-recognized',
      'throne-taken',
    ]);
    expect(ids('Topics')).toEqual(['admitted', 'jailed']);
  });

  it('party-recognized: taught by three, asked by the garrison’s stance', () => {
    const { onSelect } = show({ kind: 'fact', id: 'party-recognized' });
    expect(row('Facts', 'party-recognized').textContent).toContain(
      'taught by 3, asked by 1'
    );
    const thread = within(threads()).getByRole('region', { name: 'Read back' });
    expect(thread.textContent).toContain(
      'Taught by: holding the record `captains-orders`; a win of `stand-aside` (captain); a miss of `stand-aside` (captain).'
    );
    expect(thread.textContent).toContain(
      'Asked by: how `garrison` and `party` stand.'
    );
    fireEvent.click(row('Facts', 'guards-turned'));
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'fact',
      id: 'guards-turned',
    });
  });

  it('a hub taught and never asked is marked, and so is one given and never asked', () => {
    show(null);
    expect(row('Facts', 'king-is-cultist').textContent).toContain(
      'taught, never asked'
    );
    expect(row('Topics', 'jailed').textContent).toContain('given, never asked');
    expect(row('Facts', 'party-recognized').textContent).not.toContain('never');
  });

  it('an entry of a kind the studio does not know is listed plainly', () => {
    const readBack = castleThreadsReadBack();
    const group = readBack.sections
      .flatMap((section) => section.groups)
      .find((g) => g.about?.id === 'party-recognized')!;
    group.statements.push({
      ...group.statements[1]!,
      kind: 'fact.mystery',
      sentence: 'A new kind of entry, as the engine says it.',
    });
    show({ kind: 'fact', id: 'party-recognized' }, { ...state(), readBack });
    const thread = within(threads()).getByRole('region', { name: 'Read back' });
    fireEvent.click(within(thread).getByRole('button', { name: 'Full' }));
    expect(thread.textContent).toContain(
      'A new kind of entry, as the engine says it.'
    );
  });

  it('a stale read-back shows the notice', () => {
    show({ kind: 'fact', id: 'party-recognized' }, state(false));
    expect(
      within(threads())
        .getAllByRole('status')
        .map((status) => status.textContent)
    ).toContain('These sentences are from the last draft that compiled.');
  });

  it('with no read-back it says the engine has not said the threads', () => {
    show(null, {
      readBack: null,
      readBackIsCurrent: false,
      unavailable: 'The server is not accepting authored encounters.',
    });
    expect(within(threads()).getByRole('status').textContent).toBe(
      'The engine has not said the threads yet. The server is not accepting authored encounters.'
    );
  });

  it('lists the records and secrets the engine says, each with its counts', () => {
    show(null);
    const rows = (list: string) =>
      within(within(threads()).getByRole('list', { name: list }))
        .getAllByRole('button')
        .map((button) => `${button.dataset.hub}: ${button.textContent}`);
    expect(rows('Records')).toEqual([
      'captains-orders: captains-orders · held by 1',
      'cooks-ledger: cooks-ledger · held by 1',
      'key-bearer: key-bearer · held by 4',
      'king-whereabouts: king-whereabouts · held by 4',
      'kitchen-way: kitchen-way · told by 1, lifts 2',
    ]);
    expect(rows('Secrets')).toEqual([
      'kitchen-passage: kitchen-passage · revealed by 1, found by 1, bars 2, needed by 2',
    ]);
  });

  it('a record nothing holds or tells is marked; a secret no record reveals is noted', () => {
    const readBack = castleThreadsReadBack();
    const groups = readBack.sections.flatMap((section) => section.groups);
    const way = groups.find((g) => g.about?.id === 'kitchen-way')!;
    way.statements = way.statements.filter((st) => st.kind !== 'record.tell');
    const secret = groups.find((g) => g.about?.id === 'kitchen-passage')!;
    secret.statements = secret.statements.filter(
      (st) => st.kind !== 'secret.reveal'
    );
    show(null, { ...state(), readBack });
    expect(row('Records', 'kitchen-way').textContent).toContain(
      'nothing holds or tells it'
    );
    // A secret found only by search is normal: a neutral note, not a mark.
    const secretRow = row('Secrets', 'kitchen-passage');
    expect(secretRow.querySelector('[data-note]')?.textContent?.trim()).toBe(
      'no record reveals it'
    );
    expect(secretRow.querySelector('.es-fact-mark')).toBeNull();
    expect(
      row('Records', 'kitchen-way').querySelector('.es-fact-mark')
    ).not.toBeNull();
    expect(row('Records', 'cooks-ledger').textContent).not.toContain('nothing');
  });

  it('a record’s thread is its own group only, in the default Folded view', () => {
    show({ kind: 'record', id: 'kitchen-way' });
    const thread = within(threads()).getByRole('region', { name: 'Read back' });
    expect(
      within(thread)
        .getByRole('button', { name: 'Folded' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(thread.textContent).toContain(
      'Told by: saying `favour` (scullion).'
    );
    // The site's own sentence about the record is not repeated as a
    // statement behind no entry.
    expect(
      within(thread).queryByRole('list', { name: 'Said in full only' })
    ).toBeNull();
    fireEvent.click(within(thread).getByRole('button', { name: 'Full' }));
    const groups = thread.querySelectorAll('details');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.open).toBe(true);
    expect(groups[0]!.querySelector('summary')?.textContent).toBe(
      'Record `kitchen-way`'
    );
  });

  it('a hub’s thread has no link back to the hub itself', () => {
    show({ kind: 'concealment', id: 'kitchen-passage' });
    const thread = within(threads()).getByRole('region', { name: 'Read back' });
    fireEvent.click(within(thread).getByRole('button', { name: 'Full' }));
    expect(
      within(thread).queryAllByRole('button', {
        name: 'Open concealment kitchen-passage',
      })
    ).toEqual([]);
    expect(
      within(thread).getAllByRole('button', { name: 'Open prop grate' }).length
    ).toBeGreaterThan(0);
  });

  it('Edit in Concealments lands on the secret’s own form through the path map', () => {
    const onJump = vi.fn();
    render(
      <StudioThreads
        document={castle}
        readBack={state()}
        focus={{ kind: 'concealment', id: 'kitchen-passage' }}
        onSelect={vi.fn()}
        onJump={onJump}
      />
    );
    fireEvent.click(
      within(threads()).getByRole('button', { name: 'Edit in Concealments' })
    );
    expect(onJump).toHaveBeenCalledWith(
      { kind: 'home', section: 'concealments', id: 'kitchen-passage' },
      'concealments.kitchen-passage'
    );
  });

  it('a way pointer the studio cannot open is text, not a button', () => {
    render(
      <StudioThreads
        document={castle}
        readBack={state()}
        focus={{ kind: 'concealment', id: 'kitchen-passage' }}
        onSelect={vi.fn()}
        wayOpener={() => null}
      />
    );
    const thread = within(threads()).getByRole('region', { name: 'Read back' });
    fireEvent.click(within(thread).getByRole('button', { name: 'Full' }));
    expect(
      within(thread).queryAllByRole('button', { name: /^Open way / })
    ).toEqual([]);
    expect(thread.textContent).toContain(
      'way way:passage:region-kitchen:region-chapel:prop-grate:line:prop-grate:to-chapel'
    );
  });
});
