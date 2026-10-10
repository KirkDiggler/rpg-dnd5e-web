import type { RegionLightingMaterialBinding } from '@/rendering/regionLightingMaterials';
/**
 * Shared real-asset surfaces for authored structural walls.
 *
 * Repeated wall pieces fill the visible cut spans, with one fitted, swinging
 * door per attached opening. These leaves consume caller-supplied visual data;
 * the editor supplies authored starting-state previews. They own no player
 * visibility, session delivery or gameplay state.
 *
 * These leaves render NO guides and NO hit targets: wall hit boxes and the
 * selected-blocker wireframe are editor-only and stay in `StructuralWallVisual`.
 *
 * THE PARENT TRANSFORM OWNS THE FULL EXACT FIT. A piece's parent group carries
 * the span pose AND the exact fit scale, including heights the shared model's
 * own `[0.25, 4]` heightScale clamp would otherwise silently shorten: the model
 * is passed its normal `heightScale` and the parent compensates its single
 * `DUNGEON_SURFACE_Y` lift so the floor lift is applied exactly once and is
 * never multiplied by the fit.
 *
 * Every derived wall mesh never raycasts. A door leaf raycasts ONLY when the
 * caller supplies a click. The editor supplies none, so its preview cannot
 * steal a floor gesture. Loading, error and refusal markers
 * are explicit, named, non-raycasting, and anchored at the wall/opening they
 * describe rather than at the world origin.
 */
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import {
  isAttachableDoorAsset,
  type FittedDoorPose,
} from './structuralDoorEditing';
import {
  isRepeatableWallAsset,
  layoutWallPieces,
  wallDirectionYaw,
  wallMidpoint,
} from './structuralWallEditing';
import type { StructuralWallSurface } from './structuralWalls';
import { WorldPropModel } from './WorldPropModel';

/** Where a wall's named marker belongs: at the wall itself, not the origin. A
 * wall too malformed to place one falls back to the origin only as a last
 * resort. */
function wallAnchor(wall: StructuralWallSurface): {
  position: [number, number, number];
  rotationY: number;
} {
  try {
    const midpoint = wallMidpoint(wall);
    return {
      position: [
        midpoint.x,
        DUNGEON_SURFACE_Y + wall.appearance.elevation + 0.35,
        midpoint.z,
      ],
      rotationY: wallDirectionYaw(wall),
    };
  } catch {
    return { position: [0, DUNGEON_SURFACE_Y + 0.35, 0], rotationY: 0 };
  }
}

/** Named, non-raycasting marker for a wall/opening's loading, error or refusal
 * state. It is never dressed up as the selected asset. */
