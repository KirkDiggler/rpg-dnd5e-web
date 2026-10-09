import type { ThreeEvent } from '@react-three/fiber';
import {
  doorAlongWall,
  type StudioDoorEditing,
  type StudioDoorTarget,
} from './studioDoorEditing';
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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { doorBindingState, type DoorBindings } from './doorBindingEdits';
import { attachedDoorVisualPose } from './structuralDoorEditing';
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
  doorEditing?: StudioDoorEditing;
  intentEpoch?: number;
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
      {doors.map((opening) => {
        // The EDITOR ADAPTER: the door's single pose is derived from its
        // owning opening, never stored a second time.
        let pose;
        try {
          pose = attachedDoorVisualPose({
            wall,
            openingId: opening.id,
          });
        } catch {
          return (
            <StructuralWallFallbackMarker
              key={opening.id}
              wall={wall}
              tone="error"
            />
          );
        }
        return (
          <FittedDoorSurface
            key={opening.id}
            doorId={opening.door!.id}
            assetRef={opening.door!.assetRef}
            pose={pose}
            // The AUTHORED INITIAL state preview only; it is never a live
            // engine operation. A missing binding reads as the asset's rest
            // pose, exactly as it did before.
            state={
              doorBindingState(doorBindings?.[opening.door!.id]) === 'open'
                ? 'open'
                : 'closed'
            }
            onMeasured={onMeasured}
          />
        );
      })}
    </>
  );
}

function WallGuides({
  wall,
  selected,
  selectable,
  onSelectWall,
  doorEditing,
}: {
  doorEditing?: StudioDoorEditing;
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
          onPointerMove={(event) => {
            if (doorEditing?.active) {
              event.stopPropagation();
              doorEditing.previewPlacement(wall.id, {
                x: event.point.x,
                z: event.point.z,
              });
            }
          }}
          onPointerOut={() => {
            if (doorEditing?.active) doorEditing.cancelPreview();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            if (doorEditing?.active)
              doorEditing.create(wall.id, {
                x: event.point.x,
                z: event.point.z,
              });
            else onSelectWall(wall.id);
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

function DoorHit({
  wall,
  openingId,
  editing,
  intentEpoch,
}: {
  wall: StructuralWall;
  openingId: string;
  editing: StudioDoorEditing;
  intentEpoch?: number;
}): React.JSX.Element {
  const opening = wall.openings.find((opening) => opening.id === openingId)!;
  const pose = attachedDoorVisualPose({ wall, openingId });
  const target: StudioDoorTarget = {
    kind: 'door',
    wallId: wall.id,
    openingId,
    doorId: opening.door!.id,
  };
  const key = (target: StudioDoorTarget | null): string =>
    JSON.stringify(
      target ? [target.wallId, target.openingId, target.doorId] : null
    );
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const gesture = useRef<{
    pointerId: number;
    target: StudioDoorTarget;
    plane: THREE.Plane;
    anchor: number;
    origin: number;
    wall: StructuralWall;
    position: number;
    valid: boolean;
    editing: StudioDoorEditing;
    surface: {
      setPointerCapture(id: number): void;
      releasePointerCapture(id: number): void;
    };
  } | null>(null);
  const cancel = useCallback((retire = false): void => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    try {
      current.surface.releasePointerCapture(current.pointerId);
    } catch {
      /* capture already lost */
    }
    const selected = editingRef.current.selectedTarget;
    if (
      selected?.doorId === current.target.doorId &&
      selected.wallId === current.target.wallId &&
      selected.openingId === current.target.openingId
    ) {
      if (retire) editingRef.current.setActive(false);
      else editingRef.current.cancelPreview();
    }
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel(true);
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      cancel();
    };
  }, [cancel]);
  useLayoutEffect(() => {
    if (
      gesture.current &&
      key(editing.selectedTarget) !== key(gesture.current.target)
    )
      cancel();
  }, [editing.selectedTarget, cancel]);
  useLayoutEffect(() => {
    cancel();
  }, [intentEpoch, cancel]);
  const sample = (event: ThreeEvent<PointerEvent>): void => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = event.ray?.intersectPlane(current.plane, new THREE.Vector3());
    if (!point) {
      current.valid = false;
      return;
    }
    current.position =
      current.origin +
      (doorAlongWall(current.wall, { x: point.x, z: point.z }) -
        current.anchor);
    current.valid = current.editing.previewMove(
      current.target,
      current.position
    );
  };
  const selected = key(editing.selectedTarget) === key(target);
  return (
    <mesh
      name={`studio-door-hit-${target.doorId}`}
      userData={{ studioDoorTarget: target }}
      position={[
        pose.point.x,
        DUNGEON_SURFACE_Y + pose.y + pose.height / 2,
        pose.point.z,
      ]}
      rotation={[0, pose.rotationY, 0]}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (!editing.select(target)) return;
        const plane = new THREE.Plane(
          new THREE.Vector3(0, 1, 0),
          -(DUNGEON_SURFACE_Y + pose.y + pose.height / 2)
        );
        const point =
          event.ray?.intersectPlane(plane, new THREE.Vector3()) ?? event.point;
        gesture.current = {
          pointerId: event.pointerId,
          target,
          plane,
          anchor: doorAlongWall(wall, { x: point.x, z: point.z }),
          origin: opening.position,
          position: opening.position,
          wall,
          valid: true,
          editing,
          surface: event.target as unknown as {
            setPointerCapture(id: number): void;
            releasePointerCapture(id: number): void;
          },
        };
        try {
          gesture.current.surface.setPointerCapture(event.pointerId);
        } catch {
          cancel();
        }
      }}
      onPointerMove={(event) => {
        if (gesture.current) {
          event.stopPropagation();
          sample(event);
        }
      }}
      onPointerUp={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        event.stopPropagation();
        sample(event);
        const valid = current.valid;
        const position = current.position;
        cancel();
        if (valid) current.editing.move(current.target, position);
      }}
      onPointerCancel={() => cancel(true)}
      onLostPointerCapture={() => cancel(true)}
    >
      <boxGeometry
        args={[pose.width, pose.height, Math.max(0.32, pose.thickness + 0.02)]}
      />
      <meshBasicMaterial
        transparent
        opacity={selected ? 0.15 : 0}
        color="#fbbf24"
        depthWrite={false}
      />
    </mesh>
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
  doorEditing,
  intentEpoch,
}: StructuralWallVisualProps) {
  const doorEditingRef = useRef(doorEditing);
  doorEditingRef.current = doorEditing;
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && doorEditingRef.current?.active)
        doorEditingRef.current.setActive(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
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
  const preview = doorEditing?.preview;
  const displayedWalls = walls.map((wall) =>
    preview?.valid && preview.wall.id === wall.id ? preview.wall : wall
  );
  const displayedBindings =
    preview?.valid && preview.purpose === 'placement'
      ? { ...doorBindings, [preview.target.doorId]: { closed: true } }
      : doorBindings;
  return (
    <group name="structural-walls">
      <group ref={piecesRef} name="structural-wall-pieces">
        {displayedWalls.map((wall) => (
          <WallVisual
            key={wall.id}
            wall={wall}
            doorBindings={displayedBindings}
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
          doorEditing={doorEditing}
        />
      ))}
      {doorEditing &&
        selectable &&
        !doorEditing.active &&
        displayedWalls.flatMap((wall) =>
          wall.openings
            .filter((opening) => opening.door)
            .map((opening) => (
              <DoorHit
                key={opening.door!.id}
                wall={wall}
                openingId={opening.id}
                editing={doorEditing}
                intentEpoch={intentEpoch}
              />
            ))
        )}
    </group>
  );
}
