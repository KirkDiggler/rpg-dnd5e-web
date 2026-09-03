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
import { useDiceDials } from '@/feel/useFeelDials';
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
  localWorldDieDimensions,
  type LocalWorldDieDimensions,
} from './diceDials';
import type { LocalWorldDieCollider } from './localWorldDieColliders';
import {
  localWorldDieCommandTerminal,
  localWorldDieDynamicState,
  type LocalWorldDieCommand,
} from './localWorldDieCommand';
import { isLocalWorldDieFloorPoint } from './localWorldDieFloor';
import { localWorldDieLaunch } from './localWorldDieMotion';
import { RollFlashDie } from './RollFlashDie';

export interface LocalWorldDieLayerProps {
  readonly command: LocalWorldDieCommand;
  readonly scene: Scene3D;
  readonly colliders: readonly LocalWorldDieCollider[];
  readonly authoritativeFace: number;
  readonly projectionRef: MutableRefObject<TrayPlaneProjection | undefined>;
  readonly onReadyChange: (ready: boolean) => void;
  readonly onTerminal: (kind: 'settled' | 'off-table' | 'failure') => void;
  /**
   * Whether die-mode roll flash is on (`?rollFlash=die`/`both`, #906) — the
   * only thing a caller needs to say. The layer triggers and renders the
   * flash itself, from the moment the die is physically at rest, using
   * `authoritativeFace` above (already the server's natural d20) — no
   * outcome object to plumb through, and no external settle gate to get the
   * timing right. See this file's own `DIE_FLASH_TOTAL_MS` doc comment and
   * RollFlashDie.tsx. Default false.
   *
   * SPECTATOR NOTE: a `command.kind === 'witness'` replay reaches
   * `beginAssist` through the exact same `useAfterPhysicsStep`/`useFrame`
   * checks as an actor's own throw (`launched.current && !assist.current`
   * neither knows nor cares which kind of command set `launched` true) — so
   * a witness playback of this SAME `LocalWorldDieLayer` instance flashes
   * too, whenever a caller passes `rollFlashEnabled` for BOTH branches (see
   * SessionEncounterView.tsx, which renders the one instance for either
   * `localWorldDiePhysical` or `localWorldDieWitnessActive`).
   */
  readonly rollFlashEnabled?: boolean;
}

const PRESET_ID = 'dice.original.carved.d20';
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

/** The kinematic correction-spin duration, seconds — extracted from the
 * `current.progress` divisor below (`useFrame`'s `delta / 0.32`) so the
 * roll-flash window (`DIE_FLASH_TOTAL_MS`) can agree with it exactly rather
 * than re-stating the same number a second place. */
const DIE_ASSIST_DURATION_S = 0.32;

/**
 * Round 3 fix, Kirk's design adopted exactly: "we spin to correct the die
 * and we could cover that with a simple animation showing the number
 * rolled; while that is over it we flip the die like we do." The flash
 * spans the WHOLE correction-spin-plus-hold window — starting the instant
 * `beginAssist` runs (die physically at rest, correction about to begin) —
 * so it is never on screen while the physics face still visibly disagrees
 * with the server's answer. It fades only in the last
 * `DIE_FLASH_FADE_MS` of that window.
 *
 * This REPLACES the previous view-level design, which gated the flash on
 * `localWorldDieSettled` — a boolean SessionEncounterView.tsx's own
 * `handleLocalWorldDieTerminal` only sets at the END of the hold, by which
 * point the layer is already unmounting. The flash never actually
 * rendered. Triggering it here, at the moment physics settles rather than
 * the moment presentation tears down, is what fixes that.
 */
export const DIE_FLASH_TOTAL_MS =
  DIE_ASSIST_DURATION_S * 1000 + LOCAL_WORLD_DIE_RESULT_HOLD_MS;

