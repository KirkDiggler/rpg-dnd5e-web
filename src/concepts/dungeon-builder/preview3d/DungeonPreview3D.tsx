/**
 * DungeonPreview3D — the 3D preview spike (Kirk's 2026-08-01 ask #4 on
 * rpg-dnd5e-web#667: "assess reusing the game's existing Three.js dungeon
 * rendering... floor + props + monsters from the compiled floor plan; no
 * combat/fog; static orbit camera fine"). Edit mode only — it renders the
 * server-compiled `FloorPlan` + the parallel `DungeonDoc` placements, so it
 * needs a real compiled floor plan to exist (creation mode's proposed
 * schema has no `FloorPlan` at all).
 *
 * Reuses the REAL game renderers directly, not a re-implementation:
 * `SyntyHexFloor` (floor tiles, genuinely self-contained — see its own doc
 * comment, no encounter-state coupling) and `PropModel` (props, same). The
 * one genuinely new piece is `PreviewMonsterModel` — see its own doc
 * comment for why HexEntity.tsx's monster-rendering branch couldn't be
 * reused directly (638 lines, mostly combat-movement/facing/tint machinery
 * this static preview doesn't want).
 *
 * DOES render `doc.holes` (Kirk's 2026-08-02 Structural-category ask,
 * TARGET-YAML.md) — `buildFloorTiles` simply skips a hole's cell, the
 * same shape as the pre-existing door-row skip. Not the same situation
 * as walls used to be: a hole is cell-native (no edge geometry to
 * invent), and "omit the floor tile" is the literal, honest render Kirk's
 * own ask specified, nearly free given `SyntyHexFloor` only renders
 * whatever's in the tile map it's handed.
 *
 * ALSO renders `doc.walls` (Kirk's 2026-08-02 "visible-first" backlog:
 * "a crude wall that RENDERS today beats a faithful one next week").
 * This file's ORIGINAL reasoning for skipping walls doesn't apply here —
 * it was about the compiled `FloorPlan` carrying no wall geometry on the
 * wire, requiring synthetic edge geometry to be invented from nothing.
 * `doc.walls` isn't wire data at all: it's this concept's OWN client-owned
 * target-dialect authoring surface (edge-native `{from, to, kind}`, already deliberately
 * shaped to mirror the real `EncounterService.Space.walls` wire type — see
 * TARGET-YAML.md's annotated example), so the edges already exist, explicit,
 * with nothing to derive. The real game's own wall renderer
 * (`WallRunMesh`/`wallRuns.computeWallRuns`, ~1300 lines) is NOT reused
 * here — it derives envelope/connector RUNS from fog-of-war-gated region
 * HEX MEMBERSHIP (`RegionInput.hexes`), a problem this concept doesn't
 * have (every wall is already an explicit, fully-known edge, no reveal
 * gating) — reusing it would mean building the derivation step it exists
 * to avoid needing. `WallRunMesh`'s tiled-piece/corner-miter fidelity is
 * a deliberate non-goal for this first landing (see `WallBox` below).
 * Doors (`kind: 'door'`) render as a distinctly colored/shorter box, not
 * an opening — the door ROW concept in edit mode's compiled chain is a
 * different thing (a legality rule on a whole grid row) from a wall
 * segment's own `kind`, and this landing doesn't attempt to cut a real
 * gap in the box for a door frame — reads as "a marked door," not yet
 * "a walkable door," and is named honestly as the next fidelity step
 * rather than attempted here.
 */
