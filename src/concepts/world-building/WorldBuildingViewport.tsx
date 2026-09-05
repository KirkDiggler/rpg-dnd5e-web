import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import {
  PropModel,
  type PropModelBounds,
} from '@/components/hex-grid/PropModel';
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import * as THREE from 'three';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { selectionClosure } from './sceneState';
import type { WorldPoint, WorldScene } from './types';

interface PlacementTool {
  kind: 'prop' | 'arrangement';
  id: string;
}

interface WorldBuildingViewportProps {
  scene: WorldScene;
  selectedIds: readonly string[];
  placement: PlacementTool | null;
  onSelect: (ids: string[]) => void;
  onPlaceGround: (point: WorldPoint) => void;
  onPlaceSurface: (
    point: { x: number; y: number; z: number },
    supportId: string
  ) => void;
  onMove: (
    ids: readonly string[],
    delta: { x: number; y: number; z: number }
  ) => void;
  onAssetState: (id: string, state: 'loaded' | 'error') => void;
}

interface DragState {
  ids: string[];
  start: THREE.Vector3;
  delta: THREE.Vector3;
}

const DRAG_PLANE = new THREE.Plane(
  new THREE.Vector3(0, 1, 0),
  -DUNGEON_SURFACE_Y
);

function makeHexLines(radius: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) > radius)
        continue;
      const center = cubeToWorld({ x: q, y: -q - r, z: r }, HEX_SIZE);
      const corners = hexCorners(center, HEX_SIZE);
      corners.forEach((corner, index) => {
        const next = corners[(index + 1) % corners.length]!;
        points.push(
          new THREE.Vector3(corner.x, DUNGEON_SURFACE_Y + 0.012, corner.z),
          new THREE.Vector3(next.x, DUNGEON_SURFACE_Y + 0.012, next.z)
        );
      });
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function makeGroundBoundary(radius: number): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 6 + (index * Math.PI) / 3;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        DUNGEON_SURFACE_Y + 0.015,
        Math.sin(angle) * radius
      );
    })
  );
}

function rayFloorPoint(event: ThreeEvent<PointerEvent>): THREE.Vector3 | null {
  return event.ray.intersectPlane(DRAG_PLANE, new THREE.Vector3());
}

function hasUpwardFace(event: ThreeEvent<PointerEvent>): boolean {
  if (!event.face) return false;
  const normal = event.face.normal.clone();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(
    event.object.matrixWorld
  );
  return normal.applyMatrix3(normalMatrix).normalize().y > 0.55;
}

function ModelFallback({ tone }: { tone: 'loading' | 'error' }) {
  return (
    <mesh position={[0, 0.3, 0]} name={`world-building-model-${tone}`}>
      <boxGeometry args={[0.5, 0.6, 0.5]} />
      <meshStandardMaterial
        color={tone === 'loading' ? '#eab308' : '#ef4444'}
        wireframe
      />
    </mesh>
  );
}

interface WorldPropVisualProps {
  item: WorldScene['items'][number];
  selected: boolean;
  dragDelta: THREE.Vector3 | null;
  placement: PlacementTool | null;
  onSelect: (ids: string[]) => void;
  selectedIds: readonly string[];
  onDragStart: (drag: DragState) => void;
  onDragChange: (delta: THREE.Vector3) => void;
  onDragEnd: () => void;
  onPlaceSurface: WorldBuildingViewportProps['onPlaceSurface'];
  onAssetState: WorldBuildingViewportProps['onAssetState'];
}

