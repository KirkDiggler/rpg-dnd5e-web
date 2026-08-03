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
 * ALSO supports click-to-place (Kirk's 2026-08-02 "3D editing" arc, part
 * 3: "being able to place objects in the 3d view would be really great if
 * possible" — click-place lands first, drag-move in 3D is the deliberate
 * follow-up, not this landing's gate). One invisible hex-shaped hit mesh
 * per floor tile (`FloorHitCell` below), positioned ABOVE the visual
 * floor texture so a downward ray from the orbit camera always meets it
 * first — R3F/Three fire pointer events nearest-hit-first, so a placed
 * prop's OWN click handler (its geometry sits higher still, and calls
 * `stopPropagation()`) naturally wins over the floor hit-cell underneath
 * it, with no manual raycasting anywhere in this file. Room-scoped only,
 * matching `Board.tsx`'s own click-to-place exactly — a top-level
 * placement is authored via YAML or moved there, never created by a
 * floor click in either view.
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
  hexCorners,
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
import { DoubleSide, Shape } from 'three';
import {
  isCellOccupied,
  isEntranceBlocked,
  isSameSelection,
} from '../boardGeometry';
import type { DungeonDoc, PlacementDoc, WallDoc } from '../dungeonYaml';
import { cubeAtColRow, hexColumn, hexRow } from '../hexLayout';
import type { PaletteSelection, PlacementSelection } from '../types';
import { PreviewMonsterModel } from './PreviewMonsterModel';

interface DungeonPreview3DProps {
  floorPlan: FloorPlan;
  doc: DungeonDoc;
  /** Kirk's 2026-08-02 "3D editing" arc, part 2 — the SAME
   * `PlacementSelection`/`onSelect` contract `Board.tsx` already uses for
   * the 2D board, so clicking a prop/monster/boss here opens the exact
   * same Inspector overlay (`DungeonBuilderConcept.tsx` renders it once,
   * outside either board) with its existing facing rotate control —
   * rotation-in-3D lands by REUSING the already-shipped 2D rotation UI,
   * not building a parallel one. Optional so a caller that doesn't wire
   * selection (none exist today, but nothing structurally requires it)
   * degrades to view-only, unchanged from before this prop existed. */
  selectedPlacement?: PlacementSelection | null;
  onSelect?: (sel: PlacementSelection | null) => void;
  /** Kirk's 2026-08-02 "3D editing" arc, part 3 — click-to-place. The
   * SAME `PaletteSelection`/`onPlace` contract `Board.tsx` already uses:
   * a palette item selected + a floor hex clicked places it via the
   * identical `handlePlace` mutator, room-scoped only (Board.tsx's own
   * click-to-place never produces a top-level placement either). All
   * three optional together — omitting them (no caller does today, but
   * nothing structurally requires wiring this) degrades to the
   * select-and-rotate-only behavior part 2 shipped, unchanged. */
  selectedPalette?: PaletteSelection | null;
  onPlace?: (roomId: string, at: [number, number]) => void;
  onReject?: (message: string) => void;
}

