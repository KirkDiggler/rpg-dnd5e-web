/**
 * The Bundles home (rpg-project#670): one card per bundle, its rows edited by
 * the Tables panel's own row editor, a parameter reference as a value kind
 * (a `$name` chip) with an undeclared name refused, a parameter list editor,
 * and an "Edit as text" view. A `use:` row in a table is one line with its
 * `with:` values as chips.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import { SiteBundlesContext } from './bundlesContext';
import { BundlesPanel } from './BundlesPanel';
import type { SiteBundles, SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';

const bundles: SiteBundles = {
  pursuer: {
    params: { distance: 6, heading: 'went' },
    rows: [
      { when: { enemy: 'remembered' }, toward: 'enemy' },
      {
        when: { enemy: 'lost' },
        search: { distance: '$distance', heading: '$heading' },
      },
    ],
  },
};

const scope: SiteScope = {
  bundles,
  tables: {
    'gate-patrol': {
      time: [
        { use: 'pursuer', with: { distance: 8 }, weight: 2, as: 'toward' },
        { use: 'hunter' },
      ],
    },
  },
};

/** The panel over live state, and the last bundles it committed. */
function mountBundles(initial: SiteBundles = bundles) {
  let last: SiteBundles | undefined;
  function Harness() {
    const [state, setState] = useState<SiteBundles>(initial);
    return (
      <SiteBundlesContext.Provider value={state}>
        <BundlesPanel
          scope={{ bundles: state }}
          onChange={(next) => {
            last = next;
            setState(next);
          }}
        />
      </SiteBundlesContext.Provider>
    );
  }
  render(<Harness />);
  return () => last;
}

describe('a use row in a table', () => {
  function mountTables() {
    render(
      <SiteBundlesContext.Provider value={scope.bundles}>
        <TablesPanel scope={scope} onChange={vi.fn()} collapsedEntries />
      </SiteBundlesContext.Provider>
    );
  }

  it('is one line, its with: values as chips', () => {
    mountTables();
    const line = document.querySelector('li.wb-entry-use .wb-entry-summary')!;
    expect(line.textContent).toBe('pursuer · with distance 8 · ×2 · as toward');
    expect(line.querySelector('.wb-with-chip')?.textContent).toBe('distance 8');
  });

  it('expands to the bundle’s rows with the parameters filled', () => {
    mountTables();
    fireEvent.click(
      screen.getByRole('button', { name: /Show the rows of .* entry pursuer/ })
    );
    const rows = within(screen.getByLabelText('pursuer rows')).getAllByRole(
      'listitem'
    );
    expect(rows[1].textContent).toContain('search 8 went');
  });

  it('says what the engine will refuse of a bundle nobody declared', () => {
    mountTables();
    expect(
      screen.getByText(
        '`use: hunter` names no bundle in this file: it declares pursuer'
      )
    ).toBeTruthy();
  });
});

