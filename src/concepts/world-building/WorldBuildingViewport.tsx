import { paletteNameForRef } from '@/author/paletteData';
import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
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
  type RoomDoorBinding,
  type RoomHexCell,
  type RoomMonsterBinding,
  type RoomMonsterPlacement,
  type RoomPropDeclaration,
  type RoomWorkspace,
} from './roomDraft';
import { createWalkableHexFillGeometry } from './roomHexGeometry';
import { selectionClosure } from './sceneState';
import type { SiteConcealments } from './siteScope';
import { StructuralConcealmentGuides } from './StructuralConcealmentGuides';
import { snapWallPoint } from './structuralWallEditing';
import type { StructuralWall } from './structuralWalls';
import { StructuralWallVisual } from './StructuralWallVisual';
import type { StudioArrangeTarget } from './studioArrange';
import type { StudioDoorEditing } from './studioDoorEditing';
import type { WorldPoint, WorldScene, WorldTransform } from './types';
import { usePresentationWorkspace } from './usePresentationWorkspace';
import { WorkspaceCellOverlay } from './WorkspaceCellOverlay';
import { createWorkspaceFloorGeometry } from './workspaceFloorGeometry';
import { WorkspaceFloorUnderlay } from './WorkspaceFloorUnderlay';
import {
  workspaceBounds,
  workspaceCellAtPoint,
  workspaceCells,
} from './workspaceGeometry';
import { createWorkspaceRectangleSelection } from './workspaceRectangleSelection';
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
      | 'start'
      | 'wall'
      | 'door';
    doorEditing?: StudioDoorEditing;
    intentEpoch?: number;
    walkableHexes: readonly RoomHexCell[];
    concealments?: SiteConcealments;
    activeConcealmentId?: string | null;
    onConcealmentCellPick?: (cell: RoomHexCell) => void;
    onConcealmentPropPick?: (id: string) => void;
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
    monsterBindings?: Readonly<Record<string, RoomMonsterBinding>>;
    partyStart?: RoomHexCell | null;
    armedMonsterRef?: string | null;
    /** Typed Studio identity. Explicit null masks legacy remembered IDs; only
     * an absent contract uses the old string consumer boundary. */
    selectedActorTarget?: Extract<
      StudioArrangeTarget,
      { kind: 'actor' | 'start' }
    > | null;
    onSelectActorTarget?: (
      target: Extract<StudioArrangeTarget, { kind: 'actor' | 'start' }> | null
    ) => void;
    selectedActorId?: string | null;
    onSelectActor?: (actorId: string | null) => void;
    onPlaceMonster?: (cell: RoomHexCell) => void;
    onMoveMonster?: (id: string, cell: RoomHexCell) => void;
    onStartGesture?: (cell: RoomHexCell) => void;
    /** Authored structural walls, their selection, the optional snap flag and
     * the draw callback. The viewport reports a finished line; the editor
     * creates and commits the wall through the existing room history. */
    walls?: readonly StructuralWall[];
    /** Attached-door state, keyed by bound door id. Presentation preview of
     * the authored INITIAL state only; never a live engine operation. */
    doorBindings?: Readonly<Record<string, RoomDoorBinding>>;
    selectedWallId?: string | null;
    previewWall?: StructuralWall | null;
    onWallTransformPreview?: (wall: StructuralWall | null) => void;
    onWallTransformCommit?: (wall: StructuralWall) => void;
    wallSnapEnabled?: boolean;
    onWallGesture?: (line: { start: WorldPoint; end: WorldPoint }) => void;
    onSelectWall?: (id: string | null) => void;
  };
}

