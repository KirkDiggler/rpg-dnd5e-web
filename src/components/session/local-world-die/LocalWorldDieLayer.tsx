import type { Scene3D } from '@/components/session/atlasToScene3D';
import type { DiceMotionPose } from '@/components/ui/dice/diceMotionSolver';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
  type DiceRuntimePresetSnapshot,
} from '@/components/ui/dice/diceRuntimeProvider';
import { resolveRuntimeDiceSettlement } from '@/components/ui/dice/diceSettlementResolver';
import { RuntimeDiceMesh } from '@/components/ui/dice/RuntimeDiceMesh';
import type { TrayPlaneProjection } from '@/components/ui/dice/trayPlaneProjection';
import { TrayPlaneProjectionBridge } from '@/components/ui/dice/TrayPlaneProjectionBridge';
import type { VisualThrowProfileV1 } from '@/components/ui/dice/visualThrowProfile';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useFrame } from '@react-three/fiber';
import {
  ConvexHullCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useAfterPhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { IcosahedronGeometry, Quaternion } from 'three';
import {
  buildLocalWorldDieColliders,
  type LocalWorldDieCollider,
} from './localWorldDieColliders';
import { isLocalWorldDieFloorPoint } from './localWorldDieFloor';
import { localWorldDieLaunch } from './localWorldDieMotion';
import type { LocalWorldDiePlanTerminal } from './localWorldDiePreSimulation';

export interface LocalWorldDieHeldState {
  readonly position: readonly [number, number];
  readonly height: number;
}

export type LocalWorldDieCommand =
  | Readonly<{ id: number; kind: 'reset' }>
  | Readonly<{ id: number; kind: 'held'; held: LocalWorldDieHeldState }>
  | Readonly<{
      id: number;
      kind: 'released';
      held: LocalWorldDieHeldState;
      profile: VisualThrowProfileV1;
      plannedTerminal?: LocalWorldDiePlanTerminal;
    }>;

export interface LocalWorldDieLayerProps {
  readonly command: LocalWorldDieCommand;
  readonly scene: Scene3D;
  readonly openDoorIds: ReadonlySet<string>;
  readonly authoritativeFace: number;
  readonly projectionRef: MutableRefObject<TrayPlaneProjection | undefined>;
  readonly onReadyChange: (ready: boolean) => void;
  readonly onTerminal: (kind: 'settled' | 'off-table' | 'failure') => void;
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
  bodyColor: '#365b91',
  numeralColor: '#fffbe8',
  roughness: 0.58,
  metalness: 0.08,
  bodyEmissive: '#10233f',
  numeralEmissive: '#fff4cf',
  emissiveIntensity: 0.32,
});
const identityPose = () => STATIC_POSE;
export const LOCAL_WORLD_DIE_RESULT_HOLD_MS = 750;

function runtimeSource(snapshot: DiceRuntimePresetSnapshot) {
  if (
    snapshot.status !== 'ready' ||
    !snapshot.preset ||
    !snapshot.scene ||
    !snapshot.binding
  )
    return undefined;
  return {
    preset: snapshot.preset,
    scene: snapshot.scene,
    binding: snapshot.binding,
  };
}

function StaticCollider({
  collider,
}: {
  readonly collider: LocalWorldDieCollider;
}) {
  return (
    <CuboidCollider
      args={[...collider.halfExtents]}
      position={[...collider.position]}
      rotation={[0, collider.rotationY, 0]}
      friction={collider.kind === 'floor' ? 0.9 : 0.72}
      restitution={collider.kind === 'floor' ? 0.25 : 0.55}
    />
  );
}