/** How long, at the end of `DIE_FLASH_TOTAL_MS`, the flash fades out. */
export const DIE_FLASH_FADE_MS = 300;

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
  dieScale,
  dimensions,
  authoritativeFace,
  rollFlashEnabled,
  onBodyReady,
  onMeshReady,
  onTerminal,
}: {
  readonly command: LocalWorldDieCommand;
  readonly source: NonNullable<ReturnType<typeof runtimeSource>>;
  readonly target?: readonly [number, number, number, number];
  readonly scene: Scene3D;
  /** Raw `?dieScale=` multiplier — passed straight through to
   * `RuntimeDiceMesh`'s own `sizeScale` for the visual mesh/shadow, which
   * are single local multiplications with nothing else to derive here (see
   * diceDials.ts's own doc comment). */
  readonly dieScale: number;
  readonly dimensions: LocalWorldDieDimensions;
  /** The server's natural d20 — shown by the roll flash directly, no
   * outcome object needed (see `LocalWorldDieLayerProps.rollFlashEnabled`). */
  readonly authoritativeFace: number;
  readonly rollFlashEnabled: boolean;
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
  // The roll flash's own rest position, captured once at `beginAssist` and
  // cleared DIE_FLASH_TOTAL_MS later (or immediately, on the next command) —
  // see DIE_FLASH_TOTAL_MS's own doc comment for why this moment, not
  // `onTerminal('settled')`.
  const [rollFlashPosition, setRollFlashPosition] = useState<
    readonly [number, number, number] | undefined
  >(undefined);
  const rollFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  // [x, y, z] rest position — `?dieScale=` (diceDials.ts) scales its height
  // above the surface together with the hull/mesh/shadow, so a bigger die
  // still sits ON the dungeon surface rather than floating or clipping into
  // it. Memoized (like the old frozen module constant it replaces) so its
  // reference stays stable across renders — `dieScale` never changes for the
  // component's lifetime, but an unstable reference here would re-run the
  // reset effect below, and re-apply the RigidBody's `position` prop, on
  // every unrelated render.
  const resetPosition = useMemo<readonly [number, number, number]>(
    () => [0, DUNGEON_SURFACE_Y + dimensions.restHeightAboveSurface, 0],
    [dimensions.restHeightAboveSurface]
  );
  const hull = useMemo(() => {
    const geometry = new IcosahedronGeometry(dimensions.hullRadius, 0);
    const vertices = new Float32Array(
      geometry.getAttribute('position').array as ArrayLike<number>
    );
    geometry.dispose();
    return vertices;
  }, [dimensions.hullRadius]);

  useEffect(() => {
    if (bodyRef.current) onBodyReady();
  }, [onBodyReady]);

  useEffect(
    () => () => {
      if (settledTimer.current !== undefined) {
        clearTimeout(settledTimer.current);
        settledTimer.current = undefined;
      }
      if (rollFlashTimer.current !== undefined) {
        clearTimeout(rollFlashTimer.current);
        rollFlashTimer.current = undefined;
      }
    },
    []
  );

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
    // The die is physically at rest RIGHT NOW (only its rotation is about to
    // be kinematically corrected — see the `useFrame` block below); this is
    // the moment DIE_FLASH_TOTAL_MS's own doc comment names as the trigger.
    if (rollFlashEnabled) {
      const rest = body.translation();
      setRollFlashPosition([rest.x, rest.y, rest.z]);
      if (rollFlashTimer.current !== undefined) {
        clearTimeout(rollFlashTimer.current);
      }
      rollFlashTimer.current = setTimeout(() => {
        rollFlashTimer.current = undefined;
        setRollFlashPosition(undefined);
      }, DIE_FLASH_TOTAL_MS);
    }
  }, [rapier.RigidBodyType.KinematicPositionBased, target, rollFlashEnabled]);

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
    // A new command supersedes any flash left over from a PREVIOUS throw —
    // without this, a fast reroll could show the old throw's number.
    if (rollFlashTimer.current !== undefined) {
      clearTimeout(rollFlashTimer.current);
      rollFlashTimer.current = undefined;
    }
    setRollFlashPosition(undefined);
    if (command.kind === 'reset') {
      launched.current = false;
      setVisible(false);
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      body.setTranslation(
        { x: resetPosition[0], y: resetPosition[1], z: resetPosition[2] },
        true
      );
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    setVisible(true);
    if (command.kind === 'witness') {
      const witnessState = localWorldDieDynamicState(command)!;
      launched.current = true;
      body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      body.setTranslation(witnessState.position, true);
      body.setRotation(witnessState.rotation, true);
      body.setLinvel(witnessState.linearVelocity, true);
      body.setAngvel(witnessState.angularVelocity, true);
      body.wakeUp();
      return;
    }
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
  }, [command, rapier.RigidBodyType, resetPosition]);

  useAfterPhysicsStep(() => {
    const body = bodyRef.current;
    if (!body || !launched.current || assist.current) return;
    physicsStep.current += 1;
    const plannedTerminal = localWorldDieCommandTerminal(command);
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
    current.progress = Math.min(
      1,
      current.progress + delta / DIE_ASSIST_DURATION_S
    );
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
    <>
      <group visible={visible}>
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
            sizeScale={dieScale}
          />
        </RigidBody>
      </group>
      <RollFlashDie
        position={rollFlashPosition}
        naturalRoll={authoritativeFace}
        totalMs={DIE_FLASH_TOTAL_MS}
        fadeMs={DIE_FLASH_FADE_MS}
      />
    </>
  );
}

export function LocalWorldDieLayer({
  command,
  scene,
  colliders,
  authoritativeFace,
  projectionRef,
  onReadyChange,
  onTerminal,
  rollFlashEnabled = false,
}: LocalWorldDieLayerProps) {
  const [snapshot, setSnapshot] = useState(() =>
    getDiceRuntimePresetSnapshot(PRESET_ID)
  );
  const [projectionReady, setProjectionReady] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [bodyReady, setBodyReady] = useState(false);
  const [meshReady, setMeshReady] = useState(false);
  const runtimeFailureReported = useRef(false);
  // `?dieScale=` (diceDials.ts) — LIVE (#906 batch 2), though in practice
  // this whole component only mounts while a throw is in flight (see
  // SessionEncounterView.tsx's own note), so a drawer edit takes effect
  // starting with the next throw rather than reshaping an in-flight one.
  const dieScale = useDiceDials().dieScale;
  const dimensions = useMemo(
    () => localWorldDieDimensions(dieScale),
    [dieScale]
  );
  const source = useMemo(() => runtimeSource(snapshot), [snapshot]);
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

  useEffect(() => {
    if (snapshot.status !== 'failed') {
      runtimeFailureReported.current = false;
      return;
    }
    if (runtimeFailureReported.current) return;
    runtimeFailureReported.current = true;
    onTerminal('failure');
  }, [onTerminal, snapshot.status]);

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
        // Must agree with `resetPosition`'s own height inside DieBody below
        // (same `dimensions.restHeightAboveSurface`) — otherwise the plane
        // the player drags/throws on drifts from where the die actually
        // sits once `?dieScale=` moves it.
        origin={[0, DUNGEON_SURFACE_Y + dimensions.restHeightAboveSurface, 0]}
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
            dieScale={dieScale}
            dimensions={dimensions}
            authoritativeFace={authoritativeFace}
            rollFlashEnabled={rollFlashEnabled}
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
