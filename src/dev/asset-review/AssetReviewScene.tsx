import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import { resolveClassCharacterModelUrl } from '@/components/hex-grid/classCharacterModels';
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { SyntyHexFloor } from '@/components/hex-grid/SyntyHexFloor';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  contextLossDiagnostic,
  type ContextLossDiagnostic,
} from '../prop-calibration/contextDiagnostic';
import {
  centeredFloorOffset,
  type SimpleBounds,
  type Vec3,
} from '../prop-calibration/previewTransform';
import { SceneErrorBoundary } from '../prop-calibration/SceneErrorBoundary';
import { disposeObjectResources } from './disposeObjectResources';
import type { AssetReviewLoadStatus } from './model';

const FLOOR_TILES = new Map<string, AbsoluteFloorTile>([
  ['0,0,0', { x: 0, y: 0, z: 0, roomId: 'asset-review' }],
  ['1,-1,0', { x: 1, y: -1, z: 0, roomId: 'asset-review' }],
  ['-1,1,0', { x: -1, y: 1, z: 0, roomId: 'asset-review' }],
]);
const FIGHTER_URL = resolveClassCharacterModelUrl('fighter', false);

export type { AssetReviewLoadStatus } from './model';

export interface AssetReviewSceneProps {
  url?: string;
  scale: number;
  yawDegrees: number;
  fineOffsetMeters: Vec3;
  cameraMode: 'orbit' | 'play';
  showRaw: boolean;
  onLoadStateChange: (
    url: string,
    status: AssetReviewLoadStatus,
    detail?: string
  ) => void;
}

interface LoadedCandidateState {
  url: string;
  root: THREE.Object3D;
}

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
    const created = new Set<THREE.Material>();
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
        created.add(clone);
        return clone;
      });
      child.material = Array.isArray(child.material) ? ghosted : ghosted[0]!;
    });
    return () => created.forEach((material) => material.dispose());
  }, [object]);
}

function CandidatePreview({
  root,
  scale,
  yawDegrees,
  fineOffsetMeters,
  showRaw,
}: Pick<
  AssetReviewSceneProps,
  'scale' | 'yawDegrees' | 'fineOffsetMeters' | 'showRaw'
> & { root: THREE.Object3D }) {
  const raw = useMemo(() => root.clone(true), [root]);
  useGhostMaterials(raw);
  const bounds = useMemo(() => boundsFor(root), [root]);
  const totalScale = SYNTY_SCALE * scale;
  const offset = centeredFloorOffset(bounds, totalScale, fineOffsetMeters);

  return (
    <group rotation={[0, THREE.MathUtils.degToRad(yawDegrees), 0]}>
      {showRaw && (
        <group position={[0, DUNGEON_SURFACE_Y, 0]} scale={SYNTY_SCALE}>
          <primitive object={raw} dispose={null} />
        </group>
      )}
      <group
        position={[offset[0], offset[1] + DUNGEON_SURFACE_Y, offset[2]]}
        scale={totalScale}
      >
        <primitive object={root} dispose={null} />
      </group>
    </group>
  );
}

function ReviewWorld({
  candidate,
  scale,
  yawDegrees,
  fineOffsetMeters,
  cameraMode,
  showRaw,
}: Omit<AssetReviewSceneProps, 'url' | 'onLoadStateChange'> & {
  candidate?: THREE.Object3D;
}) {
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
      {candidate && (
        <CandidatePreview
          root={candidate}
          scale={scale}
          yawDegrees={yawDegrees}
          fineOffsetMeters={fineOffsetMeters}
          showRaw={showRaw}
        />
      )}
      {FIGHTER_URL && (
        <group position={[1.65, DUNGEON_SURFACE_Y, 0]}>
          <ClassCharacterModel url={FIGHTER_URL} facingRotation={Math.PI} />
        </group>
      )}
      <gridHelper
        args={[8, 16, '#46625f', '#263b39']}
        position={[0, DUNGEON_SURFACE_Y - 0.01, 0]}
      />
    </>
  );
}

function ContextLossReporter({
  onLost,
  onRestored,
}: {
  onLost: (diagnostic: ContextLossDiagnostic) => void;
  onRestored: () => void;
}) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      const statusMessage =
        event instanceof WebGLContextEvent ? event.statusMessage : '';
      onLost(contextLossDiagnostic(statusMessage, gl.info));
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl, onLost, onRestored]);
  return null;
}

/** Loads exactly one uncached candidate and owns only that candidate's data. */
export function AssetReviewScene({
  url,
  onLoadStateChange,
  ...worldProps
}: AssetReviewSceneProps) {
  const [loaded, setLoaded] = useState<LoadedCandidateState>();
  const [loadError, setLoadError] = useState('');
  const [diagnostic, setDiagnostic] = useState<ContextLossDiagnostic>();

  useEffect(() => {
    if (!url) {
      setLoaded(undefined);
      setLoadError('This imported row has no prepared local GLB.');
      return;
    }

    let current = true;
    let loadedForEffect: THREE.Object3D | undefined;
    let disposed = false;
    const disposeLoaded = () => {
      if (disposed || !loadedForEffect) return;
      disposed = true;
      disposeObjectResources(loadedForEffect);
      loadedForEffect.removeFromParent();
    };

    setLoaded(undefined);
    setLoadError('');
    onLoadStateChange(url, 'loading');
    new GLTFLoader().load(
      url,
      (gltf) => {
        loadedForEffect = gltf.scene;
        if (!current) {
          disposeLoaded();
          return;
        }
        setLoaded({ url, root: gltf.scene });
        onLoadStateChange(url, 'success');
      },
      undefined,
      (error) => {
        if (!current) return;
        const detail = error instanceof Error ? error.message : String(error);
        setLoadError(`Candidate failed to load: ${detail}`);
        onLoadStateChange(url, 'error', detail);
      }
    );

    return () => {
      current = false;
      disposeLoaded();
    };
  }, [onLoadStateChange, url]);

  const candidate = loaded && loaded.url === url ? loaded.root : undefined;

  return (
    <div className="asset-review-scene">
      <SceneErrorBoundary>
        <Canvas frameloop="demand" shadows dpr={[1, 1.5]}>
          <ContextLossReporter
            onLost={setDiagnostic}
            onRestored={() => setDiagnostic(undefined)}
          />
          <ReviewWorld candidate={candidate} {...worldProps} />
        </Canvas>
      </SceneErrorBoundary>
      {!candidate && !loadError && (
        <div className="asset-review-loading">Loading candidate…</div>
      )}
      {loadError && (
        <div className="asset-review-scene-error" role="alert">
          {loadError}
        </div>
      )}
      {diagnostic && (
        <pre className="asset-review-scene-error" role="alert">
          {JSON.stringify(diagnostic, null, 2)}
        </pre>
      )}
    </div>
  );
}