function DieBody({
  command,
  source,
  target,
  scene,
  onBodyReady,
  onMeshReady,
  onTerminal,
}: {
  readonly command: LocalWorldDieCommand;
  readonly source: NonNullable<ReturnType<typeof runtimeSource>>;
  readonly target?: readonly [number, number, number, number];
  readonly scene: Scene3D;
  readonly onBodyReady: () => void;
  readonly onMeshReady: () => void;
  readonly onTerminal: (kind: 'settled' | 'off-table' | 'failure') => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const { rapier } = useRapier();
  const launched = useRef(false);
  const launchAge = useRef(0);
  const physicsStep = useRef(0);
  const settledTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const assist = useRef<
    | {
        from: Quaternion;
        target: Quaternion;
        progress: number;
      }
    | undefined
  >(undefined);
  const [visible, setVisible] = useState(false);
  const hull = useMemo(() => {
    const geometry = new IcosahedronGeometry(DIE_RADIUS, 0);
    const vertices = new Float32Array(
      geometry.getAttribute('position').array as ArrayLike<number>
    );
    geometry.dispose();
    return vertices;
  }, []);

  useEffect(() => {
    if (bodyRef.current) onBodyReady();
    return () => {
      if (settledTimer.current !== undefined) {
        clearTimeout(settledTimer.current);
        settledTimer.current = undefined;
      }
    };
  }, [onBodyReady]);

  const beginAssist = useCallback(() => {
    const body = bodyRef.current;
    if (!body || !target || !launched.current || assist.current) return;
    const rotation = body.rotation();
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    assist.current = {
      from: new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      target: new Quaternion(...target),
      progress: 0,
    };
  }, [rapier.RigidBodyType.KinematicPositionBased, target]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    assist.current = undefined;
    launchAge.current = 0;
    physicsStep.current = 0;
    if (settledTimer.current !== undefined) {
      clearTimeout(settledTimer.current);
      settledTimer.current = undefined;
    }
    if (command.kind === 'reset') {
      launched.current = false;
      setVisible(false);
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setTranslation(
        { x: RESET_POSITION[0], y: RESET_POSITION[1], z: RESET_POSITION[2] },
        true
      );
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    setVisible(true);
    const { position, height } = command.held;
    if (command.kind === 'held') {
      launched.current = false;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setNextKinematicTranslation({
        x: position[0],
        y: height,
        z: position[1],
      });
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const launch = localWorldDieLaunch(command.profile);
    launched.current = true;
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation({ x: position[0], y: height, z: position[1] }, true);
    body.setLinvel(launch.linearVelocity, true);
    body.setAngvel(launch.angularVelocity, true);
    body.wakeUp();
  }, [command, rapier.RigidBodyType]);

  useAfterPhysicsStep(() => {
    const body = bodyRef.current;
    if (!body || !launched.current || assist.current) return;
    physicsStep.current += 1;
    const plannedTerminal =
      command.kind === 'released' ? command.plannedTerminal : undefined;
    if (plannedTerminal && physicsStep.current >= plannedTerminal.step) {
      if (plannedTerminal.kind === 'off-table') {
        launched.current = false;
        body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        setVisible(false);
        onTerminal('off-table');
      } else {
        beginAssist();
      }
      return;
    }
    if (plannedTerminal) return;
    const position = body.translation();
    const offTable =
      position.y < DUNGEON_SURFACE_Y - 0.5 ||
      (position.y < DUNGEON_SURFACE_Y + 0.05 &&
        !isLocalWorldDieFloorPoint(scene, position.x, position.z));
    if (offTable) {
      launched.current = false;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      setVisible(false);
      onTerminal('off-table');
      return;
    }
    const linear = body.linvel();
    const angular = body.angvel();
    if (
      Math.hypot(linear.x, linear.y, linear.z) < 0.28 &&
      Math.hypot(angular.x, angular.y, angular.z) < 1.1
    ) {
      beginAssist();
    }
  });

  useFrame((_, delta) => {
    if (launched.current && !assist.current) {
      launchAge.current += delta;
      if (launchAge.current >= 3) beginAssist();
    }
    const current = assist.current;
    const body = bodyRef.current;
    if (!current || !body) return;
    current.progress = Math.min(1, current.progress + delta / 0.32);
    const eased = 1 - Math.pow(1 - current.progress, 3);
    body.setNextKinematicRotation(
      current.from.clone().slerp(current.target, eased)
    );
    if (current.progress >= 1) {
      assist.current = undefined;
      launched.current = false;
      body.setBodyType(rapier.RigidBodyType.Fixed, true);
      settledTimer.current = setTimeout(() => {
        settledTimer.current = undefined;
        onTerminal('settled');
      }, LOCAL_WORLD_DIE_RESULT_HOLD_MS);
    }
  });

  return (
    <group visible={visible}>
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
          onReady={onMeshReady}
          onFailure={() => onTerminal('failure')}
          selectedGroupName="local-world-die-d20"
          shadowName="local-world-die-shadow"
        />
      </RigidBody>
    </group>
  );
}

export function LocalWorldDieLayer({
  command,
  scene,
  openDoorIds,
  authoritativeFace,
  projectionRef,
  onReadyChange,
  onTerminal,
}: LocalWorldDieLayerProps) {
  const [snapshot, setSnapshot] = useState(() =>
    getDiceRuntimePresetSnapshot(PRESET_ID)
  );
  const [projectionReady, setProjectionReady] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [bodyReady, setBodyReady] = useState(false);
  const [meshReady, setMeshReady] = useState(false);
  const source = useMemo(() => runtimeSource(snapshot), [snapshot]);
  const colliders = useMemo(
    () => buildLocalWorldDieColliders(scene, openDoorIds),
    [openDoorIds, scene]
  );
  const target = useMemo(
    () =>
      source
        ? resolveRuntimeDiceSettlement({
            preset: source.preset,
            expectedPresetId: PRESET_ID,
            authoritativeResult: authoritativeFace,
          })?.target
        : undefined,
    [authoritativeFace, source]
  );

  useEffect(() => {
    let active = true;
    const refresh = () =>
      active && setSnapshot(getDiceRuntimePresetSnapshot(PRESET_ID));
    const current = getDiceRuntimePresetSnapshot(PRESET_ID);
    setSnapshot(current);
    if (current.status === 'idle' || current.status === 'loading') {
      void preloadDiceRuntimePreset(PRESET_ID).then(refresh, refresh);
    }
    return () => {
      active = false;
    };
  }, []);

  const ready =
    Boolean(source && target) &&
    projectionReady &&
    worldReady &&
    bodyReady &&
    meshReady;
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
          <RigidBody type="fixed" colliders={false}>
            {colliders.map((collider) => (
              <StaticCollider
                key={`${collider.kind}:${collider.id}`}
                collider={collider}
              />
            ))}
          </RigidBody>
          <WorldReady onReady={() => setWorldReady(true)} />
          <DieBody
            command={command}
            source={source}
            target={target}
            scene={scene}
            onBodyReady={() => setBodyReady(true)}
            onMeshReady={() => setMeshReady(true)}
            onTerminal={onTerminal}
          />
        </Physics>
      )}
    </>
  );
}

function WorldReady({ onReady }: { readonly onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}
