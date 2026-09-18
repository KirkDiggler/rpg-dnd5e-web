import type { PropModelBounds } from '@/components/hex-grid/PropModel';
import { describe, expect, it } from 'vitest';
import {
  declarationMapForSelection,
  footprintFromMeasuredBounds,
  seedDeclarations,
  UNSEEDED_FOOTPRINT,
} from './declarationFootprint';
import {
  FOOTPRINT_MAXIMUM_EXTENT,
  FOOTPRINT_MINIMUM_EXTENT,
  type RoomPropDeclaration,
} from './roomDraft';

function bounds(width: number, depth: number): PropModelBounds {
  return { minY: 0, maxY: 2, width, height: 2, depth };
}

describe('a footprint is seeded from the mesh it describes', () => {
  it('takes the wall’s own extents, not a 1×1 patch', () => {
    // The door wall is 2.787 × 0.248 metres of asset; both model loaders
    // report bounds in world units, so the authored rectangle is the mesh.
    expect(footprintFromMeasuredBounds(bounds(2.09, 0.186))).toEqual({
      width: 2.09,
      depth: 0.186,
      offsetX: 0,
      offsetZ: 0,
    });
  });

  it('is owner-local, so it is the same whatever the prop’s yaw', () => {
    // A RoomFootprint rotates WITH its prop; taking the mesh's intrinsic
    // extents is therefore correct at any rotation, and the seed must not
    // reach for a world-space measurement that would change with yaw.
    const fp = footprintFromMeasuredBounds(bounds(2.09, 0.186));
    expect(fp.offsetX).toBe(0);
    expect(fp.offsetZ).toBe(0);
  });

  it('clamps to the range the room draft validates', () => {
    // A seeded footprint that the validator refuses would be worse than no
    // seeding at all: the author would be blocked by the builder's own
    // guess. Both ends are pinned against the shared constants.
    const thin = footprintFromMeasuredBounds(bounds(0.001, 0.02));
    expect(thin.width).toBe(FOOTPRINT_MINIMUM_EXTENT);
    expect(thin.depth).toBe(FOOTPRINT_MINIMUM_EXTENT);

    const huge = footprintFromMeasuredBounds(bounds(40, 99));
    expect(huge.width).toBe(FOOTPRINT_MAXIMUM_EXTENT);
    expect(huge.depth).toBe(FOOTPRINT_MAXIMUM_EXTENT);
  });

  it('hands back the old default when nothing was measured', () => {
    // Absent is not a guess: the author gets the box they always got, and
    // can size it, rather than a fabricated measurement.
    expect(footprintFromMeasuredBounds(undefined)).toEqual(UNSEEDED_FOOTPRINT);
  });

  it('treats an unusable measurement as unmeasured', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
      expect(footprintFromMeasuredBounds(bounds(bad, bad))).toEqual({
        width: 1,
        depth: 1,
        offsetX: 0,
        offsetZ: 0,
      });
    }
  });
});

describe('a multi-selection seeds one declaration per prop', () => {
  const measured = new Map<string, PropModelBounds>([
    ['wall-long', bounds(2.09, 0.186)],
    ['wall-short', bounds(1.5, 0.186)],
  ]);

  it('gives every selected prop its OWN box', () => {
    // The point of the slice. One shared default would hand the long wall the
    // short wall's blocker, which is the bug this replaces in a new costume.
    const declarations = seedDeclarations(['wall-long', 'wall-short'], (id) =>
      measured.get(id)
    );
    expect(declarations['wall-long'].footprint.width).toBe(2.09);
    expect(declarations['wall-short'].footprint.width).toBe(1.5);
  });

  it('asserts no blocking until the author says so', () => {
    const declarations = seedDeclarations(['wall-long'], (id) =>
      measured.get(id)
    );
    expect(declarations['wall-long'].blocksMovement).toBe(false);
    expect(declarations['wall-long'].blocksLineOfSight).toBe(false);
  });

  it('still produces a usable declaration for an unmeasured prop', () => {
    const declarations = seedDeclarations(['never-loaded'], () => undefined);
    expect(declarations['never-loaded'].footprint).toEqual(UNSEEDED_FOOTPRINT);
  });
});

describe('an authored edit lands on the whole selection', () => {
  const authored: RoomPropDeclaration = {
    blocksMovement: true,
    blocksLineOfSight: true,
    footprint: { width: 2, depth: 0.2, offsetX: 0, offsetZ: 0 },
  };

  it('writes the same declaration to every selected prop', () => {
    // This is what makes the blocking checkboxes do anything for more than one
    // prop: before, the commit path required a SINGLE selected prop, so the
    // controls were inert for a multi-selection.
    const next = declarationMapForSelection({}, ['a', 'b', 'c'], authored);
    expect(Object.keys(next).sort()).toEqual(['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) expect(next[id]).toEqual(authored);
  });

  it('never drops a blocker outside the selection', () => {
    const existing = { keep: { ...authored, blocksMovement: false } };
    const next = declarationMapForSelection(existing, ['a'], authored);
    expect(next.keep).toEqual(existing.keep);
    expect(next.a).toEqual(authored);
  });

  it('is a no-op for an empty selection', () => {
    const existing = { keep: authored };
    expect(declarationMapForSelection(existing, [], authored)).toEqual(
      existing
    );
  });
});
