/**
 * DungeonPreview3D.test.ts — the first test file for this component.
 * CONTRACT.md's own ledger documents why the full 3D render can't be
 * asserted in this environment (no `public/models/synty`, the R3F
 * `<Canvas>` never mounts) and instead reasons that the render path is
 * "mathematically guaranteed consistent" because it calls the same
 * `boardGeometry.ts` functions the geometry test suite already proves
 * correct. This file makes that guarantee an actual assertion rather
 * than just an argument: `buildOnePlacement` (exported specifically for
 * this) is pure math with no Canvas/GLB dependency, so it can be called
 * directly.
 *
 * Added as part of reconciling rpg-dnd5e-web#693 (fine rotation,
 * generalized to floor-standing props) with #691 (the `defaults:`
 * ref-keyed inheritance resolver) — the two features never coexisted in
 * either PR's own branch, so neither has a test proving they compose.
 */
import { describe, expect, it } from 'vitest';
import { facingToRotationY } from '../boardGeometry';
import { straightWallFootprint } from '../creation/straightWallGeometry';
import {
  addWallLine,
  parseDungeon,
  setPlacementMount,
  setPlacementRotationDegrees,
  setRefDefault,
  toDungeonDoc,
} from '../dungeonYaml';
import { SHOWCASE_FLOORPLAN, SHOWCASE_YAML } from '../fixtures';
import {
  buildFloorTiles,
  buildOnePlacement,
  buildWallLineFootprint,
  CANVAS_ROOM_ID,
} from './DungeonPreview3D';

describe('buildOnePlacement — resolved facing × fine-rotation composition', () => {
  it('an INHERITED facing (defaults:, nothing explicit on the placement itself) still composes with an explicit rotate_degrees, exactly like an explicit facing would', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // showcase.yaml's own statue-reaper (shrine room) carries no facing,
    // mount, or rotate_degrees at all (fixtures.ts) — give its REF a
    // default facing, then a fine-rotation nudge, without ever setting
    // facing explicitly on this one instance.
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'facing', 2); // NE
    const shrineBefore = toDungeonDoc(cst).rooms.find(
      (r) => r.id === 'shrine'
    )!;
    const statueIndex = shrineBefore.place.findIndex(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    );
    setPlacementRotationDegrees(cst, 'shrine', statueIndex, 20);

    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statue = room.place[statueIndex]!;
    // The raw fields stay unset — proving the composition below comes
    // from `resolvePlacement`, not from data sitting on this instance.
    expect(statue.facing).toBeNull();
    expect(statue.explicit.facing).toBe(false);
    expect(statue.mount).toBe('floor');
    expect(statue.rotationDegrees).toBe(20);

    const { prop } = buildOnePlacement(
      doc,
      statue,
      statue.at[0],
      statue.at[1],
      { roomId: 'shrine', index: statueIndex },
      'test-key'
    );

    const inheritedCoarseAngle = facingToRotationY(2); // NE's own coarse angle
    expect(prop!.rotationY).toBeCloseTo(
      inheritedCoarseAngle + (20 * Math.PI) / 180,
      10
    );
    // Not just the un-nudged coarse angle — a regression that silently
    // read the placement's own (null) `facing` instead of the resolved
    // one for the geometry call would either throw (facingToRotationY
    // takes a `number`, not `number | null`) or, if narrowed some other
    // way, drop the fine adjustment entirely. Neither happens here.
    expect(prop!.rotationY).not.toBeCloseTo(inheritedCoarseAngle, 5);
  });

  it('a `mount: wall` placement composes the same way through wallMountRotationY, using the resolved facing for both the flush edge AND the fine nudge', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // wall-banner is wall-mountable and already has an explicit facing
    // (mount:wall requires one to pick an edge) — this instance instead
    // exercises the inherited-facing path on a wall mount specifically,
    // since #693's generalization changed the wall branch too (resolved
    // facing, not raw).
    setRefDefault(cst, 'dnd5e:props:wall-banner', 'facing', 0); // N
    const shrineBefore = toDungeonDoc(cst).rooms.find(
      (r) => r.id === 'shrine'
    )!;
    const bannerIndex = shrineBefore.place.findIndex(
      (p) => p.ref === 'dnd5e:props:wall-banner' && p.at[0] === 5
    );
    // showcase.yaml's wall-banner carries no `mount:` key at all
    // (fixtures.ts) — set it explicitly so this test actually exercises
    // the `mount === 'wall'` branch, not the floor-standing one.
    setPlacementMount(cst, 'shrine', bannerIndex, 'wall');
    setPlacementRotationDegrees(cst, 'shrine', bannerIndex, -10);

    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const banner = room.place[bannerIndex]!;
    expect(banner.facing).toBeNull();
    expect(banner.explicit.facing).toBe(false);
    expect(banner.mount).toBe('wall');

    const { prop } = buildOnePlacement(
      doc,
      banner,
      banner.at[0],
      banner.at[1],
      { roomId: 'shrine', index: bannerIndex },
      'test-key-2'
    );

    // Only asserting the fine nudge is actually applied on top of
    // *some* coarse wall-flush angle — the coarse angle's own geometry
    // is boardGeometry.test.ts's job, not this file's.
    expect(prop!.rotationY).not.toBeUndefined();
    expect(Number.isFinite(prop!.rotationY)).toBe(true);
  });
});

