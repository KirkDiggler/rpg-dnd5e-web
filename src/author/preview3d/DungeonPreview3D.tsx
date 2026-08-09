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
 * Two more doc-native overlays that unit added, both driven purely by
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
 *
 * **Straight walls (`doc.wallLines`) now stand as real 3D geometry, not
 * just a floor dim** (rpg-project#169 follow-up unit, 2026-08-04) — the
 * "full 3D line geometry for wallLines" gap the creation-mode-3D-preview
 * unit named and deliberately deferred. `buildWallLineSegments` walks
 * each line's corner-anchored `from`/`to` (`creation/hexCorner.ts`'s
 * `cornerPoint`, rescaled into this file's world space —
 * `cornerWorldPos`'s own doc comment has the exact ratio) as ONE straight
 * box (`WallBox`, now variable-length, not fixed at `HEX_SIZE`) spanning
 * corner to corner — no per-cell pieces, matching Kirk's own mental model
 * of a straight wall as a single run. A `doors:` entry splits that run at
 * its own footprint clip interval (`clipSegmentToShrunkHex`, the SAME
 * primitive `straightWallFootprint` already uses for the 2D/footprint-dim
 * math — reused, not re-derived) into solid pieces flanking a `DoorGap`
 * (now variable-width too) at the gap's own real extent — the identical
 * amber jamb+lintel visual language edge-native `doc.walls` doors already
 * use, one door language for both wall vocabularies. See this file's own
 * `buildWallLineSegments` doc comment for the full geometry writeup and
 * CONTRACT.md's ledger entry for this unit's live verification.
 */
import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
  hexEdgeBetween,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import { PropModel } from '@/components/hex-grid/PropModel';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import {
  CUTAWAY_STUB_WALL_HEIGHT,
  WALL_HEIGHT,
} from '@/rendering/calibrationConstants';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { Billboard, Bounds, OrbitControls, Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import { DoubleSide, Shape } from 'three';
import {
  facingToRotationY,
  isCellOccupied,
  isEntranceBlocked,
  isSameSelection,
  wallMountRotationY,
} from '../boardGeometry';
import { canvasPlacementRejectReason } from '../creation/canvasFloor';
import { DEFAULT_CANVAS } from '../creation/emptyCanvasDoc';
import { cornerPoint, type CornerRef } from '../creation/hexCorner';
import {
  clipSegmentToShrunkHex,
  standableFootprintKeys,
  straightWallsFootprintCoverage,
} from '../creation/straightWallGeometry';
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
import { BOARD_HEX_SIZE, cubeAtColRow, hexColumn, hexRow } from '../hexLayout';
import { END_COLOR, regionArchetypeColor, START_COLOR } from '../markerStyle';
import { regionCentroid } from '../regionGeometry';
import type { BoardTool, PaletteSelection, PlacementSelection } from '../types';
import {
  readOrbitOrthographicPreference,
  writeOrbitOrthographicPreference,
} from './orbitProjectionPreference';
import { PlayCamera } from './PlayCamera';
import { PreviewMonsterModel } from './PreviewMonsterModel';
import {
  CameraWardTracker,
  RealEdgeDoorPiece,
  RealEdgeWallPiece,
  RealWallLineDoorPiece,
  RealWallLineRun,
} from './RealWallPieces';
import { WalkCamera } from './WalkCamera';
import {
  capWalkLights,
  deriveWalkLights,
  resolveAmbientIntensity,
  resolveDirectionalScale,
  WALK_LIGHT_BUDGET,
  WALK_LIGHT_DECAY,
} from './walkLighting';
import {
  buildWalkContext,
  floorCentroid,
  resolveWalkStart,
} from './walkMovement';
import {
  facingCutawayHeight,
  resolveDoorLocked,
  resolveWallPieceFacing,
} from './wallPieceHelpers';

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

/**
 * Orbit mode's fixed initial `<Canvas camera={{ position }}>` — a plain,
 * un-derived `[x, y, z]` literal for most of this file's history. Named
 * and exported now (world-parity unit, see `boardGeometry.ts`'s own
 * "THE CANONICAL WORLD" doc comment for the full investigation) so its
 * azimuth can be checked against `playCameraRig.INITIAL_AZIMUTH` — the
 * tactical camera's own value — in a real test (this file's own
 * `DungeonPreview3D.test.ts`, "ORBIT_INITIAL_CAMERA_POSITION" describe
 * block), instead of only ever being eyeballed. Matching azimuth is
 * necessary but NOT sufficient for Orbit to preview a facing-sensitive
 * placement accurately (that doc comment has the rest: perspective vs the
 * tactical camera's orthographic projection is the actual remaining gap)
 * — this constant and its test guard the one part of that relationship
 * that COULD silently drift and wouldn't be caught any other way.
 * `Bounds.fit` (below) still repositions the camera to frame whatever's
 * actually loaded; this is only ever the value it starts from before that
 * runs.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const ORBIT_INITIAL_CAMERA_POSITION: readonly [number, number, number] =
  [10, 14, 10];

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
  /** Which source produced `floorCells` — `creation/canvasFloor.ts`'s
   * `resolveCanvasFloor` (v0.3 wire consumption unit, 2026-08-05). Purely
   * a badge/label input, same "caller derives, this component just
   * renders" discipline `floorCells` itself follows (see this prop's own
   * doc comment) — this component does not itself decide server-vs-derived,
   * only displays what the caller already decided. Omitted (or
   * `undefined`) when `floorCells` itself is absent (edit mode,
   * `floorPlan`-only) — there is no creation-canvas floor SOURCE to badge
   * in that case, matching `Board.tsx`'s own edit-mode wall/door
   * indicator, which this badge mirrors for creation mode's floor. */
  floorSource?: 'server' | 'derived';
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
   * identical `handlePlace` mutator. Room-scoped when `floorPlan` is
   * present (Board.tsx's own click-to-place never produces a top-level
   * placement either) — but when `floorPlan` is ABSENT (creation mode's
   * canvas, rpg-project#169's creation-3D-editing unit), a legal click
   * calls `onPlace(null, [col, row])` instead: the exact top-level shape
   * `CreationBoard.tsx`'s own 2D brush already produces via
   * `edit.handlePlace(null, cell)`. `roomId` is therefore `string | null`,
   * not just `string` — see `handleClickCell`'s own doc comment for the
   * full floorPlan-present-vs-absent branch. All three optional
   * together — omitting them degrades to the select-and-rotate-only
   * behavior part 2 shipped, unchanged. */
  selectedPalette?: PaletteSelection | null;
  onPlace?: (roomId: string | null, at: [number, number]) => void;
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
  /** Which 2D-only `BoardTool` (if any) is currently armed — region/wall/
   * hole/start/end editing stays 2D-only this round
   * (rpg-project#169's creation-3D-editing unit; see CONTRACT.md).
   * Purely informational: this component never acts on a tool itself
   * (there is no 3D geometry-editing surface here), it only uses this to
   * give an honest reject message — "switch to 2D" — instead of the
   * generic "pick a palette item first" when a tool (not a palette item)
   * is the reason nothing is armed for a click. Optional; omitting it
   * (edit mode's own call site does, since edit mode's tools aren't
   * creation-canvas-scoped the same way) just falls back to the
   * pre-existing generic message. */
  selectedTool?: BoardTool | null;
  /**
   * Fixture-only render seam used by the precise-composition Learn probe
   * (#728). It can swap the rendered asset or add a small world-space offset
   * without promoting either experiment into DungeonDoc/YAML. The resolved
   * prop list is shared by Orbit and Play; this does not create a camera-only
   * transform path. Omitted by every production authoring caller.
   */
  placementPreviewOverride?: PlacementPreviewOverrideResolver;
}

export interface PlacementPreviewOverride {
  assetRef?: string;
  positionOffset?: readonly [number, number, number];
  rotationOffsetY?: number;
}

export type PlacementPreviewOverrideResolver = (
  selection: PlacementSelection
) => PlacementPreviewOverride | undefined;

export interface PlacedProp {
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
  /** The edge's own `a` corner (`hexEdgeBetween`'s `HexEdge.a`) — real-wall-
   * assets unit (rpg-project#169): a real per-edge Synty piece is placed at
   * this corner with `rotationY`, matching `SyntyHexWall.tsx`'s own
   * per-edge convention (`position={edge.a}`), NOT `position` (this box's
   * own thickness-centered midpoint) — `wallVariantScale`'s squeeze-to-one-
   * edge scale assumes the piece's local origin anchors one END of the
   * edge, not its center. Carried through here (rather than recomputed
   * from `wall.from`/`wall.to` a second time) so `RealWallPieces.tsx` never
   * re-derives `hexEdgeBetween` independently of this file's own
   * `edgeBetweenCells`. */
  edgeA: WorldPos;
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
  // The connector band (Kirk's live-screenshot finding, 2026-08-04): the
  // doorRow skip just above is correct dungeonspec legality (`col ∈
  // [start_column, start_column+width) AND row != door_row` — CONTRACT.md's
  // own "cell legality" finding) — doorRow genuinely isn't part of any
  // ROOM's walkable footprint. But `connector.column` (CONTRACT.md's
  // "connector door position as a cell must still be derived" finding) is
  // the single GAP column BETWEEN two rooms — `start_column` chain
  // accumulation always leaves exactly one such column
  // (`next.startColumn = prev.startColumn + prev.width + 1`, verified
  // against SHOWCASE_FLOORPLAN's own room/connector columns) — and that
  // column belongs to NEITHER room's `[startColumn, startColumn+width)`
  // range, so the room loop above never visits it at ANY row, door or not.
  // The real door (a genuine walkable opening — `WallBox`/`DoorGap` above
  // already render it as one, from server-truth edges or the derived
  // fallback either way) was therefore standing over a floor tile that
  // was NEVER GENERATED, not merely skipped — a true chasm, not the
  // intentional door-row void. One tile per connector, at exactly
  // `[connector.column, doorRow]` — the same cell `boardGeometry.ts`'s
  // `connectorAtColumn` (the 2D board's own door-row-click resolver)
  // already keys off, so this reuses the established column convention
  // rather than re-deriving it. `roomId` picks the FROM room — arbitrary
  // between the two real adjacent rooms (nothing downstream reads a
  // connector tile's roomId today), but a real room id, not a synthetic
  // sentinel, since this cell genuinely belongs to the compiled dungeon.
  for (const connector of floorPlan.connectors) {
    if (holeSet.has(`${connector.column},${floorPlan.doorRow}`)) continue;
    const cube = cubeAtColRow(connector.column, floorPlan.doorRow);
    const key = `${cube.x},${cube.y},${cube.z}`;
    tiles.set(key, {
      x: cube.x,
      y: cube.y,
      z: cube.z,
      roomId: connector.fromRoomId,
    });
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
  edgeA: WorldPos;
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
    edgeA: edge.a,
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
    const { position, rotationY, edgeA } = wallBoxTransform(wall);
    return {
      key: `${keyPrefix}:${wall.from.join(',')}-${wall.to.join(',')}`,
      position,
      rotationY,
      isDoor: wall.kind === 'door',
      doorId: wall.doorId,
      edgeA,
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
  const canonicalPosition = worldPosition(absCol, row, resolved.height ?? 0);
  const offset = p.offset ?? [0, 0, 0];
  const position: [number, number, number] = [
    canonicalPosition[0] + offset[0],
    canonicalPosition[1] + offset[1],
    canonicalPosition[2] + offset[2],
  ];
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

/** Apply the Learn probe's optional render-only adjustment to one already-
 * resolved prop. Kept pure/exported so tests discriminate against replacement
 * losing the authored center or a later camera branch applying a second
 * transform. Production authoring never supplies an override. */
// eslint-disable-next-line react-refresh/only-export-components
export function applyPlacementPreviewOverride(
  prop: PlacedProp,
  override: PlacementPreviewOverride | undefined
): PlacedProp {
  if (!override) return prop;
  const [dx, dy, dz] = override.positionOffset ?? [0, 0, 0];
  return {
    ...prop,
    variantRef: override.assetRef ?? prop.variantRef,
    position: [
      prop.position[0] + dx,
      prop.position[1] + dy,
      prop.position[2] + dz,
    ],
    rotationY: prop.rotationY + (override.rotationOffsetY ?? 0),
  };
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
        const canonicalPosition = worldPosition(absCol, room.boss.at[1]);
        const offset = room.boss.offset ?? [0, 0, 0];
        const position: [number, number, number] = [
          canonicalPosition[0] + offset[0],
          canonicalPosition[1] + offset[1],
          canonicalPosition[2] + offset[2],
        ];
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

export interface PlaceableCell {
  key: string;
  col: number;
  row: number;
  roomId: string;
  worldX: number;
  worldZ: number;
  occupied: boolean;
  /** Creation-mode only (`floorPlan` absent) — WHY this cell isn't a
   * legal placement target (`creation/canvasFloor.ts`'s
   * `canvasPlacementRejectReason`), for `handleClickCell`'s reject toast.
   * `undefined` for every edit-mode cell (that branch stays SILENT on
   * `occupied`, matching `Board.tsx`'s own click-to-place precedent
   * exactly — see `handleClickCell`'s own doc comment) and for any
   * legally-placeable creation-mode cell. */
  rejectReason?: string;
}

/** Click-to-place targets (Kirk's "3D editing" arc, part 3; extended to
 * creation mode by rpg-project#169's creation-3D-editing unit) — one
 * entry per floor tile `buildFloorTiles` already generated, resolved back
 * to (col, row) via `hexColumn`/`hexRow` — the exact inverse of
 * `cubeAtColRow`, so this never re-derives placement math independently
 * of the rest of the concept.
 *
 * `floorPlan` is now OPTIONAL, matching this file's own established
 * "alternate input path" shape (`buildFloorTiles`'s own doc comment):
 * every edit-mode floor tile already belongs to a real room
 * (`buildFloorTiles` only ever iterates `floorPlan.rooms` on that path),
 * so `roomId` there is a real room id, unchanged; every creation-mode
 * floor tile carries the `CANVAS_ROOM_ID` sentinel instead (`floorCells`
 * path) — this function doesn't need to special-case that, it's just
 * along for the ride in `PlaceableCell.roomId`, unused by the
 * creation-mode branch of `handleClickCell` below (which places
 * top-level, `roomId: null`, not room-scoped).
 *
 * `occupied`/`rejectReason` are computed differently per mode: edit mode
 * keeps its original single `isCellOccupied` check (silent on the
 * click side, see `handleClickCell`); creation mode runs the full shared
 * `canvasPlacementRejectReason` (footprint AND occupied, with a real
 * message) since that's the SAME predicate the 2D brush
 * (`CreationBoard.tsx`) now consults — the two views must never disagree
 * about where a click is legal. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildPlaceableCells(
  floorPlan: FloorPlan | undefined,
  doc: DungeonDoc,
  floorTiles: Map<string, AbsoluteFloorTile>,
  wallLineFootprint: ReadonlySet<string>
): PlaceableCell[] {
  const cells: PlaceableCell[] = [];
  for (const tile of floorTiles.values()) {
    const cube: CubeCoord = { x: tile.x, y: tile.y, z: tile.z };
    const col = hexColumn(cube);
    const row = hexRow(cube);
    const world = cubeToWorld(cube, HEX_SIZE);
    // Generic, ref-agnostic precompute — drives hover/occupied display for
    // every cell regardless of what's currently selected in the palette,
    // so it uses the STANDABLE-required gate (matches monster/boss, the
    // majority case). `handleClickCell` below re-checks with the actual
    // selection's own requirement at click time rather than trusting this
    // — a `'prop'` selection needs the relaxed (footprint-permitting)
    // check `canvasPlacementRejectReason`'s `requiresStandable: false`
    // gives it (rpg-project#169's "props on footprint cells" unit), which
    // this per-cell table can't express without being recomputed on every
    // palette change.
    const rejectReason = floorPlan
      ? undefined
      : (canvasPlacementRejectReason(doc, col, row, wallLineFootprint, true) ??
        undefined);
    cells.push({
      key: `${tile.x},${tile.y},${tile.z}`,
      col,
      row,
      roomId: tile.roomId,
      worldX: world.x,
      worldZ: world.z,
      occupied: floorPlan
        ? isCellOccupied(floorPlan, doc, col, row)
        : rejectReason !== undefined,
      rejectReason,
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
 * excluded per-line, each with its own coverage FRACTION (0..0.5,
 * `straightWallGeometry.ts`'s `hexCoverageFraction`) — the exact same
 * `straightWallsFootprintCoverage` the 2D board's own hatch overlay now
 * consumes (`CreationBoard.tsx`), reused rather than re-derived. Cheap by
 * construction, and skipped entirely for the (overwhelmingly common)
 * `doc.wallLines.length === 0` case rather than paying for an empty grid
 * scan. This is the FULL touched-at-all set (any genuine clip, however
 * shallow) — for the coverage-based STANDABLE subset, see
 * `buildStandableWallLineFootprint`, below. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildWallLineFootprintCoverage(
  doc: DungeonDoc
): Map<string, number> {
  if (doc.wallLines.length === 0) return new Map();
  const grid = doc.canvas ?? DEFAULT_CANVAS;
  return straightWallsFootprintCoverage(doc.wallLines, grid);
}

/** The STANDABLE subset of `buildWallLineFootprintCoverage`'s own result
 * (rpg-project#169's coverage-based-standability follow-up, live design
 * round with Kirk, 2026-08-07): only cells at/above
 * `STANDABLE_COVERAGE_THRESHOLD` — what `buildPlaceableCells`/
 * `buildWalkContext`/`handleClickCell` below actually need to block
 * STANDING on. A lightly-clipped cell below the threshold is real floor
 * again for these purposes; the wall LINE's own crossing prohibition
 * into/out of it is untouched (`buildWalkContext`'s own `blockedEdges`
 * derivation still reads the FULL, unfiltered footprint for that —
 * `straightWallGeometry.ts`'s own "coverage-based standability" header
 * comment has the full rule-5 writeup: coverage decides standing, never
 * what the wall's own line blocks crossing, and never Half A's wire
 * projection). */
// eslint-disable-next-line react-refresh/only-export-components
export function buildStandableWallLineFootprint(doc: DungeonDoc): Set<string> {
  return standableFootprintKeys(buildWallLineFootprintCoverage(doc));
}

/** The uniform scale between this concept's 2D board-space corner math
 * (`hexLayout.ts`'s `BOARD_HEX_SIZE`, `creation/hexCorner.ts`'s
 * `cornerPoint`) and this file's own 3D world space (`hexMath.ts`'s
 * `HEX_SIZE`). Both are the exact same `cubeToWorld`/`hexCorners`
 * functions (`hexLayout.ts`'s own header doc comment: "Same odd-q
 * pointy-top math the real 3D floor renders with"), each linear in its
 * own `size` parameter with no additive offset —
 * `cubeToWorld(cube, size) = size * SQRT_3 * (...)`/`size * 1.5 * cube.z`,
 * and `hexCorners(center, size)` adds `size * cos/sin` to a center that's
 * already scaled the same way. A board-space point therefore scales
 * EXACTLY into world space by this one ratio; no re-derivation needed. */
const BOARD_TO_WORLD_SCALE = HEX_SIZE / BOARD_HEX_SIZE;

/** A `CornerRef`'s world-space `{x, z}` point — `cornerPoint` (board
 * space) rescaled by `BOARD_TO_WORLD_SCALE`, not a second corner-
 * resolution implementation. Reusing `cornerPoint` (rather than
 * re-deriving via `hexCorners`/`cubeAtColRow` at `HEX_SIZE` directly)
 * keeps corner-index normalization and cell/world math in exactly ONE
 * place — any future fix to `cornerPoint` itself propagates to this 3D
 * render path automatically instead of needing a parallel fix here. */
function cornerWorldPos(ref: CornerRef): { x: number; z: number } {
  const p = cornerPoint(ref);
  return { x: p.x * BOARD_TO_WORLD_SCALE, z: p.y * BOARD_TO_WORLD_SCALE };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** One render-ready piece of a `wallLines:` entry — either a solid run or
 * a door's own gap span. `position`/`rotationY` are ready to hand
 * straight to `WallBox`/`DoorGap` unchanged; `length` doubles as
 * `WallBox`'s box width and `DoorGap`'s gap `width`. `start`/`end` (real-
 * wall-assets unit, rpg-project#169) are the SAME two world points
 * `position ± length/2` along `rotationY` already implies, carried through
 * directly (not reconstructed from the trig) so `RealWallPieces.tsx` can
 * hand a 'solid' piece straight to `wallRunMeshHelpers.tileWallSegment`
 * (which wants a `{start, end}` pair, matching `WallRunMesh.tsx`'s own
 * `WallRunSegment` shape) without a lossy round trip through
 * position/rotationY/length first. */
export interface WallLineSegment {
  key: string;
  kind: 'solid' | 'door';
  position: [number, number, number];
  rotationY: number;
  length: number;
  start: WorldPos;
  end: WorldPos;
}

/**
 * Render-ready pieces for every `doc.wallLines` entry — real 3D wall
 * geometry, not just the footprint dim `buildWallLineFootprint` already
 * builds (the two are siblings: this renders WHAT the wall looks like,
 * that flags WHERE it blocks movement). One `wallLines:` entry becomes
 * ONE straight box spanning corner to corner (`cornerWorldPos`) — never a
 * piece per clipped cell, matching Kirk's own mental model of a straight
 * wall as a single run, not a chain of edge segments — UNLESS it carries
 * `doors:`, in which case the run splits at each door's own footprint
 * clip interval into alternating solid/door pieces.
 *
 * **Door intervals are reused, not re-derived**: `clipSegmentToShrunkHex`
 * is the exact primitive `straightWallFootprint` already calls per
 * candidate cell to build the 2D/footprint-dim door exclusion — calling
 * it directly here for just the door's own cell gives the identical
 * `[t0, t1]` clip interval TARGET-YAML.md's "Doors" section describes,
 * with no second footprint derivation. A door whose cell the line no
 * longer genuinely clips (stranded by an endpoint drag — 2D flags this
 * with a ⚠ marker, TARGET-YAML.md's "flag, never silently repair"
 * discipline) simply produces no interval here, so the wall renders solid
 * straight through it rather than guessing a gap — this component owns
 * geometry, not the flag.
 *
 * **`t` is computed once, in board space, and reused for world space
 * unchanged.** `clipSegmentToShrunkHex` takes board-space `CellPos`
 * points (`cornerPoint`'s own output) because its epsilon
 * (`FOOTPRINT_EPSILON`) is tuned relative to `BOARD_HEX_SIZE` — but the
 * resulting `t` is a pure fraction along the SAME directed segment
 * `cornerWorldPos`'s world points also lie on (both are the same line,
 * uniformly rescaled by `BOARD_TO_WORLD_SCALE` — see that constant's own
 * doc comment), so lerping the WORLD endpoints by a board-computed `t`
 * lands exactly on the point `cornerWorldPos` would give that fraction of
 * the way along the line. No world-space clip math needed.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildWallLineSegments(doc: DungeonDoc): WallLineSegment[] {
  const segments: WallLineSegment[] = [];
  doc.wallLines.forEach((line, lineIndex) => {
    const aBoard = cornerPoint(line.from);
    const bBoard = cornerPoint(line.to);
    const aWorld = cornerWorldPos(line.from);
    const bWorld = cornerWorldPos(line.to);
    const dx = bWorld.x - aWorld.x;
    const dz = bWorld.z - aWorld.z;
    const totalLength = Math.hypot(dx, dz);
    if (totalLength < 1e-9) return; // degenerate (from === to) — nothing to draw
    const rotationY = Math.atan2(-dz, dx); // hexEdgeBetween's own atan2 convention

    const doorTs = (line.doors ?? [])
      .map((d) => clipSegmentToShrunkHex(aBoard, bBoard, d.cell[0], d.cell[1]))
      .filter((interval): interval is [number, number] => interval !== null)
      .sort((a, b) => a[0] - b[0]);

    const pointAt = (t: number): [number, number] => [
      lerp(aWorld.x, bWorld.x, t),
      lerp(aWorld.z, bWorld.z, t),
    ];
    const pushPiece = (
      kind: 'solid' | 'door',
      t0: number,
      t1: number,
      idx: number
    ) => {
      // A door landing exactly at a segment's own endpoint leaves nothing
      // before/after it to draw — an empty piece, not a zero-length box.
      if (t1 - t0 < 1e-6) return;
      const [x0, z0] = pointAt(t0);
      const [x1, z1] = pointAt(t1);
      segments.push({
        key: `wallline-${lineIndex}-${kind}-${idx}`,
        kind,
        position: [(x0 + x1) / 2, WALL_HEIGHT / 2, (z0 + z1) / 2],
        rotationY,
        length: Math.hypot(x1 - x0, z1 - z0),
        start: { x: x0, z: z0 },
        end: { x: x1, z: z1 },
      });
    };

    let cursor = 0;
    doorTs.forEach(([t0, t1], idx) => {
      pushPiece('solid', cursor, t0, idx);
      pushPiece('door', t0, t1, idx);
      cursor = t1;
    });
    pushPiece('solid', cursor, 1, doorTs.length);
  });
  return segments;
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
// (`CreationBoard.tsx`'s `db-footprint-hatch` pattern) — a BLOCKED
// overlay on an otherwise-real floor tile, not an omitted tile the way a
// hole is (see `creation/canvasFloor.ts`'s own doc comment for that
// distinction spelled out). Same crimson family as the 2D hatch's own
// stroke color (`#c94f4f`), translucent rather than a hatch pattern — a
// flat semi-transparent disc is the cheap 3D-legible equivalent; a true
// hatched TEXTURE was judged not worth the extra material/UV work for a
// first landing.
//
// **Coverage-scaled opacity (rpg-project#169's coverage-based-
// standability follow-up, live design round with Kirk, 2026-08-07)**:
// every footprint cell still renders SOME dim (an author needs to see
// every cell a wall genuinely clips, standable or not — the retired
// binary rule's own honesty about "the wall touches here" doesn't go
// away just because coverage now decides whether it also blocks
// standing), but a lightly-clipped, standable cell reads visibly
// LIGHTER than a heavily-clipped, blocked one — `FOOTPRINT_DIM_OPACITY`
// is now the opacity at FULL coverage (0.5, the maximum
// `hexCoverageFraction` ever returns), scaled linearly down from there;
// `FOOTPRINT_DIM_MIN_OPACITY` is the floor for a near-zero clip so even
// the faintest genuine touch stays visible, never fully invisible.
const FOOTPRINT_DIM_Y = 0.21;
const FOOTPRINT_DIM_COLOR = '#c94f4f';
const FOOTPRINT_DIM_OPACITY = 0.55;
const FOOTPRINT_DIM_MIN_OPACITY = 0.12;

function FootprintDimCell({
  worldX,
  worldZ,
  shape,
  coverage,
}: {
  worldX: number;
  worldZ: number;
  shape: Shape;
  /** `hexCoverageFraction`'s own 0..0.5 range. */
  coverage: number;
}) {
  const opacity =
    FOOTPRINT_DIM_MIN_OPACITY +
    (FOOTPRINT_DIM_OPACITY - FOOTPRINT_DIM_MIN_OPACITY) *
      Math.min(1, coverage / 0.5);
  return (
    <mesh
      position={[worldX, FOOTPRINT_DIM_Y, worldZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={FOOTPRINT_DIM_COLOR}
        transparent
        opacity={opacity}
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

// Placeholder box-per-edge wall/door pieces (`placeholderWallPieces.tsx`,
// moved out this unit — rpg-project#169's real-wall-assets unit) now serve
// as the explicit FALLBACK tier: `RealWallPieces.tsx` renders real Synty
// GLB pieces and falls back to these, per-instance, only when a GLB fails
// to load — see that file's own doc comment.

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
  floorSource,
  doc,
  selectedPlacement,
  onSelect,
  selectedPalette,
  onPlace,
  onReject,
  onSelectConnector,
  selectedTool,
  placementPreviewOverride,
}: DungeonPreview3DProps) {
  const floorTiles = useMemo(
    () => buildFloorTiles(floorPlan, doc.holes, floorCells),
    [floorPlan, doc.holes, floorCells]
  );
  const { props: baseProps, monsters } = useMemo(
    () => buildPlacements(floorPlan, doc),
    [floorPlan, doc]
  );
  // Resolve fixture-only offsets/assets once, before any camera branch.
  // Orbit and Play below render this SAME array through the SAME PropModel.
  const props = useMemo(
    () =>
      baseProps.map((prop) =>
        applyPlacementPreviewOverride(
          prop,
          placementPreviewOverride?.(prop.sel)
        )
      ),
    [baseProps, placementPreviewOverride]
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
  // identically regardless of `floorPlan`/`floorCells`. `wallLineFootprint`
  // is the STANDABLE subset (coverage-based, rpg-project#169's live-design
  // follow-up) — every existing consumer below (`buildPlaceableCells`,
  // `buildWalkContext`, `handleClickCell`) already only ever needed "is
  // this cell blocked for STANDING," so none of them changed; only what
  // this variable itself means did. `wallLineFootprintCoverage` is the
  // FULL touched-at-all map (every footprint cell, any coverage), needed
  // separately for the dim overlay's own light/full de-emphasis below —
  // see `buildWallLineFootprintCoverage`/`buildStandableWallLineFootprint`'s
  // own doc comments.
  const wallLineFootprintCoverage = useMemo(
    () => buildWallLineFootprintCoverage(doc),
    [doc]
  );
  const wallLineFootprint = useMemo(
    () => standableFootprintKeys(wallLineFootprintCoverage),
    [wallLineFootprintCoverage]
  );
  // The straight wall's own real geometry (this unit) — doc-native too,
  // same reasoning as the footprint above. See `buildWallLineSegments`'s
  // own doc comment.
  const wallLineSegments = useMemo(() => buildWallLineSegments(doc), [doc]);
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
  // Click-to-place (Kirk's "3D editing" arc, part 3) now covers creation
  // mode too (rpg-project#169's creation-3D-editing unit) — `floorPlan`
  // presence still decides WHICH legality rule applies (room-scoped vs.
  // top-level canvas), but `placeableCells` is no longer gated to "empty
  // without floorPlan": `floorTiles` already carries the right cell set
  // for either mode (`buildFloorTiles`'s own doc comment), and
  // `buildPlaceableCells` now branches internally per-cell instead of the
  // caller branching on the whole set.
  const placeableCells = useMemo(
    () => buildPlaceableCells(floorPlan, doc, floorTiles, wallLineFootprint),
    [floorPlan, doc, floorTiles, wallLineFootprint]
  );
  const hitShape = useMemo(() => buildHexHitShape(), []);

  // --- Walk / Play modes (rpg-project#169's author-walkthrough unit) ---
  // 'orbit' (existing, unchanged default) vs. 'walk' (literal
  // player-perspective — see WalkCamera.tsx's own header doc comment) vs.
  // 'play' (rpg-project#169 FOLLOW-UP unit — Kirk played Walk live: "walk
  // is pretty literal. that is not the view we have when playing. really
  // cool though" — Play drives the SAME walked position through the real
  // game's own tactical camera rig instead; see PlayCamera.tsx's own
  // header doc comment for the full citation of every constant/formula).
  // Both Walk and Play are view-only. Local to this component, not lifted
  // to either caller: neither `DungeonBuilderConcept.tsx`'s edit-mode
  // call site nor `CreationConcept.tsx`'s creation-mode one needs to know
  // which camera is currently driving — "one component" per this unit's
  // own scope.
  const [cameraMode, setCameraMode] = useState<'orbit' | 'walk' | 'play'>(
    'orbit'
  );
  // Orbit's projection toggle (world-parity unit, see boardGeometry.ts's
  // own "THE CANONICAL WORLD" doc comment) — perspective vs orthographic,
  // Orbit-only. Default UNCHANGED (perspective) so nothing shifts under
  // any existing workflow unless an author opts in. Lets Kirk flip it
  // live on his own doc and judge "thin-object editing legibility vs
  // preview fidelity" experientially, rather than this file silently
  // picking a side of that product tradeoff for him. Read/write plumbing
  // itself lives in orbitProjectionPreference.ts (own unit tests there);
  // this is just the React state wiring around it.
  const [orbitOrthographic, setOrbitOrthographic] = useState<boolean>(() =>
    readOrbitOrthographicPreference(
      typeof window === 'undefined' ? undefined : window.localStorage
    )
  );
  const handleToggleOrbitProjection = () => {
    setOrbitOrthographic((prev) => {
      const next = !prev;
      writeOrbitOrthographicPreference(
        typeof window === 'undefined' ? undefined : window.localStorage,
        next
      );
      return next;
    });
  };
  const [walkLocked, setWalkLocked] = useState(false);
  // The player's own nearest cell, updated only on a CELL CHANGE (not
  // every frame — WalkCamera.tsx's own `onCellChange` doc comment) —
  // drives light-cap recentering below without a per-frame re-render.
  // Shared by both Walk and Play — whichever is active is the only one
  // calling `setPlayerCell` at a time.
  const [playerCell, setPlayerCell] = useState<PlaceableCell | null>(null);

  const walkContext = useMemo(
    () => buildWalkContext(floorPlan, doc, placeableCells, wallLineFootprint),
    [floorPlan, doc, placeableCells, wallLineFootprint]
  );
  const walkStart = useMemo(
    () => resolveWalkStart(walkContext, doc),
    [walkContext, doc]
  );
  const walkLookToward = useMemo(
    () => floorCentroid(walkContext) ?? walkStart,
    [walkContext, walkStart]
  );

  const isWalking = cameraMode === 'walk';
  const isPlaying = cameraMode === 'play';
  const isWalkingOrPlaying = isWalking || isPlaying;

  // Cutaway (real-wall-assets unit, rpg-project#169): "Orbit/Play views
  // can't see into rooms" once walls stand at real height — Walk mode
  // stays OFF (you're inside; full walls, per this unit's own scope).
  // `cameraWard` is the LIVE "which way is the camera, from the dungeon's
  // own center" vector `CameraWardTracker` (mounted inside the Canvas
  // below) feeds via a throttled `onChange` — see `wallPieceHelpers.ts`'s
  // own header doc comment for why a fixed direction (the game's own
  // `CAMERA_WARD_XZ`) doesn't apply to this preview's free Orbit/Play
  // cameras. `null` until the tracker's first frame — every piece renders
  // TALL until then, matching `facingCutawayHeight`'s own "no ward yet
  // defaults tall" fallback.
  const cutawayEnabled = !isWalking;
  const [cameraWard, setCameraWard] = useState<WorldPos | null>(null);
  const wardReference = useMemo(() => {
    const centroid = floorCentroid(walkContext);
    return centroid
      ? { x: centroid.worldX, z: centroid.worldZ }
      : { x: 0, z: 0 };
  }, [walkContext]);
  // "Can a player actually stand here and look at this wall?" — the
  // per-piece facing resolver's own `isOpenCell` predicate (see
  // `resolveWallPieceFacing`'s doc comment). Edge-native walls: real floor
  // tile membership. `wallLines:` runs: real floor tile membership MINUS
  // the run's own footprint (a footprint cell has a floor tile but isn't
  // traversable — `buildWallLineFootprint`'s own doc comment).
  const isOpenFloorCell = (key: string) => floorTiles.has(key);
  const isOpenWallLineCell = (key: string) =>
    floorTiles.has(key) && !wallLineFootprint.has(key);

  // Single entry point for every mode transition — both Walk and Play
  // need the SAME "release an engaged pointer lock before leaving Walk"
  // guard (only Walk ever engages one, but the guard has to run whenever
  // Walk is the mode being LEFT, regardless of which mode is next) and
  // the SAME "no floor, honest reject" gate before entering either.
  const handleSelectCameraMode = (mode: 'orbit' | 'walk' | 'play') => {
    if (mode === cameraMode) return;
    if (isWalking) {
      // `PointerLockControls.disconnect()` (WalkCamera's own unmount
      // cleanup) only removes ITS event listeners — it never calls
      // `document.exitPointerLock()` (verified live: leaving Walk mode
      // via this button while still locked left the browser's pointer
      // genuinely captured, breaking every click on the page afterward,
      // including ones with no relation to this component at all). Exit
      // explicitly here so leaving Walk mode always returns the page to
      // an ordinary, unlocked mouse regardless of whether the player had
      // engaged mouse-look at all.
      if (document.pointerLockElement) document.exitPointerLock();
    }
    if ((mode === 'walk' || mode === 'play') && !walkStart) {
      onReject?.('No floor to walk on yet.');
      return;
    }
    setCameraMode(mode);
  };

  // Lighting (Kirk's day-one ask, same unit: "has the lighting loaded")
  // — applies in ALL THREE camera modes, not gated to Walk/Play only:
  // it's a real improvement to the existing Orbit preview too, and
  // keeping one lighting path (rather than a per-mode special case) is
  // simpler.
  const rawWalkLights = useMemo(() => deriveWalkLights(props), [props]);
  const walkLights = useMemo(
    () =>
      capWalkLights(
        rawWalkLights,
        WALK_LIGHT_BUDGET,
        playerCell ? [playerCell.worldX, playerCell.worldZ] : undefined
      ),
    [rawWalkLights, playerCell]
  );
  const ambientIntensity = resolveAmbientIntensity(doc);
  const directionalScale = resolveDirectionalScale(doc);

  // View-only while walking OR playing (this unit's own scope: "no
  // editing while walking," extended to Play — it's the same
  // fidelity-check idea, not an editing surface either) — every
  // interaction prop degrades to inert rather than this component
  // growing a parallel render tree per mode. Selection/placement/
  // connector clicks and the empty-space deselect all no-op; the
  // underlying hit-cells/props/doors stay mounted (cheap, no visual
  // difference) so switching modes needs no remount.
  const effectiveOnSelect = isWalkingOrPlaying ? undefined : onSelect;
  const effectiveOnPlace = isWalkingOrPlaying ? undefined : onPlace;
  const effectiveOnSelectConnector = isWalkingOrPlaying
    ? undefined
    : onSelectConnector;

  // Mirrors Board.tsx's own click-to-place cell handler for the edit-mode
  // (floorPlan present) branch — same messages, same boss/occupied rules,
  // still silent on `occupied` there (no toast, matching Board.tsx's own
  // click-to-place precedent exactly — `if (occupied) return;`).
  //
  // The `!floorPlan` branch (creation mode's from-scratch canvas, this
  // unit) is a genuinely different placement shape: TOP-LEVEL
  // (`roomId: null`, absolute `[col, row]`, no room to resolve a
  // room-local column against) — the exact shape `CreationBoard.tsx`'s
  // own 2D brush already produces via `edit.handlePlace(null, cell)`.
  // Legality is `cell.rejectReason` (already resolved by
  // `buildPlaceableCells` via the SAME `canvasPlacementRejectReason` the
  // 2D brush now consults), not a fresh room/door-row lookup — there is
  // no room chain or door row on a canvas to check against.
  const handleClickCell = (cell: PlaceableCell) => {
    if (isWalkingOrPlaying) return; // view-only — see this component's own "Walk / Play modes" section above
    if (!selectedPalette || !effectiveOnPlace) {
      onReject?.(
        selectedTool
          ? 'That tool is 2D-only for now — switch to the 2D board to use it, or pick a palette item to place something here.'
          : 'Pick a palette item first, then click an empty cell to place it.'
      );
      return;
    }
    const onPlace = effectiveOnPlace;
    if (!floorPlan) {
      // Boss stays room-scoped even in the target dialect (dungeonspec's
      // validateBossCardinality needs an owning archetype:boss room) — a
      // from-scratch canvas has zero rooms, same guard
      // `CreationBoard.tsx`'s own 2D click handler makes.
      if (selectedPalette.kind === 'boss') {
        onReject?.(
          'Boss stays room-scoped — this canvas has no rooms yet to hold one (see TARGET-YAML.md).'
        );
        return;
      }
      // `cell.rejectReason` (`buildPlaceableCells`) is precomputed
      // STANDABLE-required — correct for `'monster'`, but a `'prop'`
      // selection needs a FRESH, ref-aware check
      // (rpg-project#169's "props on footprint cells" unit: a bookcase
      // resting against a drawn wall's footprint is a legal target, a
      // skeleton standing on it is not). Re-running the real predicate
      // here (rather than conditionally ignoring the precomputed
      // rejection) keeps the hole/off-canvas/occupied gates intact for
      // props too — only the footprint gate actually differs.
      const reject =
        selectedPalette.kind === 'prop'
          ? canvasPlacementRejectReason(
              doc,
              cell.col,
              cell.row,
              wallLineFootprint,
              false
            )
          : cell.rejectReason;
      if (reject) {
        onReject?.(reject);
        return;
      }
      onPlace(null, [cell.col, cell.row]);
      return;
    }
    // The connector-band fix above (`buildFloorTiles`) gives the door its
    // own floor tile so it no longer stands over a void — but that tile
    // is still the reserved door row, not a placeable room cell (same
    // rule `Board.tsx`'s own 2D drag-drop already enforces: "Can't drop
    // on the reserved door row," `row === floorPlan.doorRow`). Without
    // this guard, a click here would fall through to the room-lookup
    // below using the tile's `roomId` (deliberately one of the two real
    // adjacent rooms, not a sentinel — see that tile's own doc comment)
    // and compute a room-LOCAL column outside that room's own width,
    // silently corrupting the placement.
    if (cell.row === floorPlan.doorRow) {
      onReject?.('Can’t place on the reserved door row.');
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
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0c0a08',
      }}
    >
      {/* Canvas floor source indicator (v0.3 wire consumption unit,
       * 2026-08-05) — same "make drift visible, not silent" idiom as
       * `Board.tsx`'s wall/door source indicator (`db-wall-source-indicator`):
       * distinguishes a real `FloorPlan.floor_cells` response
       * (rpg-api-protos v0.1.120+) from `creation/canvasFloor.ts`'s
       * client-derived fallback this preview used exclusively before this
       * unit, and still uses whenever a response carries no floor_cells
       * (every live server today — rollout gap A4, not a contract defect).
       * Only rendered when `floorSource` is supplied at all — edit mode's
       * `floorPlan`-only call site has no creation-canvas floor SOURCE to
       * badge. Deliberately a sibling of `.dg-walk-viewport` below (both
       * absolutely positioned against THIS div, the nearest positioned
       * ancestor either way), not gated on `cameraMode` — the badge is
       * meaningful in Orbit, Play, and Walk alike, since all three render
       * the SAME resolved `floorCells`. */}
      {floorSource && (
        <div
          data-testid="db-floor-source-indicator"
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            zIndex: 5,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.3,
            padding: '3px 7px',
            borderRadius: 4,
            pointerEvents: 'none',
            ...(floorSource === 'server'
              ? {
                  color: '#100d0b',
                  background: '#c9bfae',
                }
              : {
                  color: '#e8e2d8',
                  background: 'rgba(90, 74, 58, 0.55)',
                  border: '1px dashed #8a7a5a',
                }),
          }}
        >
          {floorSource === 'server'
            ? `FLOOR: SERVER (${floorCells?.length ?? 0} cells)`
            : 'FLOOR: DERIVED'}
        </div>
      )}
      {/* The Canvas-covering element `WalkCamera`'s `PointerLockControls`
          treats as "click here to engage mouse-look" (its own `selector`
          prop below). Deliberately does NOT wrap the mode-toggle button
          further down — that button is a SIBLING of this div, not a
          descendant, specifically so clicking it (to LEAVE Walk mode)
          never also bubbles into this element's own click-to-lock
          listener and re-engages pointer lock in the same tick. */}
      <div
        className="dg-walk-viewport"
        style={{ width: '100%', height: '100%' }}
      >
        <Canvas
          // Projection is fixed at Canvas creation — R3F does not swap
          // camera type on a prop change — so the toggle rides a `key` to
          // force a clean remount, same convention HexGrid.tsx's own
          // ortho/persp dial uses (`canvasDials.perspective`). Only
          // meaningful while Orbit is the ACTIVE camera: Play/Walk each
          // mount their own `makeDefault` camera (PlayCamera.tsx's
          // OrthographicCamera, WalkCamera.tsx's own) that overrides
          // whatever this prop set up, so switching mode away from Orbit
          // is unaffected by this toggle either way.
          key={orbitOrthographic ? 'orbit-ortho' : 'orbit-persp'}
          orthographic={orbitOrthographic}
          camera={
            orbitOrthographic
              ? { zoom: 40, position: ORBIT_INITIAL_CAMERA_POSITION }
              : { fov: 45, position: ORBIT_INITIAL_CAMERA_POSITION }
          }
          onPointerMissed={() => effectiveOnSelect?.(null)}
        >
          <ambientLight intensity={ambientIntensity} />
          <directionalLight
            position={[6, 10, 4]}
            intensity={1.0 * directionalScale}
          />
          <directionalLight
            position={[-6, 4, -4]}
            intensity={0.35 * directionalScale}
          />
          {walkLights.map((light) => (
            <pointLight
              key={light.key}
              position={light.position}
              color={light.color}
              intensity={light.intensity}
              distance={light.distance}
              decay={WALK_LIGHT_DECAY}
            />
          ))}
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
              {[...wallLineFootprintCoverage].map(([key, coverage]) => {
                const [col, row] = key.split(',').map(Number);
                const [wx, , wz] = worldPosition(col, row);
                return (
                  <FootprintDimCell
                    key={`wallline-fp-${key}`}
                    worldX={wx}
                    worldZ={wz}
                    shape={hitShape}
                    coverage={coverage}
                  />
                );
              })}
              {placeableCells.map((cell) => (
                <FloorHitCell
                  key={cell.key}
                  cell={cell}
                  shape={hitShape}
                  placing={!isWalkingOrPlaying && !!selectedPalette}
                  onClickCell={handleClickCell}
                />
              ))}
              {[...serverWalls, ...authoredWalls].map((w) => {
                const edgeMid: WorldPos = {
                  x: w.position[0],
                  z: w.position[2],
                };
                const facing = resolveWallPieceFacing(
                  edgeMid.x,
                  edgeMid.z,
                  w.rotationY,
                  isOpenFloorCell
                );
                const wallHeight = facingCutawayHeight(
                  facing,
                  cameraWard,
                  cutawayEnabled,
                  WALL_HEIGHT,
                  CUTAWAY_STUB_WALL_HEIGHT
                );
                if (w.isDoor) {
                  const connectorIndex = floorPlan
                    ? connectorIndexForDoorId(floorPlan, w.doorId)
                    : null;
                  const locked = resolveDoorLocked(
                    doc.connectors,
                    connectorIndex
                  );
                  return (
                    <RealEdgeDoorPiece
                      key={w.key}
                      edgeMid={edgeMid}
                      edgeA={w.edgeA}
                      rotationY={w.rotationY}
                      facing={facing}
                      wallHeight={wallHeight}
                      locked={locked}
                      onSelectDoor={doorSelectHandler(
                        w,
                        floorPlan,
                        effectiveOnSelectConnector
                      )}
                    />
                  );
                }
                return (
                  <RealEdgeWallPiece
                    key={w.key}
                    edgeKey={w.key}
                    edgeA={w.edgeA}
                    rotationY={w.rotationY}
                    facing={facing}
                    wallHeight={wallHeight}
                  />
                );
              })}
              {wallLineSegments.map((seg) => {
                const facing = resolveWallPieceFacing(
                  seg.position[0],
                  seg.position[2],
                  seg.rotationY,
                  isOpenWallLineCell
                );
                const wallHeight = facingCutawayHeight(
                  facing,
                  cameraWard,
                  cutawayEnabled,
                  WALL_HEIGHT,
                  CUTAWAY_STUB_WALL_HEIGHT
                );
                if (seg.kind === 'door') {
                  return (
                    <RealWallLineDoorPiece
                      key={seg.key}
                      segKey={seg.key}
                      position={{ x: seg.position[0], z: seg.position[2] }}
                      rotationY={seg.rotationY}
                      length={seg.length}
                      facing={facing}
                      wallHeight={wallHeight}
                    />
                  );
                }
                return (
                  <RealWallLineRun
                    key={seg.key}
                    segKey={seg.key}
                    start={seg.start}
                    end={seg.end}
                    rotationY={seg.rotationY}
                    length={seg.length}
                    facing={facing}
                    wallHeight={wallHeight}
                  />
                );
              })}
              {props.map((p) => {
                const variant = resolvePropVariant(p.variantRef);
                if (!variant) return null;
                const selected = isSameSelection(selectedPlacement, p.sel);
                return (
                  <group
                    key={p.key}
                    onClick={(e) => {
                      if (!effectiveOnSelect) return;
                      e.stopPropagation();
                      effectiveOnSelect(p.sel);
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
                      if (!effectiveOnSelect) return;
                      e.stopPropagation();
                      effectiveOnSelect(m.sel);
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
                      entityId={m.key}
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
                    <PointMarker
                      worldX={w[0]}
                      worldZ={w[2]}
                      color={END_COLOR}
                    />
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
          {/* Live camera-ward tracker for cutaway (real-wall-assets unit) —
              always mounted, regardless of camera mode: cheap (throttled
              per-frame dot product, `wallPieceHelpers.facingCutawayHeight`
              already no-ops the RESULT while Walk is active via
              `cutawayEnabled`), and avoids racing a mount/unmount against
              camera-mode switches the way a conditionally-mounted tracker
              would (this file's own "stale camera reference" bug, fixed
              in the Play/Walk transition above, is exactly the class of
              defect that class of conditional mounting invites). */}
          <CameraWardTracker
            reference={wardReference}
            onChange={setCameraWard}
          />
          {isWalking && walkStart ? (
            <WalkCamera
              ctx={walkContext}
              start={walkStart}
              lookToward={walkLookToward ?? walkStart}
              domSelector=".dg-walk-viewport"
              onLockedChange={setWalkLocked}
              onCellChange={setPlayerCell}
            />
          ) : isPlaying && walkStart ? (
            <PlayCamera
              ctx={walkContext}
              start={walkStart}
              onCellChange={setPlayerCell}
            />
          ) : (
            <OrbitControls makeDefault />
          )}
        </Canvas>
        {isWalking && !walkLocked && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              background: 'rgba(12,10,8,0.6)',
              color: '#e8e2d8',
              fontSize: 13,
              cursor: 'pointer',
              pointerEvents: 'none', // the click itself is caught by dg-walk-viewport's own PointerLockControls listener, not this overlay
            }}
          >
            Click to look around — WASD to move, mouse to look, Esc to release
            the mouse.
          </div>
        )}
        {isPlaying && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              padding: '4px 8px',
              background: 'rgba(12,10,8,0.6)',
              color: '#8a7a5a',
              fontSize: 11,
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            WASD to move · Q/E or right-drag to rotate · scroll to zoom — the
            game's own tactical camera.
          </div>
        )}
      </div>
      {/* Orbit / Play / Walk — Play ordered right after Orbit
          (deliberately, not alphabetically): it needs no click-to-lock
          step at all, so it's the lowest-friction way off Orbit — "the
          fidelity-check mode he actually needs" (Kirk, on Play vs. the
          literal Walk mode). */}
      <div
        role="group"
        aria-label="Camera mode"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 2,
          border: '1px solid var(--border-primary)',
          borderRadius: 5,
          padding: 2,
          background: '#14110f',
        }}
      >
        {(
          [
            { mode: 'orbit' as const, label: 'Orbit' },
            { mode: 'play' as const, label: 'Play' },
            { mode: 'walk' as const, label: 'Walk' },
          ] as const
        ).map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => handleSelectCameraMode(mode)}
            title={
              mode === 'orbit'
                ? 'Orbit camera — edit/select/place'
                : !walkStart
                  ? 'No floor to walk on yet'
                  : mode === 'play'
                    ? "The game's own tactical camera, following WASD movement (view-only)"
                    : 'Player-perspective eye-level camera, WASD + mouse-look (view-only)'
            }
            style={{
              padding: '3px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              background: cameraMode === mode ? '#5fd1c9' : 'transparent',
              color: cameraMode === mode ? '#14110f' : '#e8e2d8',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Orbit-only projection toggle (world-parity unit) — perspective vs
          orthographic. Positioned below the camera-mode group, only
          rendered while Orbit is active: Play/Walk already fix their own
          projection (orthographic, matching the game) and aren't a place
          this choice applies. See the `orbitOrthographic` state's own doc
          comment above for why this is a toggle Kirk drives, not a
          default this file silently changes. */}
      {cameraMode === 'orbit' && (
        <button
          onClick={handleToggleOrbitProjection}
          title={
            orbitOrthographic
              ? 'Orthographic — matches the tactical camera exactly (same projection Play/the live game use). Click to switch back to perspective.'
              : 'Perspective (default) — easier close-up legibility while placing, but not what the tactical camera actually shows for an off-center rotation. Click to preview orthographic instead.'
          }
          style={{
            position: 'absolute',
            top: 40,
            right: 8,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 5,
            border: '1px solid var(--border-primary)',
            cursor: 'pointer',
            background: orbitOrthographic ? '#5fd1c9' : '#14110f',
            color: orbitOrthographic ? '#14110f' : '#e8e2d8',
          }}
        >
          {orbitOrthographic ? 'Orthographic' : 'Perspective'}
        </button>
      )}
    </div>
  );
}
