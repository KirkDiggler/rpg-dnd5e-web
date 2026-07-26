/**
 * WallRunMesh — W2's render half of the dungeon-walls redesign
 * (rpg-project#133 design.md/plan.md). Draws wallRuns.ts's computed
 * envelope/connector runs as straight PLACEHOLDER extruded boxes (plan.md:
 * "simple extruded boxes") plus a floor skirt covering the half-hex
 * scallop between the true hex floor edge and the wall line. W3 swaps
 * these boxes for real Synty modular segment/corner/door-frame meshes —
 * this component's geometry (one straight box per run segment) is exactly
 * what a modular piece run replaces, piece by piece, without touching the
 * run computation itself.
 *
 * A "run" here is deliberately just a straight line between two world
 * points (WallRunSegment) — this component has no notion of hex
 * adjacency, cube coordinates, or region membership at all; that's
 * entirely wallRuns.ts's job. This keeps the render layer trivially
 * simple and the one genuinely tricky computation (W1) isolated from
 * rendering concerns, matching this design's stated split.
 */

import type {
  ConnectorRun,
  EnvelopeRun,
  WallRunSegment,
} from '@/hooks/wallRuns';
import {
  CRYPT_MEMORY_COLOR,
  CRYPT_MEMORY_EMISSIVE,
  CRYPT_MEMORY_EMISSIVE_INTENSITY,
  CRYPT_MEMORY_OPACITY,
} from './sceneKnowledge';
import { segmentKey, wallRunBoxTransform } from './wallRunMeshHelpers';

/** Placeholder wall thickness (world units) — W3 replaces this box with a
 * real Synty modular piece whose own thickness governs the look; this
 * only needs to read clearly as "a wall," not match final art. */
const WALL_RUN_THICKNESS = 0.15;

/** Placeholder wall + skirt colors — neutral stone/floor tones so the
 * placeholder reads as "structure" against ShadedHexFloor/SyntyHexFloor's
 * existing floor tiles without competing with real Synty materials once
 * W3 lands. */
const WALL_RUN_COLOR = '#5b5f66';
const FLOOR_SKIRT_COLOR = '#3a3630';

/** Floor skirt depth (world units, the axis perpendicular to the run) —
 * deliberately generous (covers past the wall's own footprint on one
 * side and back toward the room's floor tiles on the other) rather than
 * precisely matched to the exact envelope offset: this is a placeholder
 * "make sure nothing scallops" slab, not a final-art seam. Overlapping
 * slightly under the wall box or slightly past it into unrevealed
 * darkness is harmless — both are already-covered/invisible in either
 * case. */
const FLOOR_SKIRT_DEPTH = 1.5;
const FLOOR_SKIRT_HEIGHT = 0.02;

function WallRunBox({
  segment,
  wallHeight,
  remembered = false,
}: {
  segment: WallRunSegment;
  wallHeight: number;
  remembered?: boolean;
}) {
  const { position, rotationY, length } = wallRunBoxTransform(segment);
  if (length === 0) return null;
  return (
    <mesh
      position={[position.x, wallHeight / 2, position.z]}
      rotation={[0, rotationY, 0]}
    >
      <boxGeometry args={[length, wallHeight, WALL_RUN_THICKNESS]} />
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
        <meshStandardMaterial color={WALL_RUN_COLOR} />
      )}
    </mesh>
  );
}

function FloorSkirtBox({
  segment,
  remembered = false,
}: {
  segment: WallRunSegment;
  remembered?: boolean;
}) {
  const { position, rotationY, length } = wallRunBoxTransform(segment);
  if (length === 0) return null;
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

export interface WallRunMeshProps {
  envelopeRuns: EnvelopeRun[];
  connectorRuns: ConnectorRun[];
  rememberedEnvelopeRegionIds?: ReadonlySet<string>;
  rememberedConnectorDoorIds?: ReadonlySet<string>;
  /** Wall height, world units — defaults to the game's standard
   * WALL_HEIGHT (calibrationConstants.ts) so this matches every other
   * wall renderer without callers having to pass it explicitly. */
  wallHeight?: number;
}

const DEFAULT_WALL_HEIGHT = 0.8; // matches calibrationConstants.WALL_HEIGHT

/**
 * Renders every envelope run and every connector run segment as a
 * placeholder box + floor skirt. Stateless and Suspense-free (no GLB
 * loading, unlike SyntyHexWall) — safe to mount unconditionally alongside
 * the existing wall renderers.
 */
export function WallRunMesh({
  envelopeRuns,
  connectorRuns,
  rememberedEnvelopeRegionIds,
  rememberedConnectorDoorIds,
  wallHeight = DEFAULT_WALL_HEIGHT,
}: WallRunMeshProps) {
  return (
    <>
      {envelopeRuns.map((run) => (
        <group key={`${run.regionId}-${run.side}`}>
          <WallRunBox
            segment={run}
            wallHeight={wallHeight}
            remembered={rememberedEnvelopeRegionIds?.has(run.regionId)}
          />
          <FloorSkirtBox
            segment={run}
            remembered={rememberedEnvelopeRegionIds?.has(run.regionId)}
          />
        </group>
      ))}
      {connectorRuns.flatMap((run) =>
        run.segments.map((segment) => {
          const remembered =
            !!run.doorId && rememberedConnectorDoorIds?.has(run.doorId);
          return (
            <group key={segmentKey(segment)}>
              <WallRunBox
                segment={segment}
                wallHeight={wallHeight}
                remembered={remembered}
              />
              <FloorSkirtBox segment={segment} remembered={remembered} />
            </group>
          );
        })
      )}
    </>
  );
}
