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
import { describe, expect, it, vi } from 'vitest';
import { FactionsPanel, TableNameSelect } from './SitePolicies';
import type { SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';

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
      '1 trigger'
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
