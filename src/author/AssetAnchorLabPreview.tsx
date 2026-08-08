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
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  useGLTF,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  resolvedCalibrationOffset,
  type AssetAnchorLabState,
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
const WALL_Z = -Math.sqrt(3) / 2;
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
}: {
  bounds: VisibleBounds;
  offset: Vec3Tuple;
  color: string;
}) {
  const position = bounds.center.map(
    (value, index) => value + offset[index]!
  ) as Vec3Tuple;
  return (
    <mesh position={position} renderOrder={10}>
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

function AssetComparison({
  url,
  state,
  fallbackBounds,
  onBoundsMeasured,
}: {
  url: string;
  state: AssetAnchorLabState;
  fallbackBounds: VisibleBounds;
  onBoundsMeasured: (bounds: VisibleBounds) => void;
}) {
  const { scene } = useGLTF(url);
  const raw = useMemo(() => cloneSkeleton(scene), [scene]);
  const calibrated = useMemo(() => cloneSkeleton(scene), [scene]);
  const measured = useMemo(() => measureVisibleBounds(raw), [raw]);
  useRawGhostMaterials(raw);

  useEffect(() => onBoundsMeasured(measured), [measured, onBoundsMeasured]);

  const bounds = measured.size.every(Number.isFinite)
    ? measured
    : fallbackBounds;
  const offset = resolvedCalibrationOffset(state, bounds);
  const rotationY = facingToRotationY(state.facing);

  return (
    <group rotation={[0, rotationY, 0]}>
      <group scale={SYNTY_SCALE}>
        <primitive object={raw} />
      </group>
      <group position={offset} scale={SYNTY_SCALE}>
        <primitive object={calibrated} />
      </group>
      <BoundsBox bounds={bounds} offset={[0, 0, 0]} color="#ff3fa4" />
      <BoundsBox bounds={bounds} offset={offset} color="#39e7ff" />
      <mesh position={[0, 0.28, 0]} renderOrder={20}>
        <sphereGeometry args={[0.085, 16, 12]} />
        <meshBasicMaterial
          color="#ffdf54"
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <arrowHelper
        args={[
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0.34, 0),
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
      makeDefault
      position={[position.x, position.y, position.z]}
      zoom={ORTHO_ZOOM}
      near={ORTHO_NEAR}
      far={ORTHO_FAR}
    />
  );
}

function LabScene({
  url,
  state,
  fallbackBounds,
  onBoundsMeasured,
}: {
  url: string;
  state: AssetAnchorLabState;
  fallbackBounds: VisibleBounds;
  onBoundsMeasured: (bounds: VisibleBounds) => void;
}) {
  const highlightGeometry = useMemo(makeHexGeometry, []);
  const rotationY = facingToRotationY(state.facing);
  return (
    <>
      {state.cameraMode === 'play' ? (
        <TacticalCamera />
      ) : (
        <>
          <PerspectiveCamera makeDefault position={[4.8, 4.2, 5.4]} fov={42} />
          <OrbitControls makeDefault target={[0, 0.75, 0]} />
        </>
      )}
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      <Suspense fallback={null}>
        <SyntyHexFloor floorTiles={FLOOR_TILES} hexSize={HEX_SIZE} />
        <mesh geometry={highlightGeometry} position={[0, 0.215, 0]}>
          <meshBasicMaterial
            color="#1fd4c4"
            transparent
            opacity={0.28}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <group rotation={[0, rotationY, 0]}>
          <GlbInstance
            file={PLAIN_WALL.file}
            position={{ x: -0.5, z: WALL_Z }}
            rotationY={0}
            scale={wallVariantScale(PLAIN_WALL, WALL_HEIGHT, SYNTY_SCALE)}
          />
          <mesh position={[0, WALL_HEIGHT / 2, WALL_Z - 0.035]}>
            <boxGeometry args={[1.08, WALL_HEIGHT, 0.04]} />
            <meshBasicMaterial
              color="#ff9e45"
              wireframe
              transparent
              opacity={0.95}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        </group>
        <AssetComparison
          url={url}
          state={state}
          fallbackBounds={fallbackBounds}
          onBoundsMeasured={onBoundsMeasured}
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
      <Canvas frameloop="demand" dpr={[1, 1.5]}>
        <LabScene {...props} />
      </Canvas>
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
        cyan = calibrated bounds · magenta = raw bounds/model · gold = raw
        origin + local +Z probe
      </div>
    </div>
  );
}
