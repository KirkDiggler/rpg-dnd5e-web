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

  it('a hub taught and never asked is marked, and so is one granted and never asked', () => {
    show(null);
    expect(row('Facts', 'king-is-cultist').textContent).toContain(
      'taught, never asked'
    );
    expect(row('Topics', 'jailed').textContent).toContain(
      'granted, never asked'
    );
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
      'captains-orders: captains-orders hold 1',
      'cooks-ledger: cooks-ledger hold 1',
      'key-bearer: key-bearer hold 4',
      'king-whereabouts: king-whereabouts hold 4',
      'kitchen-way: kitchen-way tell 1 · lift 2',
    ]);
    expect(rows('Secrets')).toEqual([
      'kitchen-passage: kitchen-passage reveal 1 · find 1 · bar 2 · need 2',
    ]);
  });

  it('a record nothing holds or tells, and a secret no record reveals, are marked', () => {
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
    expect(row('Secrets', 'kitchen-passage').textContent).toContain(
      'no record reveals it'
    );
    expect(row('Records', 'cooks-ledger').textContent).not.toContain('nothing');
  });

  it('a record’s thread is its Read back, and links to its editing home', () => {
    const onConfigure = vi.fn();
    render(
      <StudioThreads
        document={castle}
        readBack={state()}
        focus={{ kind: 'record', id: 'kitchen-way' }}
        onSelect={vi.fn()}
        onConfigure={onConfigure}
      />
    );
    const thread = within(threads()).getByRole('region', { name: 'Read back' });
    expect(thread.textContent).toContain(
      'Told by: saying `favour` (scullion).'
    );
    fireEvent.click(
      within(threads()).getByRole('button', { name: 'Edit in Intel' })
    );
    expect(onConfigure).toHaveBeenCalledWith('intel');
  });
});
