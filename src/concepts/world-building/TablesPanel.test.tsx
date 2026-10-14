/**
 * `TablesPanel` against a site that declares root tables (rpg-toolkit#1897,
 * rpg-dnd5e-web#1201).
 *
 * These are RENDER tests, not grammar tests: what the table grammar accepts is
 * `answerTableShape.test.ts` and `sitePolicyEdits.test.ts` owns the edit
 * mechanics. What is asserted here is the panel's own two jobs — that a
 * declared table appears with the entries the DOCUMENT holds, and that the
 * reference controls offer the site's own tables and nothing invented.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import { FactionsPanel, TableNameSelect } from './SitePolicies';
import type { SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';
import { tableUsers } from './tableUsers';

/** A site with two tables: one carrying an entry, one declared and still
 * empty — the second is legal and is half of what these tests pin. */
const site: SiteScope = {
  tables: {
    'goblin-drill': {
      time: [
        { when: { enemy: 'reach' }, attack: 'enemy' },
        { when: { enemy: 'none' }, hold: {} },
      ],
    },
    'watch-drill': {},
  },
  factions: [{ id: 'goblins', table: 'goblin-drill' }],
};

describe('TablesPanel — the site’s shared tables, declared at the root', () => {
  it('adds another row on an authored trigger and keeps the new-trigger chooser truthful', () => {
    const onChange = vi.fn();
    const mounted = render(
      <TablesPanel scope={{ tables: { drill: {} } }} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Table drill'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Add entry on time to drill' })
    );
    const next = onChange.mock.calls.at(-1)![0] as SiteScope;
    mounted.rerender(<TablesPanel scope={next} onChange={onChange} />);
    // `time` is the only trigger (the social keys retired to options,
    // rpg-project#569 R2), so once it is authored there is no new trigger to
    // choose and the chooser is not offered.
    expect(screen.queryByLabelText('Add trigger to drill')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add entry on time to drill' })
    );
    expect(
      (onChange.mock.calls.at(-1)![0] as SiteScope).tables?.drill.time
    ).toHaveLength(2);
  });

  it('explicit table names never commit on blur and cancel without a document edit', () => {
    const onChange = vi.fn();
    render(
      <TablesPanel
        scope={{ tables: { drill: {} } }}
        onChange={onChange}
        explicitRename
      />
    );
    fireEvent.click(screen.getByLabelText('Table drill'));
    const name = screen.getByLabelText(
      'Table id for drill'
    ) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'patrol' } });
    fireEvent.blur(name);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel table name' }));
    expect(name.value).toBe('drill');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'patrol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply table name' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      tables: { patrol: {} },
    });
  });
  it('states the empty site rather than showing an empty list', () => {
    render(<TablesPanel scope={{}} onChange={() => {}} />);
    expect(screen.getByTestId('site-tables-none')).toBeTruthy();
  });

  it('declares a table with a fresh id, without touching the ones that exist', () => {
    const onChange = vi.fn();
    render(<TablesPanel scope={site} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add table' }));
    const next = onChange.mock.calls[0][0] as SiteScope;
    expect(Object.keys(next.tables ?? {}).sort()).toEqual([
      'goblin-drill',
      'table-3',
      'watch-drill',
    ]);
    // A NEW TABLE IS BORN EMPTY, and that is a legal authored state — a table
    // waiting for its second creature is the point of declaring one here.
    expect(next.tables?.['table-3']).toEqual({});
  });

  it('shows each table with its entry count, and an empty one as empty', () => {
    render(<TablesPanel scope={site} onChange={() => {}} />);
    expect(screen.getByLabelText('Table goblin-drill').textContent).toContain(
      '2 entries'
    );
    expect(screen.getByLabelText('Table watch-drill').textContent).toContain(
      'empty'
    );
  });

  it('reads the document’s entries as controls holding the document’s values', () => {
    render(<TablesPanel scope={site} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));
    // The two authored entries are rendered by the ONE shared entry editor, so
    // the condition controls the #1192 slice built are what appears here.
    const whens = screen.getAllByLabelText('When for time entry');
    expect(whens).toHaveLength(2);
    expect((whens[0] as HTMLSelectElement).value).toBe('enemy:reach');
    expect((whens[1] as HTMLSelectElement).value).toBe('enemy:none');
  });

  it('adds an entry on a declared-but-empty table through the parent scope', () => {
    const onChange = vi.fn();
    render(<TablesPanel scope={site} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Table watch-drill'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Add entry on time to watch-drill' })
    );
    const added = onChange.mock.calls.at(-1)![0] as SiteScope;
    expect(added.tables?.['watch-drill']?.time).toHaveLength(1);
    // The added entry is the one default the vocabulary declares for `time`,
    // and the other table is untouched.
    expect(added.tables?.['goblin-drill']).toEqual(
      site.tables?.['goblin-drill']
    );
  });

  it('patches an entry by index, handing the parent the whole next table', () => {
    // THE PANEL RENDERS FROM ITS `scope` PROP, so this mounts a table that
    // already carries the entry — the same caveat the #1192 tests state.
    const onChange = vi.fn();
    render(
      <TablesPanel
        scope={{
          tables: { 'watch-drill': { time: [{ hold: {} }] } },
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Table watch-drill'));
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'deed:attacked' },
    });
    const patched = onChange.mock.calls.at(-1)![0] as SiteScope;
    expect(patched.tables?.['watch-drill']?.time?.[0]?.when).toEqual({
      attacked: { within: 1 },
    });
  });

  it('removes an entry, dropping an emptied trigger but keeping the table', () => {
    const onChange = vi.fn();
    render(
      <TablesPanel
        scope={{
          ...site,
          tables: { 'watch-drill': { time: [{ hold: {} }] } },
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Table watch-drill'));
    fireEvent.click(screen.getByRole('button', { name: /^Remove .* entry$/ }));
    const next = onChange.mock.calls.at(-1)![0] as SiteScope;
    // The emptied TRIGGER goes; the declared TABLE stays — clearing the last
    // entry is not the same act as removing the declaration.
    expect(next.tables?.['watch-drill']).toEqual({});
  });

  it('renames the declaration and NOT the references to it', () => {
    const onChange = vi.fn();
    render(<TablesPanel scope={site} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));

    const idInput = screen.getByLabelText('Table id for goblin-drill');
    fireEvent.change(idInput, { target: { value: 'goblin-orders' } });
    fireEvent.blur(idInput);

    const next = onChange.mock.calls.at(-1)![0] as SiteScope;
    expect(Object.keys(next.tables ?? {})).toContain('goblin-orders');
    // The faction still names the OLD id: resolving it is the server's job, and
    // its refusal is the sentence worth surfacing — the same law
    // `renameSiteFaction` states one noun over.
    expect(next.factions?.[0]?.table).toBe('goblin-drill');
  });

  it('refuses a rename onto a name another table already has, and says so', () => {
    const onChange = vi.fn();
    render(<TablesPanel scope={site} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));

    const idInput = screen.getByLabelText('Table id for goblin-drill');
    fireEvent.change(idInput, { target: { value: 'watch-drill' } });
    // Reported beside the control that would write it, rather than publishing a
    // declaration that silently replaced another.
    expect(screen.getByTestId('table-id-taken')).toBeTruthy();
    fireEvent.blur(idInput);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the declaration only', () => {
    const onChange = vi.fn();
    render(<TablesPanel scope={site} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove table goblin-drill' })
    );

    const next = onChange.mock.calls.at(-1)![0] as SiteScope;
    expect(Object.keys(next.tables ?? {})).toEqual(['watch-drill']);
    expect(next.factions?.[0]?.table).toBe('goblin-drill');
  });
});

