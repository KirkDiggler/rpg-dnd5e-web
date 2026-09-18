import { paletteNameForRef } from '@/author/paletteData';
import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
  worldToCube,
} from '@/components/hex-grid/hexMath';
import type { PropModelBounds } from '@/components/hex-grid/PropModel';
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
import { createGroundBoundaryGeometry } from './groundBoundaryGeometry';
import {
  compositionGuideBounds,
  type MeasuredWorldPropBounds,
} from './placementGuides';
import { layoutRepeatedProps } from './repeatPlacement';
import { RepeatPlacementPreview } from './RepeatPlacementPreview';
import {
  ROOM_MONSTER_COLOR,
  ROOM_START_COLOR,
  RoomActorMarkers,
  RoomActorPreview,
} from './RoomActorMarkers';
import {
  walkableCellsInWorldRectangle,
  type RoomHexCell,
  type RoomMonsterPlacement,
  type RoomPropDeclaration,
  type RoomWorkspace,
} from './roomDraft';
import { createWalkableHexFillGeometry } from './roomHexGeometry';
import { selectionClosure } from './sceneState';
import type { WorldScene, WorldTransform } from './types';
import { WorkspaceFloorUnderlay } from './WorkspaceFloorUnderlay';
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
import {
  WorldPlacementGuideControl,
  WorldPlacementGuides,
} from './WorldPlacementGuides';
import { WorldPropModel } from './WorldPropModel';

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
  /** Every placed prop's measured world bounds, reported as each one loads.
   * The composition guide aggregates these; the builder also seeds an authored
   * movement/sight footprint from them (`declarationFootprint.ts`), so an
   * author's blocker starts the size of the mesh instead of 1×1. Reported in
   * world units by both model loaders. */
  onMeasuredBounds?: (id: string, measurement: MeasuredWorldPropBounds) => void;
  roomAuthoring?: {
    tool:
      | 'select'
      | 'move'
      | 'rotate'
      | 'paint'
      | 'erase'
      | 'rectangle'
      | 'repeat'
      | 'monster'
      | 'start';
    walkableHexes: readonly RoomHexCell[];
    workspace: RoomWorkspace;
    propDeclarations: Readonly<Record<string, RoomPropDeclaration>>;
    onWalkableGesture: (
      cells: readonly RoomHexCell[],
      mode: 'paint' | 'erase'
    ) => void;
    repeat?: {
      assetRef: string;
      step: number;
      originOffset: number;
      maxCount: number;
    };
    onRepeatGesture?: (
      assetRef: string,
      transforms: readonly WorldTransform[]
    ) => void;
    /** Room-only actor authoring: the placed monsters, the optional party
     * start, and their controls. These are authoring metadata only — never
     * scene props, and never a game-legality gate. */
    monsters?: readonly RoomMonsterPlacement[];
    partyStart?: RoomHexCell | null;
    armedMonsterRef?: string | null;
    selectedActorId?: string | null;
    onSelectActor?: (actorId: string | null) => void;
    onPlaceMonster?: (cell: RoomHexCell) => void;
    onMoveMonster?: (id: string, cell: RoomHexCell) => void;
    onStartGesture?: (cell: RoomHexCell) => void;
  };
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

  const recordBounds = (measured: PropModelBounds) => {
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
  };

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
            <WorldPropModel
              entry={entry}
              position={position}
              rotationY={item.transform.rotationY}
              heightScale={item.heightScale}
              onGeneratedDiagnostic={() => onAssetState(item.id, 'error')}
              onBoundsMeasured={recordBounds}
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

