// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  defaultPatternStart,
  resolvePatternStart,
  type BoundaryRun,
  type RegionWallBoundary,
} from './regionSurfaceBoundary';
import type { WorldPoint } from './types';

/*
 * Region wall-side provenance is no longer derived from walls: regions are
 * their cells and name no wall face (rpg-project#725), so the enclosure
 * certification tests are retired with the automatic regions. What survives
 * is the pattern-start contract over a given boundary, built by hand here.
 */

const run = (
  wallId: string,
  direction: BoundaryRun['direction'] = 'start-to-end'
): BoundaryRun => ({ wallId, direction });

function corner(incoming: string, outgoing: string, point: WorldPoint) {
  return {
    reference: { incoming: run(incoming), outgoing: run(outgoing) },
    point,
  };
}

function boundary(): Extract<RegionWallBoundary, { status: 'resolved' }> {
  return {
    id: 'hall',
    status: 'resolved',
    sides: [
      {
        ...run('north'),
        side: 'positive-z',
        from: { x: 0, z: 0 },
        to: { x: 8, z: 0 },
        start: 0,
        end: 8,
      },
    ],
    corners: [
      corner('west', 'north', { x: 0, z: 0 }),
      corner('north', 'east', { x: 8, z: 0 }),
      corner('east', 'south', { x: 8, z: 4 }),
    ],
  };
}

describe('pattern start over a wall boundary', () => {
  it('defaults to the first offered corner and resolves a chosen corner by identity', () => {
    const value = boundary();
    expect(defaultPatternStart(value)).toEqual({
      status: 'resolved',
      reference: value.corners[0].reference,
      point: { x: 0, z: 0 },
    });
    expect(resolvePatternStart(value, value.corners[1].reference)).toEqual({
      status: 'resolved',
      reference: value.corners[1].reference,
      point: { x: 8, z: 0 },
    });
    // Identity, not array offset: the same reference resolves after reordering.
    const reordered = { ...value, corners: [...value.corners].reverse() };
    expect(
      resolvePatternStart(reordered, value.corners[1].reference)
    ).toMatchObject({ status: 'resolved', point: { x: 8, z: 0 } });
    expect(defaultPatternStart(reordered)).toMatchObject({
      point: { x: 8, z: 4 },
    });
  });

  it('refuses missing, reversed and ambiguous references without choosing a replacement', () => {
    const value = boundary(),
      anchor = defaultPatternStart(value);
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    const reversed = structuredClone(anchor.reference);
    reversed.incoming.direction = 'end-to-start';
    expect(resolvePatternStart(value, reversed)).toEqual({
      status: 'unresolved',
      reason: 'missing-pattern-start',
    });
    const duplicate = {
      ...value,
      corners: [...value.corners, structuredClone(value.corners[0])],
    };
    expect(resolvePatternStart(duplicate, anchor.reference)).toEqual({
      status: 'unresolved',
      reason: 'ambiguous-pattern-start',
    });
    expect(defaultPatternStart({ ...value, corners: [] })).toEqual({
      status: 'unresolved',
      reason: 'no-pattern-corner',
    });
  });

  it('carries an unresolved boundary reason through both resolvers', () => {
    const unbound: RegionWallBoundary = {
      id: 'hall',
      status: 'unresolved',
      reason: 'not-wall-bound',
    };
    expect(defaultPatternStart(unbound)).toEqual({
      status: 'unresolved',
      reason: 'not-wall-bound',
    });
    expect(
      resolvePatternStart(unbound, boundary().corners[0].reference)
    ).toEqual({ status: 'unresolved', reason: 'not-wall-bound' });
  });

  it('outputs are detached copies', () => {
    const value = boundary(),
      before = structuredClone(value),
      anchor = defaultPatternStart(value);
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    anchor.point.x = 999;
    anchor.reference.incoming.wallId = 'mutated';
    const found = resolvePatternStart(value, value.corners[2].reference);
    if (found.status !== 'resolved') throw new Error('Missing corner');
    found.point.z = 999;
    found.reference.outgoing.wallId = 'mutated';
    expect(value).toEqual(before);
  });
});
