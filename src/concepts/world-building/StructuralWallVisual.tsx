/**
 * Editor-only visual for authored structural walls (Task 3).
 *
 * Visible spans come from the pure geometry helper; each span is filled by
 * repeating the selection's real catalog asset with the shared
 * `WorldPropModel` leaf. The repeated pieces are DERIVED presentation, never
 * authored scene props.
 *
 * The PARENT transform owns the span pose AND the full exact fit scale,
 * including heights the shared model's own `[0.25, 4]` heightScale clamp would
 * otherwise silently shorten. The shared model is passed its normal
 * `heightScale`, and the parent compensates its single `DUNGEON_SURFACE_Y`
 * lift so the floor lift is applied exactly once and is never scaled by the
 * fit.
 *
 * Every derived mesh never raycasts: wall hit selection is a separate
 * invisible box rendered only while the Select tool owns the canvas. Loading,
 * error and refusal markers are explicit, named, non-raycasting, and anchored
 * at the wall/piece they describe rather than at the world origin. The
 * selected blocker is an editor-only wireframe guide, not a sight query.
 */
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { doorBindingState, type DoorBindings } from './doorBindingEdits';
import {
  wallDirectionYaw,
  wallLength,
  wallMidpoint,
} from './structuralWallEditing';
import type { StructuralWall } from './structuralWalls';
import {
  FittedDoorSurface,
  StructuralWallFallbackMarker,
  StructuralWallSurfacePieces,
} from './StructuralWallSurfaces';

export interface StructuralWallVisualProps {
  walls: readonly StructuralWall[];
  selectedWallId: string | null;
  /** The open document's attached-door state, keyed by bound door id. Drives
   * the authored INITIAL-state preview only; it is never a live engine
   * operation. */
  doorBindings?: DoorBindings;
  /** True only while the Select tool owns the canvas: no wall hit box is
   * rendered for paint, erase, actor, concealment or wall-drawing tools, so
   * no wall mesh can intercept their ground gestures. */
  selectable: boolean;
  onSelectWall?: (id: string | null) => void;
  /** Explicit allocation cap forwarded to the pure derivation. */
  maxPieces?: number;
}

function AttachedDoors({
  wall,
  doorBindings,
  onMeasured,
}: {
  wall: StructuralWall;
  doorBindings?: DoorBindings;
  onMeasured: () => void;
}) {
  const doors = wall.openings.filter((opening) => opening.door);
  if (doors.length === 0) return null;
  return (
    <>
      {doors.map((opening) => (
        <FittedDoorSurface
          key={opening.id}
          wall={wall}
          opening={opening}
          // The AUTHORED INITIAL state preview only; it is never a live
          // engine operation.
          open={doorBindingState(doorBindings?.[opening.door!.id]) === 'open'}
          onMeasured={onMeasured}
        />
      ))}
    </>
  );
}

function WallGuides({
  wall,
  selected,
  selectable,
  onSelectWall,
}: {
  wall: StructuralWall;
  selected: boolean;
  selectable: boolean;
  onSelectWall?: (id: string | null) => void;
}) {
  const midpoint = wallMidpoint(wall);
  const length = wallLength(wall);
  const rotationY = wallDirectionYaw(wall);
  const { offsetX, offsetZ, width, depth } = wall.blocker.footprint;
  return (
    <group name={`structural-wall-guide-${wall.id}`}>
      {selectable && onSelectWall && (
        <mesh
          name={`structural-wall-hit-${wall.id}`}
          userData={{ worldWallId: wall.id }}
          position={[
            midpoint.x,
            DUNGEON_SURFACE_Y +
              wall.appearance.elevation +
              wall.appearance.height / 2,
            midpoint.z,
          ]}
          rotation={[0, rotationY, 0]}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            onSelectWall(wall.id);
          }}
        >
          <boxGeometry
            args={[
              Math.max(length, 0.05),
              Math.max(wall.appearance.height, 0.05),
              0.14,
            ]}
          />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>
      )}
      {selected && (
        <group
          name={`structural-wall-blocker-${wall.id}`}
          position={[midpoint.x, DUNGEON_SURFACE_Y + 0.05, midpoint.z]}
          rotation={[0, rotationY, 0]}
        >
          <mesh
            position={[offsetX, 0, offsetZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial
              color="#fbbf24"
              wireframe
              transparent
              opacity={0.95}
              depthTest={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function WallVisual({
  wall,
  doorBindings,
  maxPieces,
  onMeasured,
}: {
  wall: StructuralWall;
  doorBindings?: DoorBindings;
  maxPieces?: number;
  onMeasured: () => void;
}) {
  return (
    <ErrorBoundary
      fallback={<StructuralWallFallbackMarker wall={wall} tone="error" />}
      onError={onMeasured}
    >
      <Suspense
        fallback={<StructuralWallFallbackMarker wall={wall} tone="loading" />}
      >
        <StructuralWallSurfacePieces
          wall={wall}
          maxPieces={maxPieces}
          onMeasured={onMeasured}
        />
        <AttachedDoors
          wall={wall}
          doorBindings={doorBindings}
          onMeasured={onMeasured}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

export function StructuralWallVisual({
  walls,
  selectedWallId,
  doorBindings,
  selectable,
  onSelectWall,
  maxPieces,
}: StructuralWallVisualProps) {
  const piecesRef = useRef<THREE.Group>(null);
  const [geometryVersion, setGeometryVersion] = useState(0);
  const bumpGeometry = useCallback(
    () => setGeometryVersion((value) => value + 1),
    []
  );
  // Run on EVERY render — not just on a bounds measurement — so the derived
  // pieces stay non-raycasting when the wall list, an asset, or a wall's
  // loading/error state changes. `geometryVersion` forces the re-render that
  // follows an asynchronous model mount; the markers are already
  // non-raycasting on their own.
  useLayoutEffect(() => {
    void geometryVersion;
    const root = piecesRef.current;
    if (!root) return;
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        (object as THREE.Mesh).raycast = () => null;
      }
    });
  });
  return (
    <group name="structural-walls">
      <group ref={piecesRef} name="structural-wall-pieces">
        {walls.map((wall) => (
          <WallVisual
            key={wall.id}
            wall={wall}
            doorBindings={doorBindings}
            maxPieces={maxPieces}
            onMeasured={bumpGeometry}
          />
        ))}
      </group>
      {walls.map((wall) => (
        <WallGuides
          key={wall.id}
          wall={wall}
          selected={wall.id === selectedWallId}
          selectable={selectable}
          onSelectWall={onSelectWall}
        />
      ))}
    </group>
  );
}
