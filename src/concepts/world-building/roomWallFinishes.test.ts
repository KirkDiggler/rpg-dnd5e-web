// @vitest-environment node
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import { moveMapLabel } from './mapLabelEdits';
import { setRegionWallFinish } from './regionFinishEdits';
import {
  finishRoomFixture,
  FIT_WALL_REF,
  GRAY_REF,
} from './roomFinishTestFixtures';
import {
  partitionFinishInterval,
  projectRoomWallFinishes,
} from './roomWallFinishes';
const image = {
  url: '/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 10,
  width: 1,
  height: 1,
};
const catalog: WorldMaterialCatalog = {
  kind: 'candidate',
  catalogSha256: 'a'.repeat(64),
  materials: [
    {
      ref: GRAY_REF,
      displayName: 'Gray',
      family: 'masonry',
      baseColor: image,
      normal: image,
      repeatMeters: [3.3, 3.3],
      normalScale: [1, 1],
      roughness: 0.5,
      metalness: 0,
    },
  ],
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

describe('room-facing finish chart projection', () => {
  it('measures offset face distance with fixed physical repeat and one noninteger closing seam', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    const before = structuredClone(draft),
      p = projectRoomWallFinishes(draft, catalog);
    expect(p.regions[0].status).toBe('ready');
    expect(p.regions[0].perimeter).toBeCloseTo(22.4);
    expect(p.spans).toHaveLength(4);
    const repeat = (3.3 * Math.sqrt(3)) / 5 / 0.3048;
    expect(
      p.spans.every((s) => Math.abs(s.chart.repeat[0] - repeat) < 1e-12)
    ).toBe(true);
    const north = p.spans.find((s) => s.wallId === 'north')!,
      east = p.spans.find((s) => s.wallId === 'east')!;
    const u = (s: typeof north, d: number) =>
      s.chart.phase + s.chart.direction * d;
    expect(u(north, 0.2)).toBeCloseTo(0);
    expect(u(north, 7.8)).toBeCloseTo(u(east, 0.2));
    const west = p.spans.find((s) => s.wallId === 'west')!;
    expect(u(west, 3.8)).toBeCloseTo(22.4);
    expect(22.4 / repeat).not.toBeCloseTo(Math.round(22.4 / repeat), 4);
    expect(
      projectRoomWallFinishes(
        moveMapLabel(draft, 'left-label', { x: 3, z: 2 }),
        catalog
      )
    ).toEqual(p);
    draft.room.walls!.reverse();
    expect(projectRoomWallFinishes(draft, catalog)).toEqual(p);
    draft.room.walls!.reverse();
    expect(draft).toEqual(before);
  });
  it('adds repeats on resize and preserves source-anchored phase through rotation', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    const before = projectRoomWallFinishes(draft, catalog);
    draft.room.walls = draft.room.walls!.map((wall) => ({
      ...wall,
      line: {
        start: {
          ...wall.line.start,
          x: wall.line.start.x === 8 ? 10 : wall.line.start.x,
        },
        end: {
          ...wall.line.end,
          x: wall.line.end.x === 8 ? 10 : wall.line.end.x,
        },
      },
    }));
    const resized = projectRoomWallFinishes(draft, catalog);
    expect(resized.regions[0].perimeter).toBeCloseTo(
      before.regions[0].perimeter! + 4
    );
    expect(resized.spans[0].chart).toEqual(before.spans[0].chart);
    const rotate = (p: { x: number; z: number }) => ({ x: -p.z, z: p.x });
    draft.room.walls = draft.room.walls!.map((wall) => ({
      ...wall,
      line: { start: rotate(wall.line.start), end: rotate(wall.line.end) },
    }));
    draft.scene.mapLabels = draft.scene.mapLabels!.map((label) => ({
      ...label,
      location: rotate(label.location),
    }));
    const rotated = projectRoomWallFinishes(draft, catalog);
    expect(rotated.regions[0].status).toBe('ready');
    expect(rotated.spans.map((s) => s.chart)).toEqual(
      resized.spans.map((s) => s.chart)
    );
    expect(rotated.regions[0].perimeter).toBeCloseTo(
      resized.regions[0].perimeter!
    );
  });

  it('keeps opposite faces and same-side source subintervals independent across two rooms', () => {
    let draft = setRegionWallFinish(finishRoomFixture(true), 'left', {
      materialRef: GRAY_REF,
    });
    draft = setRegionWallFinish(draft, 'right', { materialRef: GRAY_REF });
    const p = projectRoomWallFinishes(draft, catalog);
    expect(p.regions.map((r) => r.status)).toEqual(['ready', 'ready']);
    const shared = p.spans.filter((s) => s.wallId === 'divider');
    expect(new Set(shared.map((s) => s.side)).size).toBe(2);
    expect(shared.map((s) => s.chart.direction).sort()).toEqual([-1, 1]);
    const north = p.spans.filter((s) => s.wallId === 'north');
    expect(north.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 8],
    ]);
    expect(
      partitionFinishInterval(0, 8, north).map((s) => [
        s.start,
        s.end,
        s.finishes[0].regionId,
      ])
    ).toEqual([
      [0, 4, 'left'],
      [4, 8, 'right'],
    ]);
  });
  it('keeps phase across openings and requires explicit repair of a removed anchor', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    const before = projectRoomWallFinishes(draft, catalog);
    draft.room.walls![0] = {
      ...draft.room.walls![0],
      openings: [{ id: 'opening', position: 4, width: 2 }],
    };
    expect(projectRoomWallFinishes(draft, catalog)).toEqual(before);
    draft.scene.authoringRegions![0].wallFinish!.patternStart.incoming.wallId =
      'gone';
    const broken = projectRoomWallFinishes(draft, catalog);
    expect(broken.spans).toEqual([]);
    expect(broken.regions[0].reason).toMatch(/pattern start/);
  });
  it('reports missing resources, absent surface capability and collapsed offset path instead of partial application', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    expect(projectRoomWallFinishes(draft, null).regions[0].reason).toMatch(
      /unavailable/
    );
    expect(
      projectRoomWallFinishes(draft, { ...catalog, surfaces: [] }).spans
    ).toEqual([]);
    draft.room.walls!.forEach((w) => (w.appearance.thickness = 5));
    expect(projectRoomWallFinishes(draft, catalog).regions[0].reason).toMatch(
      /collapses/
    );
  });
  it('moves the seam only by explicit corner selection without changing repeat or perimeter', () => {
    const draft = setRegionWallFinish(finishRoomFixture(), 'left', {
      materialRef: GRAY_REF,
    });
    const before = projectRoomWallFinishes(draft, catalog);
    const moved = setRegionWallFinish(draft, 'left', {
      patternStart: before.regions[0].corners[1].reference,
    });
    const after = projectRoomWallFinishes(moved, catalog);
    expect(after.regions[0].perimeter).toBeCloseTo(
      before.regions[0].perimeter!
    );
    expect(after.regions[0].marker).not.toEqual(before.regions[0].marker);
    expect(after.spans.map((s) => s.chart.repeat)).toEqual(
      before.spans.map((s) => s.chart.repeat)
    );
  });
});
