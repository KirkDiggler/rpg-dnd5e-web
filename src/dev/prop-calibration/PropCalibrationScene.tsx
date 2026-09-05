import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import { resolveClassCharacterModelUrl } from '@/components/hex-grid/classCharacterModels';
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  centeredFloorOffset,
  type SimpleBounds,
  type Vec3,
} from './previewTransform';

const FLOOR_TILES = new Map<string, AbsoluteFloorTile>([
  ['0,0,0', { x: 0, y: 0, z: 0, roomId: 'prop-calibration' }],
  ['1,-1,0', { x: 1, y: -1, z: 0, roomId: 'prop-calibration' }],
  ['-1,1,0', { x: -1, y: 1, z: 0, roomId: 'prop-calibration' }],
]);
const FIGHTER_URL = resolveClassCharacterModelUrl('fighter', false);

function boundsFor(object: THREE.Object3D): SimpleBounds {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  return {
    min: box.min.toArray() as Vec3,
    max: box.max.toArray() as Vec3,
  };
}

function useGhostMaterials(object: THREE.Object3D) {
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
        clone.opacity = 0.2;
        clone.depthWrite = false;
        if ('color' in clone && clone.color instanceof THREE.Color) {
          clone.color.lerp(new THREE.Color('#ff4ca8'), 0.65);
        }
        created.push(clone);
        return clone;
      });
      child.material = Array.isArray(child.material) ? ghosted : ghosted[0]!;
    });
    return () => created.forEach((material) => material.dispose());
  }, [object]);
}

function PreparedProp({
  url,
  scale,
  yawDegrees,
  fineOffsetMeters,
  showRaw,
}: {
  url: string;
  scale: number;
  yawDegrees: number;
  fineOffsetMeters: Vec3;
  showRaw: boolean;
}) {
  const { scene } = useGLTF(url);
  const calibrated = useMemo(() => scene.clone(true), [scene]);
  const raw = useMemo(() => scene.clone(true), [scene]);
  useGhostMaterials(raw);
  const bounds = useMemo(() => boundsFor(scene), [scene]);
  const totalScale = SYNTY_SCALE * scale;
  const offset = centeredFloorOffset(bounds, totalScale, fineOffsetMeters);

  return (
    <group rotation={[0, THREE.MathUtils.degToRad(yawDegrees), 0]}>
      {showRaw && (
        <group position={[0, DUNGEON_SURFACE_Y, 0]} scale={SYNTY_SCALE}>
          <primitive object={raw} />
        </group>
      )}
      <group
        position={[offset[0], offset[1] + DUNGEON_SURFACE_Y, offset[2]]}
        scale={totalScale}
      >
        <primitive object={calibrated} />
      </group>
    </group>
  );
}

function CalibrationWorld({
  url,
  scale,
  yawDegrees,
  fineOffsetMeters,
  cameraMode,
  showRaw,
}: PropCalibrationSceneProps & { url: string }) {
  const cameraPosition: Vec3 =
    cameraMode === 'play' ? [5.2, 5.6, 5.2] : [4, 3.4, 4];
  return (
    <>
      <color attach="background" args={['#101719']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 7, 5]} intensity={2.2} castShadow />
      <OrthographicCamera
        makeDefault
        position={cameraPosition}
        zoom={cameraMode === 'play' ? 115 : 90}
        near={0.01}
        far={100}
      />
      <OrbitControls makeDefault target={[0, 0.75, 0]} enableDamping={false} />
      <SyntyHexFloor
        floorTiles={FLOOR_TILES}
        hexSize={HEX_SIZE}
        spaceTheme="crypt"
      />
      <Suspense fallback={null}>
        <PreparedProp
          url={url}
          scale={scale}
          yawDegrees={yawDegrees}
          fineOffsetMeters={fineOffsetMeters}
          showRaw={showRaw}
        />
        {FIGHTER_URL && (
          <group position={[1.65, DUNGEON_SURFACE_Y, 0]}>
            <ClassCharacterModel url={FIGHTER_URL} facingRotation={Math.PI} />
          </group>
        )}
      </Suspense>
      <gridHelper
        args={[8, 16, '#46625f', '#263b39']}
        position={[0, DUNGEON_SURFACE_Y - 0.01, 0]}
      />
    </>
  );
}

export interface PropCalibrationSceneProps {
  url?: string;
  scale: number;
  yawDegrees: number;
  fineOffsetMeters: Vec3;
  cameraMode: 'orbit' | 'play';
  showRaw: boolean;
}

export function PropCalibrationScene(props: PropCalibrationSceneProps) {
  if (!props.url) {
    return <div role="alert">This imported row has no prepared local GLB.</div>;
  }
  return (
    <Canvas shadows dpr={[1, 1.5]}>
      <CalibrationWorld {...props} url={props.url} />
    </Canvas>
  );
}
