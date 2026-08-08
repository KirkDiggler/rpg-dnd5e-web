import { GlbInstance } from '@/components/hex-grid/GlbInstance';
import { HEX_SIZE, hexCorners } from '@/components/hex-grid/hexMath';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import {
  WALL_VARIANTS,
  wallVariantScale,
} from '@/components/hex-grid/syntyHexWallHelpers';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import {
  Html,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  useGLTF,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  isUsableMeasurement,
  resolvedCalibrationOffset,
  type AssetAnchorLabState,
  type RenderObservation,
  type Vec3Tuple,
  type VisibleBounds,
} from './assetAnchorExperiment';
import { facingToRotationY } from './boardGeometry';
import {
  INITIAL_AZIMUTH,
  INITIAL_DISTANCE,
  ORTHO_FAR,
  ORTHO_NEAR,
  ORTHO_ZOOM,
  POLAR_ANGLE,
  sphericalCameraPosition,
} from './preview3d/playCameraRig';

const FLOOR_TILES = new Map<string, AbsoluteFloorTile>([
  ['0,0,0', { x: 0, y: 0, z: 0, roomId: 'anchor-lab' }],
]);
export const LAB_WALL_NOMINAL_Z = -Math.sqrt(3) / 2;
// Measured from the exact plain wall GLB used by this fixture: raw Z
// [-0.153132, +0.282585] scaled by SYNTY_SCALE and placed at nominal Z.
export const LAB_WALL_VISIBLE_FAR_FACE_Z =
  LAB_WALL_NOMINAL_Z + -0.1531318724 * SYNTY_SCALE;
export const LAB_WALL_VISIBLE_ROOM_FACE_Z =
  LAB_WALL_NOMINAL_Z + 0.282584846 * SYNTY_SCALE;
const WALL_Z = LAB_WALL_NOMINAL_Z;
const WALL_HEIGHT = 1.6;
const PLAIN_WALL = WALL_VARIANTS[0]!;

function makeHexGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  hexCorners({ x: 0, z: 0 }, HEX_SIZE).forEach((corner, index) => {
    if (index === 0) shape.moveTo(corner.x, -corner.z);
    else shape.lineTo(corner.x, -corner.z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function measureVisibleBounds(object: THREE.Object3D): VisibleBounds {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  const min = box.min
    .toArray()
    .map((value) => value * SYNTY_SCALE) as Vec3Tuple;
  const max = box.max
    .toArray()
    .map((value) => value * SYNTY_SCALE) as Vec3Tuple;
  return {
    min,
    max,
    center: min.map((value, index) => (value + max[index]!) / 2) as Vec3Tuple,
    size: min.map((value, index) => max[index]! - value) as Vec3Tuple,
  };
}

function useRawGhostMaterials(object: THREE.Object3D) {
  useEffect(() => {
    const created: THREE.Material[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const source = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const ghosted = source.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = 0.24;
        clone.depthWrite = false;
        if ('color' in clone && clone.color instanceof THREE.Color) {
          clone.color.lerp(new THREE.Color('#ff3fa4'), 0.7);
        }
        created.push(clone);
        return clone;
      });
      child.material = Array.isArray(child.material) ? ghosted : ghosted[0]!;
    });
    return () => created.forEach((material) => material.dispose());
  }, [object]);
}