describe('TableNameSelect — the reference, chosen from what the site declares', () => {
  it('offers exactly the declared tables, and an unset choice', () => {
    render(
      <TableNameSelect
        scope={site}
        value={undefined}
        label="Table for goblin-1"
        placeholder="none"
        onChange={() => {}}
      />
    );
    const select = screen.getByLabelText('Table for goblin-1');
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.value)
    ).toEqual(['', 'goblin-drill', 'watch-drill']);
  });

  it('carries a name this site does not declare instead of dropping it', () => {
    // A hand-written file may name a table that is not here. The builder must
    // not rewrite bytes the server accepts and the engine is the one that
    // refuses the name — so the value keeps its own option and stays selected.
    render(
      <TableNameSelect
        scope={site}
        value="ghost-drill"
        label="Table for goblin-1"
        placeholder="none"
        onChange={() => {}}
      />
    );
    const select = screen.getByLabelText(
      'Table for goblin-1'
    ) as HTMLSelectElement;
    expect(select.value).toBe('ghost-drill');
    expect(select.textContent).toContain('not declared here');
  });

  it('hands the parent the name, and `undefined` for the unset choice', () => {
    const onChange = vi.fn();
    render(
      <TableNameSelect
        scope={site}
        value={undefined}
        label="Table for goblin-1"
        placeholder="none"
        onChange={onChange}
      />
    );
    const select = screen.getByLabelText('Table for goblin-1');
    fireEvent.change(select, { target: { value: 'watch-drill' } });
    expect(onChange).toHaveBeenLastCalledWith('watch-drill');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('the faction’s table reference', () => {
  it('offers the site’s tables and writes the chosen one', () => {
    const onChange = vi.fn();
    render(
      <FactionsPanel
        scope={{ tables: site.tables, factions: [{ id: 'goblins' }] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Faction goblins'));
    const select = screen.getByLabelText('Table for goblins');
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.value)
    ).toEqual(['', 'goblin-drill', 'watch-drill']);

    fireEvent.change(select, { target: { value: 'watch-drill' } });
    expect(
      (onChange.mock.calls.at(-1)![0] as SiteScope).factions?.[0]?.table
    ).toBe('watch-drill');
  });

  it('clears the name to absence, never to an empty string', () => {
    const onChange = vi.fn();
    render(
      <FactionsPanel
        scope={{
          tables: site.tables,
          factions: [{ id: 'goblins', table: 'goblin-drill' }],
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Faction goblins'));
    fireEvent.change(screen.getByLabelText('Table for goblins'), {
      target: { value: '' },
    });
    const faction = (onChange.mock.calls.at(-1)![0] as SiteScope).factions?.[0];
    expect(faction?.table).toBeUndefined();
    expect('table' in (faction ?? {})).toBe(false);
  });
});

/**
 * THE HEARING ROWS IN THE ROOT TABLE EDITOR (rpg-project#569 R6–R8, R10): a
 * `when` is a list with a `not` per condition, `heard` and `fact` join the
 * conditions, `fact` is a word on `time`, `toward` walks to a sound, `away`
 * flees one, `attack` never offers `sound`, and neither a route nor `patrol`
 * is ever offered — the v4 single room names no route (rpg-toolkit#2044).
 */
describe('TablesPanel — hearing, facts and patrols (rpg-project#569)', () => {
  type Entry = NonNullable<
    NonNullable<SiteScope['tables']>[string]['time']
  >[number];

  /** Mount one table holding `entry`, open it, and answer the entry the last
   * edit committed. */
  function mount(entry: Entry) {
    const onChange = vi.fn();
    render(
      <TablesPanel
        scope={{ tables: { patrol: { time: [entry] } } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Table patrol'));
    return () =>
      (onChange.mock.calls.at(-1)![0] as SiteScope).tables?.patrol?.time?.[0];
  }

  const options = (label: string) =>
    Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(
      (option) => option.value
    );

  it('adds a second condition as a list, every entry of which must hold', () => {
    const last = mount({ when: { enemy: 'none' }, hold: {} });
    fireEvent.click(screen.getByLabelText('Add condition for time entry'));
    expect(last()?.when).toEqual([{ enemy: 'none' }, { enemy: 'reach' }]);
  });

  it('a `not` wraps one condition and writes the list form', () => {
    const last = mount({ when: { enemy: 'seen' }, hold: {} });
    fireEvent.click(screen.getByLabelText('Not for time entry'));
    expect(last()?.when).toEqual([{ not: { enemy: 'seen' } }]);
  });

  it('a list back down to one plain condition is written as the single mapping', () => {
    const last = mount({
      when: [{ fact: 'guards-turned' }, { not: { enemy: 'seen' } }],
      hold: {},
    });
    // Both rows are shown, the second with its `not` ticked.
    expect(
      (screen.getByLabelText('Not 2 for time entry') as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(
      (screen.getByLabelText('Fact for time entry') as HTMLInputElement).value
    ).toBe('guards-turned');
    fireEvent.click(screen.getByLabelText('Remove condition 2 for time entry'));
    expect(last()?.when).toEqual({ fact: 'guards-turned' });
  });

  it('authors `heard` from the four sealed kinds, with a span', () => {
    const last = mount({ when: { enemy: 'none' }, hold: {} });
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'heard' },
    });
    expect(last()?.when).toEqual({ heard: { kind: 'boom', within: 1 } });
  });

  it('offers exactly the four sealed kinds, in the engine’s order, and keeps the span when the kind changes', () => {
    const last = mount({
      when: { heard: { kind: 'clang', within: 2 } },
      toward: 'sound',
    });
    expect(options('Sound for time entry')).toEqual([
      'boom',
      'crash',
      'clang',
      'voice',
    ]);
    fireEvent.change(screen.getByLabelText('Sound for time entry'), {
      target: { value: 'voice' },
    });
    expect(last()?.when).toEqual({ heard: { kind: 'voice', within: 2 } });
  });

  it('authors a `fact` condition as a free id', () => {
    const last = mount({ when: { enemy: 'none' }, hold: {} });
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'fact' },
    });
    expect(last()?.when).toEqual({ fact: '' });
  });

  it('offers `fact` as a word on `time` — the alarm', () => {
    const last = mount({ when: { enemy: 'seen' }, hold: {} });
    expect(options('Do for time entry')).toContain('fact');
    fireEvent.change(screen.getByLabelText('Do for time entry'), {
      target: { value: 'fact' },
    });
    expect(last()).toEqual({ when: { enemy: 'seen' }, fact: '' });
  });

  it('`toward` offers exactly enemy and attacker on a row that listens for nothing — never a cell or a route', () => {
    mount({ when: { enemy: 'none' }, toward: 'enemy' });
    // `actor` waits for a deed and `sound` for a top-level `heard`; `at` and
    // `path` are refused by the single room (rpg-toolkit#2044).
    expect(options('To for time entry')).toEqual(['enemy', 'attacker']);
  });

  it('`toward` offers the sound once the row listens', () => {
    const last = mount({
      when: { heard: { kind: 'clang', within: 2 } },
      toward: 'enemy',
    });
    expect(options('To for time entry')).toEqual([
      'enemy',
      'attacker',
      'sound',
    ]);
    fireEvent.change(screen.getByLabelText('To for time entry'), {
      target: { value: 'sound' },
    });
    expect(last()?.toward).toBe('sound');
  });

  it('a `heard` inside a `not` is not listening: no sound offered', () => {
    mount({
      when: [{ not: { heard: { kind: 'clang', within: 2 } } }],
      toward: 'enemy',
    });
    expect(options('To for time entry')).not.toContain('sound');
  });

  it('negating or replacing the row’s `heard` takes a `sound` selector with it', () => {
    const last = mount({
      when: { heard: { kind: 'clang', within: 2 } },
      toward: 'sound',
    });
    fireEvent.click(screen.getByLabelText('Not for time entry'));
    expect(last()).toEqual({
      when: [{ not: { heard: { kind: 'clang', within: 2 } } }],
      toward: 'enemy',
    });
  });

  it('clearing the `heard` condition takes a `sound` selector with it', () => {
    const last = mount({
      when: { heard: { kind: 'boom', within: 3 } },
      away: 'sound',
    });
    fireEvent.change(screen.getByLabelText('When for time entry'), {
      target: { value: 'any' },
    });
    expect(last()).toEqual({ away: 'enemy' });
  });

  it('`away` offers the sound but no route; `attack` offers neither; `patrol` is never a word', () => {
    mount({ when: { heard: { kind: 'boom', within: 3 } }, away: 'sound' });
    expect(options('From for time entry')).toContain('sound');
    expect(options('From for time entry')).not.toContain('path');
    expect(options('Do for time entry')).not.toContain('patrol');
  });

  it('`attack` never offers the sound — a sound cannot be struck', () => {
    mount({ when: { enemy: 'reach' }, attack: 'enemy' });
    expect(options('To for time entry')).not.toContain('sound');
    expect(options('To for time entry')).not.toContain('path');
  });
});

describe('TablesPanel — rows that summarise until opened (rpg-project#579)', () => {
  const room = decodeWorldBuilderV4Site().draft.room;
  const names = new Map([
    ['goblin-1', 'Goblin'],
    ['skeleton-a', 'Guard'],
    ['skeleton-b', 'Guard (2)'],
  ]);
  const used: SiteScope = {
    ...site,
    factions: [{ id: 'goblins', table: 'goblin-drill' }],
  };
  const usedRoom = {
    ...room,
    monsterBindings: {
      'skeleton-a': { table: 'goblin-drill' },
      'skeleton-b': { table: 'goblin-drill' },
    },
  };

  it('the table summary counts entries, not triggers', () => {
    render(<TablesPanel scope={site} onChange={() => {}} />);
    const summary = screen.getByLabelText('Table goblin-drill').textContent;
    expect(summary).toContain('2 entries');
    expect(summary).not.toContain('trigger');
  });

  it('the summary names the factions and placements that use the table', () => {
    render(
      <TablesPanel
        scope={used}
        room={usedRoom}
        placementNames={names}
        onChange={() => {}}
      />
    );
    expect(
      screen.getByLabelText('Table goblin-drill').textContent?.trim()
    ).toBe('goblin-drill · 2 entries · used by goblins, Guard, Guard (2)');
    expect(tableUsers(used, usedRoom, 'goblin-drill')).toEqual({
      factions: ['goblins'],
      placements: ['skeleton-a', 'skeleton-b'],
    });
  });

  it('an unused table says not used', () => {
    render(
      <TablesPanel
        scope={used}
        room={usedRoom}
        placementNames={names}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText('Table watch-drill').textContent).toContain(
      'not used'
    );
  });

  it('a collapsed entry shows one sentence and opens on Edit', () => {
    render(<TablesPanel scope={site} collapsedEntries onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));
    expect(screen.queryAllByLabelText('When for time entry')).toHaveLength(0);
    const edits = screen.getAllByRole('button', { name: 'Edit time entry' });
    expect(edits).toHaveLength(2);
    const first = edits[0]!.closest('li')!;
    expect(first.querySelector('.wb-entry-summary')?.textContent).toMatch(
      /attack/
    );
    fireEvent.click(edits[0]!);
    // One row opened; the other stays a line.
    expect(screen.getAllByLabelText('When for time entry')).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Edit time entry' })
    ).toHaveLength(1);
  });

  it('editing an opened entry commits exactly as before', () => {
    const collapsed = vi.fn();
    const open = vi.fn();
    const first = render(
      <TablesPanel scope={site} collapsedEntries onChange={collapsed} />
    );
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit time entry' })[1]!
    );
    fireEvent.change(screen.getByLabelText('Weight for time entry'), {
      target: { value: '3' },
    });
    first.unmount();
    render(<TablesPanel scope={site} onChange={open} />);
    fireEvent.click(screen.getByLabelText('Table goblin-drill'));
    fireEvent.change(screen.getAllByLabelText('Weight for time entry')[1]!, {
      target: { value: '3' },
    });
    expect(collapsed.mock.calls).toEqual(open.mock.calls);
    expect(collapsed).toHaveBeenCalledTimes(1);
  });
});

describe('TablesPanel — rows heaviest first (rpg-project#576)', () => {
  function Controlled({ initial }: { initial: SiteScope }) {
    const [scope, setScope] = useState(initial);
    return <TablesPanel scope={scope} onChange={setScope} collapsedEntries />;
  }

  it('a row given weight 5 moves to the top with its editor still open', () => {
    render(
      <Controlled
        initial={{
          tables: {
            drill: {
              time: [
                { when: { enemy: 'none' }, hold: {} },
                { when: { enemy: 'seen' }, toward: 'enemy' },
                { when: { enemy: 'reach' }, attack: 'enemy' },
              ],
            },
          },
        }}
      />
    );
    fireEvent.click(screen.getByLabelText('Table drill'));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit time entry' })[2]!
    );
    const weight = screen.getByLabelText('Weight for time entry');
    fireEvent.change(weight, { target: { value: '5' } });
    const rows = screen
      .getByTestId('site-tables')
      .querySelectorAll('.wb-policy-entries > li');
    expect(rows[0]!.classList.contains('wb-entry-sentence-card')).toBe(true);
    expect(
      (screen.getByLabelText('Weight for time entry') as HTMLInputElement).value
    ).toBe('5');
    expect(rows[1]!.textContent).toContain('when enemy none');
  });
});