function WorldBuildingCameraControls({
  enabled,
  maxDistance = 26,
}: {
  enabled: boolean;
  maxDistance?: number;
}) {
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
      maxDistance={maxDistance}
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

function RoomAuthoringDeclarations({
  scene,
  authoring,
  rectanglePreview,
}: {
  scene: WorldScene;
  authoring: NonNullable<WorldBuildingViewportProps['roomAuthoring']>;
  rectanglePreview: readonly RoomHexCell[];
}) {
  const fillGeometry = useMemo(() => createWalkableHexFillGeometry(), []);
  return (
    <group name="room-authored-declarations">
      {authoring.walkableHexes.map((cell) => {
        const center = cubeToWorld(
          { x: cell.q, y: -cell.q - cell.r, z: cell.r },
          HEX_SIZE
        );
        return (
          <mesh
            key={`${cell.q},${cell.r}`}
            name={`room-walkable-${cell.q}-${cell.r}`}
            position={[center.x, DUNGEON_SURFACE_Y + 0.018, center.z]}
            geometry={fillGeometry}
            raycast={() => null}
          >
            <meshBasicMaterial
              color="#34d399"
              transparent
              opacity={0.34}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      {rectanglePreview.map((cell) => {
        const center = cubeToWorld(
          { x: cell.q, y: -cell.q - cell.r, z: cell.r },
          HEX_SIZE
        );
        return (
          <mesh
            key={`preview-${cell.q},${cell.r}`}
            name={`room-rectangle-preview-${cell.q}-${cell.r}`}
            position={[center.x, DUNGEON_SURFACE_Y + 0.022, center.z]}
            geometry={fillGeometry}
            raycast={() => null}
          >
            <meshBasicMaterial
              color="#67e8f9"
              transparent
              opacity={0.48}
              depthWrite={false}
            />
          </mesh>
        );
      })}
      {scene.items.flatMap((item) => {
        const declaration = authoring.propDeclarations[item.id];
        if (!declaration) return [];
        const footprint = declaration.footprint;
        return [
          <group
            key={item.id}
            position={[
              item.transform.x,
              DUNGEON_SURFACE_Y + 0.035,
              item.transform.z,
            ]}
            rotation={[0, item.transform.rotationY, 0]}
          >
            <mesh
              name={`room-footprint-${item.id}`}
              position={[footprint.offsetX, 0, footprint.offsetZ]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            >
              <planeGeometry args={[footprint.width, footprint.depth]} />
              <meshBasicMaterial
                color={declaration.blocksMovement ? '#fb7185' : '#fbbf24'}
                wireframe
                transparent
                opacity={0.95}
                depthTest={false}
              />
            </mesh>
          </group>,
        ];
      })}
    </group>
  );
}

export function WorldSceneContents(
  props: WorldBuildingViewportProps & { showCompositionBounds: boolean }
) {
  const { scene, previewScene, selectedIds, tool, activeDrag, onSelect } =
    props;
  const { gl } = useThree();
  const displayScene = previewScene ?? scene;
  const isRoomAuthoring = Boolean(props.roomAuthoring);
  const workspaceHexRadius = props.roomAuthoring?.workspace.hexRadius ?? 6;
  const workspaceGroundRadius =
    props.roomAuthoring?.workspace.horizontalLimit !== undefined
      ? props.roomAuthoring.workspace.horizontalLimit + 1
      : 11.5;
  const hexGeometry = useMemo(
    () => makeHexLines(workspaceHexRadius),
    [workspaceHexRadius]
  );
  const boundaryGeometry = useMemo(
    () => createGroundBoundaryGeometry(workspaceGroundRadius, isRoomAuthoring),
    [isRoomAuthoring, workspaceGroundRadius]
  );
  useEffect(() => () => boundaryGeometry.dispose(), [boundaryGeometry]);
  const controlsRef = useRef<TransformControlsImpl>(null);
  type CapturedFloorPointer = {
    pointerId: number;
    target: Element;
  };
  const floorGesture = useRef<
    | ({
        kind: 'brush';
        mode: 'paint' | 'erase';
        cells: Map<string, RoomHexCell>;
      } & CapturedFloorPointer)
    | ({
        kind: 'rectangle';
        start: { x: number; z: number };
        cells: RoomHexCell[];
      } & CapturedFloorPointer)
    | ({
        kind: 'repeat';
        start: { x: number; z: number };
        descriptor: NonNullable<
          NonNullable<WorldBuildingViewportProps['roomAuthoring']>['repeat']
        >;
        transforms: WorldTransform[];
      } & CapturedFloorPointer)
    | null
  >(null);
  const [rectanglePreview, setRectanglePreview] = useState<RoomHexCell[]>([]);
  /** Hover/placement preview cell for the armed monster and party-start
   * tools. Purely authoring: never authored, never a legality gate. */
  const [actorHoverCell, setActorHoverCell] = useState<RoomHexCell | null>(
    null
  );
  const [repeatPreview, setRepeatPreview] = useState<{
    assetRef: string;
    transforms: WorldTransform[];
  } | null>(null);
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
      // Reported upward as well as kept locally: the guide needs the
      // aggregate, and the declaration editor needs one prop's own size.
      props.onMeasuredBounds?.(id, measurement);
    },
    [props.onMeasuredBounds]
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
  const releaseFloorPointer = useCallback((gesture: CapturedFloorPointer) => {
    try {
      gesture.target.releasePointerCapture?.(gesture.pointerId);
    } catch {
      // Capture may already be released by pointercancel/lostpointercapture.
    }
  }, []);
  const cancelFloorGesture = useCallback(() => {
    const gesture = floorGesture.current;
    floorGesture.current = null;
    if (gesture) releaseFloorPointer(gesture);
    setRectanglePreview([]);
    setRepeatPreview(null);
  }, [releaseFloorPointer]);
  const cancelOwnedFloorGesture = useCallback(
    (pointerId: number) => {
      if (floorGesture.current?.pointerId === pointerId) cancelFloorGesture();
    },
    [cancelFloorGesture]
  );
  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelFloorGesture();
    };
    const cancelOnRightClick = (event: PointerEvent) => {
      if (event.button === 2) cancelFloorGesture();
    };
    const cancelOnContextMenu = () => cancelFloorGesture();
    const cancelOnLostCapture = (event: PointerEvent) =>
      cancelOwnedFloorGesture(event.pointerId);
    window.addEventListener('keydown', cancelOnEscape);
    gl.domElement.addEventListener('pointerdown', cancelOnRightClick);
    gl.domElement.addEventListener('contextmenu', cancelOnContextMenu);
    gl.domElement.addEventListener('lostpointercapture', cancelOnLostCapture);
    return () => {
      window.removeEventListener('keydown', cancelOnEscape);
      gl.domElement.removeEventListener('pointerdown', cancelOnRightClick);
      gl.domElement.removeEventListener('contextmenu', cancelOnContextMenu);
      gl.domElement.removeEventListener(
        'lostpointercapture',
        cancelOnLostCapture
      );
    };
  }, [cancelFloorGesture, cancelOwnedFloorGesture, gl.domElement]);
  useEffect(cancelFloorGesture, [
    cancelFloorGesture,
    props.roomAuthoring?.tool,
  ]);
  useEffect(() => {
    // The hover preview belongs to the armed actor tools alone.
    if (
      props.roomAuthoring?.tool !== 'monster' &&
      props.roomAuthoring?.tool !== 'start'
    )
      setActorHoverCell(null);
  }, [props.roomAuthoring?.tool]);
  useEffect(() => cancelFloorGesture, [cancelFloorGesture]);

  return (
    <>
      <color attach="background" args={['#071113']} />
      <WorldBuildingFog roomAuthoring={Boolean(props.roomAuthoring)} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[7, 12, 6]} intensity={1.35} castShadow />
      <hemisphereLight args={['#a5f3fc', '#172026', 0.55]} />
      <VisualPointLights lights={pointLights} />
      {repeatPreview &&
        (() => {
          const entry = WORLD_BUILDING_CATALOG_BY_REF.get(
            repeatPreview.assetRef
          );
          return entry?.source === 'generated' ? (
            <RepeatPlacementPreview
              entry={entry}
              transforms={repeatPreview.transforms}
            />
          ) : null;
        })()}
      <mesh
        name="world-building-finite-ground"
        userData={{ worldBuildingGround: true }}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, DUNGEON_SURFACE_Y - 0.012, 0]}
        receiveShadow
        onPointerDown={(event) => {
          if (event.button !== 0 || isGizmoPointer()) return;
          if (floorGesture.current) return;
          event.stopPropagation();
          const roomTool = props.roomAuthoring?.tool;
          const actor = props.roomAuthoring?.selectedActorId;
          // Room actor authoring: one click is one whole-room history
          // transaction committed by the editor, on the snapped cell. This
          // is placement selection, not game legality.
          if (
            roomTool === 'monster' ||
            roomTool === 'start' ||
            (roomTool === 'select' && actor)
          ) {
            const cube = worldToCube(
              { x: event.point.x, z: event.point.z },
              HEX_SIZE
            );
            const cell = { q: cube.x, r: cube.z };
            if (roomTool === 'monster') {
              props.roomAuthoring?.onPlaceMonster?.(cell);
              return;
            }
            if (roomTool === 'start' || actor === 'start') {
              props.roomAuthoring?.onStartGesture?.(cell);
              return;
            }
            if (actor) {
              props.roomAuthoring?.onMoveMonster?.(actor, cell);
              return;
            }
          }
          if (roomTool === 'repeat') {
            const descriptor = props.roomAuthoring?.repeat;
            if (!descriptor) return;
            const start = { x: event.point.x, z: event.point.z };
            try {
              const layout = layoutRepeatedProps({
                start,
                end: start,
                step: descriptor.step,
                originOffset: descriptor.originOffset,
                maxCount: descriptor.maxCount,
              });
              const target = event.target as Element;
              target.setPointerCapture?.(event.pointerId);
              floorGesture.current = {
                kind: 'repeat',
                start,
                descriptor: { ...descriptor },
                transforms: layout.transforms,
                pointerId: event.pointerId,
                target,
              };
              setRepeatPreview({
                assetRef: descriptor.assetRef,
                transforms: layout.transforms,
              });
            } catch (error) {
              cancelFloorGesture();
              props.onTransformReject(
                error instanceof Error ? error.message : String(error)
              );
            }
            return;
          }
          if (roomTool === 'rectangle') {
            const start = { x: event.point.x, z: event.point.z };
            const cells = walkableCellsInWorldRectangle(
              start,
              start,
              workspaceHexRadius
            );
            const target = event.target as Element;
            target.setPointerCapture?.(event.pointerId);
            floorGesture.current = {
              kind: 'rectangle',
              start,
              cells,
              pointerId: event.pointerId,
              target,
            };
            setRectanglePreview(cells);
            return;
          }
          if (roomTool === 'paint' || roomTool === 'erase') {
            const cube = worldToCube(
              { x: event.point.x, z: event.point.z },
              HEX_SIZE
            );
            const cell = { q: cube.x, r: cube.z };
            const target = event.target as Element;
            target.setPointerCapture?.(event.pointerId);
            floorGesture.current = {
              kind: 'brush',
              mode: roomTool,
              cells: new Map([[`${cell.q},${cell.r}`, cell]]),
              pointerId: event.pointerId,
              target,
            };
            return;
          }
          if (!event.shiftKey) onSelect([]);
        }}
        onPointerMove={(event) => {
          const roomTool = props.roomAuthoring?.tool;
          // Snapped hover/placement preview for the armed actor tools. The
          // shared worldToCube already rounds to the nearest hex.
          if (roomTool === 'monster' || roomTool === 'start') {
            const cube = worldToCube(
              { x: event.point.x, z: event.point.z },
              HEX_SIZE
            );
            setActorHoverCell((current) =>
              current && current.q === cube.x && current.r === cube.z
                ? current
                : { q: cube.x, r: cube.z }
            );
          } else if (actorHoverCell) setActorHoverCell(null);
          if (event.buttons !== 1) return;
          const gesture = floorGesture.current;
          if (!gesture || event.pointerId !== gesture.pointerId) return;
          event.stopPropagation();
          if (roomTool === 'repeat' && gesture.kind === 'repeat') {
            try {
              const layout = layoutRepeatedProps({
                start: gesture.start,
                end: { x: event.point.x, z: event.point.z },
                step: gesture.descriptor.step,
                originOffset: gesture.descriptor.originOffset,
                maxCount: gesture.descriptor.maxCount,
              });
              gesture.transforms = layout.transforms;
              setRepeatPreview({
                assetRef: gesture.descriptor.assetRef,
                transforms: layout.transforms,
              });
            } catch (error) {
              gesture.transforms = [];
              setRepeatPreview(null);
              props.onTransformReject(
                error instanceof Error ? error.message : String(error)
              );
            }
            return;
          }
          if (roomTool === 'rectangle' && gesture.kind === 'rectangle') {
            const cells = walkableCellsInWorldRectangle(
              gesture.start,
              { x: event.point.x, z: event.point.z },
              workspaceHexRadius
            );
            gesture.cells = cells;
            setRectanglePreview(cells);
            return;
          }
          if (
            (roomTool !== 'paint' && roomTool !== 'erase') ||
            gesture.kind !== 'brush'
          )
            return;
          const cube = worldToCube(
            { x: event.point.x, z: event.point.z },
            HEX_SIZE
          );
          const cell = { q: cube.x, r: cube.z };
          gesture.cells.set(`${cell.q},${cell.r}`, cell);
        }}
        onPointerUp={(event) => {
          const gesture = floorGesture.current;
          if (!gesture || event.pointerId !== gesture.pointerId) return;
          event.stopPropagation();
          floorGesture.current = null;
          releaseFloorPointer(gesture);
          setRectanglePreview([]);
          setRepeatPreview(null);
          if (gesture.kind === 'repeat') {
            if (gesture.transforms.length > 0) {
              props.roomAuthoring?.onRepeatGesture?.(
                gesture.descriptor.assetRef,
                gesture.transforms
              );
            }
          } else if (gesture.kind === 'rectangle') {
            if (gesture.cells.length > 0)
              props.roomAuthoring?.onWalkableGesture(gesture.cells, 'paint');
          } else {
            props.roomAuthoring?.onWalkableGesture(
              [...gesture.cells.values()],
              gesture.mode
            );
          }
        }}
        onPointerCancel={(event) => cancelOwnedFloorGesture(event.pointerId)}
      >
        <circleGeometry args={[workspaceGroundRadius, 6]} />
        <meshStandardMaterial
          color="#182a2a"
          roughness={0.96}
          metalness={0.02}
        />
      </mesh>
      {props.roomAuthoring && (
        <WorkspaceFloorUnderlay radius={workspaceGroundRadius} />
      )}
      <lineSegments
        name="world-building-real-hex-basis"
        geometry={hexGeometry}
        raycast={() => null}
      >
        <lineBasicMaterial color="#47726e" transparent opacity={0.72} />
      </lineSegments>
      <lineLoop
        name="world-building-ground-boundary"
        geometry={boundaryGeometry}
        raycast={() => null}
      >
        <lineBasicMaterial color="#5eead4" transparent opacity={0.55} />
      </lineLoop>
      <WorldPlacementGuides
        bounds={guideBounds}
        showCompositionBounds={props.showCompositionBounds}
      />
      {props.roomAuthoring && (
        <RoomAuthoringDeclarations
          scene={displayScene}
          authoring={props.roomAuthoring}
          rectanglePreview={rectanglePreview}
        />
      )}
      {props.roomAuthoring && (
        <RoomActorMarkers
          monsters={props.roomAuthoring.monsters ?? []}
          partyStart={props.roomAuthoring.partyStart ?? null}
          selectedActorId={props.roomAuthoring.selectedActorId ?? null}
          onSelectActor={(actor) => props.roomAuthoring?.onSelectActor?.(actor)}
        />
      )}
      {props.roomAuthoring &&
        actorHoverCell &&
        (props.roomAuthoring.tool === 'monster' ||
          props.roomAuthoring.tool === 'start') && (
          <RoomActorPreview
            hoverCell={actorHoverCell}
            label={
              props.roomAuthoring.tool === 'start'
                ? 'Party start'
                : paletteNameForRef(props.roomAuthoring.armedMonsterRef ?? '')
            }
            color={
              props.roomAuthoring.tool === 'start'
                ? ROOM_START_COLOR
                : ROOM_MONSTER_COLOR
            }
          />
        )}
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
      <WorldBuildingCameraControls
        enabled={!transforming}
        maxDistance={Math.max(26, workspaceGroundRadius * 2.2)}
      />
      <WorldBuildingTransformGizmo
        controlsRef={controlsRef}
        scene={scene}
        selectedIds={selectedIds}
        tool={tool}
        onPreview={props.onTransformPreview}
        onCommit={props.onTransformCommit}
        onReject={props.onTransformReject}
        onTransformingChange={setTransforming}
        sceneHorizontalLimit={props.roomAuthoring?.workspace.horizontalLimit}
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

/** Expanded room authoring stays legible; the prop composer keeps its atmosphere. */
export function WorldBuildingFog({
  roomAuthoring,
}: {
  roomAuthoring: boolean;
}) {
  return roomAuthoring ? null : <fog attach="fog" args={['#071113', 15, 31]} />;
}

export function WorldBuildingViewport(props: WorldBuildingViewportProps) {
  const [showCompositionBounds, setShowCompositionBounds] = useState(true);

  return (
    <>
      <Canvas
        camera={{ position: [8, 9, 8], fov: 48, near: 0.1, far: 100 }}
        dpr={[1, 1.6]}
        shadows
        data-testid="world-building-canvas"
        aria-label="World building 3D canvas. The gold X0/Z0 hex is the placement anchor; the optional orange box is the visual composition bounds, not a mechanical footprint. Left click selects; Shift-left adds selection; middle drag orbits; Shift-middle drag pans; wheel zooms; right click cancels a transform."
      >
        <WorldSceneContents
          {...props}
          showCompositionBounds={showCompositionBounds}
        />
      </Canvas>
      <div className="wb-placement-guide-legend" aria-hidden="true">
        <span>
          <i className="wb-placement-guide-swatch wb-placement-guide-swatch--anchor" />
          Placement anchor · X0 / Z0
        </span>
      </div>
      <WorldPlacementGuideControl
        showCompositionBounds={showCompositionBounds}
        onShowCompositionBoundsChange={setShowCompositionBounds}
      />
    </>
  );
}
