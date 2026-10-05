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
  attachedDoorPlacement,
  isAttachableDoorAsset,
} from './structuralDoorEditing';
import {
  isRepeatableWallAsset,
  layoutWallPieces,
  wallDirectionYaw,
  wallMidpoint,
} from './structuralWallEditing';
import { wallOpeningPoint } from './structuralWallGeometry';
import type {
  StructuralWallOpening,
  StructuralWallSurface,
} from './structuralWalls';
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

/** Where an attached door's named marker belongs: at the opening, not at the
 * wall midpoint and never at the origin. */
function openingAnchor(
  wall: StructuralWallSurface,
  openingId: string
): { position: [number, number, number]; rotationY: number } {
  try {
    const point = wallOpeningPoint({ wall, openingId });
    return {
      position: [
        point.x,
        DUNGEON_SURFACE_Y + wall.appearance.elevation + 0.35,
        point.z,
      ],
      rotationY: wallDirectionYaw(wall),
    };
  } catch {
    return wallAnchor(wall);
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
}: {
  wall: StructuralWallSurface;
  maxPieces?: number;
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

/**
 * One attached door, fitted to its opening and the wall's appearance through
 * the shared structural-parent technique. The caller owns the state ADAPTER
 * (`open`) and click callback (`onClick`): the editor passes the authored
 * initial preview with no click. This leaf neither queries nor interprets
 * gameplay state. A missing/ungenerated/non-leaf asset or a
 * refused fit is a named marker at the opening, never a substitute model.
 */
export function FittedDoorSurface({
  wall,
  opening,
  open,
  onMeasured,
  onClick,
}: {
  wall: StructuralWallSurface;
  opening: StructuralWallOpening;
  /** TRUE swings the leaf open; FALSE and ABSENT both render the asset's own
   * rest pose. The runtime passes ABSENT when no live state exists, exactly as
   * a standalone door with no observed state does. */
  open?: boolean;
  onMeasured?: () => void;
  onClick?: () => void;
}) {
  const door = opening.door;
  if (!door) return null;
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(door.assetRef);
  const anchor = openingAnchor(wall, opening.id);
  if (
    !entry ||
    entry.source !== 'generated' ||
    !isAttachableDoorAsset(door.assetRef)
  ) {
    return (
      <WallMarker
        wallId={`${wall.id}/${opening.id}`}
        tone="error"
        reason={`no door asset ${door.assetRef}`}
        position={anchor.position}
        rotationY={anchor.rotationY}
      />
    );
  }
  const [widthMeters, heightMeters, depthMeters] = entry.asset.boundsMeters;
  let placement;
  try {
    placement = attachedDoorPlacement({
      wall,
      openingId: opening.id,
      assetWidthMeters: widthMeters,
      assetHeightMeters: heightMeters,
      assetDepthMeters: depthMeters,
      // Geometry does not depend on `open`; unknown state rests closed for the
      // named parent record, while the leaf below keeps the ABSENT rest pose.
      open: open ?? false,
    });
  } catch (error) {
    return (
      <WallMarker
        wallId={`${wall.id}/${opening.id}`}
        tone="refusal"
        reason={error instanceof Error ? error.message : String(error)}
        position={anchor.position}
        rotationY={anchor.rotationY}
      />
    );
  }
  // Same structural-parent technique as the wall pieces: the parent owns the
  // exact fit and compensates the shared leaf's single, unscaled floor lift so
  // it is never multiplied by the fit scale.
  const baseY = placement.y + DUNGEON_SURFACE_Y * (1 - placement.heightScale);
  return (
    <group
      name={`structural-wall-door-${wall.id}-${opening.id}`}
      userData={{
        wallId: wall.id,
        doorId: door.id,
        open: placement.open,
        baseY,
        heightScale: placement.heightScale,
      }}
      position={[placement.point.x, baseY, placement.point.z]}
      rotation={[0, placement.rotationY, 0]}
      scale={[
        placement.widthScale,
        placement.heightScale,
        placement.depthScale,
      ]}
    >
      <WorldPropModel
        entry={entry}
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