export function WallMarker({
  wallId,
  tone,
  reason,
  position,
  rotationY = 0,
}: {
  wallId: string;
  tone: 'loading' | 'error' | 'refusal';
  reason?: string;
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <mesh
      name={`structural-wall-${tone}-${wallId}`}
      userData={{ wallId, reason }}
      position={position}
      rotation={[0, rotationY, 0]}
      raycast={() => null}
    >
      <boxGeometry args={[0.6, 0.8, 0.6]} />
      <meshBasicMaterial
        color={
          tone === 'loading'
            ? '#eab308'
            : tone === 'error'
              ? '#ef4444'
              : '#f97316'
        }
        wireframe
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A named loading/error marker for a WHOLE wall, anchored at the wall itself
 * rather than the origin. The caller owns the tone; the position is this
 * module's. Exported as a component (not a bare anchor helper) so the file
 * stays fast-refresh-safe and both callers share one anchor rule. */
export function StructuralWallFallbackMarker({
  wall,
  tone,
}: {
  wall: StructuralWallSurface;
  tone: 'loading' | 'error';
}) {
  const anchor = wallAnchor(wall);
  return (
    <WallMarker
      wallId={wall.id}
      tone={tone}
      position={anchor.position}
      rotationY={anchor.rotationY}
    />
  );
}

/**
 * The repeated real-asset wall surface. It derives its spans from the wall's
 * visible line via the shared cut helper and fills each one by repeating the
 * selected catalog asset. The derivation is capped and refuses by name instead
 * of allocating unboundedly. It renders no guide and no hit target, and every
 * mesh it owns is made non-raycasting.
 */
export function StructuralWallSurfacePieces({
  wall,
  maxPieces,
  onMeasured,
  visualLighting,
}: {
  wall: StructuralWallSurface;
  maxPieces?: number;
  visualLighting?: RegionLightingMaterialBinding;
  onMeasured?: () => void;
}) {
  const piecesRef = useRef<THREE.Group>(null);
  // Run on EVERY render: the derived pieces must be non-raycasting even after
  // an asset or loading/error state changes, and the markers are already
  // non-raycasting on their own. Scoped to this wall's own pieces, so a runtime
  // door rendered as a sibling keeps its click.
  useLayoutEffect(() => {
    const root = piecesRef.current;
    if (!root) return;
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        (object as THREE.Mesh).raycast = () => null;
      }
    });
  });
  const anchor = wallAnchor(wall);
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(wall.appearance.assetRef);
  if (!entry || entry.source !== 'generated' || !isRepeatableWallAsset(entry)) {
    return (
      <WallMarker
        wallId={wall.id}
        tone="error"
        reason={`no repeatable appearance asset ${wall.appearance.assetRef}`}
        position={anchor.position}
        rotationY={anchor.rotationY}
      />
    );
  }
  const [widthMeters, heightMeters, depthMeters] = entry.asset.boundsMeters;
  let layouts;
  try {
    layouts = layoutWallPieces({
      wall,
      sourceWidthMeters: widthMeters,
      sourceHeightMeters: heightMeters,
      sourceDepthMeters: depthMeters,
      maxPieces,
    });
  } catch (error) {
    return (
      <WallMarker
        wallId={wall.id}
        tone="refusal"
        reason={error instanceof Error ? error.message : String(error)}
        position={anchor.position}
        rotationY={anchor.rotationY}
      />
    );
  }
  return (
    <group ref={piecesRef} name={`structural-wall-pieces-${wall.id}`}>
      {layouts.flatMap((layout, spanIndex) =>
        layout.pieces.map((piece, pieceIndex) => {
          // The shared leaf adds `DUNGEON_SURFACE_Y` once, inside its own
          // group. The parent would scale that offset by the exact fit, so the
          // parent's own Y is lowered by the scaled amount: the net floor lift
          // is exactly `DUNGEON_SURFACE_Y`, unscaled, at the authored
          // elevation.
          const baseY = piece.y + DUNGEON_SURFACE_Y * (1 - piece.heightScale);
          return (
            <group
              key={`${spanIndex}-${pieceIndex}`}
              name={`structural-wall-piece-${wall.id}-${spanIndex}-${pieceIndex}`}
              userData={{
                wallId: wall.id,
                span: layout.span,
                baseY,
                heightScale: piece.heightScale,
              }}
              position={[piece.point.x, baseY, piece.point.z]}
              rotation={[0, piece.rotationY, 0]}
              scale={[piece.widthScale, piece.heightScale, piece.depthScale]}
            >
              <WorldPropModel
                entry={entry}
                visualLighting={visualLighting}
                position={[0, 0, 0]}
                rotationY={0}
                heightScale={1}
                onBoundsMeasured={onMeasured}
              />
            </group>
          );
        })
      )}
    </group>
  );
}

/** A door's mutable state, as the caller resolved it. `unknown` is a real
 * answer, not a synonym for closed: the leaf draws an explicit neutral
 * representation for it and never invents open/closed or substitutes an
 * opaque wall. */
export type FittedDoorState = 'open' | 'closed' | 'unknown';

/** A named, non-raycasting, neutral marker signalling that a door's mutable
 * state has not been observed. It is deliberately NOT the asset's own leaf
 * pose: an unknown doorway must not read as an invented open or closed door. */
