// @vitest-environment node
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import { setRegionWallFinish } from './regionFinishEdits';
import {
  finishRoomFixture,
  finishWall,
  FIT_WALL_REF,
  GRAY_REF,
} from './roomFinishTestFixtures';
import { projectRoomWallFinishes } from './roomWallFinishes';
import { setWallFinishes } from './wallFinishEdits';
import { projectWallFinishes } from './wallFinishProjection';
const small = 'dnd5e:material:test:small_gray';
const image = {
  url: '/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 10,
  width: 1,
  height: 1,
};
const material = {
  ref: GRAY_REF,
  displayName: 'Gray',
  family: 'masonry',
  baseColor: image,
  normal: image,
  repeatMeters: [3.3, 3.3] as [number, number],
  normalScale: [1, 1] as [number, number],
  roughness: 0.5,
  metalness: 0,
};
const catalog: WorldMaterialCatalog = {
  kind: 'candidate',
  catalogSha256: 'a'.repeat(64),
  materials: [material, { ...material, ref: small, repeatMeters: [1.7, 1.7] }],
  surfaces: [
    {
      assetRef: FIT_WALL_REF,
      glbSha256: 'b'.repeat(64),
      bindings: [
        {
          id: 'front',
          node: 'WallBody_v1',
          material: 'Front',
          side: 'positive-z',
          family: 'masonry',
        },
        {
          id: 'back',
          node: 'WallBody_v1',
          material: 'Back',
          side: 'negative-z',
          family: 'masonry',
        },
      ],
    },
  ],
};
describe('wall choices over optional room defaults', () => {
  it('finishes both sides of a standalone wall with no region and fixed Start-relative phase', () => {
    const draft = finishRoomFixture();
    delete draft.scene.authoringRegions;
    delete draft.scene.mapLabels;
    draft.room.walls = [draft.room.walls![0]];
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': GRAY_REF,
      'negative-z': small,
    });
    const before = structuredClone(draft),
      p = projectWallFinishes(draft, catalog);
    expect(p.regions).toEqual([]);
    expect(p.walls.map((w) => w.status)).toEqual(['ready', 'ready']);
    expect(
      p.spans.map((s) => [
        s.start,
        s.end,
        s.regionId,
        s.chart.phase,
        s.chart.direction,
      ])
    ).toEqual([
      [0, 8, undefined, 0, 1],
      [0, 8, undefined, 0, -1],
    ]);
    expect(p.spans.map((s) => s.material.ref)).toEqual([GRAY_REF, small]);
    expect(draft).toEqual(before);
    draft.room.walls = [
      {
        ...draft.room.walls![0],
        line: { start: { x: 0, z: 0 }, end: { x: 0, z: 10 } },
      },
    ];
    const resized = projectWallFinishes(draft, catalog);
    expect(resized.spans.map((s) => s.chart)).toEqual(
      p.spans.map((s) => s.chart)
    );
    expect(resized.spans.map((s) => s.end)).toEqual([10, 10]);
  });
  it('handles a projecting wall without requiring it to be a certified room boundary', () => {
    const draft = finishRoomFixture();
    draft.room.walls!.push(finishWall('stub', { x: 2, z: 0 }, { x: 2, z: 2 }));
    draft.scene = setWallFinishes(draft.scene, 'stub', {
      'positive-z': GRAY_REF,
      'negative-z': GRAY_REF,
    });
    const p = projectWallFinishes(draft, catalog);
    expect(p.spans.filter((s) => s.wallId === 'stub')).toHaveLength(2);
    expect(p.walls.every((s) => s.status === 'ready')).toBe(true);
  });
  it('overrides all face intervals, retaining each resolved room chart and using a local chart for an unowned tail', () => {
    let draft = finishRoomFixture(true);
    draft.room.walls![0] = {
      ...draft.room.walls![0],
      line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    };
    draft = setRegionWallFinish(
      setRegionWallFinish(draft, 'left', { materialRef: GRAY_REF }),
      'right',
      { materialRef: GRAY_REF }
    );
    const defaults = projectRoomWallFinishes(draft, catalog),
      base = defaults.spans.filter((s) => s.wallId === 'north');
    expect(base).toHaveLength(2);
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': small,
    });
    const p = projectWallFinishes(draft, catalog),
      north = p.spans.filter((s) => s.wallId === 'north');
    expect(north.map((s) => [s.start, s.end, s.regionId])).toEqual([
      [0, 4, 'left'],
      [4, 8, 'right'],
      [8, 10, undefined],
    ]);
    for (let i = 0; i < 2; i++) {
      expect(north[i].chart.phase).toBe(base[i].chart.phase);
      expect(north[i].chart.direction).toBe(base[i].chart.direction);
      expect(north[i].chart.repeat[0]).not.toBe(base[i].chart.repeat[0]);
    }
    expect(north[2].chart.phase).toBe(0);
    expect(north.every((s) => s.material.ref === small)).toBe(true);
    expect(p.spans.filter((s) => s.wallId !== 'north')).toEqual(
      defaults.spans.filter((s) => s.wallId !== 'north')
    );
    draft.scene = setWallFinishes(draft.scene, 'north', { 'positive-z': null });
    expect(projectWallFinishes(draft, catalog).spans).toEqual(defaults.spans);
  });
  it('never hides an invalid explicit choice behind a valid room default, and leaves the other face independent', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': 'dnd5e:material:missing:look',
      'negative-z': small,
    });
    const p = projectWallFinishes(draft, catalog);
    expect(p.walls.find((w) => w.side === 'positive-z')?.status).toBe(
      'unresolved'
    );
    expect(
      p.spans.filter((s) => s.wallId === 'north').map((s) => s.material.ref)
    ).toEqual([small]);
    expect(
      projectWallFinishes(draft, null).walls.every(
        (w) => w.status === 'unresolved'
      )
    ).toBe(true);
  });
  it('keeps room-only behavior unchanged and refuses an unenrolled wall rather than inferring capability', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    expect(projectWallFinishes(draft, catalog)).toEqual({
      ...projectRoomWallFinishes(draft, catalog),
      walls: [],
    });
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': GRAY_REF,
    });
    draft.room.walls![0].appearance.assetRef =
      'dnd5e:env:dark-fortress:45_wall_01';
    expect(projectWallFinishes(draft, catalog).walls[0].reason).toMatch(
      /compatible/
    );
  });
});
