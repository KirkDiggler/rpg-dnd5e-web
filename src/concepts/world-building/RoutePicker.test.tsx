/**
 * The row form's cell and route on `toward` (rpg-project#720): offered beside
 * the words where the studio can pick on its Layout, written as the reader's
 * shapes, edited as chips, and refused at the row in the engine's sentence.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from '../encounter-studio/draftFile';
import type { AnswerEntryShape } from './answerTableShape';
import { SiteBundlesContext } from './bundlesContext';
import {
  RoutePickContext,
  type RoutePickRequest,
  type RoutePicking,
} from './routePicking';
import { RowRefusalsContext, type RowRefusals } from './rowRefusals';
import type { SiteScope } from './siteScope';
import { TablesPanel } from './TablesPanel';

function mount(
  entry: AnswerEntryShape,
  {
    picking,
    refusals,
    collapsed = false,
  }: {
    picking?: RoutePicking;
    refusals?: RowRefusals;
    collapsed?: boolean;
  } = {}
) {
  const onChange = vi.fn();
  const panel = (
    <TablesPanel
      scope={{ tables: { patrol: { time: [entry] } } }}
      onChange={onChange}
      collapsedEntries={collapsed}
    />
  );
  const withRefusals = refusals ? (
    <RowRefusalsContext.Provider value={refusals}>
      {panel}
    </RowRefusalsContext.Provider>
  ) : (
    panel
  );
  render(
    picking ? (
      <RoutePickContext.Provider value={picking}>
        {withRefusals}
      </RoutePickContext.Provider>
    ) : (
      withRefusals
    )
  );
  if (!refusals?.focus) fireEvent.click(screen.getByLabelText('Table patrol'));
  return () =>
    (onChange.mock.calls.at(-1)?.[0] as SiteScope | undefined)?.tables?.patrol
      ?.time?.[0];
}

const options = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(
    (option) => option.value
  );

function arming() {
  const requests: RoutePickRequest[] = [];
  const picking: RoutePicking = { arm: (request) => requests.push(request) };
  return { picking, requests };
}

describe('a cell and a route on toward (rpg-project#720)', () => {
  it('`toward` offers a cell and a route beside the words where the map can pick', () => {
    mount({ when: { enemy: 'none' }, toward: 'enemy' }, arming());
    expect(options('To for time entry')).toEqual([
      'enemy',
      'attacker',
      'at',
      'path',
    ]);
  });

  it('`attack` and `away` never offer one: the engine walks only `toward` to a place', () => {
    mount({ when: { enemy: 'reach' }, attack: 'enemy' }, arming());
    expect(options('To for time entry')).not.toContain('path');
    expect(options('To for time entry')).not.toContain('at');
  });

  it('choosing a route opens the pick; Done writes exactly `toward: { path }`', () => {
    const { picking, requests } = arming();
    const last = mount(
      { when: { enemy: 'none' }, toward: 'enemy' },
      {
        picking,
      }
    );
    fireEvent.change(screen.getByLabelText('To for time entry'), {
      target: { value: 'path' },
    });
    // Nothing is written until the pick is Done: a cancel writes nothing.
    expect(last()).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ mode: 'route', route: [] });
    requests[0]!.onDone([
      { q: -2, r: 0 },
      { q: 0, r: -2 },
      { q: 2, r: 0 },
    ]);
    expect(last()?.toward).toEqual({
      path: [
        { q: -2, r: 0 },
        { q: 0, r: -2 },
        { q: 2, r: 0 },
      ],
    });
  });

  it('choosing a cell opens a one-click pick and writes `toward: { at }`', () => {
    const { picking, requests } = arming();
    const last = mount(
      { when: { enemy: 'none' }, toward: 'enemy' },
      {
        picking,
      }
    );
    fireEvent.change(screen.getByLabelText('To for time entry'), {
      target: { value: 'at' },
    });
    expect(requests[0]).toMatchObject({ mode: 'cell' });
    requests[0]!.onDone([{ q: 10, r: -19 }]);
    expect(last()?.toward).toEqual({ at: { q: 10, r: -19 } });
  });

  it('a waypoint takes a wait in rounds, and a facing only beside one', () => {
    const last = mount(
      {
        when: { enemy: 'none' },
        toward: {
          path: [
            { q: -5, r: 8 },
            { q: -5, r: 10 },
            { q: -7, r: 10 },
          ],
        },
      },
      arming()
    );
    const facing = screen.getByLabelText(
      'Facing at waypoint 1 of time entry'
    ) as HTMLSelectElement;
    expect(facing.disabled).toBe(true);
    fireEvent.change(
      screen.getByLabelText('Wait in rounds at waypoint 1 of time entry'),
      { target: { value: '1' } }
    );
    expect(last()?.toward).toEqual({
      path: [
        { q: -5, r: 8, wait: 1 },
        { q: -5, r: 10 },
        { q: -7, r: 10 },
      ],
    });
  });

  it('the facing select offers the compass and writes after the wait', () => {
    const last = mount(
      {
        when: { enemy: 'none' },
        toward: {
          path: [
            { q: -5, r: 8, wait: 1 },
            { q: -5, r: 10 },
            { q: -7, r: 10 },
          ],
        },
      },
      arming()
    );
    fireEvent.change(
      screen.getByLabelText('Facing at waypoint 1 of time entry'),
      { target: { value: 'ne' } }
    );
    const route = (last()?.toward as { path: object[] }).path;
    expect(route[0]).toEqual({ q: -5, r: 8, wait: 1, facing: 'ne' });
    expect(Object.keys(route[0]!)).toEqual(['q', 'r', 'wait', 'facing']);
  });

  it('waypoints are reordered and removed from the row', () => {
    const last = mount(
      {
        when: { enemy: 'none' },
        toward: {
          path: [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 1, r: 1 },
          ],
        },
      },
      arming()
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move waypoint 3 of time entry earlier',
      })
    );
    expect(last()?.toward).toEqual({
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 1 },
        { q: 1, r: 0 },
      ],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove waypoint 1 of time entry' })
    );
    expect(last()?.toward).toEqual({
      path: [
        { q: 1, r: 0 },
        { q: 1, r: 1 },
      ],
    });
  });

  it('Done writes through the row as it last rendered, not as it was armed', () => {
    // The studio retires a presentation's callbacks when the pick switches to
    // the Layout; a commit through the armed render's closure is refused.
    const { picking, requests } = arming();
    const stale = vi.fn();
    const fresh = vi.fn();
    const scope: SiteScope = {
      tables: {
        patrol: { time: [{ when: { enemy: 'none' }, toward: 'enemy' }] },
      },
    };
    const view = render(
      <RoutePickContext.Provider value={picking}>
        <TablesPanel scope={scope} onChange={stale} />
      </RoutePickContext.Provider>
    );
    fireEvent.click(screen.getByLabelText('Table patrol'));
    fireEvent.change(screen.getByLabelText('To for time entry'), {
      target: { value: 'path' },
    });
    view.rerender(
      <RoutePickContext.Provider value={picking}>
        <TablesPanel scope={scope} onChange={fresh} />
      </RoutePickContext.Provider>
    );
    requests[0]!.onDone([{ q: 1, r: 0 }]);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('a pick whose row was undone off `toward` writes nothing', () => {
    // The reviewer's probe: arm a route on `toward`, the row comes back as
    // `away` (an Undo of the word change), then Done.
    const { picking, requests } = arming();
    const onChange = vi.fn();
    const scopeOf = (entry: AnswerEntryShape): SiteScope => ({
      tables: { patrol: { time: [entry] } },
    });
    const view = render(
      <RoutePickContext.Provider value={picking}>
        <TablesPanel
          scope={scopeOf({ when: { enemy: 'none' }, toward: 'enemy' })}
          onChange={onChange}
        />
      </RoutePickContext.Provider>
    );
    fireEvent.click(screen.getByLabelText('Table patrol'));
    fireEvent.change(screen.getByLabelText('To for time entry'), {
      target: { value: 'path' },
    });
    view.rerender(
      <RoutePickContext.Provider value={picking}>
        <TablesPanel
          scope={scopeOf({ when: { enemy: 'none' }, away: 'enemy' })}
          onChange={onChange}
        />
      </RoutePickContext.Provider>
    );
    requests[0]!.onDone([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Add waypoints on map hands the pick the route it already holds', () => {
    const { picking, requests } = arming();
    mount(
      {
        when: { enemy: 'none' },
        toward: { path: [{ q: 0, r: 0, wait: 2 }] },
      },
      { picking }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Add waypoints on the map to time entry',
      })
    );
    expect(requests[0]).toMatchObject({
      mode: 'route',
      route: [{ q: 0, r: 0, wait: 2 }],
    });
  });

  it("the engine's refusal of a row is said at the row, in its own words", () => {
    const sentence =
      'this route retraces itself at {q: 1, r: 0}: a patrol walks a loop — add a waypoint so no leg crosses another';
    mount(
      {
        when: { enemy: 'none' },
        toward: {
          path: [
            { q: 1, r: 0 },
            { q: 1, r: 0 },
            { q: 2, r: 0 },
          ],
        },
      },
      {
        refusals: {
          refusals: [
            { path: 'tables.patrol.on.time[0].toward.path', message: sentence },
            { path: 'tables.patrol.on.time[1].toward', message: 'not mine' },
          ],
          focus: null,
        },
      }
    );
    expect(
      screen.getAllByTestId('row-refusal').map((p) => p.textContent)
    ).toEqual([sentence]);
  });

  it('a jump to a row opens its table and the row', () => {
    mount(
      { when: { enemy: 'none' }, toward: { path: [{ q: 1, r: 0 }] } },
      {
        collapsed: true,
        refusals: {
          refusals: [
            { path: 'tables.patrol.on.time[0].toward.path', message: 'no' },
          ],
          focus: { path: 'tables.patrol.on.time[0]', nonce: 1 },
        },
      }
    );
    expect(
      (screen.getByTestId('site-table-patrol') as HTMLDetailsElement).open
    ).toBe(true);
    // Open, not the one-line summary: its route is editable.
    expect(
      screen.getByRole('list', { name: 'Route for time entry' })
    ).toBeTruthy();
  });
});

describe("the castle's gate patrol, its loop given to a bundle", () => {
  function castle(): SiteScope {
    const read = readDraftYaml(
      readFileSync(
        'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
        'utf8'
      )
    );
    if (!read.ok) throw new Error(read.refusal);
    return read.scope;
  }

  it('the patrol row shows its three waypoints as chips, and edits them', () => {
    const scope = castle();
    const onChange = vi.fn();
    render(
      <SiteBundlesContext.Provider value={scope.bundles}>
        <RoutePickContext.Provider value={arming().picking}>
          <TablesPanel scope={scope} onChange={onChange} collapsedEntries />
        </RoutePickContext.Provider>
      </SiteBundlesContext.Provider>
    );
    fireEvent.click(screen.getByLabelText('Table gate-patrol'));
    const table = screen.getByTestId('site-table-gate-patrol');
    const chips = within(table).getByLabelText('Waypoints of patrol path');
    expect(
      Array.from(chips.querySelectorAll('[data-waypoint]')).map(
        (chip) => chip.textContent
      )
    ).toEqual([
      '1{q: -5, r: 8} waits 1, faces ne',
      '2{q: -5, r: 10} waits 1, faces se',
      '3{q: -7, r: 10}',
    ]);
    fireEvent.click(
      within(table).getByRole('button', {
        name: /^Edit the route of time entry patrol$/,
      })
    );
    fireEvent.change(
      within(table).getByLabelText(
        'Wait in rounds at waypoint 3 of time entry patrol path'
      ),
      { target: { value: '2' } }
    );
    const next = onChange.mock.calls.at(-1)![0] as SiteScope;
    const patrol = next.tables!['gate-patrol']!.time!.find(
      (row) => row.use === 'patrol'
    );
    expect(patrol?.with?.path).toEqual([
      { q: -5, r: 8, wait: 1, facing: 'ne' },
      { q: -5, r: 10, wait: 1, facing: 'se' },
      { q: -7, r: 10, wait: 2 },
    ]);
  });
});
