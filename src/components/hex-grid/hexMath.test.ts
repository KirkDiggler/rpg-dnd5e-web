import { describe, expect, it } from 'vitest';
import { HEX_SIZE, hexCorners, hexEdgeBetween } from './hexMath';

describe('hexCorners', () => {
  it('returns 6 corners at the expected pointy-top angles for a unit hex at the origin', () => {
    const corners = hexCorners({ x: 0, z: 0 }, 1);
    expect(corners).toHaveLength(6);
    // angle = 30deg (i=0): (cos30, -sin30)
    expect(corners[0]!.x).toBeCloseTo(0.866, 3);
    expect(corners[0]!.z).toBeCloseTo(-0.5, 3);
    // angle = 90deg (i=1): (cos90, -sin90) = (0, -1)
    expect(corners[1]!.x).toBeCloseTo(0, 3);
    expect(corners[1]!.z).toBeCloseTo(-1, 3);
  });

  it('offsets by the given center', () => {
    const corners = hexCorners({ x: 5, z: -3 }, 1);
    expect(corners[1]!.x).toBeCloseTo(5, 3);
    expect(corners[1]!.z).toBeCloseTo(-4, 3);
  });
});

describe('hexEdgeBetween', () => {
  it('finds the shared corner pair between a hex and its E neighbor, rotationY aligned to that edge', () => {
    // (0,0,0) and its E neighbor (1,-1,0) — HEX_DIRECTIONS[0].
    const edge = hexEdgeBetween(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      HEX_SIZE
    );
    // The shared edge sits at world x ≈ sqrt(3)/2 ≈ 0.866, spanning z from
    // +0.5 to -0.5 (worked out by hand against hexCorners' angle table).
    expect(edge.a.x).toBeCloseTo(0.866, 2);
    expect(edge.a.z).toBeCloseTo(0.5, 2);
    expect(edge.b.x).toBeCloseTo(0.866, 2);
    expect(edge.b.z).toBeCloseTo(-0.5, 2);
    expect(edge.mid.x).toBeCloseTo(0.866, 2);
    expect(edge.mid.z).toBeCloseTo(0, 2);
    // a->b runs in -z, matching a rotationY of +90deg (local +X -> world -z).
    expect(edge.rotationY).toBeCloseTo(Math.PI / 2, 3);
  });

  it('produces a symmetric mid point regardless of which hex is "A"', () => {
    const forward = hexEdgeBetween(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      HEX_SIZE
    );
    const backward = hexEdgeBetween(
      { x: 1, y: -1, z: 0 },
      { x: 0, y: 0, z: 0 },
      HEX_SIZE
    );
    expect(backward.mid.x).toBeCloseTo(forward.mid.x, 5);
    expect(backward.mid.z).toBeCloseTo(forward.mid.z, 5);
  });

  it('scales with hexSize', () => {
    const unit = hexEdgeBetween({ x: 0, y: 0, z: 0 }, { x: 1, y: -1, z: 0 }, 1);
    const doubled = hexEdgeBetween(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      2
    );
    expect(doubled.mid.x).toBeCloseTo(unit.mid.x * 2, 3);
    expect(doubled.a.x).toBeCloseTo(unit.a.x * 2, 3);
  });
});