import { facingDirection } from '@/components/hex-grid/authorGridHelpers';
import {
  type CubeCoord,
  cubeToWorld,
  HEX_SIZE,
  hexEdgeBetween,
} from '@/components/hex-grid/hexMath';
import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import { PropModel } from '@/components/hex-grid/PropModel';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { Bounds, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import type { DungeonDoc, WallDoc } from '../dungeonYaml';
import { cubeAtColRow } from '../hexLayout';
import { PreviewMonsterModel } from './PreviewMonsterModel';

interface DungeonPreview3DProps {
  floorPlan: FloorPlan;
  doc: DungeonDoc;
}

interface PlacedProp {
  key: string;
  position: [number, number, number];
  variantRef: string;
  rotationY: number;
}

interface PlacedWall {
  key: string;
  position: [number, number, number];
  rotationY: number;
  isDoor: boolean;
}

interface PlacedMonster {
  key: string;
  position: [number, number, number];
  monsterRefId: string;
}

/** `holes` are target dialect, proposed (TARGET-YAML.md's Structural category, Kirk's
 * 2026-08-02 ask) — absolute [col,row] cells with no floor. Skipping them
 * here is the SAME shape as the existing door-row skip just below (both
 * are "don't generate a tile for this cell"), and it's the honest render
 * Kirk's own ask specified: "3D preview = simply omit the floor hex" —
 * nearly free given `SyntyHexFloor` only ever renders whatever's in the
 * tile map handed to it. */
function buildFloorTiles(
  floorPlan: FloorPlan,
  holes: readonly [number, number][]
): Map<string, AbsoluteFloorTile> {
  const holeSet = new Set(holes.map(([c, r]) => `${c},${r}`));
  const tiles = new Map<string, AbsoluteFloorTile>();
  for (const room of floorPlan.rooms) {
    for (
      let col = room.startColumn;
      col < room.startColumn + room.width;
      col++
    ) {
      for (let row = 0; row < floorPlan.height; row++) {
        if (row === floorPlan.doorRow) continue; // same legality rule Board.tsx uses
        if (holeSet.has(`${col},${row}`)) continue;
        const cube = cubeAtColRow(col, row);
        const key = `${cube.x},${cube.y},${cube.z}`;
        tiles.set(key, { x: cube.x, y: cube.y, z: cube.z, roomId: room.id });
      }
    }
  }
  return tiles;
}

function worldPosition(
  absCol: number,
  row: number,
  y = 0
): [number, number, number] {
  const cube = cubeAtColRow(absCol, row);
  const world = cubeToWorld(cube, HEX_SIZE);
  return [world.x, y, world.z];
}

/** A `facing:` index (0-5, HEX_FACING_LABELS order) to a Three.js Y
 * rotation (radians) — same `atan2(-dz, dx)` convention every other
 * facing-to-rotationY conversion in this codebase uses (hexMath.ts's
 * `hexEdgeBetween`, wallRuns.ts's envelope-corner rotation), so a
 * facing-rotated preview mesh orients the same way the real game's own
 * facing-aware renderers would. Floor-standing props only — a
 * `mount: wall` placement uses `wallMountRotationY` below instead, which
 * squares the model flush against its actual wall edge rather than just
 * pointing toward it. */
function facingToRotationY(facing: number): number {
  const dir = facingDirection(facing);
  const world = cubeToWorld(dir, 1);
  return Math.atan2(-world.z, world.x);
}

/** The edge geometry between two adjacent hex cells — position + rotation
 * both come from `hexMath.ts`'s `hexEdgeBetween`, the SAME function every
 * other edge-aligned Synty piece in the real game uses (envelope walls,
 * connectors). This file used to hand-derive an equivalent rotation by
 * rotating the cell-center-to-cell-center line 90° — geometrically valid
 * (that line IS perpendicular to the shared edge for any regular hex
 * tiling) but a DIFFERENT perpendicular than `hexEdgeBetween`'s own
 * corner-pair-derived one, off by a constant 180° from the rest of the
 * codebase's convention. Invisible on a symmetric wall box (a box looks
 * identical rotated 180°), but wrong for any future asymmetric wall piece
 * (a tiled/mitered `WallRunMesh`-style GLB) and inconsistent with every
 * other edge-aligned piece — worth fixing now rather than carrying the
 * drift forward. Kirk, 2026-08-02, after seeing this live: walls read as
 * misaligned; verified against `hexEdgeBetween` directly rather than
 * guessing at the fix. */
function edgeBetweenCells(
  colA: number,
  rowA: number,
  colB: number,
  rowB: number
) {
  return hexEdgeBetween(
    cubeAtColRow(colA, rowA),
    cubeAtColRow(colB, rowB),
    HEX_SIZE
  );
}

function wallBoxTransform(wall: WallDoc): {
  position: [number, number, number];
  rotationY: number;
} {
  const edge = edgeBetweenCells(
    wall.from[0],
    wall.from[1],
    wall.to[0],
    wall.to[1]
  );
  return {
    position: [edge.mid.x, WALL_HEIGHT / 2, edge.mid.z],
    rotationY: edge.rotationY,
  };
}

/** A wall-mounted prop's rotation: flush against the wall face it hangs
 * on, squared to that edge — the same `hexEdgeBetween` convention
 * `wallBoxTransform` above uses, not `facingToRotationY`'s "point toward
 * the wall" approximation (which orients the model's local +X straight
 * OUT through the wall, perpendicular to the face it's supposedly
 * mounted flush against — the actual bug behind Kirk's "banner renders
 * slightly angled" report). `facing` names which of the cell's 6 edges
 * the prop mounts on (TARGET-YAML.md's z-axis section); the neighbor
 * cell in that direction, fed through the same edge function every wall
 * uses, gives the correct flush-against-the-face rotation for free —
 * one convention, not two. */
function wallMountRotationY(
  absCol: number,
  row: number,
  facing: number
): number {
  const here = cubeAtColRow(absCol, row);
  const dir = facingDirection(facing);
  const there: CubeCoord = {
    x: here.x + dir.x,
    y: here.y + dir.y,
    z: here.z + dir.z,
  };
  return hexEdgeBetween(here, there, HEX_SIZE).rotationY;
}

function buildWalls(walls: readonly WallDoc[]): PlacedWall[] {
  return walls.map((wall) => {
    const { position, rotationY } = wallBoxTransform(wall);
    return {
      key: `${wall.from.join(',')}-${wall.to.join(',')}`,
      position,
      rotationY,
      isDoor: wall.kind === 'door',
    };
  });
}

function buildPlacements(
  floorPlan: FloorPlan,
  doc: DungeonDoc
): { props: PlacedProp[]; monsters: PlacedMonster[] } {
  const props: PlacedProp[] = [];
  const monsters: PlacedMonster[] = [];

  for (const room of doc.rooms) {
    const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
    if (!fpRoom) continue;

    for (const p of room.place) {
      const absCol = fpRoom.startColumn + p.at[0];
      // Target dialect, proposed (TARGET-YAML.md's "z-axis: mount +
      // height" section) — mount: 'wall' placements render at their
      // authored height instead of the floor plane, rotated flush
      // against the wall edge they hang on via `wallMountRotationY` (the
      // same `hexEdgeBetween` convention `wallBoxTransform` uses, not a
      // floor prop's `facingToRotationY`).
      const position = worldPosition(
        absCol,
        p.at[1],
        p.mount === 'wall' ? (p.height ?? 0) : 0
      );
      const rotationY =
        p.facing === null
          ? 0
          : p.mount === 'wall'
            ? wallMountRotationY(absCol, p.at[1], p.facing)
            : facingToRotationY(p.facing);
      const key = `${room.id}:${p.at[0]},${p.at[1]}:${p.ref}`;
      if (p.isMonster) {
        const monsterRefId = p.ref.split(':').pop();
        if (monsterRefId) monsters.push({ key, position, monsterRefId });
      } else {
        props.push({ key, position, variantRef: p.ref, rotationY });
      }
    }

    if (room.boss) {
      const absCol = fpRoom.startColumn + room.boss.at[0];
      const position = worldPosition(absCol, room.boss.at[1]);
      const monsterRefId = room.boss.ref.split(':').pop();
      if (monsterRefId) {
        monsters.push({
          key: `${room.id}:boss`,
          position,
          monsterRefId,
        });
      }
    }
  }

  return { props, monsters };
}

// Crude box-per-edge placeholder (this file's own doc comment) — NOT the
// real game's tiled/mitered `WallRunMesh`. Solid vs. door reuses the
// EXACT colors the 2D board's own target-dialect structural overlay already uses for
// the same distinction (Board.tsx/CreationBoard.tsx: '#e8e2d8' solid,
// '#ffb347' door) — one visual language for "this is a drawn wall" across
// both previews, same principle the hole rendering already established.
// A door renders shorter (a marked threshold, not a walkable gap — see
// this file's header doc comment for why a real opening isn't attempted
// this round) so it reads as different from a solid run at a glance, not
// just a different color at a distance.
const WALL_SOLID_COLOR = '#e8e2d8';
const WALL_DOOR_COLOR = '#ffb347';
const WALL_THICKNESS = 0.12;
const WALL_DOOR_HEIGHT_RATIO = 0.55;

function WallBox({ wall }: { wall: PlacedWall }) {
  const height = wall.isDoor
    ? WALL_HEIGHT * WALL_DOOR_HEIGHT_RATIO
    : WALL_HEIGHT;
  const y = wall.isDoor ? (height - WALL_HEIGHT) / 2 : 0;
  return (
    <mesh
      position={[wall.position[0], wall.position[1] + y, wall.position[2]]}
      rotation={[0, wall.rotationY, 0]}
    >
      <boxGeometry args={[HEX_SIZE, height, WALL_THICKNESS]} />
      <meshStandardMaterial
        color={wall.isDoor ? WALL_DOOR_COLOR : WALL_SOLID_COLOR}
      />
    </mesh>
  );
}

export function DungeonPreview3D({ floorPlan, doc }: DungeonPreview3DProps) {
  const floorTiles = useMemo(
    () => buildFloorTiles(floorPlan, doc.holes),
    [floorPlan, doc.holes]
  );
  const { props, monsters } = useMemo(
    () => buildPlacements(floorPlan, doc),
    [floorPlan, doc]
  );
  const walls = useMemo(() => buildWalls(doc.walls), [doc.walls]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0c0a08' }}>
      <Canvas camera={{ fov: 45, position: [10, 14, 10] }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[6, 10, 4]} intensity={1.0} />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} />
        <Suspense fallback={null}>
          <Bounds fit clip margin={1.25}>
            <SyntyHexFloor floorTiles={floorTiles} hexSize={HEX_SIZE} />
            {walls.map((w) => (
              <WallBox key={w.key} wall={w} />
            ))}
            {props.map((p) => {
              const variant = resolvePropVariant(p.variantRef);
              if (!variant) return null;
              return (
                <PropModel
                  key={p.key}
                  variant={variant}
                  position={p.position}
                  rotationY={p.rotationY}
                />
              );
            })}
            {monsters.map((m) => (
              <PreviewMonsterModel
                key={m.key}
                monsterRefId={m.monsterRefId}
                position={m.position}
              />
            ))}
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