describe('a bundle card', () => {
  it('has the id and the parameters on top, the rows below, the actions at the foot', () => {
    mountBundles();
    const card = screen.getByRole('listitem', { name: 'Bundle pursuer' });
    const header = card.querySelector('header')!;
    expect(within(header).getByLabelText('Bundle pursuer id')).toBeTruthy();
    expect(
      (
        within(header).getByLabelText(
          'Default of distance in pursuer'
        ) as HTMLInputElement
      ).value
    ).toBe('6');
    const footer = card.querySelector('footer')!;
    expect(
      within(footer).getByRole('button', { name: 'Remove bundle pursuer' })
    ).toBeTruthy();
    expect(
      within(footer).getByRole('button', { name: 'Edit pursuer as text' })
    ).toBeTruthy();
    expect(card.querySelector('textarea')).toBeNull();
    // The rows are the row editor's own sentences, the parameters as chips.
    const summaries = Array.from(
      card.querySelectorAll('.wb-entry-summary')
    ).map((n) => n.textContent);
    expect(summaries[1]).toContain('search $distance $heading');
  });

  it('shows a parameter in a row as a chip, and puts a value back', () => {
    const last = mountBundles();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit pursuer row 2 entry' })
    );
    const chip = document.querySelector(
      '[data-param="distance"].wb-param-chip'
    )!;
    expect(chip.textContent).toContain('$distance');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Clear $distance from Cells for pursuer row 2 entry',
      })
    );
    expect(last()!.pursuer.rows[1]).toEqual({
      when: { enemy: 'lost' },
      search: { heading: '$heading' },
    });
  });

  it('picks a declared parameter into a slot', () => {
    const last = mountBundles({
      pursuer: {
        params: { distance: 6 },
        rows: [{ when: { enemy: 'lost' }, search: {} }],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit pursuer row 1 entry' })
    );
    fireEvent.change(
      screen.getByLabelText('Parameter for Cells for pursuer row 1 entry'),
      { target: { value: 'distance' } }
    );
    expect(last()!.pursuer.rows[0]).toEqual({
      when: { enemy: 'lost' },
      search: { distance: '$distance' },
    });
  });

  it('refuses a name the bundle does not declare, and writes nothing', () => {
    const last = mountBundles({
      pursuer: {
        params: { distance: 6 },
        rows: [{ when: { enemy: 'lost' }, search: {} }],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit pursuer row 1 entry' })
    );
    fireEvent.change(
      screen.getByLabelText('Parameter for Cells for pursuer row 1 entry'),
      { target: { value: '__other__' } }
    );
    const typed = screen.getByLabelText(
      'Parameter name for Cells for pursuer row 1 entry'
    );
    fireEvent.change(typed, { target: { value: 'range' } });
    fireEvent.keyDown(typed, { key: 'Enter' });
    expect(
      screen.getByText(
        '`$range` is not a parameter bundle "pursuer" declares: it takes distance'
      )
    ).toBeTruthy();
    expect(last()).toBeUndefined();
  });

  it('draws a name already written but not declared as a refused chip', () => {
    mountBundles({
      pursuer: {
        rows: [{ when: { enemy: 'lost' }, search: { distance: '$range' } }],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit pursuer row 1 entry' })
    );
    expect(
      document.querySelector('[data-param="range"].wb-param-chip--refused')
    ).not.toBeNull();
  });

  it('edits the parameters as a list; an empty list reads "no parameters"', () => {
    const last = mountBundles({ calm: { rows: [{ hold: {} }] } });
    const card = screen.getByRole('listitem', { name: 'Bundle calm' });
    expect(within(card).getByText('no parameters')).toBeTruthy();
    expect(card.querySelector('input[placeholder]')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a parameter to calm' })
    );
    expect(last()!.calm.params).toEqual({ 'param-1': null });
    fireEvent.click(screen.getByLabelText('param-1 has no default'));
    fireEvent.change(screen.getByLabelText('Default of param-1 in calm'), {
      target: { value: '4' },
    });
    expect(last()!.calm.params).toEqual({ 'param-1': 4 });
  });

  it('adds, moves and removes rows with the row editor', () => {
    const last = mountBundles();
    fireEvent.click(
      screen.getByRole('button', { name: 'Move pursuer row 2 up' })
    );
    expect(last()!.pursuer.rows[0]).toMatchObject({ when: { enemy: 'lost' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a row to pursuer' })
    );
    expect(last()!.pursuer.rows).toHaveLength(3);
  });

  it('shows the YAML on "Edit as text", and applies it', () => {
    const last = mountBundles();
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit pursuer as text' })
    );
    const text = screen.getByLabelText('Bundle as text') as HTMLTextAreaElement;
    expect(text.value).toContain('distance: $distance');
    fireEvent.change(text, {
      target: {
        value:
          'params: { distance: 4 }\nrows:\n  - { when: { enemy: lost }, search: { distance: $distance } }\n',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply text' }));
    expect(last()!.pursuer).toEqual({
      params: { distance: 4 },
      rows: [{ when: { enemy: 'lost' }, search: { distance: '$distance' } }],
    });
  });

  it('shows the engine’s sentence for a bundle with no rows', () => {
    mountBundles({ empty: { rows: [] } });
    expect(
      screen.getByText(
        'a bundle holds no rows; a group is a table, and a table with no rows can never be picked'
      )
    ).toBeTruthy();
  });
});

describe('the castle’s bundles through a save', () => {
  it('a bundle row’s $distance chip survives open → save → reopen', () => {
    const opened = readDraftYaml(
      readFileSync(
        'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
        'utf8'
      )
    );
    if (!opened.ok) throw new Error(opened.refusal);
    const saved = exportDraftYaml(
      { draft: opened.draft, scope: opened.scope },
      opened.key
    );
    const reopened = readDraftYaml(saved);
    if (!reopened.ok) throw new Error(reopened.refusal);
    expect(reopened.scope.bundles).toEqual(opened.scope.bundles);
    mountBundles(reopened.scope.bundles);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit pursuer row 2 entry' })
    );
    const card = screen.getByRole('listitem', { name: 'Bundle pursuer' });
    expect(
      card.querySelector('[data-param="distance"].wb-param-chip')
    ).not.toBeNull();
    expect(
      card.querySelector('[data-param="heading"].wb-param-chip')
    ).not.toBeNull();
    expect(card.querySelector('.wb-param-chip--refused')).toBeNull();
  });
});