function makeHexLines(workspace: RoomWorkspace | number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (const { q, r } of workspaceCells(workspace)) {
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
  onMemberPick?: (id: string) => void;
  memberColor?: string;
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
  onMemberPick,
  memberColor,
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
    if (onMemberPick) {
      onMemberPick(selectionId);
      return;
    }
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
      {(selected || memberColor) && bounds && (
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
            color={memberColor ?? '#67e8f9'}
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
  workspace,
}: {
  enabled: boolean;
  maxDistance?: number;
  workspace?: RoomWorkspace;
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
  const extent = useMemo(
    () =>
      workspace?.kind === 'centered-odd-r' ? workspaceBounds(workspace) : null,
    [workspace]
  );
  const fittedRectangle = useRef(false);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;
  const aspect = perspectiveCamera.isPerspectiveCamera
    ? perspectiveCamera.aspect
    : 1;
  useEffect(() => {
    if (!perspectiveCamera.isPerspectiveCamera) return;
    if (!extent) {
      if (fittedRectangle.current) {
        camera.position.set(8, 9, 8);
        perspectiveCamera.far = 100;
        perspectiveCamera.updateProjectionMatrix();
        controlsRef.current?.target.set(0, 0.6, 0);
        controlsRef.current?.update();
        fittedRectangle.current = false;
      }
      return;
    }
    fittedRectangle.current = true;
    // Fit at the existing orientation; no gameplay preset or mouse changes.
    const radius = Math.hypot(
      Math.max(Math.abs(extent.minX), Math.abs(extent.maxX)),
      Math.max(Math.abs(extent.minZ), Math.abs(extent.maxZ))
    );
    const halfFov = Math.min(
      THREE.MathUtils.degToRad(perspectiveCamera.fov / 2),
      Math.atan(
        Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)) * aspect
      )
    );
    const distance = (radius / Math.sin(halfFov)) * 1.08;
    const target = new THREE.Vector3(0, 0.6, 0);
    const direction = camera.position
      .clone()
      .sub(controlsRef.current?.target ?? target);
    if (direction.lengthSq() === 0) direction.set(8, 8.4, 8);
    camera.position.copy(
      direction.normalize().multiplyScalar(distance).add(target)
    );
    const reach = Math.max(maxDistance, distance * 2);
    perspectiveCamera.far = Math.max(100, distance + reach + radius * 4);
    if (controlsRef.current) controlsRef.current.maxDistance = reach;
    perspectiveCamera.updateProjectionMatrix();
    controlsRef.current?.target.copy(target);
    controlsRef.current?.update();
    recordCamera();
  }, [camera, perspectiveCamera, aspect, extent, maxDistance, recordCamera]);
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
  useEffect(() => () => fillGeometry.dispose(), [fillGeometry]);
  const rectangular = authoring.workspace.kind === 'centered-odd-r';
  return (
    <group name="room-authored-declarations">
      {rectangular ? (
        <WorkspaceCellOverlay
          name="room-walkable-cells"
          cells={authoring.walkableHexes}
          geometry={fillGeometry}
          y={DUNGEON_SURFACE_Y + 0.018}
          color="#34d399"
          opacity={0.34}
        />
      ) : (
        authoring.walkableHexes.map((cell) => {
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
        })
      )}
      {rectangular
        ? Object.entries(authoring.concealments ?? {}).map(([id, spec]) => (
            <WorkspaceCellOverlay
              key={id}
              name={`room-concealment-${id}-cells`}
              cells={spec.cells ?? []}
              geometry={fillGeometry}
              y={DUNGEON_SURFACE_Y + 0.021}
              color={
                id === authoring.activeConcealmentId ? '#fbbf24' : '#c084fc'
              }
              opacity={0.6}
            />
          ))
        : Object.entries(authoring.concealments ?? {}).flatMap(([id, spec]) =>
            (spec.cells ?? []).map((cell) => {
              const center = cubeToWorld(
                { x: cell.q, y: -cell.q - cell.r, z: cell.r },
                HEX_SIZE
              );
              return (
                <mesh
                  key={`${id}-${cell.q},${cell.r}`}
                  name={`room-concealment-${id}-${cell.q}-${cell.r}`}
                  position={[center.x, DUNGEON_SURFACE_Y + 0.021, center.z]}
                  geometry={fillGeometry}
                  raycast={() => null}
                >
                  <meshBasicMaterial
                    color={
                      id === authoring.activeConcealmentId
                        ? '#fbbf24'
                        : '#c084fc'
                    }
                    transparent
                    opacity={0.6}
                    depthWrite={false}
                  />
                </mesh>
              );
            })
          )}
      {rectangular ? (
        <WorkspaceCellOverlay
          name="room-rectangle-preview-cells"
          cells={rectanglePreview}
          geometry={fillGeometry}
          y={DUNGEON_SURFACE_Y + 0.022}
          color="#67e8f9"
          opacity={0.48}
        />
      ) : (
        rectanglePreview.map((cell) => {
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
        })
      )}
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
  const {
    scene,
    previewScene,
    selectedIds,
    tool,
    activeDrag,
    onSelect,
    onMeasuredBounds,
  } = props;
  const { gl } = useThree();
  // Ground and actor overlays pick the same authored cell. Markers intercept
  // pointer events, so their occupied floor must use this path too.
  const pickConcealmentCell = (cell: RoomHexCell | null | undefined): void => {
    const authoring = props.roomAuthoring;
    if (!cell || !authoring?.activeConcealmentId) return;
    if (
      authoring.walkableHexes.some(
        (value) => value.q === cell.q && value.r === cell.r
      )
    ) {
      authoring.onConcealmentCellPick?.(cell);
    }
  };
  const displayScene = previewScene ?? scene;
  const isRoomAuthoring = Boolean(props.roomAuthoring);
  const workspace = usePresentationWorkspace(props.roomAuthoring?.workspace);
  const rectangular = workspace?.kind === 'centered-odd-r';
  const rectangleCells = useMemo(
    () => createWorkspaceRectangleSelection(workspace ?? 6),
    [workspace]
  );
  const workspaceGroundRadius =
    props.roomAuthoring?.workspace.horizontalLimit !== undefined
      ? props.roomAuthoring.workspace.horizontalLimit + 1
      : 11.5;
  const hexGeometry = useMemo(() => makeHexLines(workspace ?? 6), [workspace]);
  const boundaryGeometry = useMemo(
    () =>
      createGroundBoundaryGeometry(
        workspace ?? workspaceGroundRadius,
        isRoomAuthoring
      ),
    [isRoomAuthoring, workspace, workspaceGroundRadius]
  );
  const groundGeometry = useMemo(
    () => createWorkspaceFloorGeometry(workspace ?? workspaceGroundRadius, 6),
    [workspace, workspaceGroundRadius]
  );
  useEffect(() => () => boundaryGeometry.dispose(), [boundaryGeometry]);
  useEffect(() => () => hexGeometry.dispose(), [hexGeometry]);
  useEffect(() => () => groundGeometry.dispose(), [groundGeometry]);
  const pickGroundCell = (point: {
    x: number;
    z: number;
  }): RoomHexCell | null =>
    workspaceCellAtPoint(
      workspace ?? { hexRadius: 6, horizontalLimit: 12 },
      point
    );
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
    | ({
        kind: 'wall';
        start: WorldPoint;
        end: WorldPoint;
      } & CapturedFloorPointer)
    | null
  >(null);
  const [rectanglePreview, setRectanglePreview] = useState<RoomHexCell[]>([]);
  const [wallPreview, setWallPreview] = useState<{
    start: WorldPoint;
    end: WorldPoint;
  } | null>(null);
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
      onMeasuredBounds?.(id, measurement);
    },
    [onMeasuredBounds]
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
    setWallPreview(null);
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
    props.roomAuthoring?.activeConcealmentId,
    scene,
    props.roomAuthoring?.workspace,
    props.roomAuthoring?.walkableHexes,
    props.roomAuthoring?.walls,
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
      {wallPreview &&
        (() => {
          const dx = wallPreview.end.x - wallPreview.start.x;
          const dz = wallPreview.end.z - wallPreview.start.z;
          const length = Math.hypot(dx, dz);
          const rotationY = length === 0 ? 0 : Math.atan2(-dz, dx);
          return (
            <mesh
              name="structural-wall-draw-preview"
              userData={{ length }}
              position={[
                (wallPreview.start.x + wallPreview.end.x) / 2,
                DUNGEON_SURFACE_Y + 0.06,
                (wallPreview.start.z + wallPreview.end.z) / 2,
              ]}
              rotation={[0, rotationY, 0]}
              raycast={() => null}
            >
              <boxGeometry args={[Math.max(length, 0.04), 0.02, 0.1]} />
              <meshBasicMaterial
                color="#67e8f9"
                transparent
                opacity={0.9}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          );
        })()}
      {props.roomAuthoring && (props.roomAuthoring.walls?.length ?? 0) > 0 && (
        <StructuralWallVisual
          walls={(props.roomAuthoring.walls ?? []).map((wall) =>
            props.roomAuthoring?.previewWall?.id === wall.id
              ? props.roomAuthoring.previewWall
              : wall
          )}
          selectedWallId={props.roomAuthoring.selectedWallId ?? null}
          doorBindings={props.roomAuthoring.doorBindings}
          doorEditing={props.roomAuthoring.doorEditing}
          intentEpoch={props.roomAuthoring.intentEpoch}
          selectable={
            ['select', 'move', 'rotate', 'door'].includes(
              props.roomAuthoring.tool
            ) && !props.roomAuthoring.activeConcealmentId
          }
          onSelectWall={(id) => {
            if (!isGizmoPointer()) props.roomAuthoring?.onSelectWall?.(id);
          }}
        />
      )}
      {props.roomAuthoring && (
        <StructuralConcealmentGuides
          walls={props.roomAuthoring.walls ?? []}
          concealments={props.roomAuthoring.concealments}
          activeId={props.roomAuthoring.activeConcealmentId}
          onPick={props.roomAuthoring.onConcealmentPropPick}
        />
      )}
      <mesh
        name="world-building-finite-ground"
        userData={{ worldBuildingGround: true }}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, DUNGEON_SURFACE_Y - 0.012, 0]}
        receiveShadow
        geometry={groundGeometry}
        onPointerDown={(event) => {
          if (event.button !== 0 || isGizmoPointer()) return;
          if (floorGesture.current) return;
          const cell = pickGroundCell(event.point);
          if (rectangular && !cell) return;
          event.stopPropagation();
          const roomTool = props.roomAuthoring?.tool;
          if (roomTool === 'door') {
            props.roomAuthoring?.doorEditing?.cancelPreview();
            return;
          }
          const authoring = props.roomAuthoring;
          const actor =
            authoring?.selectedActorTarget !== undefined
              ? authoring.selectedActorTarget
              : authoring?.selectedActorId
                ? authoring.selectedActorId === 'start'
                  ? { kind: 'start' as const }
                  : { kind: 'actor' as const, id: authoring.selectedActorId }
                : null;
          if (props.roomAuthoring?.activeConcealmentId) {
            // Pick authored floor, not empty workspace; never game legality.
            pickConcealmentCell(cell);
            return;
          }
          // Room actor authoring: one click is one whole-room history
          // transaction committed by the editor, on the snapped cell. This
          // is placement selection, not game legality.
          //
          // PLACING AND MOVING ARE BOTH ARMED, AND `select` IS NEITHER. An
          // actor being selected must never mean the next floor click moves it,
          // or an author cannot select a creature to edit it and then go on to
          // click a prop — or empty ground — without relocating the creature
          // (Kirk, 2026-09-19). Moving is armed from the actor list and spends
          // itself on the click that performs it.
          if (
            roomTool === 'monster' ||
            roomTool === 'start' ||
            roomTool === 'move'
          ) {
            if (!cell) return;
            if (roomTool === 'monster') {
              props.roomAuthoring?.onPlaceMonster?.(cell);
              return;
            }
            if (roomTool === 'start') {
              props.roomAuthoring?.onStartGesture?.(cell);
              return;
            }
            if (actor) {
              // Preserve the old string consumer's routing when the typed
              // contract is absent; Studio never takes that ambiguous path.
              if (authoring?.selectedActorTarget === undefined)
                authoring?.onMoveMonster?.(authoring.selectedActorId!, cell);
              else if (actor.kind === 'start') authoring.onStartGesture?.(cell);
              else authoring.onMoveMonster?.(actor.id, cell);
              return;
            }
          }
          // A floor click in `select` DROPS the actor selection, then falls
          // through to the ordinary scenery path below, so one click both
          // clears the actor and selects whatever is under the cursor — which,
          // on bare ground, is nothing.
          if (roomTool === 'select' && actor) {
            if (authoring?.onSelectActorTarget)
              authoring.onSelectActorTarget(null);
            else authoring?.onSelectActor?.(null);
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
              if (
                rectangular &&
                layout.transforms.some(
                  (transform) => !pickGroundCell(transform)
                )
              )
                throw new Error(
                  'Repeat anchor outside the authoring workspace.'
                );
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
            const cells = rectangleCells(start, start);
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
            if (!cell) return;
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
          // Wall drawing: preview-only during the drag, one line reported on
          // release, zero length a no-op. Snapping is optional and uses the
          // one shared pure helper for both the preview and the commit.
          if (roomTool === 'wall') {
            const start = snapWallPoint({
              point: { x: event.point.x, z: event.point.z },
              enabled: props.roomAuthoring?.wallSnapEnabled ?? false,
            }).point;
            if (rectangular && !pickGroundCell(start)) return;
            const target = event.target as Element;
            target.setPointerCapture?.(event.pointerId);
            floorGesture.current = {
              kind: 'wall',
              start,
              end: start,
              pointerId: event.pointerId,
              target,
            };
            setWallPreview({ start, end: start });
            return;
          }
          if (!event.shiftKey) onSelect([]);
        }}
        onPointerMove={(event) => {
          const roomTool = props.roomAuthoring?.tool;
          const cell = pickGroundCell(event.point);
          if (rectangular && !cell) {
            setActorHoverCell(null);
            return;
          }
          // Snapped hover/placement preview for the armed actor tools. The
          // shared worldToCube already rounds to the nearest hex.
          if (roomTool === 'monster' || roomTool === 'start') {
            setActorHoverCell(cell);
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
              if (
                rectangular &&
                layout.transforms.some(
                  (transform) => !pickGroundCell(transform)
                )
              )
                throw new Error(
                  'Repeat anchor outside the authoring workspace.'
                );
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
            const cells = rectangleCells(gesture.start, event.point);
            gesture.cells = cells;
            setRectanglePreview(cells);
            return;
          }
          if (roomTool === 'wall' && gesture.kind === 'wall') {
            const end = snapWallPoint({
              point: { x: event.point.x, z: event.point.z },
              enabled: props.roomAuthoring?.wallSnapEnabled ?? false,
            }).point;
            if (rectangular && !pickGroundCell(end)) return;
            gesture.end = end;
            setWallPreview({ start: gesture.start, end });
            return;
          }
          if (
            (roomTool !== 'paint' && roomTool !== 'erase') ||
            gesture.kind !== 'brush'
          )
            return;
          if (cell) gesture.cells.set(`${cell.q},${cell.r}`, cell);
        }}
        onPointerUp={(event) => {
          const gesture = floorGesture.current;
          if (!gesture || event.pointerId !== gesture.pointerId) return;
          event.stopPropagation();
          // Capture release may be off-ground; only the already-contained
          // samples are committed. The release point never adds a cell/pose.
          floorGesture.current = null;
          releaseFloorPointer(gesture);
          setRectanglePreview([]);
          setRepeatPreview(null);
          setWallPreview(null);
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
          } else if (gesture.kind === 'wall') {
            const length = Math.hypot(
              gesture.end.x - gesture.start.x,
              gesture.end.z - gesture.start.z
            );
            if (length > 0) {
              props.roomAuthoring?.onWallGesture?.({
                start: { ...gesture.start },
                end: { ...gesture.end },
              });
            }
          } else {
            props.roomAuthoring?.onWalkableGesture(
              [...gesture.cells.values()],
              gesture.mode
            );
          }
        }}
        onPointerCancel={(event) => cancelOwnedFloorGesture(event.pointerId)}
      >
        <meshStandardMaterial
          color="#182a2a"
          roughness={0.96}
          metalness={0.02}
        />
      </mesh>
      {props.roomAuthoring && <WorkspaceFloorUnderlay workspace={workspace!} />}
      <lineSegments
        name="world-building-real-hex-basis"
        geometry={hexGeometry}
        raycast={() => null}
      >
        <lineBasicMaterial color="#47726e" transparent opacity={0.72} />
      </lineSegments>
      {rectangular ? (
        <lineSegments
          name="world-building-ground-boundary"
          geometry={boundaryGeometry}
          raycast={() => null}
        >
          <lineBasicMaterial color="#5eead4" transparent opacity={0.55} />
        </lineSegments>
      ) : (
        <lineLoop
          name="world-building-ground-boundary"
          geometry={boundaryGeometry}
          raycast={() => null}
        >
          <lineBasicMaterial color="#5eead4" transparent opacity={0.55} />
        </lineLoop>
      )}
      {/* The composition origin and its bounds are prop-composition
          vocabulary (design §UI surfaces, violation 3). While a room is being
          built they mean nothing, so they are not drawn at all. */}
      {!isRoomAuthoring && (
        <WorldPlacementGuides
          bounds={guideBounds}
          showCompositionBounds={props.showCompositionBounds}
        />
      )}
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
          monsterBindings={props.roomAuthoring.monsterBindings}
          partyStart={props.roomAuthoring.partyStart ?? null}
          selectedActorId={props.roomAuthoring.selectedActorId ?? null}
          selectedActorTarget={props.roomAuthoring.selectedActorTarget}
          onSelectActorTarget={
            props.roomAuthoring.onSelectActorTarget
              ? (target) => {
                  const authoring = props.roomAuthoring;
                  if (authoring?.activeConcealmentId) {
                    pickConcealmentCell(
                      target?.kind === 'start'
                        ? authoring.partyStart
                        : target?.kind === 'actor'
                          ? authoring.monsters?.find(
                              (monster) => monster.id === target.id
                            )?.startingCell.location
                          : null
                    );
                    return;
                  }
                  authoring?.onSelectActorTarget?.(target);
                }
              : undefined
          }
          onSelectActor={(actor) => {
            const authoring = props.roomAuthoring;
            if (authoring?.activeConcealmentId) {
              pickConcealmentCell(
                actor === 'start'
                  ? authoring.partyStart
                  : authoring.monsters?.find((monster) => monster.id === actor)
                      ?.startingCell.location
              );
              return;
            }
            authoring?.onSelectActor?.(actor);
          }}
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
          onMemberPick={
            props.roomAuthoring?.activeConcealmentId
              ? props.roomAuthoring.onConcealmentPropPick
              : undefined
          }
          memberColor={
            Object.entries(props.roomAuthoring?.concealments ?? {}).some(
              ([id, spec]) =>
                id === props.roomAuthoring?.activeConcealmentId &&
                spec.props?.includes(item.id)
            )
              ? '#fbbf24'
              : Object.values(props.roomAuthoring?.concealments ?? {}).some(
                    (spec) => spec.props?.includes(item.id)
                  )
                ? '#c084fc'
                : undefined
          }
        />
      ))}
      <WorldBuildingCameraControls
        enabled={!transforming}
        maxDistance={Math.max(
          26,
          workspaceGroundRadius * (rectangular ? 8 : 2.2)
        )}
        workspace={workspace}
      />
      <WorldBuildingTransformGizmo
        controlsRef={controlsRef}
        scene={scene}
        selectedIds={
          props.roomAuthoring?.activeConcealmentId ? [] : selectedIds
        }
        tool={tool}
        onPreview={props.onTransformPreview}
        onCommit={props.onTransformCommit}
        onReject={props.onTransformReject}
        onTransformingChange={setTransforming}
        workspace={props.roomAuthoring?.workspace}
        sceneHorizontalLimit={props.roomAuthoring?.workspace.horizontalLimit}
        wallTarget={(() => {
          const room = props.roomAuthoring;
          const wall = room?.walls?.find(
            (entry) => entry.id === room.selectedWallId
          );
          if (
            !room ||
            !wall ||
            room.activeConcealmentId ||
            (room.tool !== 'move' && room.tool !== 'rotate') ||
            !room.onWallTransformPreview ||
            !room.onWallTransformCommit
          )
            return undefined;
          return {
            wall,
            horizontalLimit: room.workspace.horizontalLimit,
            workspace: room.workspace,
            onPreview: room.onWallTransformPreview,
            onCommit: room.onWallTransformCommit,
          };
        })()}
      />
      <WorldBuildingDropInteraction
        activeDrag={
          props.roomAuthoring?.activeConcealmentId ? null : activeDrag
        }
        floorY={DUNGEON_SURFACE_Y}
        workspace={props.roomAuthoring?.workspace}
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
  /** The placement anchor and the composition-bounds guide are the prop
   * composer's vocabulary. In room authoring they are a leak, so the legend,
   * the toggle and the meshes are all absent (rpg-dnd5e-web#1152). */
  const compositionGuides = !props.roomAuthoring;

  return (
    <>
      <Canvas
        camera={{ position: [8, 9, 8], fov: 48, near: 0.1, far: 100 }}
        dpr={[1, 1.6]}
        shadows
        data-testid="world-building-canvas"
        aria-label={
          compositionGuides
            ? 'World building 3D canvas. The gold X0/Z0 hex is the placement anchor; the optional orange box is the visual composition bounds, not a mechanical footprint. Left click selects; Shift-left adds selection; middle drag orbits; Shift-middle drag pans; wheel zooms; right click cancels a transform.'
            : 'Room authoring 3D canvas. Hexes are slots for the room grid, not free world space. Left click selects; Shift-left adds selection; middle drag orbits; Shift-middle drag pans; wheel zooms; right click cancels a transform.'
        }
      >
        <WorldSceneContents
          {...props}
          showCompositionBounds={showCompositionBounds}
        />
      </Canvas>
      {compositionGuides && (
        <>
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
      )}
    </>
  );
}
