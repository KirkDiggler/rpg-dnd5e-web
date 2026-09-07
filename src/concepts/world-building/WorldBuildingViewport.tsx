import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { PropModel } from '@/components/hex-grid/PropModel';
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { projectCompositionPointLights } from '@/compositions/compositionLightSources';
import { DUNGEON_POINT_LIGHT_BUDGET } from '@/rendering/dungeonLighting';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { VisualPointLights } from '@/rendering/visualPointLights';
import { selectBoundedVisualPointLights } from '@/rendering/visualPointLightSelection';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from 'three-stdlib';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import {
  compositionGuideBounds,
  type MeasuredWorldPropBounds,
} from './placementGuides';
import { selectionClosure } from './sceneState';
import type { WorldScene } from './types';
import type { WorldBuildingDragPayload } from './worldBuildingDrag';
import {
  WorldBuildingDropInteraction,
  WorldBuildingTransformGizmo,
  type WorldBuildingTool,
} from './WorldBuildingInteraction';
import {
  resolveWorldSelectionId,
  type WorldBuildingDropTarget,
} from './worldBuildingPointer';
import { WorldPlacementGuides } from './WorldPlacementGuides';

export interface WorldBuildingViewportProps {
  /** Last committed scene. Transform previews never replace this value. */
  scene: WorldScene;
  previewScene: WorldScene | null;
  selectedIds: readonly string[];
  tool: WorldBuildingTool;
  activeDrag: WorldBuildingDragPayload | null;
  onSelect: (ids: string[]) => void;
  onDrop: (
    payload: WorldBuildingDragPayload,
    target: WorldBuildingDropTarget
  ) => void;
  onDragFinished: () => void;
  onTransformPreview: (scene: WorldScene | null) => void;
  onTransformCommit: (scene: WorldScene) => void;
  onTransformReject: (message: string) => void;
  onAssetState: (id: string, state: 'loaded' | 'error') => void;
}

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
  onSelect: (ids: string[]) => void;
  selectedIds: readonly string[];
  isGizmoPointer: () => boolean;
  resolveSelectionId: (
    intersections: readonly THREE.Intersection[]
  ) => string | null;
  onAssetState: WorldBuildingViewportProps['onAssetState'];
  onBoundsMeasured?: (id: string, measurement: MeasuredWorldPropBounds) => void;
}