function WorldPropVisual({
  item,
  selected,
  dragDelta,
  placement,
  onSelect,
  selectedIds,
  onDragStart,
  onDragChange,
  onDragEnd,
  onPlaceSurface,
  onAssetState,
}: WorldPropVisualProps) {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(item.assetRef);
  const [bounds, setBounds] = useState<PropModelBounds | null>(null);
  const delta = dragDelta ?? new THREE.Vector3();
  const position: [number, number, number] = [
    item.transform.x + delta.x,
    item.transform.y,
    item.transform.z + delta.z,
  ];
  if (!entry) return null;

  const placeOnVisibleSurface = (event: ThreeEvent<PointerEvent>) => {
    if (!placement || !entry.supportsDecoration) return;
    // Placement rays intentionally land on the loaded PropModel meshes, not
    // the generous selection box below. This keeps authored Y at the visible
    // tabletop/upper surface even when the model has an irregular silhouette.
    event.stopPropagation();
    if (!hasUpwardFace(event)) return;
    onPlaceSurface(
      {
        x: event.point.x,
        y: Math.max(0, event.point.y - DUNGEON_SURFACE_Y),
        z: event.point.z,
      },
      item.id
    );
  };

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (placement) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const nextSelection = additive
      ? selected
        ? selectedIds.filter((id) => id !== item.id)
        : [...selectedIds, item.id]
      : selected
        ? [...selectedIds]
        : [item.id];
    onSelect(nextSelection);
    if (!nextSelection.includes(item.id)) return;
    const start = rayFloorPoint(event);
    if (!start) return;
    const pointerTarget = event.target as Element | null;
    pointerTarget?.setPointerCapture(event.pointerId);
    onDragStart({ ids: nextSelection, start, delta: new THREE.Vector3() });
  };

  const changeDrag = (event: ThreeEvent<PointerEvent>) => {
    const pointerTarget = event.target as Element | null;
    if (placement || !pointerTarget?.hasPointerCapture(event.pointerId)) {
      return;
    }
    const point = rayFloorPoint(event);
    if (!point) return;
    onDragChange(point);
  };

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    const pointerTarget = event.target as Element | null;
    if (pointerTarget?.hasPointerCapture(event.pointerId)) {
      pointerTarget.releasePointerCapture(event.pointerId);
      onDragEnd();
    }
  };

  return (
    <group
      name={`world-prop-${item.id}`}
      userData={{ worldItemId: item.id, assetRef: item.assetRef }}
      onPointerDown={placeOnVisibleSurface}
    >
      <Suspense fallback={<ModelFallback tone="loading" />}>
        <ErrorBoundary
          fallback={<ModelFallback tone="error" />}
          onError={() => onAssetState(item.id, 'error')}
        >
          <PropModel
            variant={entry.variant}
            position={position}
            rotationY={item.transform.rotationY}
            anchor="bounds-floor-center"
            onBoundsMeasured={(measured) => {
              setBounds((current) =>
                current &&
                current.width === measured.width &&
                current.height === measured.height &&
                current.depth === measured.depth
                  ? current
                  : measured
              );
              onAssetState(item.id, 'loaded');
            }}
          />
        </ErrorBoundary>
      </Suspense>
      {bounds && !placement && (
        <mesh
          name={`world-building-interaction-${item.id}`}
          position={[
            position[0],
            position[1] + DUNGEON_SURFACE_Y + bounds.height / 2,
            position[2],
          ]}
          rotation={[0, item.transform.rotationY, 0]}
          onPointerDown={startDrag}
          onPointerMove={changeDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <boxGeometry
            args={[
              Math.max(0.08, bounds.width),
              Math.max(0.08, bounds.height),
              Math.max(0.08, bounds.depth),
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
      {selected && bounds && (
        <mesh
          name={`world-building-selection-${item.id}`}
          position={[
            position[0],
            position[1] + DUNGEON_SURFACE_Y + bounds.height / 2,
            position[2],
          ]}
          rotation={[0, item.transform.rotationY, 0]}
        >
          <boxGeometry
            args={[
              Math.max(0.1, bounds.width + 0.06),
              Math.max(0.1, bounds.height + 0.06),
              Math.max(0.1, bounds.depth + 0.06),
            ]}
          />
          <meshBasicMaterial
            color="#67e8f9"
            wireframe
            depthTest={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

function WorldSceneContents(props: WorldBuildingViewportProps) {
  const { scene, selectedIds, placement, onSelect, onPlaceGround, onMove } =
    props;
  const hexGeometry = useMemo(() => makeHexLines(6), []);
  const boundaryGeometry = useMemo(() => makeGroundBoundary(11.5), []);
  const [drag, setDrag] = useState<DragState | null>(null);
  const draggedIds = useMemo(
    () => (drag ? selectionClosure(scene, drag.ids) : new Set<string>()),
    [drag, scene]
  );

  const startDrag = (next: DragState) => setDrag(next);
  const changeDrag = (point: THREE.Vector3) =>
    setDrag((current) =>
      current
        ? {
            ...current,
            delta: new THREE.Vector3(
              point.x - current.start.x,
              0,
              point.z - current.start.z
            ),
          }
        : current
    );
  const endDrag = () => {
    if (drag && drag.delta.lengthSq() > 0.000001) {
      onMove(drag.ids, { x: drag.delta.x, y: 0, z: drag.delta.z });
    }
    setDrag(null);
  };

  return (
    <>
      <color attach="background" args={['#071113']} />
      <fog attach="fog" args={['#071113', 15, 31]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[7, 12, 6]} intensity={1.35} castShadow />
      <hemisphereLight args={['#a5f3fc', '#172026', 0.55]} />
      <mesh
        name="world-building-finite-ground"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, DUNGEON_SURFACE_Y - 0.012, 0]}
        receiveShadow
        onPointerDown={(event) => {
          event.stopPropagation();
          if (placement) {
            onPlaceGround({ x: event.point.x, z: event.point.z });
          } else {
            onSelect([]);
          }
        }}
      >
        <circleGeometry args={[11.5, 6]} />
        <meshStandardMaterial
          color="#182a2a"
          roughness={0.96}
          metalness={0.02}
        />
      </mesh>
      <lineSegments
        name="world-building-real-hex-basis"
        geometry={hexGeometry}
        raycast={() => null}
      >
        <lineBasicMaterial color="#47726e" transparent opacity={0.72} />
      </lineSegments>
      <lineLoop geometry={boundaryGeometry} raycast={() => null}>
        <lineBasicMaterial color="#5eead4" transparent opacity={0.55} />
      </lineLoop>
      {scene.items.map((item) => (
        <WorldPropVisual
          key={item.id}
          item={item}
          selected={selectedIds.includes(item.id)}
          selectedIds={selectedIds}
          dragDelta={draggedIds.has(item.id) ? (drag?.delta ?? null) : null}
          placement={placement}
          onSelect={onSelect}
          onDragStart={startDrag}
          onDragChange={(point) => changeDrag(point)}
          onDragEnd={endDrag}
          onPlaceSurface={props.onPlaceSurface}
          onAssetState={props.onAssetState}
        />
      ))}
      <OrbitControls
        makeDefault
        enabled={!drag}
        target={[0, 0.6, 0]}
        minDistance={4}
        maxDistance={26}
        maxPolarAngle={Math.PI / 2.05}
        mouseButtons={{
          LEFT: -1 as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        enableDamping
      />
    </>
  );
}

export function WorldBuildingViewport(props: WorldBuildingViewportProps) {
  return (
    <Canvas
      camera={{ position: [8, 9, 8], fov: 48, near: 0.1, far: 100 }}
      dpr={[1, 1.6]}
      shadows
      data-testid="world-building-canvas"
      aria-label="World building 3D canvas. Left drag moves selected objects; right drag orbits; wheel zooms."
    >
      <WorldSceneContents {...props} />
    </Canvas>
  );
}
