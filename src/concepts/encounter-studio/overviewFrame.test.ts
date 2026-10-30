import { describe, expect, it } from 'vitest';
import { contentWorkspace } from '../world-building/contentGrid';
import { createRegion } from '../world-building/regionEdits';
import { createRoomDraft, paintCells } from '../world-building/roomDraft';
import { workspaceBounds } from '../world-building/workspaceGeometry';
import { createLayoutTransform, worldToClient } from './layoutGeometry';
import { cellsBounds, contentBounds, frameOf } from './overviewFrame';

const viewport = { left: 0, top: 0, width: 1000, height: 600 };
const target = { minX: 10, maxX: 20, minZ: -5, maxZ: 5 };

describe('frameOf', () => {
  it('centres the target on the surface and fits it', () => {
    const frame = frameOf(target, viewport, 40)!;
    const transform = createLayoutTransform(viewport, frame, 40)!;
    const centre = worldToClient({ x: 15, z: 0 }, transform)!;
    expect(centre.x).toBeCloseTo(500);
    expect(centre.y).toBeCloseTo(300);
    const right = worldToClient({ x: 20, z: 5 }, transform)!;
    expect(right.y).toBeLessThanOrEqual(600);
  });

  it('fits and centres the target in the part an overlay leaves', () => {
    const frame = frameOf(target, viewport, 40, 0.9, { left: 0, right: 400 })!;
    const transform = createLayoutTransform(viewport, frame, 40)!;
    expect(worldToClient({ x: 15, z: 0 }, transform)!.x).toBeCloseTo(300);
    expect(worldToClient({ x: 20, z: 0 }, transform)!.x).toBeLessThanOrEqual(
      600
    );
  });
});

// "Show entire" frames the content (rpg-project#725 R3): the floor — every
// region's cells, not one region's — and the walls and placed nouns, or the
// empty grid when nothing is authored.
describe('contentBounds', () => {
  const blank = () =>
    createRoomDraft(
      { version: 1, id: 'scene', name: 'Room', items: [], groups: [] },
      'room'
    );

  it('frames the union of every region, wherever the cells were painted', () => {
    let draft = paintCells(blank(), [{ q: 0, r: 0 }]);
    draft = createRegion(draft, 'far', 'Far');
    draft = paintCells(draft, [{ q: 40, r: -10 }], 'far');
    expect(contentBounds(draft)).toEqual(
      cellsBounds([
        { q: 0, r: 0 },
        { q: 40, r: -10 },
      ])
    );
  });

  it('falls back to the empty grid when nothing is authored', () => {
    expect(contentBounds(blank())).toEqual(
      workspaceBounds(contentWorkspace(blank()))
    );
  });
});
