import { Canvas, useFrame } from '@react-three/fiber';
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
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { IcosahedronGeometry, Quaternion } from 'three';
import type { DiceMotionPose } from '../../components/ui/dice/diceMotionSolver';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
  type DiceRuntimePresetSnapshot,
} from '../../components/ui/dice/diceRuntimeProvider';
import { resolveRuntimeDiceSettlement } from '../../components/ui/dice/diceSettlementResolver';
import { RuntimeDiceMesh } from '../../components/ui/dice/RuntimeDiceMesh';
import type { TrayPlaneProjection } from '../../components/ui/dice/trayPlaneProjection';
import { TrayPlaneProjectionBridge } from '../../components/ui/dice/TrayPlaneProjectionBridge';
import { createVisualThrowProfile } from '../../components/ui/dice/visualThrowProfile';
import { physicsLaunchFromProfile } from './physicsTraySpikeMotion';

const PRESET_ID = 'dice.original.carved.d20';
const TRAY_WIDTH = 6;
const TRAY_DEPTH = 4;
const DIE_RADIUS = 0.275;
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

interface PointerSample {
  x: number;
  y: number;
  time: number;
}

export interface HoldCommand {
  id: number;
  type: 'hold';
  position: readonly [number, number];
  height: number;
}

export interface ReleaseCommand {
  id: number;
  type: 'release';
  position: readonly [number, number];
  height: number;
  profile: ReturnType<typeof createVisualThrowProfile>;
}

export interface ResetCommand {
  id: number;
  type: 'reset';
}

export type PhysicsCommand = HoldCommand | ReleaseCommand | ResetCommand;

function useVerifiedD20(result: number) {
  const [snapshot, setSnapshot] = useState<DiceRuntimePresetSnapshot>(() =>
    getDiceRuntimePresetSnapshot(PRESET_ID)
  );

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) setSnapshot(getDiceRuntimePresetSnapshot(PRESET_ID));
    };
    const initial = getDiceRuntimePresetSnapshot(PRESET_ID);
    setSnapshot(initial);
    if (initial.status === 'idle' || initial.status === 'loading')
      void preloadDiceRuntimePreset(PRESET_ID).then(refresh, refresh);
    return () => {
      active = false;
    };
  }, []);

  const source = useMemo(() => {
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
  }, [snapshot]);
  const target = useMemo(
    () =>
      source
        ? resolveRuntimeDiceSettlement({
            preset: source.preset,
            expectedPresetId: PRESET_ID,
            authoritativeResult: result,
          })?.target
        : undefined,
    [result, source]
  );
  return { source, target, failed: snapshot.status === 'failed' };
}

