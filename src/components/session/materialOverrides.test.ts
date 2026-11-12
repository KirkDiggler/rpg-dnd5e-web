import { create } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralWallSchema,
  PropPresentationSchema,
  StructuralWallOpeningsReplacementSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { applyStructuralRecords } from './applyReveal';
import {
  applyPropPresentations,
  propPresentationItem,
} from './propPresentations';
import { structuralWallSurfaceFromAtlas } from './structuralLayout';
const choice = {
  surfaceId: 'atlas',
  materialRef: 'dnd5e:material:fantasy-kingdom:atlas_04_c',
};
const wall = () =>
  create(AtlasStructuralWallSchema, {
    id: 'wall',
    ref: 'wall-model',
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 3,
    thickness: 0.3,
    materialOverrides: [choice],
  });
const prop = () =>
  create(PropPresentationSchema, {
    id: 'prop',
    ref: 'prop-model',
    origin: { x: 0, y: 0 },
    heightScale: 1,
    materialOverrides: [choice],
  });
describe('captured material choices in play adapters', () => {
  it('carries detached explicit scopes from both owners without querying source', () => {
    const w = wall(),
      p = prop();
    const surface = structuralWallSurfaceFromAtlas(w, 1),
      item = propPresentationItem(p, 1);
    expect(surface.appearance.materialOverrides).toEqual([choice]);
    expect(item.materialOverrides).toEqual([choice]);
    w.materialOverrides[0].materialRef = 'later';
    p.materialOverrides[0].materialRef = 'later';
    expect(surface.appearance.materialOverrides?.[0].materialRef).toBe(
      choice.materialRef
    );
    expect(item.materialOverrides?.[0].materialRef).toBe(choice.materialRef);
  });
  it('carries detached face choices and keeps them across an opening-only update', () => {
    const w = wall();
    w.faceFinishes = create(AtlasStructuralWallSchema, {
      faceFinishes: [
        { side: 'positive-z', materialRef: 'look:brick' },
        { side: 'negative-z', materialRef: 'look:stucco' },
      ],
    }).faceFinishes;
    const surface = structuralWallSurfaceFromAtlas(w, 1);
    expect(surface.faceFinishes).toEqual({
      'positive-z': 'look:brick',
      'negative-z': 'look:stucco',
    });
    w.faceFinishes[0].materialRef = 'source:changed';
    expect(surface.faceFinishes?.['positive-z']).toBe('look:brick');
    const changedOpenings = applyStructuralRecords(
      create(GetAtlasResponseSchema, { structuralWalls: [w] }),
      [],
      [],
      [
        create(StructuralWallOpeningsReplacementSchema, {
          wallId: w.id,
          openings: [{ id: 'gap', position: 4, width: 1 }],
        }),
      ]
    );
    expect(
      structuralWallSurfaceFromAtlas(changedOpenings.structuralWalls[0], 1)
        .faceFinishes
    ).toEqual({ 'positive-z': 'source:changed', 'negative-z': 'look:stucco' });
  });
  it('refuses duplicate or invalid face facts rather than dropping them', () => {
    for (const faces of [
      [{ side: 'front', materialRef: 'look' }],
      [{ side: 'positive-z', materialRef: ' ' }],
      [
        { side: 'positive-z', materialRef: 'one' },
        { side: 'positive-z', materialRef: 'two' },
      ],
    ]) {
      const w = wall();
      w.faceFinishes = create(AtlasStructuralWallSchema, {
        faceFinishes: faces,
      }).faceFinishes;
      expect(() => structuralWallSurfaceFromAtlas(w, 1)).toThrow(/face/i);
    }
  });
  it('refuses malformed lists before caching or drawing a partial appearance', () => {
    const w = wall();
    w.materialOverrides.push({ ...w.materialOverrides[0] });
    expect(() => structuralWallSurfaceFromAtlas(w, 1)).toThrow(/material/i);
    const p = prop();
    p.materialOverrides[0].materialRef = '';
    expect(() => applyPropPresentations([], [p])).toThrow(/material/i);
  });
});