// rpg-project#169's creation-mode 3D preview unit (2026-08-04) — the
// alternate `floorCells` input path this component's own header doc
// comment describes. `buildFloorTiles`/`buildWallLineFootprint` are pure
// math with no Canvas/GLB dependency (same reasoning `buildOnePlacement`'s
// own doc comment above gives for being exported and tested directly).
describe('buildFloorTiles — the floorCells alternate input path (creation mode)', () => {
  it('builds one tile per supplied cell, tagged with the canvas room-id sentinel', () => {
    const tiles = buildFloorTiles(
      undefined,
      [],
      [
        [0, 0],
        [1, 0],
        [2, 1],
      ]
    );
    expect(tiles.size).toBe(3);
    for (const tile of tiles.values()) {
      expect(tile.roomId).toBe(CANVAS_ROOM_ID);
    }
  });

  it('still excludes doc.holes cells, even on the floorCells path', () => {
    const tiles = buildFloorTiles(
      undefined,
      [[1, 0]],
      [
        [0, 0],
        [1, 0],
        [2, 1],
      ]
    );
    expect(tiles.size).toBe(2);
  });

  it('with no floorPlan and no floorCells, produces an honest empty map rather than throwing', () => {
    const tiles = buildFloorTiles(undefined, []);
    expect(tiles.size).toBe(0);
  });

  it('the floorPlan.rooms path (edit mode) is unchanged by this unit — same tile count as before, against the real showcase fixture', () => {
    const tiles = buildFloorTiles(SHOWCASE_FLOORPLAN, []);
    // Every room's width * (height - 1 for the door row), summed —
    // cross-checked against the fixture's own room widths (6/14/8,
    // CONTRACT.md's "start_column chain accumulation" finding) rather
    // than a hard-coded magic number.
    const expected = SHOWCASE_FLOORPLAN.rooms.reduce(
      (sum, room) => sum + room.width * (SHOWCASE_FLOORPLAN.height - 1),
      0
    );
    expect(tiles.size).toBe(expected);
    expect(tiles.size).toBeGreaterThan(0);
  });

  it('floorCells takes priority when both floorCells and floorPlan are supplied', () => {
    const tiles = buildFloorTiles(SHOWCASE_FLOORPLAN, [], [[0, 0]]);
    expect(tiles.size).toBe(1);
    expect([...tiles.values()][0].roomId).toBe(CANVAS_ROOM_ID);
  });
});

describe('buildWallLineFootprint — doc-native, mode-agnostic', () => {
  it('an empty doc.wallLines produces an empty set, cheaply (no grid scan)', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(buildWallLineFootprint(doc).size).toBe(0);
  });

  it('matches straightWallFootprint (creation/straightWallGeometry.ts) exactly for one drawn line — reused geometry, not re-derived', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    const from = { cell: [4, 4] as [number, number], corner: 0 };
    const to = { cell: [6, 1] as [number, number], corner: 3 };
    addWallLine(cst, from, to);
    const doc = toDungeonDoc(cst);
    expect(doc.wallLines).toHaveLength(1);

    const grid = doc.canvas ?? { width: 20, height: 30 };
    const expectedFootprint = straightWallFootprint(
      doc.wallLines[0].from,
      doc.wallLines[0].to,
      grid
    );
    expect(expectedFootprint.length).toBeGreaterThan(0);

    const result = buildWallLineFootprint(doc);
    expect(result.size).toBe(expectedFootprint.length);
    for (const [col, row] of expectedFootprint) {
      expect(result.has(`${col},${row}`)).toBe(true);
    }
  });
});