function StructuralDoorUnknownMarker({
  doorId,
  position,
  rotationY,
  width,
  height,
  thickness,
}: {
  doorId: string;
  position: [number, number, number];
  rotationY: number;
  width: number;
  height: number;
  thickness: number;
}) {
  return (
    <mesh
      name={`structural-door-unknown-${doorId}`}
      userData={{ doorId, status: 'unknown' }}
      position={position}
      rotation={[0, rotationY, 0]}
      raycast={() => null}
    >
      <boxGeometry
        args={[
          Math.max(width, 0.05),
          Math.max(height, 0.05),
          Math.max(thickness, 0.02),
        ]}
      />
      <meshBasicMaterial
        color="#94a3b8"
        wireframe
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * One attached door, fitted to its opening and the wall's appearance through
 * the shared structural-parent technique. The caller supplies a RESOLVED
 * VISUAL POSE — the editor derives it from the owning opening
 * (`attachedDoorVisualPose`), the runtime derives it from the supplied door
 * endpoints (`structuralLayout.structuralDoorPose`). The caller also owns the
 * state ADAPTER (`state`) and click callback (`onClick`): the editor passes
 * the authored initial preview with no click, while the runtime passes the
 * observed state (or `unknown`) and a click only for a supplied known state.
 * This leaf neither queries nor interprets gameplay state. A
 * missing/ungenerated/non-leaf asset or unmeasured asset is a named marker at
 * the pose, never a substitute model.
 */
export function FittedDoorSurface({
  doorId,
  assetRef,
  pose,
  state,
  onMeasured,
  onClick,
  visualLighting,
}: {
  /** The door's canonical identity — the runtime joins observed state by it
   * and the editor carries the authored opening's door id. */
  doorId: string;
  visualLighting?: RegionLightingMaterialBinding;
  /** The door's opaque appearance content ref (`AtlasStructuralDoor.ref`, or
   * an opening's authored `assetRef`). */
  assetRef: string;
  /** The resolved visual pose, scene units. */
  pose: FittedDoorPose;
  /** The authored/observed state. `unknown` draws an explicit neutral
   * representation; it is never an invented open/closed pose. */
  state: FittedDoorState;
  onMeasured?: () => void;
  onClick?: () => void;
}) {
  if (state === 'unknown') {
    // The model's absent `open` prop is a closed rest pose, not an unknown
    // state. Render only the neutral supplied-layout marker until observed.
    return (
      <StructuralDoorUnknownMarker
        doorId={doorId}
        position={[
          pose.point.x,
          DUNGEON_SURFACE_Y + pose.y + pose.height / 2,
          pose.point.z,
        ]}
        rotationY={pose.rotationY}
        width={pose.width}
        height={pose.height}
        thickness={pose.thickness}
      />
    );
  }
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(assetRef);
  const anchor = {
    position: [
      pose.point.x,
      DUNGEON_SURFACE_Y + pose.y + 0.35,
      pose.point.z,
    ] as [number, number, number],
    rotationY: pose.rotationY,
  };
  if (
    !entry ||
    entry.source !== 'generated' ||
    !isAttachableDoorAsset(assetRef)
  ) {
    return (
      <WallMarker
        wallId={doorId}
        tone="error"
        reason={`no door asset ${assetRef}`}
        position={anchor.position}
        rotationY={anchor.rotationY}
      />
    );
  }
  const [widthMeters, heightMeters, depthMeters] = entry.asset.boundsMeters;
  if (
    ![widthMeters, heightMeters, depthMeters].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return (
      <WallMarker
        wallId={doorId}
        tone="error"
        reason={`door asset ${assetRef} has no measured dimensions`}
        position={anchor.position}
        rotationY={anchor.rotationY}
      />
    );
  }
  // Catalog bounds already include the shared model scale; fit against the
  // rendered dimensions. Geometry does not depend on `state`.
  const widthScale = pose.width / widthMeters;
  const heightScale = pose.height / heightMeters;
  const depthScale = pose.thickness / depthMeters;
  const open = state === 'open';
  // Same structural-parent technique as the wall pieces: the parent owns the
  // exact fit and compensates the shared leaf's single, unscaled floor lift so
  // it is never multiplied by the fit scale.
  const baseY = pose.y + DUNGEON_SURFACE_Y * (1 - heightScale);
  return (
    <group
      name={`structural-wall-door-${doorId}`}
      userData={{
        doorId,
        assetRef,
        state,
        open,
        baseY,
        heightScale,
      }}
      position={[pose.point.x, baseY, pose.point.z]}
      rotation={[0, pose.rotationY, 0]}
      scale={[widthScale, heightScale, depthScale]}
    >
      <WorldPropModel
        entry={entry}
        visualLighting={visualLighting}
        position={[0, 0, 0]}
        rotationY={0}
        heightScale={1}
        open={open}
        onBoundsMeasured={onMeasured}
        onDoorClick={onClick}
      />
    </group>
  );
}
