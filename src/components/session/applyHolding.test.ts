import { create } from '@bufbuild/protobuf';
import {
  DroppedSchema,
  TakenSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { applyDropped, applyTaken, takenProp } from './applyHolding';

/** Two props on the floor: the artifact, named, and a pillar the author
 * never named — the second is what proves the patch works on IDS and not
 * on refs or on array position. */
function atlasWithHeirloom(): GetAtlasResponse {
  return create(GetAtlasResponseSchema, {
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    props: [
      {
        id: 'heirloom',
        ref: 'dnd5e:props:reliquary',
        at: { x: 1, y: 0 },
        blocksMovement: false,
        blocksLineOfSight: false,
        facing: 'ne',
        offsetX: 0.25,
        offsetZ: 1.5,
      },
      {
        ref: 'dnd5e:props:pillar',
        at: { x: 0, y: 0 },
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ],
  });
}

const propIds = (atlas: GetAtlasResponse) => atlas.props.map((p) => p.id);

describe('applyTaken — the prop leaves the floor for everyone', () => {
  it('removes the prop with that placement id and nothing else', () => {
    const before = atlasWithHeirloom();
    const after = applyTaken(
      before,
      create(TakenSchema, { taker: 'aldric', prop: 'heirloom' })
    );
    expect(propIds(after)).toEqual(['']);
    expect(after.props[0].ref).toBe('dnd5e:props:pillar');
    // The cells, regions and everything else are untouched: a thing
    // leaving the floor is not a change to the floor.
    expect(after.cells).toEqual(before.cells);
  });

  it('leaves the caller’s atlas alone', () => {
    const before = atlasWithHeirloom();
    applyTaken(before, create(TakenSchema, { prop: 'heirloom' }));
    expect(propIds(before)).toEqual(['heirloom', '']);
  });

  it('removes nothing for an id this atlas never held', () => {
    const before = atlasWithHeirloom();
    const after = applyTaken(before, create(TakenSchema, { prop: 'crown' }));
    expect(propIds(after)).toEqual(['heirloom', '']);
  });

  it('never removes an unnamed prop, whatever the beat says', () => {
    // An empty `prop` must not match the pillar's empty id — that would
    // clear a prop nobody picked up.
    const after = applyTaken(atlasWithHeirloom(), create(TakenSchema, {}));
    expect(propIds(after)).toEqual(['heirloom', '']);
  });

  it('reports what it would remove, for the caller to remember', () => {
    const before = atlasWithHeirloom();
    expect(
      takenProp(before, create(TakenSchema, { prop: 'heirloom' }))?.ref
    ).toBe('dnd5e:props:reliquary');
    expect(
      takenProp(before, create(TakenSchema, { prop: 'crown' }))
    ).toBeUndefined();
    expect(takenProp(before, create(TakenSchema, {}))).toBeUndefined();
  });
});

describe('applyDropped — it lands where the carrier stood (R9)', () => {
  it('puts the remembered prop back at the drop cell, whole', () => {
    const before = atlasWithHeirloom();
    const remembered = takenProp(
      before,
      create(TakenSchema, { prop: 'heirloom' })
    );
    const taken = applyTaken(before, create(TakenSchema, { prop: 'heirloom' }));
    const after = applyDropped(
      taken,
      create(DroppedSchema, {
        member: 'aldric',
        prop: 'heirloom',
        at: { x: 5, y: 7 },
      }),
      remembered
    );
    const landed = after.props.find((p) => p.id === 'heirloom');
    expect(landed?.at).toEqual(expect.objectContaining({ x: 5, y: 7 }));
    // Everything the client knew about the thing comes back with it —
    // the ref is what draws it, and `Dropped` does not carry one.
    expect(landed?.ref).toBe('dnd5e:props:reliquary');
    expect(landed?.facing).toBe('ne');
    expect(landed?.offsetX).toBeCloseTo(0.25);
    expect(landed?.offsetZ).toBeCloseTo(1.5);
    // And the authored cell is NOT where it is: it lies where it fell.
    expect(landed?.at?.x).not.toBe(1);
  });

  it('places the id and the cell alone when nothing was remembered', () => {
    // A client that joined after the pick-up never saw the prop. It still
    // places what the beat says — the refetch fills the ref in a moment.
    const after = applyDropped(
      create(GetAtlasResponseSchema, {}),
      create(DroppedSchema, { prop: 'heirloom', at: { x: 2, y: 2 } })
    );
    expect(after.props).toHaveLength(1);
    expect(after.props[0].id).toBe('heirloom');
    expect(after.props[0].ref).toBe('');
    expect(after.props[0].at).toEqual(expect.objectContaining({ x: 2, y: 2 }));
  });

  it('draws one reliquary when the beat arrives twice', () => {
    const beat = create(DroppedSchema, {
      prop: 'heirloom',
      at: { x: 5, y: 7 },
    });
    const once = applyDropped(create(GetAtlasResponseSchema, {}), beat);
    const twice = applyDropped(once, beat);
    expect(twice.props.filter((p) => p.id === 'heirloom')).toHaveLength(1);
  });

  it('moves nothing when the beat carries no cell', () => {
    // Placing it at the origin would be a guess about where it lies.
    const before = atlasWithHeirloom();
    expect(applyDropped(before, create(DroppedSchema, { prop: 'x' }))).toBe(
      before
    );
  });

  it('leaves the caller’s atlas alone', () => {
    const before = create(GetAtlasResponseSchema, {});
    applyDropped(
      before,
      create(DroppedSchema, { prop: 'heirloom', at: { x: 1, y: 1 } })
    );
    expect(before.props).toHaveLength(0);
  });
});
