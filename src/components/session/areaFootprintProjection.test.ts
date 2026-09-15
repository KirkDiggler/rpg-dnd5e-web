import {
  FootprintOrigin,
  FootprintShape,
  type Footprint,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  areaFootprintProjection,
  FEET_PER_HEX,
} from './areaFootprintProjection';

function footprint(
  shape: FootprintShape,
  origin: FootprintOrigin,
  sizeFeet = 15
): Footprint {
  return {
    $typeName: 'dnd5e.api.session.v1alpha1.Footprint',
    shape,
    origin,
    sizeFeet,
  };
}

describe('areaFootprintProjection', () => {
  it('matches the toolkit pointy-top feet scale and caster-edge box placement', () => {
    const projection = areaFootprintProjection({
      footprint: footprint(FootprintShape.BOX, FootprintOrigin.CASTER_EDGE),
      caster: { x: 0, y: 0, z: 0 },
      aimed: { x: 0, y: -1, z: 1 },
      hexSize: 1,
    });

    expect(FEET_PER_HEX).toBe(5);
    expect(projection?.kind).toBe('box');
    if (projection?.kind !== 'box') return;
    expect(projection.center.x).toBeCloseTo(Math.sqrt(3));
    expect(projection.center.z).toBeCloseTo(3);
    expect(projection.depth).toBeCloseTo(3 * Math.sqrt(3));
    expect(projection.width).toBeCloseTo(3 * Math.sqrt(3));
    expect(projection.rotationY).toBeCloseTo(-Math.PI / 3);
  });

  it('centres a caster radius and converts its feet to across-flats world scale', () => {
    const projection = areaFootprintProjection({
      footprint: footprint(FootprintShape.RADIUS, FootprintOrigin.CASTER, 10),
      caster: { x: 2, y: -3, z: 1 },
      aimed: null,
      hexSize: 2,
    });

    expect(projection).toEqual({
      kind: 'radius',
      center: { x: 5 * Math.sqrt(3), z: 3 },
      radius: 4 * Math.sqrt(3),
      rotationY: 0,
    });
  });

  it('does not guess a direction when a caster-edge box is aimed at self', () => {
    expect(
      areaFootprintProjection({
        footprint: footprint(FootprintShape.BOX, FootprintOrigin.CASTER_EDGE),
        caster: { x: 1, y: -1, z: 0 },
        aimed: { x: 1, y: -1, z: 0 },
        hexSize: 1,
      })
    ).toBeNull();
  });

  it.each([
    ['absent', undefined],
    [
      'unsupported combination',
      footprint(FootprintShape.BOX, FootprintOrigin.CASTER),
    ],
    [
      'unknown shape',
      footprint(999 as FootprintShape, FootprintOrigin.CASTER_EDGE),
    ],
    [
      'unspecified origin',
      footprint(FootprintShape.BOX, FootprintOrigin.UNSPECIFIED),
    ],
    [
      'zero size',
      footprint(FootprintShape.BOX, FootprintOrigin.CASTER_EDGE, 0),
    ],
  ])('returns no misleading outline for an %s footprint', (_label, value) => {
    expect(
      areaFootprintProjection({
        footprint: value,
        caster: { x: 0, y: 0, z: 0 },
        aimed: { x: 1, y: -1, z: 0 },
        hexSize: 1,
      })
    ).toBeNull();
  });
});
