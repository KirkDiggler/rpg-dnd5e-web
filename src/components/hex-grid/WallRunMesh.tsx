/**
 * WallRunMesh — real Synty modular render of the dungeon-walls redesign's
 * computed envelope/connector runs (rpg-project#133 design.md/plan.md's W3
 * slice). Tiles repeated `wall` "plain" pieces along each run (a run spans
 * many hex-units, not the single hex-edge a "wall" piece is calibrated
 * for — see wallRunMeshHelpers.tileWallSegment's doc comment). Adjacent
 * runs meet at room corners via the "overlap-miter" cheat (each run
 * extended past the true corner intersection so the two overlap and
 * self-cover the joint) rather than a dedicated corner-fitting GLB — see
 * this file's own `WallRunMesh` doc comment for why. W2's placeholder
 * extruded boxes are gone; this is real geometry now.
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
 * every tiled piece for a remembered region/connector renders via
 * `GlbInstance`'s own `remembered` prop (the crypt-memory look) instead of
 * `spaceTheme`'s tint. #602 introduced this contract against the OLD
 * placeholder-box WallRunMesh (a `remembered` boolean swapping
 * `meshStandardMaterial`); this is the same contract re-expressed against
 * real tiled Synty pieces. Fallback segments (`fallbackSegments`, this
 * branch's own addition, postdating #602) have no natural regionId/doorId
 * of their own to match against a remembered set — see
 * `WallRunMeshProps.fallbackSegments`'s doc comment.
 */

import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import type {
  ConnectorRun,
  EnvelopeCorner,
  EnvelopeRun,
  WallRunSegment,
} from '@/hooks/wallRuns';
import { SYNTY_SCALE, WALL_HEIGHT } from '@/rendering/calibrationConstants';
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
  WALL_TINT_BY_THEME,
  WALL_VARIANTS,
  type WallTheme,
} from './syntyHexWallHelpers';
import {
  connectorPartitionHeight,
  effectiveWallHeight,
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

/**
 * Overlap grown onto each side of every tiled wall piece (rpg-dnd5e-web
 * #634: Kirk's tall-wall-default walk found visible air gaps between
 * adjacent wall segments, worse in the lower half). Root-caused via an
 * isolated two-tile render (measuring the ACTUAL rendered silhouette, not
 * just the theoretical bounding box, which already met flush with zero
 * gap by construction — see `tileWallSegment`'s own `overlapMargin` doc
 * comment): `RUN_WALL_VARIANT`'s ("plain," this run tiling's only
 * variant — this file's own doc comment on why) authored edge silhouette
 * is a deliberately irregular rock-cut profile, not a flat rectangle, and
 * recedes inward from its own bounding box by up to ~0.05 world units in
 * its lower ~60% specifically (measured directly against the real GLB).
 * 0.08 comfortably covers that measured worst case with margin to spare,
 * without visibly bulging the seam.
 */
const RUN_WALL_TILE_OVERLAP_MARGIN = 0.08;

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
        facing,
        RUN_WALL_TILE_OVERLAP_MARGIN
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
  /**
   * A canvas (authored) dungeon's own real wall edges, chained into
   * straight runs by `authoredWallRuns.computeAuthoredWallRuns` — the
   * same tiled-Synty-piece language as `envelopeRuns`, but derived
   * directly from real wall EDGES rather than a region's bounding box
   * (rpg-dnd5e-web#720 "zones are not rooms": an authored dungeon's
   * `regions:` are semantic-only zones with no guaranteed relationship to
   * real wall truth, so envelope/connector geometry can't be trusted for
   * them the way it can for a chain-generated room). Carries its own
   * `facing` (derived from its wall network's own vertex centroid, the
   * closest available stand-in for "room center" a zone-independent
   * module has), so it gets the same `facingCorrectedRotationY` treatment
   * envelope runs do. Empty/omitted (every caller before this prop
   * existed, and any chain-generated dungeon, which has no authored wall
   * edges at all) renders nothing extra, unchanged.
   *
   * Not currently matched against `rememberedEnvelopeRegionIds` — an
   * authored run has no `regionId` of its own to key against (it can span
   * or ignore zone boundaries entirely); fog-of-war memory for authored
   * dungeons is a follow-up, not a regression this prop introduces
   * (chain dungeons, the only routes with fog-of-war memory wired up
   * today, never populate this prop at all).
   */
  authoredRuns?: AuthoredWallRun[];
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
   * wall renderer without callers having to pass it explicitly. Doubles as
   * the cutaway prototype's TALL height when `wallCutaway` is set (team
   * ask: "make the tall value the ?wallHeight dial so the ladder composes
   * with cutaway"). */
  wallHeight?: number;
  /** Cutaway prototype (rpg-project#132, `?wallCutaway=1`): classifies each
   * ENVELOPE run as camera-facing (stub, `CUTAWAY_STUB_WALL_HEIGHT`) or
   * away-facing (tall, `wallHeight`) via its own `facing` vector — see
   * `effectiveWallHeight`'s own doc comment. Connector runs and their
   * fallback stand-ins use a DIFFERENT rule (`connectorPartitionHeight`,
   * keyed off `playerPosition` below) — interior partitions default tall
   * and stub only when they'd occlude the player's own current room, per
   * Kirk's live-walk follow-up ("envelope walls keep the existing dot
   * rule... interior partitions default TALL"). Default false renders
   * every run at the uniform `wallHeight`, unchanged from before this
   * prop existed. Corners where a tall run meets a stub are NOT
   * reconciled in this prototype (each run keeps its own height; judge
   * the look first, polish the joint after). */
  wallCutaway?: boolean;
  /** The local player's own current world position (`EncounterMap`'s
   * `myWorldXZ`, converted to this shape) — the cutaway prototype's
   * interior-partition classification (`connectorPartitionHeight`) needs
   * this to decide whether a connector run/fallback segment sits between
   * the camera and the player's own current room. Undefined (every
   * caller before this prop existed, or a player position not yet
   * resolved) defaults every connector/fallback partition to the tall
   * height — the same safe "interior partitions default TALL" fallback
   * as no cutaway at all. */
  playerPosition?: WorldPos;
  /** Whole-space theme (rpg-dnd5e-web#558) — tints every tiled piece and
   * corner fitting the same way SyntyHexWall's legacy renderer already
   * tints per-cell pieces, so a themed dungeon's straight runs match its
   * doors/interior walls instead of standing out in the pack's default
   * material. Undefined (every caller before this design) renders
   * untinted, unchanged. */
  spaceTheme?: WallTheme;
}