interface PlacedProp {
  key: string;
  position: [number, number, number];
  variantRef: string;
  rotationY: number;
  sel: PlacementSelection;
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
  sel: PlacementSelection;
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

/** Shared by both placement loops below (room-scoped and top-level) — the
 * position/rotation math doesn't care which list a `PlacementDoc` came
 * from, only `absCol`/`row` (already resolved by the caller: room-local
 * `at` + the room's `startColumn` for one, already-absolute `at` for the
 * other) and the `PlacementSelection` identity a click needs to report
 * back (`roomId: null` for a top-level entry — `types.ts`'s own
 * `PlacementSelection` doc comment). */
function buildOnePlacement(
  p: PlacementDoc,
  absCol: number,
  row: number,
  sel: PlacementSelection,
  key: string
): { prop?: PlacedProp; monster?: PlacedMonster } {
  // Target dialect, proposed (TARGET-YAML.md's "z-axis: mount +
  // height" section) — mount: 'wall' placements render at their
  // authored height instead of the floor plane, rotated flush
  // against the wall edge they hang on via `wallMountRotationY` (the
  // same `hexEdgeBetween` convention `wallBoxTransform` uses, not a
  // floor prop's `facingToRotationY`).
  const position = worldPosition(
    absCol,
    row,
    p.mount === 'wall' ? (p.height ?? 0) : 0
  );
  const rotationY =
    p.facing === null
      ? 0
      : p.mount === 'wall'
        ? // EXPERIMENT (see PlacementDoc.rotationDegrees's own doc
          // comment) — `rotationDegrees` is a fine ADJUSTMENT added on
          // top of the coarse 6-direction flush rotation, never a
          // replacement for it. `facing` still picks which wall edge;
          // this nudges the exact angle against that wall, the same
          // shape as the open question it exists to let Kirk answer by
          // feel: does the coarse pick get close enough that a small
          // nudge covers the gap, or is a from-scratch free control
          // needed instead?
          wallMountRotationY(absCol, row, p.facing) +
          ((p.rotationDegrees ?? 0) * Math.PI) / 180
        : facingToRotationY(p.facing);
  if (p.isMonster) {
    const monsterRefId = p.ref.split(':').pop();
    return monsterRefId
      ? { monster: { key, position, monsterRefId, sel } }
      : {};
  }
  return { prop: { key, position, variantRef: p.ref, rotationY, sel } };
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

    room.place.forEach((p, index) => {
      const absCol = fpRoom.startColumn + p.at[0];
      const { prop, monster } = buildOnePlacement(
        p,
        absCol,
        p.at[1],
        { roomId: room.id, index },
        `${room.id}:${p.at[0]},${p.at[1]}:${p.ref}`
      );
      if (prop) props.push(prop);
      if (monster) monsters.push(monster);
    });

    if (room.boss) {
      const absCol = fpRoom.startColumn + room.boss.at[0];
      const position = worldPosition(absCol, room.boss.at[1]);
      const monsterRefId = room.boss.ref.split(':').pop();
      if (monsterRefId) {
        monsters.push({
          key: `${room.id}:boss`,
          position,
          monsterRefId,
          sel: { roomId: room.id, boss: true },
        });
      }
    }
  }

  // Top-level placements (`doc.place`, `roomId: null`) — genuinely
  // absent from this preview before Kirk's 2026-08-02 "3D editing" arc
  // (confirmed via full-file read: nothing referenced `doc.place`
  // anywhere), same gap class as the entrance/start markers the
  // alignment-audit round just closed. `at` is already absolute, no room
  // `startColumn` to add — mirrors `Board.tsx`'s own top-level render
  // pass (rpg-dnd5e-web#679).
  doc.place.forEach((p, index) => {
    const { prop, monster } = buildOnePlacement(
      p,
      p.at[0],
      p.at[1],
      { roomId: null, index },
      `top:${p.at[0]},${p.at[1]}:${p.ref}`
    );
    if (prop) props.push(prop);
    if (monster) monsters.push(monster);
  });

  return { props, monsters };
}

interface PlaceableCell {
  key: string;
  col: number;
  row: number;
  roomId: string;
  worldX: number;
  worldZ: number;
  occupied: boolean;
}

/** Click-to-place targets (Kirk's "3D editing" arc, part 3) — one entry
 * per floor tile `buildFloorTiles` already generated, resolved back to
 * (col, row) via `hexColumn`/`hexRow` — the exact inverse of
 * `cubeAtColRow`, so this never re-derives placement math independently
 * of the rest of the concept. Every floor tile already belongs to a real
 * room (`buildFloorTiles` only ever iterates `floorPlan.rooms`), so
 * `roomId` here is always non-null — matches `Board.tsx`'s own click-to-
 * place, which is room-scoped only. */
function buildPlaceableCells(
  floorPlan: FloorPlan,
  doc: DungeonDoc,
  floorTiles: Map<string, AbsoluteFloorTile>
): PlaceableCell[] {
  const cells: PlaceableCell[] = [];
  for (const tile of floorTiles.values()) {
    const cube: CubeCoord = { x: tile.x, y: tile.y, z: tile.z };
    const col = hexColumn(cube);
    const row = hexRow(cube);
    const world = cubeToWorld(cube, HEX_SIZE);
    cells.push({
      key: `${tile.x},${tile.y},${tile.z}`,
      col,
      row,
      roomId: tile.roomId,
      worldX: world.x,
      worldZ: world.z,
      occupied: isCellOccupied(floorPlan, doc, col, row),
    });
  }
  return cells;
}

/** Local-space hexagon outline centered on the origin, shared by every
 * floor hit-cell below — same corner math + z-negation
 * `SyntyHexFloorTile` uses to keep the shape's winding (and therefore its
 * face normal) consistent with the rest of this file's floor geometry.
 * Slightly smaller than a full hex (`* 0.92`) so adjacent hit cells never
 * visually overlap at the seam. */
