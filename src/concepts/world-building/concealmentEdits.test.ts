import { describe, expect, it } from 'vitest';
import {
  addConcealment,
  paintConcealmentCells,
  renameConcealment,
  setConcealment,
  setConcealmentProp,
} from './concealmentEdits';
import type { SiteScope } from './siteScope';

const scope: SiteScope = {
  concealments: {
    vault: { checks: [{ ability: 'investigation', dc: 15 }], props: ['door'] },
  },
  intel: [{ id: 'map', reveals: { concealment: 'vault' } }],
};

describe('concealment document edits', () => {
  it('adds a clicked prop only once and removes membership without rewriting other fields', () => {
    const picked = setConcealmentProp(scope, 'vault', 'chest', true);
    expect(picked.concealments?.vault?.props).toEqual(['door', 'chest']);
    expect(setConcealmentProp(picked, 'vault', 'chest', true)).toBe(picked);
    expect(setConcealmentProp(picked, 'vault', 'chest', false)).toEqual(scope);
    expect(setConcealmentProp(scope, 'missing', 'chest', true)).toBe(scope);
  });
  it('adds unique declarations and omits the map when the last is removed', () => {
    const one = addConcealment({});
    const two = addConcealment(one);
    expect(Object.keys(two.concealments!)).toEqual(['secret-1', 'secret-2']);
    expect(setConcealment(one, 'secret-1', undefined)).toEqual({});
  });
  it('renames only the declaration and never overwrites another', () => {
    const renamed = renameConcealment(scope, 'vault', 'cellar');
    expect(renamed.concealments?.vault).toBeUndefined();
    expect(renamed.concealments?.cellar).toEqual(scope.concealments?.vault);
    expect(renamed.intel).toEqual(scope.intel);
    const two = addConcealment(scope);
    expect(renameConcealment(two, 'vault', 'secret-1')).toBe(two);
    expect(scope.concealments?.vault).toBeDefined();
  });
  it('paints and erases membership without mutating the input or other fields', () => {
    const cells = [
      { q: 1, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ];
    const painted = paintConcealmentCells(scope, 'vault', cells, 'paint');
    expect(painted.concealments?.vault?.cells).toEqual([cells[0], cells[2]]);
    expect(painted.concealments?.vault?.props).toEqual(['door']);
    expect(scope.concealments?.vault?.cells).toBeUndefined();
    const erased = paintConcealmentCells(painted, 'vault', cells, 'erase');
    expect(erased).toEqual(scope);
    expect(paintConcealmentCells(scope, 'missing', cells, 'paint')).toBe(scope);
  });
});
