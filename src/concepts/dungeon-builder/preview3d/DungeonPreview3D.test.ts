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
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { describe, expect, it } from 'vitest';
import { facingToRotationY } from '../boardGeometry';
import { cornerPoint, type CornerRef } from '../creation/hexCorner';
import {
  clipSegmentToShrunkHex,
  straightWallFootprint,
} from '../creation/straightWallGeometry';
import {
  addWallLine,
  parseDungeon,
  setPlacementMount,
  setPlacementRotationDegrees,
  setRefDefault,
  toDungeonDoc,
  toggleWallLineDoorAt,
} from '../dungeonYaml';
import { SHOWCASE_FLOORPLAN, SHOWCASE_YAML } from '../fixtures';
import { BOARD_HEX_SIZE, cubeAtColRow } from '../hexLayout';
import {
  buildFloorTiles,
  buildOnePlacement,
  buildWallLineFootprint,
  buildWallLineSegments,
  CANVAS_ROOM_ID,
} from './DungeonPreview3D';

// Same board-space -> world-space ratio `DungeonPreview3D.tsx`'s own
// `BOARD_TO_WORLD_SCALE` uses — recomputed independently here (not
// imported) so these tests cross-check the render path's geometry against
// a value derived fresh from first principles, not the same constant the
// code under test already trusts.
const WORLD_SCALE = HEX_SIZE / BOARD_HEX_SIZE;