export function PhysicsDieBody({
  command,
  result,
  assist,
  resetPosition = [0, 0.7, 0],
  isOutOfBounds,
  onOutOfBounds,
  onStatus,
}: {
  command: PhysicsCommand;
  result: number;
  assist: boolean;
  resetPosition?: readonly [number, number, number];
  isOutOfBounds?: (
    position: Readonly<{ x: number; y: number; z: number }>
  ) => boolean;
  onOutOfBounds?: () => void;
  onStatus: (status: string) => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const [resetX, resetY, resetZ] = resetPosition;
  const assistRef = useRef<
    | {
        from: Quaternion;
        target: Quaternion;
        progress: number;
      }
    | undefined
  >(undefined);
  const launchedRef = useRef(false);
  const launchAgeRef = useRef(0);
  const { rapier } = useRapier();
  const { source, target, failed } = useVerifiedD20(result);
  const colliderVertices = useMemo(() => {
    const geometry = new IcosahedronGeometry(DIE_RADIUS, 0);
    const vertices = new Float32Array(
      geometry.getAttribute('position').array as ArrayLike<number>
    );
    geometry.dispose();
    return vertices;
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    assistRef.current = undefined;
    launchAgeRef.current = 0;
    if (command.type === 'reset') {
      launchedRef.current = false;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setTranslation({ x: resetX, y: resetY, z: resetZ }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      onStatus('Ready to grab');
      return;
    }
    if (command.type === 'hold') {
      launchedRef.current = false;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setNextKinematicTranslation({
        x: command.position[0],
        y: command.height,
        z: command.position[1],
      });
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      onStatus(
        `Held ${command.height.toFixed(2)} high · left+right up raises, down lowers`
      );
      return;
    }

    const launch = physicsLaunchFromProfile(command.profile);
    launchedRef.current = true;
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation(
      {
        x: command.position[0],
        y: command.height,
        z: command.position[1],
      },
      true
    );
    body.setLinvel(launch.linearVelocity, true);
    body.setAngvel(launch.angularVelocity, true);
    body.wakeUp();
    onStatus('Rolling with real collisions');
  }, [command, onStatus, rapier.RigidBodyType, resetX, resetY, resetZ]);

  const beginAssist = useCallback(() => {
    const body = bodyRef.current;
    if (
      !assist ||
      !target ||
      !body ||
      !launchedRef.current ||
      assistRef.current
    )
      return;
    const rotation = body.rotation();
    body.wakeUp();
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    assistRef.current = {
      from: new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      target: new Quaternion(...target),
      progress: 0,
    };
    onStatus(`Late face assist → ${result}`);
  }, [
    assist,
    onStatus,
    rapier.RigidBodyType.KinematicPositionBased,
    result,
    target,
  ]);

  useAfterPhysicsStep(() => {
    const body = bodyRef.current;
    if (!body || !launchedRef.current || assistRef.current) return;
    const translation = body.translation();
    if (isOutOfBounds?.(translation)) {
      launchedRef.current = false;
      launchAgeRef.current = 0;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      onOutOfBounds?.();
      return;
    }
    const linear = body.linvel();
    const angular = body.angvel();
    const lowEnergy =
      Math.hypot(linear.x, linear.y, linear.z) < 0.28 &&
      Math.hypot(angular.x, angular.y, angular.z) < 1.1;
    if (lowEnergy) beginAssist();
  });

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    if (launchedRef.current && !assistRef.current) {
      launchAgeRef.current += delta;
      if (assist && launchAgeRef.current >= 3) beginAssist();
    }
    const activeAssist = assistRef.current;
    if (!activeAssist) return;
    activeAssist.progress = Math.min(1, activeAssist.progress + delta / 0.32);
    const eased = 1 - Math.pow(1 - activeAssist.progress, 3);
    const rotation = activeAssist.from
      .clone()
      .slerp(activeAssist.target, eased);
    body.setNextKinematicRotation(rotation);
    if (activeAssist.progress >= 1) {
      assistRef.current = undefined;
      launchedRef.current = false;
      body.setBodyType(rapier.RigidBodyType.Fixed, true);
      onStatus(`Settled on authoritative face ${result}`);
    }
  });

  if (failed)
    return (
      <mesh position={[0, 0.7, 0]}>
        <icosahedronGeometry args={[DIE_RADIUS, 0]} />
        <meshStandardMaterial color="#9f1239" />
      </mesh>
    );
  if (!source) return null;

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={resetPosition}
      restitution={0.48}
      friction={0.72}
      linearDamping={0.22}
      angularDamping={0.16}
      ccd
      canSleep
      onSleep={() => {
        if (assist) beginAssist();
        else onStatus('Naturally settled · face assist off');
      }}
    >
      <ConvexHullCollider args={[colliderVertices]} />
      <RuntimeDiceMesh
        source={source}
        treatment={TREATMENT}
        initialPose={STATIC_POSE}
        getPose={() => STATIC_POSE}
        onFailure={() => onStatus('3D die failed to render')}
        selectedGroupName="physics-tray-spike-d20"
        shadowName="physics-tray-spike-shadow"
      />
    </RigidBody>
  );
}

function PhysicsTrayWorld({
  command,
  result,
  assist,
  projectionRef,
  onStatus,
}: {
  command: PhysicsCommand;
  result: number;
  assist: boolean;
  projectionRef: { current: TrayPlaneProjection | undefined };
  onStatus: (status: string) => void;
}) {
  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 7, 4]} intensity={2.4} castShadow />
      <TrayPlaneProjectionBridge
        origin={[0, 0.72, 0]}
        xAxis={[1, 0, 0]}
        yAxis={[0, 0, 1]}
        width={TRAY_WIDTH}
        height={TRAY_DEPTH}
        projectionRef={projectionRef}
      />
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider
            args={[TRAY_WIDTH / 2, 0.1, TRAY_DEPTH / 2]}
            position={[0, -0.1, 0]}
            friction={0.9}
            restitution={0.25}
          />
          <CuboidCollider
            args={[0.12, 0.5, TRAY_DEPTH / 2]}
            position={[-TRAY_WIDTH / 2, 0.4, 0]}
            restitution={0.55}
          />
          <CuboidCollider
            args={[0.12, 0.5, TRAY_DEPTH / 2]}
            position={[TRAY_WIDTH / 2, 0.4, 0]}
            restitution={0.55}
          />
          <CuboidCollider
            args={[TRAY_WIDTH / 2, 0.5, 0.12]}
            position={[0, 0.4, -TRAY_DEPTH / 2]}
            restitution={0.55}
          />
          <CuboidCollider
            args={[TRAY_WIDTH / 2, 0.5, 0.12]}
            position={[0, 0.4, TRAY_DEPTH / 2]}
            restitution={0.55}
          />
        </RigidBody>
        <PhysicsDieBody
          command={command}
          result={result}
          assist={assist}
          onStatus={onStatus}
        />
      </Physics>
      <mesh position={[0, -0.105, 0]} receiveShadow>
        <boxGeometry args={[TRAY_WIDTH, 0.2, TRAY_DEPTH]} />
        <meshStandardMaterial color="#3f4650" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.4, -TRAY_DEPTH / 2]}>
        <boxGeometry args={[TRAY_WIDTH + 0.25, 1, 0.24]} />
        <meshStandardMaterial color="#171c24" />
      </mesh>
      <mesh position={[0, 0.4, TRAY_DEPTH / 2]}>
        <boxGeometry args={[TRAY_WIDTH + 0.25, 1, 0.24]} />
        <meshStandardMaterial color="#171c24" />
      </mesh>
      <mesh position={[-TRAY_WIDTH / 2, 0.4, 0]}>
        <boxGeometry args={[0.24, 1, TRAY_DEPTH]} />
        <meshStandardMaterial color="#171c24" />
      </mesh>
      <mesh position={[TRAY_WIDTH / 2, 0.4, 0]}>
        <boxGeometry args={[0.24, 1, TRAY_DEPTH]} />
        <meshStandardMaterial color="#171c24" />
      </mesh>
    </>
  );
}