/**
 * Renders every envelope run, connector run segment, and connector
 * fallback segment as tiled real Synty wall pieces. Own Suspense boundary
 * (matching SyntyHexWall's convention) — GLB loading can suspend, unlike
 * W2's placeholder boxes, which needed none. The caller's ErrorBoundary
 * (HexGrid.tsx, same one wrapping SyntyHexWall) still catches a terminal
 * load failure past this Suspense.
 *
 * No dedicated corner-fitting GLB is placed at `envelopeCorners` (round-2
 * W3/W4 finding; verdict recorded in rpg-game-assets' env-role-map
 * fittings notes, PR #33, merged): `SM_Env_Wall_End_Coner_Outer_01.glb`
 * and its End/Coner_Inner siblings are correctly-converted tall narrow
 * corner POSTS with faceted brick relief, but the wall role's fit squash
 * (~6x Y-compression to reach WALL_HEIGHT) reduces that relief to a
 * "stacked wafer" look post-shaped pieces don't survive — a squash panel
 * pieces tolerate fine. This is PERMANENT, not an interim measure — no
 * re-conversion of this family is coming; post-shaped pieces simply
 * don't map to wall roles. Rather than adopt a different GLB for this
 * slot, `envelopeGeometryForRegion`'s own `cornerExtension` (wallRuns.ts)
 * now pushes each side's tiled run PAST the true corner intersection far
 * enough that the two perpendicular runs visually overlap and self-cover
 * the joint — the standard modular-kit "overlap-miter" cheat, zero new
 * assets, picked over a small stand-in panel (`SM_Env_Wall_Quarter_01`)
 * after a live side-by-side comparison at the same corner (the panel
 * left a visible gap at this piece's own current scale/pivot; the
 * overlap-miter read as a single clean corner). `envelopeCorners` is
 * still accepted (and still exactly, correctly computed by wallRuns.ts —
 * true line-intersection position/outward rotation) for whenever a
 * corner piece that survives the squash exists; not read by this
 * component today.
 */
