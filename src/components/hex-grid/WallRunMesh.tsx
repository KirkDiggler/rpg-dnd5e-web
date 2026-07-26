/**
 * WallRunMesh — real Synty modular render of the dungeon-walls redesign's
 * computed envelope/connector runs (rpg-project#133 design.md/plan.md's W3
 * slice). Tiles repeated `wall` "plain" pieces along each run (a run spans
 * many hex-units, not the single hex-edge a "wall" piece is calibrated
 * for — see wallRunMeshHelpers.tileWallSegment's doc comment) and places a
 * `wall-corner-outer` fitting at each room's 4 envelope corners
 * (wallRuns.EnvelopeCorner — computed as the actual line intersection of
 * the two adjacent sides' own offset lines, closing Kirk's #1 prod-
 * screenshot defect: "the placeholder butt-joins visibly don't meet at
 * room corners"). W2's placeholder extruded boxes are gone; this is real
 * geometry now.
 *
 * A "run" here is still just a straight line between two world points
 * (WallRunSegment) — this component has no notion of hex adjacency, cube
 * coordinates, or region membership at all; that's entirely wallRuns.ts's
 * job. The floor skirt (covering the half-hex scallop between the true hex
 * floor edge and the wall line) stays a placeholder box — W3's scope is
 * wall/corner/door-frame meshes (plan.md), not the skirt.
 */

import type {
  ConnectorRun,
  EnvelopeCorner,
  EnvelopeRun,
  WallRunSegment,
} from '@/hooks/wallRuns';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { Suspense, useMemo } from 'react';
import type * as THREE from 'three';
import { GlbInstance } from './GlbInstance';
import {
  FITTINGS,
  fittingScale,
  WALL_TINT_BY_THEME,
  WALL_VARIANTS,
  type WallTheme,
} from './syntyHexWallHelpers';
import {
  segmentKey,
  tileWallSegment,
  wallRunBoxTransform,
} from './wallRunMeshHelpers';

/** Floor skirt colors/depth — still placeholder (W3's scope is the wall/
 * corner meshes, not the skirt; see this file's own doc comment). */
const FLOOR_SKIRT_COLOR = '#3a3630';
const FLOOR_SKIRT_DEPTH = 1.5;
const FLOOR_SKIRT_HEIGHT = 0.02;

// The "wall" role's calibrated "plain" segment (rpg-game-assets manifest,
// harness/models/synty/env/manifest.json's roles.wall.variants[0]) — the
// SAME piece SyntyHexWall's legacy per-cell renderer already uses for a
// single hex edge. Runs tile repeated copies of this piece rather than
// stretching one instance (real Synty modular-kit convention). Deliberately
// not the broken/alcove variety pool: a long straight run reads as
// deliberate architecture, not per-edge rubble variety.
const RUN_WALL_VARIANT = WALL_VARIANTS[0]!;
// The "wall" role's "edge" fit formula squeezes this variant to exactly
// 1.0 world unit wide — that calibrated width is also this module's tiling
// nominal (see tileWallSegment's doc comment for why tiling, not
// stretching, is correct here).
const NOMINAL_PIECE_WIDTH = 1.0;

function FloorSkirtBox({ segment }: { segment: WallRunSegment }) {
  const { position, rotationY, length } = wallRunBoxTransform(segment);
  if (length === 0) return null;
  return (
    <mesh
      position={[position.x, FLOOR_SKIRT_HEIGHT / 2, position.z]}
      rotation={[0, rotationY, 0]}
    >
      <boxGeometry args={[length, FLOOR_SKIRT_HEIGHT, FLOOR_SKIRT_DEPTH]} />
      <meshStandardMaterial color={FLOOR_SKIRT_COLOR} />
    </mesh>
  );
}

function TiledWallRun({
  segment,
  wallHeight,
  tint,
}: {
  segment: WallRunSegment;
  wallHeight: number;
  tint?: THREE.Color;
}) {
  const pieces = useMemo(
    () => tileWallSegment(segment, NOMINAL_PIECE_WIDTH),
    [segment]
  );
  return (
    <>
      {pieces.map((piece, i) => (
        <GlbInstance
          key={i}
          file={RUN_WALL_VARIANT.file}
          position={piece.position}
          rotationY={piece.rotationY}
          // Same "edge" fit shape as wallVariantScale (width/height/thickness),
          // but width targets THIS instance's own tiled pieceWidth rather
          // than a fixed 1.0 hex edge — see tileWallSegment's doc comment
          // for why tiling divides a run's real length evenly across N
          // pieces instead of stretching a single instance to fit it.
          // Non-uniform per-axis scale is safe here — GlbInstance bakes it
          // into a per-instance cloned geometry with recomputed normals
          // (see its own doc comment for the black-wall defect this fixes).
          scale={[
            piece.pieceWidth / RUN_WALL_VARIANT.rawWidth,
            wallHeight / RUN_WALL_VARIANT.rawHeight,
            SYNTY_SCALE,
          ]}
          tint={tint}
        />
      ))}
    </>
  );
}