function BoundsBox({
  bounds,
  offset,
  color,
  name,
}: {
  bounds: VisibleBounds;
  offset: Vec3Tuple;
  color: string;
  name: string;
}) {
  const position = bounds.center.map(
    (value, index) => value + offset[index]!
  ) as Vec3Tuple;
  return (
    <mesh name={name} position={position} renderOrder={10}>
      <boxGeometry args={bounds.size} />
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={0.9}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function SceneLabel({
  name,
  text,
  position,
  tone,
}: {
  name: string;
  text: string;
  position: Vec3Tuple;
  tone: 'raw' | 'calibrated' | 'reference';
}) {
  const color =
    tone === 'raw' ? '#ff69b5' : tone === 'calibrated' ? '#58edff' : '#ffe36e';
  return (
    <group name={name} position={position} userData={{ label: text }}>
      {/* Fixed-pixel Html is deliberate: drei distanceFactor can magnify a
          label mounted after an orthographic camera switch until it covers
          the canvas. Anchoring still follows the 3D position. */}
      <Html center zIndexRange={[30, 20]}>
        <span
          data-scene-label={text}
          style={{
            display: 'block',
            whiteSpace: 'nowrap',
            border: `1px solid ${color}`,
            borderRadius: 3,
            padding: '3px 6px',
            background: 'rgba(3, 10, 12, 0.92)',
            color,
            font: '700 10px/1.1 monospace',
            letterSpacing: '0.04em',
            boxShadow: '0 1px 5px rgba(0,0,0,.8)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      </Html>
    </group>
  );
}

export function AssetComparison({
  url,
  state,
  fallbackBounds,
  onBoundsMeasured,
  onRenderObserved,
  onAssetFailed,
}: {
  url: string;
  state: AssetAnchorLabState;
  fallbackBounds: VisibleBounds;
  onBoundsMeasured: (bounds: VisibleBounds) => void;
  onRenderObserved: (observation: RenderObservation) => void;
  onAssetFailed: (status: 'error' | 'unmeasured') => void;
}) {
  const { scene } = useGLTF(url);
  const raw = useMemo(() => cloneSkeleton(scene), [scene]);
  const calibrated = useMemo(() => cloneSkeleton(scene), [scene]);
  const measured = useMemo(() => measureVisibleBounds(raw), [raw]);
  useRawGhostMaterials(raw);

  useEffect(() => {
    if (!isUsableMeasurement(measured)) {
      onAssetFailed('unmeasured');
      return;
    }
    // This effect runs only after the real raw/calibrated primitives and the
    // current camera/facing branch have committed. Reducer navigation never
    // manufactures an observation.
    onBoundsMeasured(measured);
    onRenderObserved({
      caseId: state.caseId,
      variant: state.variant,
      candidate: state.candidate,
      cameraMode: state.cameraMode,
      visibilityMode: state.visibilityMode,
      facing: state.facing,
      bounds: measured,
    });
  }, [
    measured,
    onAssetFailed,
    onBoundsMeasured,
    onRenderObserved,
    state.cameraMode,
    state.candidate,
    state.caseId,
    state.facing,
    state.variant,
    state.visibilityMode,
  ]);

  const bounds = isUsableMeasurement(measured) ? measured : fallbackBounds;
  const offset = resolvedCalibrationOffset(state, bounds);
  const rotationY = facingToRotationY(state.facing);
  const showRaw = state.visibilityMode !== 'calibrated';
  const showCalibrated = state.visibilityMode !== 'raw';
  const rawLabelPosition: Vec3Tuple = [
    bounds.center[0],
    bounds.max[1] + 0.18,
    bounds.center[2],
  ];
  const calibratedLabelPosition: Vec3Tuple = [
    bounds.center[0] + offset[0],
    bounds.max[1] + offset[1] + 0.18,
    bounds.center[2] + offset[2],
  ];
  const calibratedLabel =
    state.caseId === 'fighter-pair' && state.variant === 'downed'
      ? 'DIAGNOSTIC · CENTER ONLY'
      : 'CALIBRATED';

  return (
    <group name="anchor-lab-asset-comparison" rotation={[0, rotationY, 0]}>
      {showRaw && (
        <>
          <group name="anchor-lab-raw-asset" scale={SYNTY_SCALE}>
            <primitive object={raw} />
          </group>
          <BoundsBox
            name="anchor-lab-raw-bounds"
            bounds={bounds}
            offset={[0, 0, 0]}
            color="#ff3fa4"
          />
          <SceneLabel
            name="anchor-lab-label-raw"
            text="RAW INPUT"
            position={rawLabelPosition}
            tone="raw"
          />
        </>
      )}
      {showCalibrated && (
        <>
          <group
            name="anchor-lab-calibrated-asset"
            position={offset}
            scale={SYNTY_SCALE}
          >
            <primitive object={calibrated} />
          </group>
          <BoundsBox
            name="anchor-lab-calibrated-bounds"
            bounds={bounds}
            offset={offset}
            color="#39e7ff"
          />
          <SceneLabel
            name="anchor-lab-label-calibrated"
            text={calibratedLabel}
            position={calibratedLabelPosition}
            tone="calibrated"
          />
        </>
      )}

      {/* The dot is centered at exact model-local zero. The vertical stem
          begins at zero and ends at the separately named elevated glyph. */}
      <mesh
        name="anchor-lab-exact-raw-origin"
        position={[0, 0, 0]}
        renderOrder={20}
      >
        <sphereGeometry args={[0.06, 16, 12]} />
        <meshBasicMaterial
          color="#ffdf54"
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        name="anchor-lab-origin-visibility-leader"
        position={[0, 0.17, 0]}
        renderOrder={19}
      >
        <cylinderGeometry args={[0.012, 0.012, 0.34, 8]} />
        <meshBasicMaterial
          color="#ffdf54"
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        name="anchor-lab-elevated-origin-glyph"
        position={[0, 0.34, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={20}
      >
        <torusGeometry args={[0.09, 0.018, 8, 20]} />
        <meshBasicMaterial
          color="#ffdf54"
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <arrowHelper
        name="anchor-lab-local-forward-probe"
        args={[
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0.025, 0),
          0.85,
          '#ffdf54',
          0.22,
          0.12,
        ]}
      />
    </group>
  );
}

function TacticalCamera() {
  const ref = useRef<THREE.OrthographicCamera | null>(null);
  const position = sphericalCameraPosition(
    { x: 0, y: 0, z: 0 },
    POLAR_ANGLE,
    INITIAL_AZIMUTH,
    INITIAL_DISTANCE
  );
  useEffect(() => {
    ref.current?.lookAt(0, 0.65, 0);
    ref.current?.updateProjectionMatrix();
  }, []);
  return (
    <OrthographicCamera
      ref={ref}
      name="anchor-lab-shared-tactical-camera"
      makeDefault
      position={[position.x, position.y, position.z]}
      zoom={ORTHO_ZOOM}
      near={ORTHO_NEAR}
      far={ORTHO_FAR}
    />
  );
}

export function AssetAnchorLabScene({
  url,
  state,
  fallbackBounds,
  onBoundsMeasured,
  onRenderObserved,
  onAssetFailed,
}: {
  url: string;
  state: AssetAnchorLabState;
  fallbackBounds: VisibleBounds;
  onBoundsMeasured: (bounds: VisibleBounds) => void;
  onRenderObserved: (observation: RenderObservation) => void;
  onAssetFailed: (status: 'error' | 'unmeasured') => void;
}) {
  const highlightGeometry = useMemo(makeHexGeometry, []);
  const rotationY = facingToRotationY(state.facing);
  return (
    <>
      {state.cameraMode === 'play' ? (
        <TacticalCamera />
      ) : (
        <>
          <PerspectiveCamera
            name="anchor-lab-orbit-camera"
            makeDefault
            position={[4.8, 4.2, 5.4]}
            fov={42}
          />
          <OrbitControls makeDefault target={[0, 0.75, 0]} />
        </>
      )}
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      <Suspense fallback={null}>
        <group name="anchor-lab-real-synty-floor">
          <SyntyHexFloor floorTiles={FLOOR_TILES} hexSize={HEX_SIZE} />
        </group>
        <mesh
          name="anchor-lab-owning-hex-highlight"
          geometry={highlightGeometry}
          position={[0, 0.215, 0]}
        >
          <meshBasicMaterial
            color="#1fd4c4"
            transparent
            opacity={0.28}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <SceneLabel
          name="anchor-lab-label-owning-hex"
          text="OWNING HEX CENTER · q0,r0,s0"
          position={[0, 0.12, 0]}
          tone="reference"
        />
        <group name="anchor-lab-real-synty-wall" rotation={[0, rotationY, 0]}>
          <GlbInstance
            file={PLAIN_WALL.file}
            position={{ x: -0.5, z: WALL_Z }}
            rotationY={0}
            scale={wallVariantScale(PLAIN_WALL, WALL_HEIGHT, SYNTY_SCALE)}
          />
          <mesh
            name="anchor-lab-visible-wall-face"
            position={[0, WALL_HEIGHT / 2, LAB_WALL_VISIBLE_ROOM_FACE_Z]}
          >
            <boxGeometry args={[1.08, WALL_HEIGHT, 0.015]} />
            <meshBasicMaterial
              color="#ff9e45"
              wireframe
              transparent
              opacity={0.95}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            name="anchor-lab-nominal-wall-plane"
            position={[0, WALL_HEIGHT / 2, LAB_WALL_NOMINAL_Z]}
          >
            <boxGeometry args={[1.02, WALL_HEIGHT * 0.92, 0.01]} />
            <meshBasicMaterial
              color="#ffe36e"
              wireframe
              transparent
              opacity={0.5}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
          <SceneLabel
            name="anchor-lab-label-wall-target"
            text="VISIBLE WALL FACE · Z -0.654m"
            position={[-0.78, WALL_HEIGHT + 0.22, LAB_WALL_VISIBLE_ROOM_FACE_Z]}
            tone="reference"
          />
          <SceneLabel
            name="anchor-lab-label-wall-nominal"
            text="NOMINAL EDGE PLANE · Z -0.866m"
            position={[0.78, WALL_HEIGHT - 0.05, LAB_WALL_NOMINAL_Z]}
            tone="reference"
          />
        </group>
        <AssetComparison
          url={url}
          state={state}
          fallbackBounds={fallbackBounds}
          onBoundsMeasured={onBoundsMeasured}
          onRenderObserved={onRenderObserved}
          onAssetFailed={onAssetFailed}
        />
      </Suspense>
      <gridHelper
        args={[8, 16, '#354d4b', '#1d2928']}
        position={[0, 0.02, 0]}
      />
    </>
  );
}

export interface AssetAnchorLabPreviewProps {
  url: string;
  state: AssetAnchorLabState;
  fallbackBounds: VisibleBounds;
  onBoundsMeasured: (bounds: VisibleBounds) => void;
  onRenderObserved: (observation: RenderObservation) => void;
  onAssetFailed: (status: 'error' | 'unmeasured') => void;
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Visual-only lab canvas. It resolves/loads actual synced GLBs but never writes
 * a manifest, changes a game renderer, or persists an adjustment.
 */
export function AssetAnchorLabPreview(props: AssetAnchorLabPreviewProps) {
  return (
    <div
      data-testid="asset-anchor-canvas"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 500,
        background: '#081012',
      }}
    >
      <PreviewErrorBoundary onError={() => props.onAssetFailed('error')}>
        <Canvas frameloop="demand" dpr={[1, 1.5]}>
          <AssetAnchorLabScene {...props} />
        </Canvas>
      </PreviewErrorBoundary>
      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          padding: '6px 8px',
          borderRadius: 4,
          background: 'rgba(2,8,10,.78)',
          color: '#d7f8f2',
          fontSize: 11,
          pointerEvents: 'none',
        }}
      >
        showing {props.state.visibilityMode.toUpperCase()} · anchored labels
        identify RAW INPUT / CALIBRATED / DIAGNOSTIC · gold dot = exact raw
        origin (0,0,0) · gold stem/ring = elevated visibility glyph · gold arrow
        = local +Z probe
      </div>
    </div>
  );
}
