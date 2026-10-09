// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  exactPoint,
  orientation,
  pointInRing,
  segmentContact,
} from './regionBoundaryPredicates';
const p = (x: number, z: number) => ({ x, z });
describe('certified boundary predicates, never epsilon connectivity', () => {
  it('certifies free-angle orientation at translations and scales', () => {
    for (const scale of [1e-100, 1, 1e100])
      expect(
        orientation(
          exactPoint(p(0, 0)),
          exactPoint(p(4 * scale, scale)),
          exactPoint(p(scale, 4 * scale))
        )
      ).toBe(1);
    expect(
      orientation(
        exactPoint(p(1e10, 1e10)),
        exactPoint(p(1e10 + 4, 1e10 + 1)),
        exactPoint(p(1e10 + 1, 1e10 + 4))
      )
    ).toBe(1);
  });
  it('refuses nearly collinear and angled T classifications without an exact certificate', () => {
    expect(
      orientation(exactPoint(p(0, 0)), exactPoint(p(4, 4)), exactPoint(p(2, 2)))
    ).toBe('uncertain');
    expect(segmentContact(p(0, 0), p(4, 4), p(2, 2), p(2, 4)).kind).toBe(
      'uncertain'
    );
  });
  it('certifies endpoints, axis T, proper crossings and disjoint representable gaps', () => {
    expect(segmentContact(p(0, 0), p(4, 0), p(2, 0), p(2, 4))).toMatchObject({
      kind: 'point',
      point: { point: p(2, 0) },
    });
    expect(segmentContact(p(0, 0), p(4, 1), p(4, 1), p(1, 4)).kind).toBe(
      'point'
    );
    const crossing = segmentContact(p(0, 0), p(4, 3), p(0, 3), p(4, 0));
    expect(crossing).toMatchObject({
      kind: 'point',
      point: { point: { x: 2, z: 1.5 } },
    });
    expect(
      segmentContact(p(0, 0), p(1, 0), p(1 + Number.EPSILON, 0), p(2, 0)).kind
    ).toBe('none');
    expect(segmentContact(p(0, 0), p(4, 0), p(2, 0), p(6, 0)).kind).toBe(
      'unsupported'
    );
  });
  it('classifies strict interiors, exterior and exact boundary', () => {
    const ring = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)].map(exactPoint);
    expect(pointInRing(ring, p(2, 2))).toBe('inside');
    expect(pointInRing(ring, p(5, 2))).toBe('outside');
    expect(pointInRing(ring, p(4, 2))).toBe('boundary');
  });
});
