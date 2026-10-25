/**
 * A `use:` row reads as ONE line and expands, read-only, to its bundle's rows
 * with the parameters filled; the bundles themselves are edited in their own
 * list (rpg-project#670).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteBundlesContext } from './bundlesContext';
import { BundlesPanel } from './BundlesPanel';
import type { SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';

const scope: SiteScope = {
  bundles: {
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
  },
  tables: {
    'gate-patrol': {
      time: [
        { use: 'pursuer', with: { distance: 8 }, weight: 2, as: 'toward' },
        { use: 'hunter' },
      ],
    },
  },
};

function mountTables() {
  render(
    <SiteBundlesContext.Provider value={scope.bundles}>
      <TablesPanel scope={scope} onChange={vi.fn()} collapsedEntries />
    </SiteBundlesContext.Provider>
  );
}

describe('a use row in a table', () => {
  it('is one line', () => {
    mountTables();
    expect(
      screen.getByText('pursuer · with distance 8 · ×2 · as toward')
    ).toBeTruthy();
  });

  it('expands to the bundle’s rows with the parameters filled', () => {
    mountTables();
    fireEvent.click(
      screen.getByRole('button', { name: /Show the rows of .* entry pursuer/ })
    );
    const rows = within(screen.getByLabelText('pursuer rows')).getAllByRole(
      'listitem'
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('when enemy remembered'),
      expect.stringContaining('search'),
    ]);
    expect(rows[1].textContent).toContain('8');
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

describe('the Bundles list', () => {
  it('shows each bundle, the rows its defaults make, and adds one', () => {
    const onChange = vi.fn();
    render(<BundlesPanel scope={scope} onChange={onChange} />);
    expect(
      (screen.getByLabelText('Bundle pursuer rows') as HTMLTextAreaElement)
        .value
    ).toContain('$distance');
    const preview = within(
      screen.getByLabelText('pursuer rows with its defaults')
    ).getAllByRole('listitem');
    expect(preview[1].textContent).toContain('6');
    fireEvent.click(screen.getByRole('button', { name: 'Add bundle' }));
    expect(onChange).toHaveBeenCalledWith({
      ...scope.bundles,
      'bundle-1': { rows: [] },
    });
  });

  it('edits a parameter default', () => {
    const onChange = vi.fn();
    render(<BundlesPanel scope={scope} onChange={onChange} />);
    const params = screen.getByLabelText('Bundle pursuer parameters');
    fireEvent.change(params, {
      target: { value: '{ distance: 4, heading: left }' },
    });
    fireEvent.blur(params);
    expect(onChange.mock.calls[0][0].pursuer.params).toEqual({
      distance: 4,
      heading: 'left',
    });
  });

  it('shows the engine’s sentence for a bundle with no rows', () => {
    render(
      <BundlesPanel
        scope={{ bundles: { empty: { rows: [] } } }}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        'a bundle holds no rows; a group is a table, and a table with no rows can never be picked'
      )
    ).toBeTruthy();
  });
});