export function WorldPropVisual({
  item,
  selected,
  onSelect,
  selectedIds,
  isGizmoPointer,
  resolveSelectionId,
  onAssetState,
  onBoundsMeasured,
}: WorldPropVisualProps) {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(item.assetRef);
  const [measurement, setMeasurement] =
    useState<MeasuredWorldPropBounds | null>(null);
  const bounds =
    measurement?.assetRef === item.assetRef ? measurement.bounds : null;
  const position: [number, number, number] = [
    item.transform.x,
    item.transform.y,
    item.transform.z,
  ];
  if (!entry) return null;

  const select = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || isGizmoPointer()) return;
    event.stopPropagation();
    const selectionId = resolveSelectionId(event.intersections) ?? item.id;
    const nextSelection = event.shiftKey
      ? selectedIds.includes(selectionId)
        ? [...selectedIds]
        : [...selectedIds, selectionId]
      : [selectionId];
    onSelect(nextSelection);
  };

  return (
    <group
      name={`world-prop-${item.id}`}
      userData={{ worldItemId: item.id, assetRef: item.assetRef }}
    >
      <Suspense fallback={<ModelFallback tone="loading" />}>
        <ErrorBoundary
          fallback={<ModelFallback tone="error" />}
          onError={() => onAssetState(item.id, 'error')}
        >
          <group
            name={`world-building-loaded-surface-${item.id}`}
            userData={
              entry.supportsDecoration
                ? { worldBuildingSupportId: item.id }
                : undefined
            }
          >
            <PropModel
              variant={entry.variant}
              position={position}
              rotationY={item.transform.rotationY}
              anchor="bounds-floor-center"
              onBoundsMeasured={(measured) => {
                setMeasurement((current) =>
                  current?.assetRef === item.assetRef &&
                  current.bounds.minY === measured.minY &&
                  current.bounds.maxY === measured.maxY &&
                  current.bounds.width === measured.width &&
                  current.bounds.height === measured.height &&
                  current.bounds.depth === measured.depth
                    ? current
                    : { assetRef: item.assetRef, bounds: measured }
                );
                onBoundsMeasured?.(item.id, {
                  assetRef: item.assetRef,
                  bounds: measured,
                });
                onAssetState(item.id, 'loaded');
              }}
            />
          </group>
        </ErrorBoundary>
      </Suspense>
      {bounds && (
        <mesh
          name={`world-building-interaction-${item.id}`}
          position={[
            position[0],
            position[1] + DUNGEON_SURFACE_Y + bounds.height / 2,
            position[2],
          ]}
          rotation={[0, item.transform.rotationY, 0]}
          userData={{ worldBuildingInteractionId: item.id }}
          onPointerDown={select}
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
          raycast={() => null}
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

function WorldBuildingCameraControls({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const recordCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    gl.domElement.dataset.worldBuildingCamera = JSON.stringify({
      position: camera.position.toArray(),
      target: controls.target.toArray(),
    });
  }, [camera.position, gl.domElement]);
  useEffect(recordCamera, [recordCamera]);
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={enabled}
      target={[0, 0.6, 0]}
      minDistance={4}
      maxDistance={26}
      maxPolarAngle={Math.PI / 2.05}
      mouseButtons={{
        LEFT: -1 as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: -1 as THREE.MOUSE,
      }}
      enablePan
      enableRotate
      enableZoom
      enableDamping
      onChange={recordCamera}
    />
  );
}

function WorldSceneContents(props: WorldBuildingViewportProps) {
  const { scene, previewScene, selectedIds, tool, activeDrag, onSelect } =
    props;
  const displayScene = previewScene ?? scene;
  const hexGeometry = useMemo(() => makeHexLines(6), []);
  const boundaryGeometry = useMemo(() => makeGroundBoundary(11.5), []);
  const controlsRef = useRef<TransformControlsImpl>(null);
  const [transforming, setTransforming] = useState(false);
  const [measuredById, setMeasuredById] = useState<
    ReadonlyMap<string, MeasuredWorldPropBounds>
  >(() => new Map());
  const recordMeasuredBounds = useCallback(
    (id: string, measurement: MeasuredWorldPropBounds) => {
      setMeasuredById((current) => {
        const previous = current.get(id);
        if (
          previous?.assetRef === measurement.assetRef &&
          previous.bounds.minY === measurement.bounds.minY &&
          previous.bounds.maxY === measurement.bounds.maxY &&
          previous.bounds.width === measurement.bounds.width &&
          previous.bounds.height === measurement.bounds.height &&
          previous.bounds.depth === measurement.bounds.depth
        ) {
          return current;
        }
        const next = new Map(current);
        next.set(id, measurement);
        return next;
      });
    },
    []
  );
  const guideBounds = useMemo(
    () => compositionGuideBounds(displayScene, measuredById),
    [displayScene, measuredById]
  );
  const selectedClosure = useMemo(
    () => selectionClosure(displayScene, selectedIds),
    [displayScene, selectedIds]
  );
  const pointLights = useMemo(
    () =>
      selectBoundedVisualPointLights(
        projectCompositionPointLights(displayScene, {
          compositionId: displayScene.id,
          placementId: 'composer',
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
        }),
        { x: 0, z: 0 },
        DUNGEON_POINT_LIGHT_BUDGET
      ),
    [displayScene]
  );
  const isGizmoPointer = () => {
    const controls = controlsRef.current as unknown as {
      axis: string | null;
      dragging: boolean;
    } | null;
    return !!controls?.axis || !!controls?.dragging;
  };
  const resolveSelectionId = (intersections: readonly THREE.Intersection[]) =>
    resolveWorldSelectionId(displayScene, intersections);

  return (
    <>
      <color attach="background" args={['#071113']} />
      <fog attach="fog" args={['#071113', 15, 31]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[7, 12, 6]} intensity={1.35} castShadow />
      <hemisphereLight args={['#a5f3fc', '#172026', 0.55]} />
      <VisualPointLights lights={pointLights} />
      <mesh
        name="world-building-finite-ground"
        userData={{ worldBuildingGround: true }}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, DUNGEON_SURFACE_Y - 0.012, 0]}
        receiveShadow
        onPointerDown={(event) => {
          if (event.button !== 0 || isGizmoPointer()) return;
          event.stopPropagation();
          if (!event.shiftKey) onSelect([]);
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
      <WorldPlacementGuides bounds={guideBounds} />
      {displayScene.items.map((item) => (
        <WorldPropVisual
          key={item.id}
          item={item}
          selected={selectedClosure.has(item.id)}
          selectedIds={selectedIds}
          onSelect={onSelect}
          isGizmoPointer={isGizmoPointer}
          resolveSelectionId={resolveSelectionId}
          onAssetState={props.onAssetState}
          onBoundsMeasured={recordMeasuredBounds}
        />
      ))}
      <WorldBuildingCameraControls enabled={!transforming} />
      <WorldBuildingTransformGizmo
        controlsRef={controlsRef}
        scene={scene}
        selectedIds={selectedIds}
        tool={tool}
        onPreview={props.onTransformPreview}
        onCommit={props.onTransformCommit}
        onReject={props.onTransformReject}
        onTransformingChange={setTransforming}
      />
      <WorldBuildingDropInteraction
        activeDrag={activeDrag}
        floorY={DUNGEON_SURFACE_Y}
        onDrop={props.onDrop}
        onDragFinished={props.onDragFinished}
      />
    </>
  );
}

export function WorldBuildingViewport(props: WorldBuildingViewportProps) {
  return (
    <>
      <Canvas
        camera={{ position: [8, 9, 8], fov: 48, near: 0.1, far: 100 }}
        dpr={[1, 1.6]}
        shadows
        data-testid="world-building-canvas"
        aria-label="World building 3D canvas. The gold X0/Z0 hex is the placement anchor; the orange box is the visual composition bounds, not a mechanical footprint. Left click selects; Shift-left adds selection; middle drag orbits; Shift-middle drag pans; wheel zooms; right click cancels a transform."
      >
        <WorldSceneContents {...props} />
      </Canvas>
      <div className="wb-placement-guide-legend" aria-hidden="true">
        <span>
          <i className="wb-placement-guide-swatch wb-placement-guide-swatch--anchor" />
          Placement anchor · X0 / Z0
        </span>
        <span>
          <i className="wb-placement-guide-swatch wb-placement-guide-swatch--bounds" />
          Composition bounds · visual guide only, not a footprint
        </span>
      </div>
    </>
  );
}
