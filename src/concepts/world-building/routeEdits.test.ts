/**
 * The form's cells and routes are the reader's shapes (rpg-project#720).
 *
 * The castle's every route and march is rebuilt the way the form builds it —
 * a pick appends each waypoint, the wait and facing fields set the pause, a
 * cell pick writes `at` — and Download YAML of the rebuilt castle is the
 * studio's export of the castle, byte for byte. A form that wrote a key in
 * another order, dropped a wait or wrote a facing the reader would not, would
 * change those bytes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import {
  selectorCell,
  selectorRoute,
  type AnswerEntryShape,
  type AnswerWaypointShape,
} from './answerTableShape';
import {
  appendWaypoint,
  cellSelector,
  isRouteValue,
  moveWaypoint,
  parseWait,
  removeWaypoint,
  routeSelector,
  setWaypointFacing,
  setWaypointWait,
  waypointOf,
} from './routeEdits';
import type { SiteScope } from './siteScope';

/** A route as an author makes it on the form: one click per cell, then each
 * waypoint's wait and facing typed into its fields. */
function repick(route: readonly AnswerWaypointShape[]): AnswerWaypointShape[] {
  let picked: AnswerWaypointShape[] = [];
  for (const w of route) picked = appendWaypoint(picked, { q: w.q, r: w.r });
  route.forEach((w, i) => {
    if (w.wait !== undefined) picked = setWaypointWait(picked, i, w.wait);
    if (w.facing !== undefined) picked = setWaypointFacing(picked, i, w.facing);
  });
  return picked;
}

/** Every row of every table with its route or cell rebuilt by the form; the
 * names of what was rebuilt, so the test can say it touched them. */
function rebuildCastle(scope: SiteScope): {
  scope: SiteScope;
  rebuilt: string[];
} {
  const rebuilt: string[] = [];
  const tables = Object.fromEntries(
    Object.entries(scope.tables ?? {}).map(([id, table]) => [
      id,
      {
        ...table,
        time: (table.time ?? []).map((row, i): AnswerEntryShape => {
          const route = selectorRoute(row.toward);
          if (route && route.length > 0) {
            rebuilt.push(`${id}.time[${i}] path`);
            return { ...row, toward: routeSelector(repick(route)) };
          }
          const cell = selectorCell(row.toward);
          if (cell) {
            rebuilt.push(`${id}.time[${i}] at`);
            return { ...row, toward: cellSelector({ q: cell.q, r: cell.r }) };
          }
          const given = row.with?.path;
          if (isRouteValue(given)) {
            rebuilt.push(`${id}.time[${i}] with.path`);
            return {
              ...row,
              with: {
                ...row.with,
                path: repick(given).map((w) => waypointOf(w, w)),
              },
            };
          }
          return row;
        }),
      },
    ])
  );
  return { scope: { ...scope, tables }, rebuilt };
}

describe('the form writes the shapes the reader reads (rpg-project#720)', () => {
  it("the castle's routes, picked and paused on the form, download byte for byte", () => {
    const yaml = readFileSync(
      'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
      'utf8'
    );
    const opened = readDraftYaml(yaml);
    if (!opened.ok) throw new Error(opened.refusal);
    const before = exportDraftYaml(
      { draft: opened.draft, scope: opened.scope },
      opened.key
    );
    const { scope, rebuilt } = rebuildCastle(opened.scope);
    // The gate guards' loops (given to the patrol bundle), the knights' and
    // the hall guard's own routes, and the marches on a cell.
    expect(rebuilt).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^gate-patrol\.time\[\d+\] with\.path$/),
        expect.stringMatching(/^gate-patrol-east\.time\[\d+\] with\.path$/),
        expect.stringMatching(/^keep-patrol\.time\[\d+\] path$/),
        expect.stringMatching(/^hall-patrol\.time\[\d+\] path$/),
        expect.stringMatching(/^storm-the-keep\.time\[\d+\] at$/),
        expect.stringMatching(/^answer-the-gate\.time\[\d+\] at$/),
      ])
    );
    const after = exportDraftYaml({ draft: opened.draft, scope }, opened.key);
    expect(after).toBe(before);
    // And the download reads back as the same castle.
    const reopened = readDraftYaml(after);
    if (!reopened.ok) throw new Error(reopened.refusal);
    expect(reopened.scope).toEqual(opened.scope);
  });

  it('a waypoint is written q, r, wait, facing, whatever order it was set in', () => {
    let route = appendWaypoint([], { q: -5, r: 8 });
    route = setWaypointFacing(route, 0, 'ne'); // no wait yet: not written
    expect(route[0]).toEqual({ q: -5, r: 8 });
    route = setWaypointWait(route, 0, 1);
    route = setWaypointFacing(route, 0, 'ne');
    expect(Object.keys(route[0]!)).toEqual(['q', 'r', 'wait', 'facing']);
  });

  it('clearing a wait, or setting it to 0, drops the facing with it', () => {
    const stood = [{ q: 0, r: 0, wait: 2, facing: 'se' }];
    expect(setWaypointWait(stood, 0, undefined)).toEqual([{ q: 0, r: 0 }]);
    expect(setWaypointWait(stood, 0, 0)).toEqual([{ q: 0, r: 0, wait: 0 }]);
  });

  it('the same cell clicked twice is appended twice: the engine judges it', () => {
    const route = appendWaypoint(appendWaypoint([], { q: 1, r: 0 }), {
      q: 1,
      r: 0,
    });
    expect(route).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: 0 },
    ]);
  });

  it('moves and removes a waypoint in place', () => {
    const route = [
      { q: 0, r: 0 },
      { q: 1, r: 0, wait: 1 },
      { q: 2, r: 0 },
    ];
    expect(moveWaypoint(route, 1, -1)).toEqual([
      { q: 1, r: 0, wait: 1 },
      { q: 0, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(moveWaypoint(route, 2, 1)).toEqual(route);
    expect(removeWaypoint(route, 1)).toEqual([
      { q: 0, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('a wait is a whole number of rounds, 0 or more', () => {
    expect(parseWait('')).toBeUndefined();
    expect(parseWait('2')).toBe(2);
    expect(parseWait('0')).toBe(0);
    expect(parseWait('-1')).toBeNull();
    expect(parseWait('1.5')).toBeNull();
  });
});
