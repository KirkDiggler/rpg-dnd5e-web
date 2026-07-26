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
 *
 * Fog-of-war memory (rpg-dnd5e-web#601/#602 scene-knowledge contract,
 * merged in here): `rememberedEnvelopeRegionIds`/`rememberedConnectorDoorIds`
 * mark which regions/connectors are "seen before, not currently visible" —
 * every tiled piece (and the corner fitting) for a remembered region/
 * connector renders via `GlbInstance`'s own `remembered` prop (the
 * crypt-memory look) instead of `spaceTheme`'s tint. #602 introduced this
 * contract against the OLD placeholder-box WallRunMesh (a `remembered`
 * boolean swapping `meshStandardMaterial`); this is the same contract
 * re-expressed against real tiled Synty pieces. Fallback segments
 * (`fallbackSegments`, this branch's own addition, postdating #602) have
 * no natural regionId/doorId of their own to match against a remembered
 * set — see `WallRunMeshProps.fallbackSegments`'s doc comment.
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
import type { WorldPos } from './hexMath';
import {
  CRYPT_MEMORY_COLOR,
  CRYPT_MEMORY_EMISSIVE,
  CRYPT_MEMORY_EMISSIVE_INTENSITY,
  CRYPT_MEMORY_OPACITY,
} from './sceneKnowledge';
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
// RUN_WALL_VARIANT's own local bbox pivot ratio (see tileWallSegment's
// `pivotRatio` param and WallVariant.rawMinX's doc comment) — round-2
// W3/W4 finding: this piece's local origin sits near its own left bbox
// edge, not centered, so tiling by (i + 0.5) alone shifted the whole run
// off its own segment line by ~0.456 world units.
const RUN_WALL_PIVOT_RATIO =
  RUN_WALL_VARIANT.rawMinX / RUN_WALL_VARIANT.rawWidth;

function FloorSkirtBox({
  segment,
  remembered = false,
}: {
  segment: WallRunSegment;
  remembered?: boolean;
}) {
  const { position, rotationY, length } = wallRunBoxTransform(segment);
  if (length === 0) return null;
  // Still a placeholder box (this file's own doc comment) — #602's
  // crypt-memory material swap applies directly here since it never
  // became a GlbInstance, so the skirt dims consistently with the real
  // wall piece standing on it.
  return (
    <mesh
      position={[position.x, FLOOR_SKIRT_HEIGHT / 2, position.z]}
      rotation={[0, rotationY, 0]}
    >
      <boxGeometry args={[length, FLOOR_SKIRT_HEIGHT, FLOOR_SKIRT_DEPTH]} />
      {remembered ? (
        <meshStandardMaterial
          color={CRYPT_MEMORY_COLOR}
          emissive={CRYPT_MEMORY_EMISSIVE}
          emissiveIntensity={CRYPT_MEMORY_EMISSIVE_INTENSITY}
          opacity={CRYPT_MEMORY_OPACITY}
          transparent={false}
          depthWrite
        />
      ) : (
        <meshStandardMaterial color={FLOOR_SKIRT_COLOR} />
      )}
    </mesh>
  );
}

function TiledWallRun({
  segment,
  wallHeight,
  tint,
  remembered = false,
  facing,
}: {
  segment: WallRunSegment;
  wallHeight: number;
  tint?: THREE.Color;
  remembered?: boolean;
  /** See tileWallSegment's own `facing` param doc comment (round-2 W3/W4
   * "west wall is a featureless dark slab" fix) — omitted for callers
   * with no defensible outward reference (fallback segments), which keep
   * the pre-fix direction-only rotationY. */
  facing?: WorldPos;
}) {
  const pieces = useMemo(
    () =>
      tileWallSegment(
        segment,
        NOMINAL_PIECE_WIDTH,
        RUN_WALL_PIVOT_RATIO,
        facing
      ),
    [segment, facing]
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
          remembered={remembered}
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
   * nothing extra, unchanged from before this prop existed.
   *
   * Not currently matched against `rememberedConnectorDoorIds`: a
   * fallback segment exists precisely because NO region/connector data
   * was known yet at that column (see connectorFallbackSegments' own doc
   * comment) — by the time a connector is old enough to be "remembered"
   * (previously seen, now out of sight) rather than merely unresolved,
   * both its regions have necessarily been known at some point, so it
   * should already have graduated to a real ConnectorRun. Latent, not
   * load-bearing today; flagged here for whoever wires a real
   * remembered-hexes data source (fog-of-war Task 2+).
   */
  fallbackSegments?: WallRunSegment[];
  /** Fog-of-war memory (rpg-dnd5e-web#601/#602 scene-knowledge contract):
   * region ids whose envelope (all 4 sides + corner) should render via
   * `GlbInstance`'s `remembered` look instead of `spaceTheme`'s tint.
   * Undefined/empty (every caller before this prop existed) renders every
   * envelope normally. */
  rememberedEnvelopeRegionIds?: ReadonlySet<string>;
  /** Fog-of-war memory (rpg-dnd5e-web#601/#602): door ids whose connector
   * run should render remembered. Undefined/empty renders every
   * connector normally. */
  rememberedConnectorDoorIds?: ReadonlySet<string>;
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
  rememberedEnvelopeRegionIds,
  rememberedConnectorDoorIds,
  wallHeight = DEFAULT_WALL_HEIGHT,
  spaceTheme,
}: WallRunMeshProps) {
  const tint = spaceTheme ? WALL_TINT_BY_THEME[spaceTheme] : undefined;
  const cornerFitting = FITTINGS['wall-corner-outer'];

  return (
    <Suspense fallback={null}>
      {envelopeRuns.map((run) => {
        const remembered = !!rememberedEnvelopeRegionIds?.has(run.regionId);
        return (
          <group key={`${run.regionId}-${run.side}`}>
            <TiledWallRun
              segment={run}
              wallHeight={wallHeight}
              tint={tint}
              remembered={remembered}
              facing={run.facing}
            />
            <FloorSkirtBox segment={run} remembered={remembered} />
          </group>
        );
      })}
      {envelopeCorners.map((corner) => (
        <GlbInstance
          key={`${corner.regionId}-${corner.corner}`}
          file={cornerFitting.file}
          position={corner.position}
          rotationY={corner.rotationY}
          scale={fittingScale(cornerFitting, wallHeight)}
          tint={tint}
          remembered={!!rememberedEnvelopeRegionIds?.has(corner.regionId)}
        />
      ))}
      {connectorRuns.flatMap((run) => {
        const remembered =
          !!run.doorId && !!rememberedConnectorDoorIds?.has(run.doorId);
        return run.segments.map((segment) => (
          <group key={segmentKey(segment)}>
            <TiledWallRun
              segment={segment}
              wallHeight={wallHeight}
              tint={tint}
              remembered={remembered}
              facing={run.facing}
            />
            <FloorSkirtBox segment={segment} remembered={remembered} />
          </group>
        ));
      })}
      {fallbackSegments.map((segment) => (
        <group key={`fallback-${segmentKey(segment)}`}>
          <TiledWallRun segment={segment} wallHeight={wallHeight} tint={tint} />
          <FloorSkirtBox segment={segment} />
        </group>
      ))}
    </Suspense>
  );
}
