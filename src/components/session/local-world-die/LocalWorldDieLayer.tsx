import type { DiceMotionPose } from '@/components/ui/dice/diceMotionSolver';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
  type DiceRuntimePresetSnapshot,
} from '@/components/ui/dice/diceRuntimeProvider';
import { RuntimeDiceMesh } from '@/components/ui/dice/RuntimeDiceMesh';
import type { TrayPlaneProjection } from '@/components/ui/dice/trayPlaneProjection';
import { TrayPlaneProjectionBridge } from '@/components/ui/dice/TrayPlaneProjectionBridge';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import {
  ConvexHullCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { IcosahedronGeometry } from 'three';

export interface LocalWorldDieHeldState {
  readonly position: readonly [number, number];
  readonly height: number;
}

export interface LocalWorldDieLayerProps {
  readonly held?: LocalWorldDieHeldState;
  readonly projectionRef: MutableRefObject<TrayPlaneProjection | undefined>;
  readonly onReadyChange: (ready: boolean) => void;
}

const PRESET_ID = 'dice.original.carved.d20';
const DIE_RADIUS = 0.275;
const RESET_POSITION = Object.freeze([0, DUNGEON_SURFACE_Y + 0.75, 0] as const);
const STATIC_POSE: DiceMotionPose = Object.freeze({
  quaternion: Object.freeze([0, 0, 0, 1] as const),
  translation: Object.freeze([0, 0, 0] as const),
  shadow: Object.freeze({
    translation: Object.freeze([0, 0, 0] as const),
    scale: 1,
    opacity: 0,
  }),
  observeNow: false,
  exactTargetHeld: false,
  failed: false,
});
const TREATMENT = Object.freeze({
  bodyColor: '#1d3359',
  numeralColor: '#fff4cf',
  roughness: 0.68,
  metalness: 0.12,
});
const identityPose = () => STATIC_POSE;

function runtimeSource(snapshot: DiceRuntimePresetSnapshot) {
  if (
    snapshot.status !== 'ready' ||
    !snapshot.preset ||
    !snapshot.scene ||
    !snapshot.binding
  ) {
    return undefined;
  }
  return {
    preset: snapshot.preset,
    scene: snapshot.scene,
    binding: snapshot.binding,
  };
}

function WorldReady({ onReady }: { readonly onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export function LocalWorldDieLayer({
  held,
  projectionRef,
  onReadyChange,
}: LocalWorldDieLayerProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const [snapshot, setSnapshot] = useState(() =>
    getDiceRuntimePresetSnapshot(PRESET_ID)
  );
  const [projectionReady, setProjectionReady] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [meshReady, setMeshReady] = useState(false);
  const source = useMemo(() => runtimeSource(snapshot), [snapshot]);
  const hull = useMemo(() => {
    const geometry = new IcosahedronGeometry(DIE_RADIUS, 0);
    const vertices = new Float32Array(
      geometry.getAttribute('position').array as ArrayLike<number>
    );
    geometry.dispose();
    return vertices;
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) setSnapshot(getDiceRuntimePresetSnapshot(PRESET_ID));
    };
    const current = getDiceRuntimePresetSnapshot(PRESET_ID);
    setSnapshot(current);
    if (current.status === 'idle' || current.status === 'loading') {
      void preloadDiceRuntimePreset(PRESET_ID).then(refresh, refresh);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const [x, z] = held?.position ?? [RESET_POSITION[0], RESET_POSITION[2]];
    const y = held?.height ?? RESET_POSITION[1];
    body.setNextKinematicTranslation({ x, y, z });
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [held]);

  const ready = Boolean(source) && projectionReady && worldReady && meshReady;
  useEffect(() => {
    onReadyChange(ready);
    return () => onReadyChange(false);
  }, [onReadyChange, ready]);

  return (
    <>
      <TrayPlaneProjectionBridge
        origin={[0, DUNGEON_SURFACE_Y + 0.75, 0]}
        xAxis={[1, 0, 0]}
        yAxis={[0, 0, 1]}
        width={200}
        height={200}
        projectionRef={projectionRef}
        onProjection={(projection) => setProjectionReady(Boolean(projection))}
      />
      {source && (
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate>
          <WorldReady onReady={() => setWorldReady(true)} />
          <group visible={Boolean(held)}>
            <RigidBody
              ref={bodyRef}
              type="kinematicPosition"
              colliders={false}
              position={RESET_POSITION}
              restitution={0.48}
              friction={0.72}
              linearDamping={0.22}
              angularDamping={0.16}
              ccd
              canSleep
            >
              <ConvexHullCollider args={[hull]} />
              <RuntimeDiceMesh
                source={source}
                treatment={TREATMENT}
                initialPose={STATIC_POSE}
                getPose={identityPose}
                onReady={() => setMeshReady(true)}
                onFailure={() => setMeshReady(false)}
                selectedGroupName="local-world-die-d20"
                shadowName="local-world-die-shadow"
              />
            </RigidBody>
          </group>
        </Physics>
      )}
    </>
  );
}
