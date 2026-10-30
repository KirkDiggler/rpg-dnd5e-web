// @vitest-environment node
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { describe, expect, it, vi } from 'vitest';
import { worldToClient } from '../encounter-studio/layoutGeometry';
import type { RoomDraft } from './roomDraft';
import {
  finishRoomFixture,
  finishWall,
  FIT_WALL_REF,
  GRAY_REF,
} from './roomFinishTestFixtures';
import * as roomCharts from './roomWallFinishes';
import {
  projectRoomWallFinishes,
  surfaceRepeatSceneUnits,
  type WallFinishSpan,
} from './roomWallFinishes';
import { setWallFinishes } from './wallFinishEdits';
import {
  projectWallFinishes,
  wallFaceGuidePoints,
} from './wallFinishProjection';
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
/** A region finish as a saved file carries it. No edit can choose one now —
 * no region is wall-bound (rpg-project#725) — so it is carried, unapplied. */
function carried(draft: RoomDraft, ...ids: string[]): RoomDraft {
  return {
    ...draft,
    scene: {
      ...draft.scene,
      version: 6,
      regionPresentation: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            wallFinish: {
              materialRef: GRAY_REF,
              patternStart: {
                incoming: {
                  wallId: 'west',
                  direction: 'end-to-start' as const,
                },
                outgoing: {
                  wallId: 'north',
                  direction: 'start-to-end' as const,
                },
              },
            },
          },
        ])
      ),
    },
  };
}
function regionSpan(
  regionId: string,
  start: number,
  end: number
): WallFinishSpan {
  return {
    regionId,
    wallId: 'north',
    side: 'positive-z',
    start,
    end,
    provider: catalog.surfaces[0],
    material: catalog.materials[0],
    chart: {
      surfaceId: 'front',
      phase: start,
      direction: 1,
      repeat: surfaceRepeatSceneUnits(catalog.materials[0]),
      elevation: 0,
    },
  };
}

describe('wall choices over optional room defaults', () => {
  it('fails closed if a region-chart provider violates the certified non-overlap contract', () => {
    const draft = finishRoomFixture();
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': small,
    });
    const defaults = projectRoomWallFinishes(draft, catalog);
    // Fault injection at the producer boundary, not a claim that valid authored
    // regions can overlap. No region is wall-bound now (rpg-project#725), so
    // the provider rows are built by hand. Pin the guard to its failure path.
    const provider = vi
      .spyOn(roomCharts, 'projectRoomWallFinishes')
      .mockReturnValue({
        ...defaults,
        spans: [
          regionSpan('left', 0, 8),
          regionSpan('overlapping-provider-row', 0, 8),
        ],
      });
    try {
      const projected = projectWallFinishes(draft, catalog);
      expect(projected.walls).toEqual([
        {
          wallId: 'north',
          side: 'positive-z',
          status: 'unresolved',
          reason: 'Conflicting region charts on one wall face.',
        },
      ]);
      expect(
        projected.spans.some(
          (span) => span.wallId === 'north' && span.side === 'positive-z'
        )
      ).toBe(false);
    } finally {
      provider.mockRestore();
    }
  });
  it('keeps A on positive local Z and B on negative local Z through rotation and Layout projection', () => {
    const wall = finishRoomFixture().room.walls![0];
    const east = wallFaceGuidePoints(wall);
    expect(east).toEqual({ a: { x: 4, z: 0.5 }, b: { x: 4, z: -0.5 } });
    const transform = {
      bounds: { left: 0, top: 0, width: 800, height: 600 },
      center: { x: 0, z: 0 },
      scale: 20,
    };
    expect(worldToClient(east.a, transform)!.y).toBeGreaterThan(
      worldToClient(east.b, transform)!.y
    );
    const rotated = wallFaceGuidePoints({
      ...wall,
      line: { start: { x: 0, z: 0 }, end: { x: 0, z: 8 } },
    });
    expect(rotated).toEqual({ a: { x: -0.5, z: 4 }, b: { x: 0.5, z: 4 } });
  });
  it('finishes both sides of a standalone wall with no region chart and fixed Start-relative phase', () => {
    const draft = finishRoomFixture();
    draft.room.walls = [draft.room.walls![0]];
    draft.scene = setWallFinishes(draft.scene, 'north', {
      'positive-z': GRAY_REF,
      'negative-z': small,
    });
    const before = structuredClone(draft),
      p = projectWallFinishes(draft, catalog);
    // Regions are always listed now (rpg-project#725); unfinished, they lend
    // no chart.
    expect(p.regions.every((r) => r.status === 'none')).toBe(true);
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
  // Carried region finishes never resolve a chart now (rpg-project#725), so
  // an explicit choice covers the whole face with the wall's local chart.
  it('overrides the whole face with a local chart while carried region finishes stay unapplied', () => {
    let draft = carried(finishRoomFixture(true), 'left', 'right');
    draft.room.walls![0] = {
      ...draft.room.walls![0],
      line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    };
    const defaults = projectRoomWallFinishes(draft, catalog);
    expect(defaults.spans).toEqual([]);
    draft = {
      ...draft,
      scene: setWallFinishes(draft.scene, 'north', { 'positive-z': small }),
    };
    const p = projectWallFinishes(draft, catalog),
      north = p.spans.filter((s) => s.wallId === 'north');
    expect(north.map((s) => [s.start, s.end, s.regionId])).toEqual([
      [0, 10, undefined],
    ]);
    expect(north[0].chart.phase).toBe(0);
    expect(north[0].material.ref).toBe(small);
    expect(p.regions).toEqual(defaults.regions);
    draft.scene = setWallFinishes(draft.scene, 'north', { 'positive-z': null });
    expect(projectWallFinishes(draft, catalog).spans).toEqual(defaults.spans);
  });
  it('never hides an invalid explicit choice behind a carried room default, and leaves the other face independent', () => {
    const draft = carried(finishRoomFixture(), 'left');
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
    const draft = carried(finishRoomFixture(), 'left');
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
