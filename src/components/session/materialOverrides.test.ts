import { create } from '@bufbuild/protobuf';
import {
  AtlasStructuralWallSchema,
  PropPresentationSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
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
  it('refuses malformed lists before caching or drawing a partial appearance', () => {
    const w = wall();
    w.materialOverrides.push({ ...w.materialOverrides[0] });
    expect(() => structuralWallSurfaceFromAtlas(w, 1)).toThrow(/material/i);
    const p = prop();
    p.materialOverrides[0].materialRef = '';
    expect(() => applyPropPresentations([], [p])).toThrow(/material/i);
  });
});