export interface WallRunMeshProps {
  envelopeRuns: EnvelopeRun[];
  envelopeCorners?: EnvelopeCorner[];
  connectorRuns: ConnectorRun[];
  /** Extra column-aligned straight segments to render with the SAME
   * tiled-run visual language as envelope/connector runs (dungeon-walls
   * redesign's W3 "fallback restyle" ask): the structural safety-net
   * candidates wallRunAdapters.connectorFallbackSegments computes for
   * connector-flanking cells not yet covered by a real ConnectorRun
   * (frontier doors, far room unexplored) — same invisible-wall coverage,
   * just rendered as a short straight tile instead of the legacy per-cell
   * hex-vertex box. Empty/omitted (every caller not yet updated) renders
   * nothing extra, unchanged from before this prop existed. */
  fallbackSegments?: WallRunSegment[];
  /** Wall height, world units — defaults to the game's standard
   * WALL_HEIGHT (calibrationConstants.ts) so this matches every other
   * wall renderer without callers having to pass it explicitly. */
  wallHeight?: number;
  /** Whole-space theme (rpg-dnd5e-web#558) — tints every tiled piece and
   * corner fitting the same way SyntyHexWall's legacy renderer already
   * tints per-cell pieces, so a themed dungeon's straight runs match its
   * doors/interior walls instead of standing out in the pack's default
   * material. Undefined (every caller before this design) renders
   * untinted, unchanged. */
  spaceTheme?: WallTheme;
}

const DEFAULT_WALL_HEIGHT = 0.8; // matches calibrationConstants.WALL_HEIGHT

/**
 * Renders every envelope run, connector run segment, and connector
 * fallback segment as tiled real Synty wall pieces, plus one
 * `wall-corner-outer` fitting per envelope corner. Own Suspense boundary
 * (matching SyntyHexWall's convention) — GLB loading can suspend, unlike
 * W2's placeholder boxes, which needed none. The caller's ErrorBoundary
 * (HexGrid.tsx, same one wrapping SyntyHexWall) still catches a terminal
 * load failure past this Suspense.
 */
export function WallRunMesh({
  envelopeRuns,
  envelopeCorners = [],
  connectorRuns,
  fallbackSegments = [],
  wallHeight = DEFAULT_WALL_HEIGHT,
  spaceTheme,
}: WallRunMeshProps) {
  const connectorSegments = useMemo(
    () => connectorRuns.flatMap((run) => run.segments),
    [connectorRuns]
  );
  const tint = spaceTheme ? WALL_TINT_BY_THEME[spaceTheme] : undefined;
  const cornerFitting = FITTINGS['wall-corner-outer'];

  return (
    <Suspense fallback={null}>
      {envelopeRuns.map((run) => (
        <group key={`${run.regionId}-${run.side}`}>
          <TiledWallRun segment={run} wallHeight={wallHeight} tint={tint} />
          <FloorSkirtBox segment={run} />
        </group>
      ))}
      {envelopeCorners.map((corner) => (
        <GlbInstance
          key={`${corner.regionId}-${corner.corner}`}
          file={cornerFitting.file}
          position={corner.position}
          rotationY={corner.rotationY}
          scale={fittingScale(cornerFitting, wallHeight)}
          tint={tint}
        />
      ))}
      {connectorSegments.map((segment) => (
        <group key={segmentKey(segment)}>
          <TiledWallRun segment={segment} wallHeight={wallHeight} tint={tint} />
          <FloorSkirtBox segment={segment} />
        </group>
      ))}
      {fallbackSegments.map((segment) => (
        <group key={`fallback-${segmentKey(segment)}`}>
          <TiledWallRun segment={segment} wallHeight={wallHeight} tint={tint} />
          <FloorSkirtBox segment={segment} />
        </group>
      ))}
    </Suspense>
  );
}