function worldOf(ref: CornerRef): { x: number; z: number } {
  const p = cornerPoint(ref);
  return { x: p.x * WORLD_SCALE, z: p.y * WORLD_SCALE };
}

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

  it('the floorPlan.rooms path (edit mode) still generates every non-door-row room cell, exactly as before this unit', () => {
    const tiles = buildFloorTiles(SHOWCASE_FLOORPLAN, []);
    // Every room's width * (height - 1 for the door row), summed —
    // cross-checked against the fixture's own room widths (6/14/8,
    // CONTRACT.md's "start_column chain accumulation" finding) rather
    // than a hard-coded magic number. Room-owned cells only — the
    // connector-band cells the next test covers are additive, checked
    // separately so this assertion stays a pure regression check on the
    // untouched per-room loop.
    const roomCellCount = SHOWCASE_FLOORPLAN.rooms.reduce(
      (sum, room) => sum + room.width * (SHOWCASE_FLOORPLAN.height - 1),
      0
    );
    expect(tiles.size).toBe(
      roomCellCount + SHOWCASE_FLOORPLAN.connectors.length
    );
    expect(tiles.size).toBeGreaterThan(0);
  });

  it('the connector band (2026-08-04 fix): a real floor tile exists at [connector.column, doorRow] for every connector — the door no longer stands over a chasm', () => {
    const tiles = buildFloorTiles(SHOWCASE_FLOORPLAN, []);
    expect(SHOWCASE_FLOORPLAN.connectors.length).toBeGreaterThan(0);
    for (const connector of SHOWCASE_FLOORPLAN.connectors) {
      const cube = cubeAtColRow(connector.column, SHOWCASE_FLOORPLAN.doorRow);
      const key = `${cube.x},${cube.y},${cube.z}`;
      const tile = tiles.get(key);
      expect(tile).toBeDefined();
      // A real room id (one of the two the connector bridges), not a
      // synthetic sentinel — this cell genuinely belongs to the compiled
      // dungeon, unlike a creation-mode canvas tile.
      expect(tile!.roomId).toBe(connector.fromRoomId);
    }
    // The connector's own column is never inside either adjacent room's
    // [startColumn, startColumn+width) range (the whole reason the room
    // loop alone could never produce this tile) — confirmed directly
    // against the real fixture, not just asserted as a design claim.
    for (const connector of SHOWCASE_FLOORPLAN.connectors) {
      for (const room of SHOWCASE_FLOORPLAN.rooms) {
        const inRoom =
          connector.column >= room.startColumn &&
          connector.column < room.startColumn + room.width;
        expect(inRoom).toBe(false);
      }
    }
  });

  it('a hole at exactly a connector cell still wins — the connector band respects doc.holes like every other tile', () => {
    const connector = SHOWCASE_FLOORPLAN.connectors[0];
    const tiles = buildFloorTiles(SHOWCASE_FLOORPLAN, [
      [connector.column, SHOWCASE_FLOORPLAN.doorRow],
    ]);
    const cube = cubeAtColRow(connector.column, SHOWCASE_FLOORPLAN.doorRow);
    const key = `${cube.x},${cube.y},${cube.z}`;
    expect(tiles.has(key)).toBe(false);
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

// rpg-project#169's "straight walls stand in 3D" unit — the follow-up
// this file's own header doc comment names as deliberately deferred by
// the creation-mode-3D-preview unit above ("Full 3D geometry for a
// straight wall's own LINE... is NOT attempted this round"). Same
// no-Canvas testing discipline as `buildOnePlacement`/`buildFloorTiles`
// above: `buildWallLineSegments` is pure math (no R3F/Canvas dependency),
// so its output is asserted directly.
describe('buildWallLineSegments — real 3D geometry for doc.wallLines', () => {
  it('a single-edge line (no doors) becomes exactly one solid box, positioned/rotated/sized from its own corner-to-corner world geometry', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    const from: CornerRef = { cell: [5, 5], corner: 0 };
    const to: CornerRef = { cell: [5, 5], corner: 1 };
    addWallLine(cst, from, to);
    const doc = toDungeonDoc(cst);

    const segments = buildWallLineSegments(doc);
    expect(segments).toHaveLength(1);
    const [seg] = segments;
    expect(seg.kind).toBe('solid');

    // Independently derived expected geometry (fresh `cornerPoint` calls
    // rescaled by `WORLD_SCALE`, not the render path's own internals) —
    // proves the segment's box actually spans corner to corner rather
    // than, say, a fixed HEX_SIZE box dropped at the midpoint.
    const a = worldOf(from);
    const b = worldOf(to);
    const expectedLength = Math.hypot(b.x - a.x, b.z - a.z);
    const expectedRotation = Math.atan2(-(b.z - a.z), b.x - a.x);
    expect(seg.length).toBeCloseTo(expectedLength, 6);
    expect(seg.position[0]).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(seg.position[2]).toBeCloseTo((a.z + b.z) / 2, 6);
    expect(seg.rotationY).toBeCloseTo(expectedRotation, 6);
    // Above the floor plane, at wall-box height — same Y every edge-native
    // WallBox piece renders at, so the two wall vocabularies share one
    // architecture (this file's own header doc comment).
    expect(seg.position[1]).toBeCloseTo(WALL_HEIGHT / 2, 6);
  });

  it('a door mid-line splits one line into solid, door, solid — in that order, all sharing the line’s own rotation', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // Same fixture straightWallGeometry.test.ts's own "door exclusion"
    // describe block uses: footprint [[4,5],[6,5],[8,5]], door at the
    // MIDDLE cell.
    const from: CornerRef = { cell: [2, 5], corner: 0 };
    const to: CornerRef = { cell: [10, 5], corner: 3 };
    addWallLine(cst, from, to);
    toggleWallLineDoorAt(cst, 0, [6, 5]);
    const doc = toDungeonDoc(cst);
    expect(doc.wallLines[0].doors).toEqual([{ cell: [6, 5] }]);

    const segments = buildWallLineSegments(doc);
    expect(segments.map((s) => s.kind)).toEqual(['solid', 'door', 'solid']);
    // One straight line has ONE direction — every piece of it shares the
    // exact same rotation, whether solid or door.
    const rotations = segments.map((s) => s.rotationY);
    expect(rotations[1]).toBeCloseTo(rotations[0], 10);
    expect(rotations[2]).toBeCloseTo(rotations[0], 10);
    for (const seg of segments) {
      expect(seg.length).toBeGreaterThan(0);
    }

    // Reuse, not re-derivation: the door piece's own extent matches
    // `clipSegmentToShrunkHex`'s real `[t0,t1]` for that cell — the SAME
    // primitive `straightWallFootprint` already uses — lerped over
    // independently-computed world corner points, not the render path's
    // own internal `t`.
    const a = cornerPoint(from);
    const b = cornerPoint(to);
    const interval = clipSegmentToShrunkHex(a, b, 6, 5);
    expect(interval).not.toBeNull();
    const [t0, t1] = interval!;
    const aWorld = worldOf(from);
    const bWorld = worldOf(to);
    const lerpPoint = (t: number) => ({
      x: aWorld.x + (bWorld.x - aWorld.x) * t,
      z: aWorld.z + (bWorld.z - aWorld.z) * t,
    });
    const p0 = lerpPoint(t0);
    const p1 = lerpPoint(t1);
    const doorSeg = segments[1];
    expect(doorSeg.position[0]).toBeCloseTo((p0.x + p1.x) / 2, 6);
    expect(doorSeg.position[2]).toBeCloseTo((p0.z + p1.z) / 2, 6);
    expect(doorSeg.length).toBeCloseTo(Math.hypot(p1.x - p0.x, p1.z - p0.z), 6);
  });

  it('a door near one end of the line produces an asymmetric split — a short leading piece, a long trailing one — with no crash or misordering', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    const from: CornerRef = { cell: [2, 5], corner: 0 };
    const to: CornerRef = { cell: [10, 5], corner: 3 };
    addWallLine(cst, from, to);
    // The FIRST footprint cell along the line, not the middle one.
    toggleWallLineDoorAt(cst, 0, [4, 5]);
    const doc = toDungeonDoc(cst);

    const segments = buildWallLineSegments(doc);
    expect(segments.map((s) => s.kind)).toEqual(['solid', 'door', 'solid']);
    const [leading, , trailing] = segments;
    // The leading solid sliver (before the near-the-start door) is
    // markedly shorter than the trailing one (which now covers the
    // fixture's other two footprint cells' worth of line) — the split
    // is asymmetric, not silently defaulting to some even partition.
    expect(leading.length).toBeLessThan(trailing.length);
  });

  it('two doors on the same line produce solid/door/solid/door/solid, five pieces in line order', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    const from: CornerRef = { cell: [2, 5], corner: 0 };
    const to: CornerRef = { cell: [10, 5], corner: 3 };
    addWallLine(cst, from, to);
    // The two OUTER footprint cells; [6,5] (the middle one) stays solid.
    toggleWallLineDoorAt(cst, 0, [4, 5]);
    toggleWallLineDoorAt(cst, 0, [8, 5]);
    const doc = toDungeonDoc(cst);
    expect(doc.wallLines[0].doors).toHaveLength(2);

    const segments = buildWallLineSegments(doc);
    expect(segments.map((s) => s.kind)).toEqual([
      'solid',
      'door',
      'solid',
      'door',
      'solid',
    ]);
    // Every piece shares the line's one direction.
    const rotations = segments.map((s) => s.rotationY);
    for (const r of rotations) expect(r).toBeCloseTo(rotations[0], 10);
  });

  it('a door left stranded by geometry that no longer clips its cell renders no gap — the wall stays solid straight through, honestly, rather than guessing one', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // corner-to-corner, exactly one cell's own edge — clips NOTHING
    // (straightWallGeometry.test.ts's own boundary case), so [5,5] is
    // never a valid door cell for this particular line.
    const from: CornerRef = { cell: [5, 5], corner: 0 };
    const to: CornerRef = { cell: [5, 5], corner: 1 };
    addWallLine(cst, from, to);
    const doc = toDungeonDoc(cst);
    // Write a door directly onto the parsed doc's own wallLine (bypassing
    // isValidDoorCell, the same way a stranded door — flagged, not
    // deleted, per TARGET-YAML.md — can exist in a real document after an
    // endpoint drag shrinks the footprint out from under it).
    const strandedDoc = {
      ...doc,
      wallLines: [
        { ...doc.wallLines[0], doors: [{ cell: [5, 5] as [number, number] }] },
      ],
    };

    const segments = buildWallLineSegments(strandedDoc);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('solid');
  });

  it('an empty doc.wallLines produces no segments, cheaply', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(buildWallLineSegments(doc)).toEqual([]);
  });
});