export default function PhysicsTraySpike() {
  const [command, setCommand] = useState<PhysicsCommand>({
    id: 0,
    type: 'reset',
  });
  const [assist, setAssist] = useState(true);
  const [result, setResult] = useState(20);
  const [status, setStatus] = useState('Loading rigid-body physics…');
  const projectionRef = useRef<TrayPlaneProjection | undefined>(undefined);
  const pointerId = useRef<number | undefined>(undefined);
  const previousSample = useRef<PointerSample | undefined>(undefined);
  const velocity = useRef<readonly [number, number]>([0, 0]);
  const nextId = useRef(1);

  const planePoint = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) =>
      projectionRef.current?.screenToPlane(event.clientX, event.clientY),
    []
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const point = planePoint(event);
      if (!point) {
        setStatus('Physics pointer projection is not ready');
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerId.current = event.pointerId;
      previousSample.current = {
        x: point[0],
        y: point[1],
        time: event.timeStamp,
      };
      velocity.current = [0, 0];
      setCommand({
        id: nextId.current++,
        type: 'hold',
        position: point,
        height: 0.72,
      });
    },
    [planePoint]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== event.pointerId) return;
      const point = planePoint(event);
      const previous = previousSample.current;
      if (!point || !previous) return;
      const dt = Math.max(1 / 240, (event.timeStamp - previous.time) / 1000);
      const instantX = (point[0] - previous.x) / dt;
      const instantY = (point[1] - previous.y) / dt;
      velocity.current = [
        velocity.current[0] * 0.55 + instantX * 0.45,
        velocity.current[1] * 0.55 + instantY * 0.45,
      ];
      previousSample.current = {
        x: point[0],
        y: point[1],
        time: event.timeStamp,
      };
      setCommand({
        id: nextId.current++,
        type: 'hold',
        position: point,
        height: 0.72,
      });
    },
    [planePoint]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== event.pointerId) return;
      const point = planePoint(event);
      const previous = previousSample.current;
      pointerId.current = undefined;
      previousSample.current = undefined;
      if (!point || !previous) return;
      const speed = Math.hypot(velocity.current[0], velocity.current[1]);
      const direction: readonly [number, number] =
        speed > 0.001
          ? [velocity.current[0] / speed, velocity.current[1] / speed]
          : [0, 0];
      const normalized = projectionRef.current?.planeToNormalized(point) ?? [
        0.5, 0.5,
      ];
      const profile = createVisualThrowProfile({
        releasePosition: normalized,
        releaseDirection: direction,
        releaseSpeed: Math.min(1, speed / 10),
        shakeEnergy: Math.min(1, speed / 14),
        spinBias: 0,
        motionSeed: nextId.current * 2654435761,
      });
      setCommand({
        id: nextId.current++,
        type: 'release',
        position: point,
        height: 0.72,
        profile,
      });
    },
    [planePoint]
  );

  return (
    <section
      className="physics-tray-spike"
      aria-labelledby="physics-tray-title"
    >
      <header className="physics-tray-spike__header">
        <div>
          <span>Throwaway local spike</span>
          <h4 id="physics-tray-title">Real rigid-body tray</h4>
          <p>
            Drag anywhere to pick up the d20, then release. Compare natural
            settlement with the optional late authoritative-face assist.
          </p>
        </div>
        <div className="physics-tray-spike__controls">
          <label>
            Target face
            <select
              value={result}
              onChange={(event) => setResult(Number(event.target.value))}
            >
              <option value={1}>1</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={assist}
              onChange={(event) => setAssist(event.target.checked)}
            />{' '}
            Late face assist
          </label>
          <button
            type="button"
            onClick={() => setCommand({ id: nextId.current++, type: 'reset' })}
          >
            Reset die
          </button>
        </div>
      </header>
      <div className="physics-tray-spike__status" role="status">
        {status}
      </div>
      <div className="physics-tray-spike__surface">
        <Canvas
          shadows
          camera={{ fov: 36, near: 0.1, far: 100, position: [0, 5.4, 6.4] }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 0.3, 0);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld(true);
          }}
        >
          <Suspense fallback={null}>
            <PhysicsTrayWorld
              command={command}
              result={result}
              assist={assist}
              projectionRef={projectionRef}
              onStatus={setStatus}
            />
          </Suspense>
        </Canvas>
        <div
          className="physics-tray-spike__gesture-layer"
          role="button"
          tabIndex={0}
          aria-label="Grab and throw physics d20"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={(event) => {
            if (pointerId.current === event.pointerId) {
              pointerId.current = undefined;
              previousSample.current = undefined;
            }
          }}
        />
      </div>
    </section>
  );
}
