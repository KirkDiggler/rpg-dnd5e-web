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
 *
 * **ALSO renders `FloorPlan.edges` (rpg-project#169's wire-edges unit,
 * 2026-08-04, rpg-api-protos v0.1.118+)** — the same server-truth edges
 * `Board.tsx`'s 2D overlay now draws, adapted through the SAME
 * `edgesAdapter.ts` module (`floorPlanEdgesToServerEdges`) rather than a
 * second parse of the proto shape. `hasServerEdges(floorPlan)` gates this:
 * empty for fixtures mode or any pre-#767 recording, in which case this
 * pane renders exactly as before (`doc.walls` only). **This closes the
 * "marked door, not a walkable door" gap CONTRACT.md's "door-row void"
 * findings name**: a DOOR edge (server-truth OR an authored
 * `doc.walls` door — both go through the SAME `WallBox`/`DoorGap` branch
 * now) renders as a genuine gap in the wall run — two solid jambs flanking
 * an open, walkable span, with a thin lintel piece for door-frame
 * styling — instead of the old shortened box that was exactly as
 * impassable as a solid wall, just visually shorter. A server-truth door's
 * `doorId` resolves back to its `FloorPlanConnector` (`edgesAdapter.ts`'s
 * `connectorIndexForDoorId` — the SAME wire-level correlation the 2D board
 * uses) and, when `onSelectConnector` is wired, an invisible click-catcher
 * spanning the opening opens the real `ConnectorInspector` — the same
 * Inspector a door-row cell already opens in 2D, now reachable by clicking
 * the actual rendered doorway in 3D too.
 *
 * **ALSO accepts a canvas-derived floor as an alternate input path
 * (rpg-project#169's creation-mode 3D preview unit, 2026-08-04)** —
 * creation mode's from-scratch canvas has no compiled `FloorPlan` at all
 * (this file's own header paragraph above), so `floorPlan` is now
 * OPTIONAL and a sibling `floorCells` prop (a plain `[col,row][]` list,
 * `creation/canvasFloor.ts`'s `deriveCanvasFloorCells`) can supply the
 * floor tile set instead. This component deliberately does NOT import
 * `deriveCanvasFloorCells` itself or otherwise know which mode is calling
 * it — the caller derives the list and hands it over as data, matching
 * CONTRACT.md's operating-bar principle ("a component should not
 * deep-couple into this concept's own state shape any more than
 * necessary to do its one job"). Every `floorPlan`-only feature
 * (server-truth edges, the entrance marker, room-scoped placements,
 * click-to-place) has no creation-mode analog and simply doesn't render
 * when `floorPlan` is absent — see each function's own guard below, not a
 * parallel code path. `doc.place` (top-level placements), `doc.walls`,
 * `doc.holes`, `doc.start`/`doc.end` are already doc-native fields with
 * zero `floorPlan` dependency, so they render unchanged in either mode.
 *
 * Two more doc-native overlays this same unit adds, both driven purely by
 * `doc` (so they render in EITHER mode, not gated on `floorCells`): a
 * straight wall's (`doc.wallLines`) FOOTPRINT cells (Kirk's rule: "any hex
 * that is not 100% uncovered would not be traversable" — the cell still
 * has a floor tile, just visually flagged as blocked, the 3D sibling of
 * the 2D board's crimson footprint hatch) render dimmed/darkened rather
 * than omitted; and `doc.regions` member cells get a subtle
 * archetype-tinted overlay plus a floating `Billboard`/`Text` label at the
 * region's centroid (the same `Billboard`+`Text` pattern
 * `AuthorGridOverlay.tsx` already uses for the real game's author-grid
 * labels — a proven-cheap primitive in this codebase, not a new one).
 * Full 3D geometry for a straight wall's own LINE (matching its
 * corner-anchored footprint/door-gap fidelity in 2D) is NOT attempted
 * this round — see CONTRACT.md's ledger entry for this unit.
 */
import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
  hexEdgeBetween,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import { PropModel } from '@/components/hex-grid/PropModel';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { Billboard, Bounds, OrbitControls, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { DoubleSide, Shape } from 'three';
import {
  facingToRotationY,
  isCellOccupied,
  isEntranceBlocked,
  isSameSelection,
  wallMountRotationY,
} from '../boardGeometry';
import { DEFAULT_CANVAS } from '../creation/emptyCanvasDoc';
import { straightWallsFootprintSet } from '../creation/straightWallGeometry';
import {
  resolvePlacement,
  type DungeonDoc,
  type PlacementDoc,
} from '../dungeonYaml';
import {
  connectorIndexForDoorId,
  floorPlanEdgesToServerEdges,
  hasServerEdges,
  type ServerEdge,
} from '../edgesAdapter';
import { cubeAtColRow, hexColumn, hexRow } from '../hexLayout';
import { END_COLOR, regionArchetypeColor, START_COLOR } from '../markerStyle';
import { regionCentroid } from '../regionGeometry';
import type { PaletteSelection, PlacementSelection } from '../types';
import { PreviewMonsterModel } from './PreviewMonsterModel';

/** A canvas-native floor tile has no owning room ("no room chain exists
 * yet" — `creation/emptyCanvasDoc.ts`'s own doc comment) — a plain,
 * honest sentinel rather than an empty string or a fabricated id, since
 * `AbsoluteFloorTile.roomId` is non-optional. Nothing currently reads
 * this value for canvas-derived tiles (click-to-place, the only consumer,
 * is gated off entirely whenever `floorPlan` is absent — see
 * `buildPlaceableCells`'s call site below), so its exact value is inert
 * today; kept as a real constant rather than an inline literal so a
 * future consumer has one place to special-case it, if it ever needs to. */
export const CANVAS_ROOM_ID = 'canvas';

interface DungeonPreview3DProps {
  /** Compiled room-chain floor plan — edit mode's own input, unchanged.
   * Now OPTIONAL: omit it (or pass `undefined`) when supplying
   * `floorCells` instead, since a from-scratch creation-mode canvas has
   * no compiled `FloorPlan` to render from at all. Every feature that
   * only makes sense against a real compiled response (server-truth
   * wall/door edges, the generator-chosen entrance marker, room-scoped
   * `place:`/`boss:`, click-to-place) degrades to "doesn't render"
   * rather than throwing when this is absent — see this file's own
   * header doc comment for the full list and CONTRACT.md's ledger entry
   * for this unit. */
  floorPlan?: FloorPlan;
  /** Canvas-derived floor cell list — creation mode's alternate input
   * path (`creation/canvasFloor.ts`'s `deriveCanvasFloorCells`, computed
   * by the CALLER, not this component — see this file's header doc
   * comment for why). When supplied, floor tiles are built directly from
   * this list instead of `floorPlan.rooms` — takes priority if BOTH are
   * somehow supplied, though the two callers this component has today
   * (edit mode: `floorPlan` only; creation mode: `floorCells` only) never
   * combine them. `floorPlan`, if also present, is still consulted for
   * its own floorPlan-only features (server-truth edges, the entrance
   * marker) regardless of which floor-tile path won — see
   * `buildFloorTiles`'s own doc comment. */
  floorCells?: readonly [number, number][];
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
  /** rpg-project#169's wire-edges unit — a server-truth DOOR edge's
   * `doorId` resolves to a real `FloorPlanConnector` index
   * (`edgesAdapter.ts`'s `connectorIndexForDoorId`); when wired, clicking
   * the rendered doorway opens `ConnectorInspector` through it — the SAME
   * `onSelectConnector` contract `Board.tsx`'s 2D door-row cell and
   * server-edge line already use. Optional, same degrade-to-view-only
   * pattern as every other interaction prop on this component: omitting
   * it just means a rendered doorway isn't clickable, the gap geometry
   * itself is unaffected either way. */
  onSelectConnector?: (index: number) => void;
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
  /** Server-truth doors only (`ServerEdge.doorId`) — an authored
   * `doc.walls` door has no connector to correlate to, so this stays
   * `undefined` for those. See `DungeonPreview3DProps.onSelectConnector`'s
   * own doc comment for what a defined value lets a click do. */
  doorId?: string;
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
/** Two independent floor-tile sources, picked by which the caller
 * supplied — see `DungeonPreview3DProps.floorCells`'s own doc comment for
 * priority when both are somehow given. `floorCells` (creation mode) is
 * ALREADY the exact cell list to render (its own deriver,
 * `deriveCanvasFloorCells`, has no door-row concept — a canvas has no
 * generator, so there's nothing to skip there); `floorPlan.rooms` (edit
 * mode) still applies the door-row skip, unchanged. `holes` is applied to
 * BOTH paths, since `doc.holes` is a doc-native field with no
 * `floorPlan`/mode dependency either way. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildFloorTiles(
  floorPlan: FloorPlan | undefined,
  holes: readonly [number, number][],
  floorCells?: readonly [number, number][]
): Map<string, AbsoluteFloorTile> {
  const holeSet = new Set(holes.map(([c, r]) => `${c},${r}`));
  const tiles = new Map<string, AbsoluteFloorTile>();
  if (floorCells) {
    for (const [col, row] of floorCells) {
      if (holeSet.has(`${col},${row}`)) continue;
      const cube = cubeAtColRow(col, row);
      const key = `${cube.x},${cube.y},${cube.z}`;
      tiles.set(key, {
        x: cube.x,
        y: cube.y,
        z: cube.z,
        roomId: CANVAS_ROOM_ID,
      });
    }
    return tiles;
  }
  if (!floorPlan) return tiles;
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

function wallBoxTransform(wall: ServerEdge): {
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

/** Builds render-ready wall pieces from either source — `doc.walls`
 * (authored, `doorId` always absent) or the server-edges adapter's output
 * (`ServerEdge[]`, `doorId` present on generated connector doors). One
 * function for both, since both are the same `{from, to, kind}` shape —
 * see `edgesAdapter.ts`'s own doc comment for why `ServerEdge` is a
 * `WallDoc` superset rather than a parallel type. `keyPrefix` keeps the
 * two sources' React keys from colliding when a document happens to
 * author a wall on the exact same edge a server edge also covers. */
function buildWalls(
  walls: readonly ServerEdge[],
  keyPrefix: string
): PlacedWall[] {
  return walls.map((wall) => {
    const { position, rotationY } = wallBoxTransform(wall);
    return {
      key: `${keyPrefix}:${wall.from.join(',')}-${wall.to.join(',')}`,
      position,
      rotationY,
      isDoor: wall.kind === 'door',
      doorId: wall.doorId,
    };
  });
}

/** `DoorGap`'s `onSelectDoor` for one `PlacedWall` — `undefined` unless
 * ALL of: the caller wired `onSelectConnector` at all, this wall carries a
 * `doorId` (server-truth only — an authored `doc.walls` door never does),
 * and that `doorId` resolves to a real connector
 * (`connectorIndexForDoorId`). Pulled out of the render loop so that loop
 * stays a plain ternary instead of an inline IIFE. */
function doorSelectHandler(
  wall: PlacedWall,
  floorPlan: FloorPlan | undefined,
  onSelectConnector: ((index: number) => void) | undefined
): (() => void) | undefined {
  // A `doorId` only exists on a SERVER-truth door (`ServerEdge`, see
  // `PlacedWall.doorId`'s own doc comment) — creation mode has no
  // `floorPlan` and its `doc.walls`/`doc.wallLines` doors never carry one
  // either, so this already returns `undefined` for every creation-mode
  // wall via the `!wall.doorId` check alone; the explicit `!floorPlan`
  // guard just keeps this honestly typed rather than asserting non-null.
  if (!onSelectConnector || !wall.doorId || !floorPlan) return undefined;
  const index = connectorIndexForDoorId(floorPlan, wall.doorId);
  return index === null ? undefined : () => onSelectConnector(index);
}

/** Shared by both placement loops below (room-scoped and top-level) — the
 * position/rotation math doesn't care which list a `PlacementDoc` came
 * from, only `absCol`/`row` (already resolved by the caller: room-local
 * `at` + the room's `startColumn` for one, already-absolute `at` for the
 * other) and the `PlacementSelection` identity a click needs to report
 * back (`roomId: null` for a top-level entry — `types.ts`'s own
 * `PlacementSelection` doc comment).
 *
 * Exported (2026-08-03, fine-rotation/defaults reconciliation) so the
 * resolved-facing + resolved-height + fine-rotation composition can be
 * unit-tested directly against the real render path, rather than only
 * re-asserted against `boardGeometry.ts`'s standalone geometry tests —
 * same reasoning as `facingToRotationY`/`wallMountRotationY` moving there
 * for one shared definition instead of a private, untestable duplicate. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildOnePlacement(
  doc: DungeonDoc,
  p: PlacementDoc,
  absCol: number,
  row: number,
  sel: PlacementSelection,
  key: string
): { prop?: PlacedProp; monster?: PlacedMonster } {
  // Resolved, not raw `p.height`/`p.facing` — a ref-level `defaults:`
  // entry (target dialect, proposed) must render identically to an
  // explicit field: a defaulted `height` still floats the candle, a
  // defaulted `facing` still orients the prop. `resolvePlacement` is a
  // no-op read (falls through to the placement's own explicit value)
  // whenever `doc.defaults` has nothing for this ref, so this costs
  // nothing for the overwhelmingly common case of no defaults at all.
  const resolved = resolvePlacement(doc, p);
  // Target dialect, proposed (TARGET-YAML.md's "z-axis: mount +
  // height" section) — `height` is DECOUPLED from `mount` (Kirk-batch,
  // 2026-08-02: "height: decouples from mount... any placement may
  // carry height (floating candles)"), so it's honored here regardless
  // of mount: a mount:wall placement renders at its authored height on
  // the wall; a floor-standing one with a height set floats above the
  // floor plane at that same height (the exact "floating candle" shape
  // the decoupling exists for). Rotation stays mount-gated below —
  // ROTATION is still a wall-vs-floor question (flush-against-the-edge
  // vs. general facing), height no longer is.
  const position = worldPosition(absCol, row, resolved.height ?? 0);
  // EXPERIMENT (see PlacementDoc.rotationDegrees's own doc comment) —
  // `rotationDegrees` is a fine ADJUSTMENT added on top of whichever
  // coarse rotation `facing` produces, never a replacement for it.
  // Originally wall-mount-only; GENERALIZED (2026-08-03) to floor props
  // too, since the same 6-direction-enum blind spot applies to both —
  // `facing`'s 6 base angles and a wall edge's 6 flush angles are
  // interleaved 30° apart regardless of whether the thing needing to sit
  // flush is mounted ON the wall or standing on the floor beside it
  // (`boardGeometry.ts`'s `computeFlushRotation` has the full geometry).
  // `facing === null` still means "no base to nudge" for either branch —
  // there's nothing for the fine adjustment to be relative to, so it's
  // ignored rather than applied against an arbitrary zero. Reads
  // `resolved.facing` (not raw `p.facing`) so an inherited `defaults:`
  // facing produces the same coarse+fine composition as an explicit one
  // — `mount` itself is deliberately NOT defaultable (TARGET-YAML.md's
  // `defaults:` section), so `p.mount` stays raw.
  const rotationY =
    resolved.facing === null
      ? 0
      : (p.mount === 'wall'
          ? wallMountRotationY(absCol, row, resolved.facing)
          : facingToRotationY(resolved.facing)) +
        ((p.rotationDegrees ?? 0) * Math.PI) / 180;
  if (p.isMonster) {
    const monsterRefId = p.ref.split(':').pop();
    return monsterRefId
      ? { monster: { key, position, monsterRefId, sel } }
      : {};
  }
  return { prop: { key, position, variantRef: p.ref, rotationY, sel } };
}

function buildPlacements(
  floorPlan: FloorPlan | undefined,
  doc: DungeonDoc
): { props: PlacedProp[]; monsters: PlacedMonster[] } {
  const props: PlacedProp[] = [];
  const monsters: PlacedMonster[] = [];

  // Room-scoped `place:`/`boss:` need a compiled room's own `startColumn`
  // to resolve an absolute cell — genuinely nothing to do without
  // `floorPlan`. Not a special case in practice: a creation-mode canvas's
  // `doc.rooms` is always `[]` (`creation/emptyCanvasDoc.ts` — "no room
  // chain exists yet"), so this loop is already a no-op there regardless;
  // the explicit `if` just keeps this function honestly typed for
  // `floorPlan: FloorPlan | undefined` rather than asserting non-null.
  if (floorPlan) {
    for (const room of doc.rooms) {
      const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
      if (!fpRoom) continue;

      room.place.forEach((p, index) => {
        const absCol = fpRoom.startColumn + p.at[0];
        const { prop, monster } = buildOnePlacement(
          doc,
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
      doc,
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

/** Every `[col, row]` cell a straight wall (`doc.wallLines`) footprint
 * currently claims, union across every drawn line, door cells already
 * excluded per-line — the exact same `straightWallsFootprintSet` the 2D
 * board's own hatch/warning overlays already use (`CreationBoard.tsx`),
 * reused rather than re-derived. Cheap by construction, and skipped
 * entirely for the (overwhelmingly common) `doc.wallLines.length === 0`
 * case rather than paying for an empty grid scan. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildWallLineFootprint(doc: DungeonDoc): Set<string> {
  if (doc.wallLines.length === 0) return new Set();
  const grid = doc.canvas ?? DEFAULT_CANVAS;
  return straightWallsFootprintSet(doc.wallLines, grid);
}

// Above SyntyHexFloorTile's own FLOOR_Y (0.2) so a downward ray from the
// orbit camera always meets this layer before the visual floor texture —
// see this file's header doc comment for why that ordering alone is
// enough to let a placed prop's own click handler win, with no manual
// raycasting. `REGION_TINT_Y`/`FOOTPRINT_DIM_Y` sit BELOW that
// (`HIT_CELL_Y` below), same reasoning: both are meant to read as floor
// decoration, not to shadow the hit-cell layer's own raycast priority —
// and `FOOTPRINT_DIM_Y` sits above `REGION_TINT_Y` so a footprint that
// lands inside a region (flagged, never auto-removed from the region —
// the same "flag, don't silently rewrite" discipline `CreationBoard.tsx`
// already follows) shows the blocked treatment on top, not hidden under
// the region tint.
const HIT_CELL_Y = 0.22;
const HIT_CLEAR_COLOR = '#5fd1c9';
const HIT_OCCUPIED_COLOR = '#ff5a3a';

// The 3D sibling of the 2D board's crimson footprint hatch
// (`CreationBoard.tsx`'s `db-footprint-hatch` pattern) — Kirk's rule ("any
// hex that is not 100% uncovered would not be traversable") makes this a
// BLOCKED overlay on an otherwise-real floor tile, not an omitted tile
// the way a hole is (see `creation/canvasFloor.ts`'s own doc comment for
// that distinction spelled out). Same crimson family as the 2D hatch's
// own stroke color (`#c94f4f`), translucent rather than a hatch pattern —
// a flat semi-transparent disc is the cheap 3D-legible equivalent; a true
// hatched TEXTURE was judged not worth the extra material/UV work for a
// first landing.
const FOOTPRINT_DIM_Y = 0.21;
const FOOTPRINT_DIM_COLOR = '#c94f4f';
const FOOTPRINT_DIM_OPACITY = 0.55;

function FootprintDimCell({
  worldX,
  worldZ,
  shape,
}: {
  worldX: number;
  worldZ: number;
  shape: Shape;
}) {
  return (
    <mesh
      position={[worldX, FOOTPRINT_DIM_Y, worldZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={FOOTPRINT_DIM_COLOR}
        transparent
        opacity={FOOTPRINT_DIM_OPACITY}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

// Region membership tint — the 3D sibling of the 2D board's own
// archetype-tinted region overlay (`CreationBoard.tsx`'s `regionEls`,
// `regionArchetypeColor`). Deliberately subtler than the footprint dim
// above (lower opacity, no border) — a region is informational, not a
// warning.
const REGION_TINT_Y = 0.205;
const REGION_TINT_OPACITY = 0.3;
const REGION_LABEL_HEIGHT = 0.6; // above head height, same as AuthorGridOverlay's ROOM_ID_HEIGHT
const REGION_LABEL_FONT_SIZE = 0.34;
const REGION_LABEL_OUTLINE_COLOR = '#100d0b';

function RegionTintCell({
  worldX,
  worldZ,
  shape,
  color,
}: {
  worldX: number;
  worldZ: number;
  shape: Shape;
  color: string;
}) {
  return (
    <mesh
      position={[worldX, REGION_TINT_Y, worldZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={REGION_TINT_OPACITY}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

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
const WALL_SOLID_COLOR = '#e8e2d8';
const WALL_DOOR_COLOR = '#ffb347';
const WALL_THICKNESS = 0.12;

function WallBox({ wall }: { wall: PlacedWall }) {
  return (
    <mesh position={wall.position} rotation={[0, wall.rotationY, 0]}>
      <boxGeometry args={[HEX_SIZE, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_SOLID_COLOR} />
    </mesh>
  );
}

// A genuine gap, not a shortened box (the "marked door, not a walkable
// door" limitation this file's header doc comment used to name as the
// next fidelity step — closed by this unit). Two solid jambs flank an
// OPEN, walkable span; a thin lintel piece reads as a door frame without
// blocking the opening below it. Kirk's own framing for the door-row void
// this same construct answers on the floor side: "the gash becomes a real
// doorway."
const DOOR_JAMB_WIDTH = HEX_SIZE * 0.22;
const DOOR_OPENING_WIDTH = HEX_SIZE - DOOR_JAMB_WIDTH * 2;
const DOOR_OPENING_HEIGHT = WALL_HEIGHT * 0.8;
const DOOR_LINTEL_HEIGHT = WALL_HEIGHT - DOOR_OPENING_HEIGHT;
// Wide/tall enough to comfortably catch a click near the opening without
// competing with the floor hit-cell or an adjacent placement's own hit
// area — invisible, `FloorHitCell`'s own "transparent but interactive"
// pattern, not a new one.
const DOOR_CLICK_HIT_THICKNESS = WALL_THICKNESS * 2.5;

/** Local-space X offset (along the wall's OWN length, before rotation)
 * rotated into a world-space `{dx, dz}` pair — Three.js's standard Y-axis
 * rotation matrix (`x' = x·cos θ + z·sin θ`, `z' = -x·sin θ + z·cos θ`,
 * evaluated at local `z = 0`). Used to place the two door jambs
 * symmetrically about the wall's own midpoint without hand-deriving a new
 * rotation per caller. */
function rotateLocalXOffset(
  rotationY: number,
  localX: number
): { dx: number; dz: number } {
  return {
    dx: localX * Math.cos(rotationY),
    dz: -localX * Math.sin(rotationY),
  };
}

function DoorGap({
  wall,
  onSelectDoor,
}: {
  wall: PlacedWall;
  onSelectDoor?: () => void;
}) {
  const jambOffset = HEX_SIZE / 2 - DOOR_JAMB_WIDTH / 2;
  const left = rotateLocalXOffset(wall.rotationY, jambOffset);
  const right = rotateLocalXOffset(wall.rotationY, -jambOffset);
  return (
    <group>
      <mesh
        position={[
          wall.position[0] + left.dx,
          wall.position[1],
          wall.position[2] + left.dz,
        ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <boxGeometry args={[DOOR_JAMB_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_DOOR_COLOR} />
      </mesh>
      <mesh
        position={[
          wall.position[0] + right.dx,
          wall.position[1],
          wall.position[2] + right.dz,
        ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <boxGeometry args={[DOOR_JAMB_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_DOOR_COLOR} />
      </mesh>
      <mesh
        position={[
          wall.position[0],
          DOOR_OPENING_HEIGHT + DOOR_LINTEL_HEIGHT / 2,
          wall.position[2],
        ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <boxGeometry
          args={[DOOR_OPENING_WIDTH, DOOR_LINTEL_HEIGHT, WALL_THICKNESS]}
        />
        <meshStandardMaterial color={WALL_DOOR_COLOR} />
      </mesh>
      {onSelectDoor && (
        <mesh
          position={wall.position}
          rotation={[0, wall.rotationY, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectDoor();
          }}
        >
          <boxGeometry
            args={[HEX_SIZE, WALL_HEIGHT, DOOR_CLICK_HIT_THICKNESS]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
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
  floorCells,
  doc,
  selectedPlacement,
  onSelect,
  selectedPalette,
  onPlace,
  onReject,
  onSelectConnector,
}: DungeonPreview3DProps) {
  const floorTiles = useMemo(
    () => buildFloorTiles(floorPlan, doc.holes, floorCells),
    [floorPlan, doc.holes, floorCells]
  );
  const { props, monsters } = useMemo(
    () => buildPlacements(floorPlan, doc),
    [floorPlan, doc]
  );
  const authoredWalls = useMemo(
    () => buildWalls(doc.walls, 'authored'),
    [doc.walls]
  );
  // Server-truth wall/door edges (rpg-project#169's wire-edges unit) — see
  // this file's own header doc comment. Empty whenever `floorPlan` is
  // absent (creation mode — no compiled response exists at all) or
  // carries no `edges` (fixtures mode, or any pre-#767 recording), in
  // which case this preview renders exactly as it did before this unit:
  // `doc.walls` only.
  const serverWalls = useMemo(
    () =>
      floorPlan && hasServerEdges(floorPlan)
        ? buildWalls(floorPlanEdgesToServerEdges(floorPlan), 'server')
        : [],
    [floorPlan]
  );
  // A straight wall's (`doc.wallLines`) footprint — doc-native, renders
  // identically regardless of `floorPlan`/`floorCells`. See
  // `buildWallLineFootprint`'s own doc comment.
  const wallLineFootprint = useMemo(() => buildWallLineFootprint(doc), [doc]);
  // The generator-chosen entrance marker has no creation-mode analog at
  // all (CONTRACT.md's "Start/end: authored, in real tension with the
  // generator-chosen entrance" finding — a freeform canvas has no
  // generator to choose FOR the author) — `false`, not computed, whenever
  // `floorPlan` is absent, matching the entrance marker itself simply not
  // rendering below.
  const entranceBlocked = useMemo(
    () => (floorPlan ? isEntranceBlocked(floorPlan, doc) : false),
    [floorPlan, doc]
  );
  // Click-to-place (Kirk's "3D editing" arc, part 3) has no creation-mode
  // analog THIS ROUND either — deliberately out of scope for the
  // creation-mode 3D preview unit (a follow-up, not a gap: edit-mode's
  // click-to-place machinery can graduate later). An empty `floorPlan`
  // check alone is enough to disable it honestly: no `floorPlan` means no
  // placeable cells, which means no `FloorHitCell`s mount at all, so the
  // whole interaction surface is simply absent rather than half-wired.
  const placeableCells = useMemo(
    () => (floorPlan ? buildPlaceableCells(floorPlan, doc, floorTiles) : []),
    [floorPlan, doc, floorTiles]
  );
  const hitShape = useMemo(() => buildHexHitShape(), []);

  // Mirrors Board.tsx's own click-to-place cell handler almost exactly
  // (same messages, same boss/occupied rules) — see this file's header
  // doc comment for why click-to-place is room-scoped only. `floorPlan`
  // is guaranteed non-null here in practice (`placeableCells` above is
  // empty without it, so no `FloorHitCell` exists to call this) — the
  // explicit guard just keeps this honestly typed.
  const handleClickCell = (cell: PlaceableCell) => {
    if (!floorPlan) return;
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
            {doc.regions.map((region) => {
              const color = regionArchetypeColor(region.archetype);
              const centroid = regionCentroid(region.cells);
              const labelPos = worldPosition(
                centroid.col,
                centroid.row,
                REGION_LABEL_HEIGHT
              );
              return (
                <group key={`region-${region.id}`}>
                  {region.cells.map(([col, row]) => {
                    const [wx, , wz] = worldPosition(col, row);
                    return (
                      <RegionTintCell
                        key={`region-${region.id}-${col}-${row}`}
                        worldX={wx}
                        worldZ={wz}
                        shape={hitShape}
                        color={color}
                      />
                    );
                  })}
                  <Billboard position={labelPos}>
                    <Text
                      fontSize={REGION_LABEL_FONT_SIZE}
                      color={color}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={0.016}
                      outlineColor={REGION_LABEL_OUTLINE_COLOR}
                    >
                      {region.name ?? region.id}
                    </Text>
                  </Billboard>
                </group>
              );
            })}
            {[...wallLineFootprint].map((key) => {
              const [col, row] = key.split(',').map(Number);
              const [wx, , wz] = worldPosition(col, row);
              return (
                <FootprintDimCell
                  key={`wallline-fp-${key}`}
                  worldX={wx}
                  worldZ={wz}
                  shape={hitShape}
                />
              );
            })}
            {placeableCells.map((cell) => (
              <FloorHitCell
                key={cell.key}
                cell={cell}
                shape={hitShape}
                placing={!!selectedPalette}
                onClickCell={handleClickCell}
              />
            ))}
            {[...serverWalls, ...authoredWalls].map((w) =>
              w.isDoor ? (
                <DoorGap
                  key={w.key}
                  wall={w}
                  onSelectDoor={doorSelectHandler(
                    w,
                    floorPlan,
                    onSelectConnector
                  )}
                />
              ) : (
                <WallBox key={w.key} wall={w} />
              )
            )}
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
            {floorPlan?.entrance &&
              (() => {
                const entrance = floorPlan.entrance;
                if (!entrance) return null;
                const w = worldPosition(entrance.column, entrance.row);
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