function buildHexHitShape(): Shape {
  const shape = new Shape();
  const corners = hexCorners({ x: 0, z: 0 }, HEX_SIZE * 0.92);
  corners.forEach((c, i) => {
    if (i === 0) shape.moveTo(c.x, -c.z);
    else shape.lineTo(c.x, -c.z);
  });
  shape.closePath();
  return shape;
}

// Above SyntyHexFloorTile's own FLOOR_Y (0.2) so a downward ray from the
// orbit camera always meets this layer before the visual floor texture —
// see this file's header doc comment for why that ordering alone is
// enough to let a placed prop's own click handler win, with no manual
// raycasting.
const HIT_CELL_Y = 0.22;
const HIT_CLEAR_COLOR = '#5fd1c9';
const HIT_OCCUPIED_COLOR = '#ff5a3a';

/** Always mounted and always clickable — even with nothing selected, so
 * clicking a floor cell gives the same "pick a palette item first" honesty
 * `Board.tsx` gives on a 2D empty-cell click, rather than silently doing
 * nothing. Only VISIBLE (a faint tint) while `placing` (a palette item is
 * selected) — otherwise fully transparent, so browsing/orbiting the scene
 * looks exactly like it did before this landing. */
function FloorHitCell({
  cell,
  shape,
  placing,
  onClickCell,
}: {
  cell: PlaceableCell;
  shape: Shape;
  placing: boolean;
  onClickCell: (cell: PlaceableCell) => void;
}) {
  return (
    <mesh
      position={[cell.worldX, HIT_CELL_Y, cell.worldZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onClickCell(cell);
      }}
    >
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={cell.occupied ? HIT_OCCUPIED_COLOR : HIT_CLEAR_COLOR}
        transparent
        opacity={placing ? (cell.occupied ? 0.08 : 0.22) : 0}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
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

/** Start/end/entrance markers — genuinely ABSENT from this preview before
 * Kirk's 2026-08-02 "3D editing" arc's alignment audit named them as a
 * class to check (CONTRACT.md): not a misalignment (nothing rendered to
 * be misaligned), a real gap. Same three points the 2D board's own
 * `Board.tsx` already shows (`doc.start`/`doc.end`'s teal/gold "ST"/"EN"
 * rings, `floorPlan.entrance`'s teal/red "PARTY SPAWN" ring, colored via
 * the SAME `isEntranceBlocked` check, imported rather than
 * re-derived) — a flat ring lying on the floor plane, since this static
 * preview has no camera-facing billboard text to spend on a label the
 * way the 2D SVG board does. */
const START_COLOR = '#5fd1c9';
const END_COLOR = '#c9a227';
const ENTRANCE_CLEAR_COLOR = '#5fd1c9';
const ENTRANCE_BLOCKED_COLOR = '#ff5a3a';
const MARKER_RING_INNER = HEX_SIZE * 0.32;
const MARKER_RING_OUTER = HEX_SIZE * 0.48;
const MARKER_Y = 0.02; // just above the floor plane — avoids z-fighting

function PointMarker({
  worldX,
  worldZ,
  color,
}: {
  worldX: number;
  worldZ: number;
  color: string;
}) {
  return (
    <mesh position={[worldX, MARKER_Y, worldZ]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[MARKER_RING_INNER, MARKER_RING_OUTER, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.5}
        side={DoubleSide}
      />
    </mesh>
  );
}

/** Selection highlight — the SAME amber (`#ffd76a`) `Board.tsx` already
 * uses for a selected marker's stroke, here a ring on the floor under
 * the selected prop/monster (this static preview has no 2D-style stroke
 * outline to recolor). Kirk's 2026-08-02 "3D editing" arc, part 2: click
 * an object in 3D, see it's selected, then rotate it via the Inspector's
 * existing facing control (opened the same way a 2D-board click already
 * opens it — one Inspector, either view). */
const SELECTED_COLOR = '#ffd76a';

export function DungeonPreview3D({
  floorPlan,
  doc,
  selectedPlacement,
  onSelect,
  selectedPalette,
  onPlace,
  onReject,
}: DungeonPreview3DProps) {
  const floorTiles = useMemo(
    () => buildFloorTiles(floorPlan, doc.holes),
    [floorPlan, doc.holes]
  );
  const { props, monsters } = useMemo(
    () => buildPlacements(floorPlan, doc),
    [floorPlan, doc]
  );
  const walls = useMemo(() => buildWalls(doc.walls), [doc.walls]);
  const entranceBlocked = useMemo(
    () => isEntranceBlocked(floorPlan, doc),
    [floorPlan, doc]
  );
  const placeableCells = useMemo(
    () => buildPlaceableCells(floorPlan, doc, floorTiles),
    [floorPlan, doc, floorTiles]
  );
  const hitShape = useMemo(() => buildHexHitShape(), []);

  // Mirrors Board.tsx's own click-to-place cell handler almost exactly
  // (same messages, same boss/occupied rules) — see this file's header
  // doc comment for why click-to-place is room-scoped only.
  const handleClickCell = (cell: PlaceableCell) => {
    if (!selectedPalette || !onPlace) {
      onReject?.(
        'Pick a palette item first, then click an empty cell to place it.'
      );
      return;
    }
    if (selectedPalette.kind === 'boss') {
      const room = floorPlan.rooms.find((r) => r.id === cell.roomId);
      if (room?.archetype !== 'boss') {
        onReject?.(
          'The boss pin can only be placed in the boss-archetype room (dungeonspec requires exactly one boss per boss room).'
        );
        return;
      }
    }
    if (cell.occupied) return;
    const room = floorPlan.rooms.find((r) => r.id === cell.roomId);
    if (!room) return;
    onPlace(cell.roomId, [cell.col - room.startColumn, cell.row]);
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#0c0a08' }}>
      <Canvas
        camera={{ fov: 45, position: [10, 14, 10] }}
        onPointerMissed={() => onSelect?.(null)}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[6, 10, 4]} intensity={1.0} />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} />
        <Suspense fallback={null}>
          <Bounds fit clip margin={1.25}>
            <SyntyHexFloor floorTiles={floorTiles} hexSize={HEX_SIZE} />
            {placeableCells.map((cell) => (
              <FloorHitCell
                key={cell.key}
                cell={cell}
                shape={hitShape}
                placing={!!selectedPalette}
                onClickCell={handleClickCell}
              />
            ))}
            {walls.map((w) => (
              <WallBox key={w.key} wall={w} />
            ))}
            {props.map((p) => {
              const variant = resolvePropVariant(p.variantRef);
              if (!variant) return null;
              const selected = isSameSelection(selectedPlacement, p.sel);
              return (
                <group
                  key={p.key}
                  onClick={(e) => {
                    if (!onSelect) return;
                    e.stopPropagation();
                    onSelect(p.sel);
                  }}
                >
                  {selected && (
                    <PointMarker
                      worldX={p.position[0]}
                      worldZ={p.position[2]}
                      color={SELECTED_COLOR}
                    />
                  )}
                  <PropModel
                    variant={variant}
                    position={p.position}
                    rotationY={p.rotationY}
                  />
                </group>
              );
            })}
            {monsters.map((m) => {
              const selected = isSameSelection(selectedPlacement, m.sel);
              return (
                <group
                  key={m.key}
                  onClick={(e) => {
                    if (!onSelect) return;
                    e.stopPropagation();
                    onSelect(m.sel);
                  }}
                >
                  {selected && (
                    <PointMarker
                      worldX={m.position[0]}
                      worldZ={m.position[2]}
                      color={SELECTED_COLOR}
                    />
                  )}
                  <PreviewMonsterModel
                    monsterRefId={m.monsterRefId}
                    position={m.position}
                  />
                </group>
              );
            })}
            {doc.start &&
              (() => {
                const w = worldPosition(doc.start[0], doc.start[1]);
                return (
                  <PointMarker
                    worldX={w[0]}
                    worldZ={w[2]}
                    color={START_COLOR}
                  />
                );
              })()}
            {doc.end &&
              (() => {
                const w = worldPosition(doc.end[0], doc.end[1]);
                return (
                  <PointMarker worldX={w[0]} worldZ={w[2]} color={END_COLOR} />
                );
              })()}
            {floorPlan.entrance &&
              (() => {
                const w = worldPosition(
                  floorPlan.entrance.column,
                  floorPlan.entrance.row
                );
                return (
                  <PointMarker
                    worldX={w[0]}
                    worldZ={w[2]}
                    color={
                      entranceBlocked
                        ? ENTRANCE_BLOCKED_COLOR
                        : ENTRANCE_CLEAR_COLOR
                    }
                  />
                );
              })()}
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
