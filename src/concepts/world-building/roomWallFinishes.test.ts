// @vitest-environment node
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import type { RoomWallFinish } from './regionFinishTypes';
import { regionLabelPoint } from './regionLabel';
import { paintCells, type RoomDraft } from './roomDraft';
import {
  finishRoomFixture,
  FIT_WALL_REF,
  GRAY_REF,
} from './roomFinishTestFixtures';
import {
  partitionFinishInterval,
  projectRoomWallFinishes,
  surfaceRepeatSceneUnits,
  type WallFinishSpan,
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

const FINISH: RoomWallFinish = {
  materialRef: GRAY_REF,
  patternStart: {
    incoming: { wallId: 'west', direction: 'end-to-start' },
    outgoing: { wallId: 'north', direction: 'start-to-end' },
  },
};

/** A region finish as a saved file carries it. No edit can choose one now:
 * regions are their cells and name no wall face (rpg-project#725). */
function carried(draft: RoomDraft, ...ids: string[]): RoomDraft {
  return {
    ...draft,
    scene: {
      ...draft.scene,
      version: 6,
      regionPresentation: Object.fromEntries(
        ids.map((id) => [id, { wallFinish: structuredClone(FINISH) }])
      ),
    },
  };
}

function span(
  regionId: string,
  side: WallFinishSpan['side'],
  start: number,
  end: number
): WallFinishSpan {
  return {
    regionId,
    wallId: 'north',
    side,
    start,
    end,
    provider: catalog.surfaces[0],
    material: catalog.materials[0],
    chart: {
      surfaceId: side === 'positive-z' ? 'front' : 'back',
      phase: 0,
      direction: side === 'positive-z' ? 1 : -1,
      repeat: surfaceRepeatSceneUnits(catalog.materials[0]),
      elevation: 0,
    },
  };
}

/*
 * The room-facing chart math (offset face distance, closing seam, phase
 * through resize/rotation/openings, explicit seam moves) ran only over a
 * certified wall boundary. No region is wall-bound now, so those charts never
 * apply; the tests that measured them are retired with the automatic regions.
 * What survives: a carried finish is reported unapplied, never partially
 * applied, and the interval partition stays a pure contract.
 */
describe('room-facing finish chart projection', () => {
  it('reports every region as none when nothing is finished and no catalog is loaded', () => {
    const draft = finishRoomFixture(true);
    expect(projectRoomWallFinishes(draft, null)).toEqual({
      regions: ['room-region', 'left', 'right'].map((id) => ({
        id,
        status: 'none',
        corners: [],
      })),
      spans: [],
    });
    expect(
      projectRoomWallFinishes(draft, catalog).regions.map((r) => r.status)
    ).toEqual(['none', 'none', 'none']);
  });

  it('shows a carried finish unapplied, with its reason at the painted region, and applies no span', () => {
    const draft = carried(
      paintCells(
        finishRoomFixture(true),
        [
          { q: 1, r: 1 },
          { q: 2, r: 1 },
        ],
        'left'
      ),
      'left',
      'right'
    );
    const before = structuredClone(draft);
    for (const source of [catalog, null]) {
      const p = projectRoomWallFinishes(draft, source);
      expect(p.spans).toEqual([]);
      const [implicit, left, right] = p.regions;
      expect(implicit).toEqual({
        id: 'room-region',
        status: 'none',
        corners: [],
      });
      expect(left).toEqual({
        id: 'left',
        status: 'unresolved',
        corners: [],
        reason: 'Wall boundary: not-wall-bound',
        diagnosticPoint: regionLabelPoint(draft.room.regions[1]),
      });
      // An unpainted region has nowhere to show its reason.
      expect(right).toEqual({
        id: 'right',
        status: 'unresolved',
        corners: [],
        reason: 'Wall boundary: not-wall-bound',
      });
    }
    expect(draft).toEqual(before);
  });
});

describe('finish interval partition', () => {
  it('cuts at every owned boundary inside the interval and keeps opposite faces independent', () => {
    const left = span('left', 'positive-z', 0, 4),
      right = span('right', 'positive-z', 4, 8),
      back = span('right', 'negative-z', 2, 8);
    expect(
      partitionFinishInterval(0, 8, [left, right]).map((s) => [
        s.start,
        s.end,
        s.finishes.map((f) => f.regionId),
      ])
    ).toEqual([
      [0, 4, ['left']],
      [4, 8, ['right']],
    ]);
    expect(
      partitionFinishInterval(1, 6, [left, right, back]).map((s) => [
        s.start,
        s.end,
        s.finishes.map((f) => f.side),
      ])
    ).toEqual([
      [1, 2, ['positive-z']],
      [2, 4, ['positive-z', 'negative-z']],
      [4, 6, ['positive-z', 'negative-z']],
    ]);
    expect(partitionFinishInterval(0, 8, [])).toEqual([
      { start: 0, end: 8, finishes: [] },
    ]);
  });

  it('refuses two owners of one wall side', () => {
    expect(() =>
      partitionFinishInterval(0, 8, [
        span('left', 'positive-z', 0, 6),
        span('right', 'positive-z', 4, 8),
      ])
    ).toThrow('Conflicting room finish ownership on one wall side.');
  });
});