export function WallRunMesh({
  envelopeRuns,
  connectorRuns,
  fallbackSegments = [],
  authoredRuns = [],
  rememberedEnvelopeRegionIds,
  rememberedConnectorDoorIds,
  wallHeight = WALL_HEIGHT,
  wallCutaway = false,
  playerPosition,
  spaceTheme,
}: WallRunMeshProps) {
  const tint = spaceTheme ? WALL_TINT_BY_THEME[spaceTheme] : undefined;

  return (
    <Suspense fallback={null}>
      {envelopeRuns.map((run) => {
        const remembered = !!rememberedEnvelopeRegionIds?.has(run.regionId);
        const height = effectiveWallHeight(run.facing, wallCutaway, wallHeight);
        return (
          <group key={`${run.regionId}-${run.side}`}>
            <TiledWallRun
              segment={run}
              wallHeight={height}
              tint={tint}
              remembered={remembered}
              facing={run.facing}
            />
            <FloorSkirtBox segment={run} remembered={remembered} />
          </group>
        );
      })}
      {authoredRuns.map((run) => {
        // Same envelope-side height rule as envelopeRuns above (both
        // carry a real outward `facing`, unlike a connector/fallback
        // interior partition) — see `authoredRuns`' own prop doc comment
        // for why this run has no regionId to key fog-of-war memory
        // against yet.
        const height = effectiveWallHeight(run.facing, wallCutaway, wallHeight);
        // The AUTHORED multiplier composes onto whatever the cutaway
        // ladder chose (rpg-project#273): `run.height` is 0 when not
        // authored — mapped to 1, never multiplied raw (the wire's own
        // contract: "said nothing" and "said 1.0" render identically).
        const authored = run.height > 0 ? run.height : 1;
        return (
          <group key={run.key}>
            <TiledWallRun
              segment={run}
              wallHeight={height * authored}
              tint={tint}
              facing={run.facing}
            />
            <FloorSkirtBox segment={run} />
          </group>
        );
      })}
      {connectorRuns.flatMap((run) => {
        const remembered =
          !!run.doorId && !!rememberedConnectorDoorIds?.has(run.doorId);
        // Interior partition rule (rpg-project#132 follow-up), NOT
        // effectiveWallHeight's envelope rule — classified ONCE per run
        // (a single representative point on the connector's own line),
        // then applied to every one of its segments, so the near/far
        // halves of the SAME connector never disagree with each other.
        const partitionPoint = run.segments[0]
          ? wallRunBoxTransform(run.segments[0]).position
          : undefined;
        const height = partitionPoint
          ? connectorPartitionHeight(
              partitionPoint,
              playerPosition,
              wallCutaway,
              wallHeight
            )
          : wallHeight;
        return run.segments.map((segment) => (
          <group key={segmentKey(segment)}>
            <TiledWallRun
              segment={segment}
              wallHeight={height}
              tint={tint}
              remembered={remembered}
              facing={run.facing}
            />
            <FloorSkirtBox segment={segment} remembered={remembered} />
          </group>
        ));
      })}
      {fallbackSegments.map((segment) => {
        // A fallback stand-in sits on the SAME column line a real
        // ConnectorRun would eventually resolve to (design.md's own
        // "structural safety net" framing) — classifying it with the
        // identical interior-partition rule, keyed off its own segment
        // midpoint, is what makes closed (fallback) and open (real run)
        // render at the SAME height instead of popping (Kirk's live-walk
        // finding: "door height pops on open").
        const height = connectorPartitionHeight(
          wallRunBoxTransform(segment).position,
          playerPosition,
          wallCutaway,
          wallHeight
        );
        return (
          <group key={`fallback-${segmentKey(segment)}`}>
            <TiledWallRun segment={segment} wallHeight={height} tint={tint} />
            <FloorSkirtBox segment={segment} />
          </group>
        );
      })}
    </Suspense>
  );
}
