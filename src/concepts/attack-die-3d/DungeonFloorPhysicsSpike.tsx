import { coordToKey, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { SessionCanvas } from '@/components/session/SessionCanvas';
import type { Scene3D } from '@/components/session/atlasToScene3D';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { TrayPlaneProjectionBridge } from '../../components/ui/dice/TrayPlaneProjectionBridge';
import type { TrayPlaneProjection } from '../../components/ui/dice/trayPlaneProjection';
import { createVisualThrowProfile } from '../../components/ui/dice/visualThrowProfile';
import { SESSION_COMBAT_MAP_FIXTURE } from '../session-combat/sessionCombatMapFixture';
import { PhysicsDieBody, type PhysicsCommand } from './PhysicsTraySpike';
import {
  buildDungeonDiceColliders,
  chooseDungeonDiceOrigin,
} from './dungeonDiceColliders';
import {
  adjustDungeonDiceHeight,
  isDungeonDiceFloorPoint,
  isDungeonDieOutOfBounds,
} from './dungeonDiceInteraction';

interface PointerSample {
  x: number;
  z: number;
  clientY: number;
  time: number;
}

function DungeonPhysicsLayer({
  scene,
  command,
  result,
  assist,
  origin,
  dieInTray,
  projectionRef,
  onOutOfBounds,
  onStatus,
}: {
  scene: Scene3D;
  command: PhysicsCommand;
  result: number;
  assist: boolean;
  origin: readonly [number, number];
  dieInTray: boolean;
  projectionRef: { current: TrayPlaneProjection | undefined };
  onOutOfBounds: () => void;
  onStatus: (status: string) => void;
}) {
  const colliders = useMemo(
    () =>
      buildDungeonDiceColliders(scene, {
        surfaceY: DUNGEON_SURFACE_Y,
        wallHeight: WALL_HEIGHT,
        openDoorIds: new Set(),
      }),
    [scene]
  );
  const holdY = DUNGEON_SURFACE_Y + 0.75;

  return (
    <>
      <TrayPlaneProjectionBridge
        origin={[origin[0], holdY, origin[1]]}
        xAxis={[1, 0, 0]}
        yAxis={[0, 0, 1]}
        width={18}
        height={11}
        projectionRef={projectionRef}
      />
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate>
        <RigidBody type="fixed" colliders={false}>
          {colliders.map((collider) => (
            <CuboidCollider
              key={`${collider.kind}:${collider.id}`}
              args={[
                collider.halfExtents[0],
                collider.halfExtents[1],
                collider.halfExtents[2],
              ]}
              position={collider.position}
              rotation={[0, collider.rotationY, 0]}
              friction={collider.kind === 'floor' ? 0.9 : 0.72}
              restitution={collider.kind === 'floor' ? 0.3 : 0.58}
            />
          ))}
        </RigidBody>
        {!dieInTray && (
          <PhysicsDieBody
            command={command}
            result={result}
            assist={assist}
            resetPosition={[origin[0], holdY, origin[1]]}
            isOutOfBounds={(position) =>
              isDungeonDieOutOfBounds(scene, position, DUNGEON_SURFACE_Y)
            }
            onOutOfBounds={onOutOfBounds}
            onStatus={onStatus}
          />
        )}
      </Physics>
    </>
  );
}

export default function DungeonFloorPhysicsSpike() {
  const scene = SESSION_COMBAT_MAP_FIXTURE.scene;
  const playerPosition = SESSION_COMBAT_MAP_FIXTURE.playerPosition;
  const occupiedKeys = useMemo(
    () =>
      new Set([
        coordToKey(playerPosition),
        ...SESSION_COMBAT_MAP_FIXTURE.members.map((member) =>
          coordToKey(member.position)
        ),
      ]),
    [playerPosition]
  );
  const origin = useMemo(
    () => chooseDungeonDiceOrigin(scene, playerPosition, occupiedKeys),
    [occupiedKeys, playerPosition, scene]
  );
  const [command, setCommand] = useState<PhysicsCommand>({
    id: 0,
    type: 'reset',
  });
  const [assist, setAssist] = useState(true);
  const [result, setResult] = useState(20);
  const [status, setStatus] = useState('Dice waiting in the tray');
  const [dieInTray, setDieInTray] = useState(true);
  const [draggingFromTray, setDraggingFromTray] = useState(false);
  const [ghostPoint, setGhostPoint] = useState<
    readonly [number, number] | undefined
  >(undefined);
  const projectionRef = useRef<TrayPlaneProjection | undefined>(undefined);
  const pointerId = useRef<number | undefined>(undefined);
  const pointerActive = useRef(false);
  const lastPointerClientY = useRef(0);
  const previousSample = useRef<PointerSample | undefined>(undefined);
  const velocity = useRef<readonly [number, number]>([0, 0]);
  const currentWorldPoint = useRef<readonly [number, number]>(origin);
  const heldHeight = useRef(DUNGEON_SURFACE_Y + 1.25);
  const worldDieActive = useRef(false);
  const trayDragActive = useRef(false);
  const nextId = useRef(1);

  const returnDieToTray = useCallback((message: string) => {
    pointerId.current = undefined;
    pointerActive.current = false;
    previousSample.current = undefined;
    velocity.current = [0, 0];
    worldDieActive.current = false;
    trayDragActive.current = false;
    setDraggingFromTray(false);
    setGhostPoint(undefined);
    setDieInTray(true);
    setCommand({ id: nextId.current++, type: 'reset' });
    setStatus(message);
  }, []);

  const planePoint = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const local = projectionRef.current?.screenToPlane(
        event.clientX,
        event.clientY
      );
      return local
        ? ([origin[0] + local[0], origin[1] + local[1]] as const)
        : undefined;
    },
    [origin]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerId.current = event.pointerId;
      pointerActive.current = true;
      lastPointerClientY.current = event.clientY;
      velocity.current = [0, 0];
      const point = planePoint(event) ?? origin;
      currentWorldPoint.current = point;
      previousSample.current = {
        x: point[0],
        z: point[1],
        clientY: event.clientY,
        time: event.timeStamp,
      };

      if (dieInTray) {
        trayDragActive.current = true;
        heldHeight.current = DUNGEON_SURFACE_Y + 1.25;
        setDraggingFromTray(true);
        setGhostPoint([event.clientX, event.clientY]);
        setStatus('Carrying dice from tray · enter the dungeon');
        return;
      }

      worldDieActive.current = true;
      setCommand({
        id: nextId.current++,
        type: 'hold',
        position: point,
        height: heldHeight.current,
      });
    },
    [dieInTray, origin, planePoint]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerId.current !== event.pointerId) return;
      event.preventDefault();
      const point = planePoint(event);
      const previous = previousSample.current;
      if (!previous) return;
      setGhostPoint([event.clientX, event.clientY]);

      if (
        trayDragActive.current &&
        !worldDieActive.current &&
        point &&
        isDungeonDiceFloorPoint(scene, point[0], point[1])
      ) {
        worldDieActive.current = true;
        currentWorldPoint.current = point;
        setDieInTray(false);
        setGhostPoint(undefined);
        setCommand({
          id: nextId.current++,
          type: 'hold',
          position: point,
          height: heldHeight.current,
        });
        setStatus('Dice handed from tray into the dungeon');
      } else if (worldDieActive.current && point) {
        const position =
          (event.buttons & 2) !== 0 ? currentWorldPoint.current : point;
        const dt = Math.max(1 / 240, (event.timeStamp - previous.time) / 1000);
        const instantX = (position[0] - previous.x) / dt;
        const instantZ = (position[1] - previous.z) / dt;
        velocity.current = [
          velocity.current[0] * 0.55 + instantX * 0.45,
          velocity.current[1] * 0.55 + instantZ * 0.45,
        ];
        currentWorldPoint.current = position;
        setCommand({
          id: nextId.current++,
          type: 'hold',
          position,
          height: heldHeight.current,
        });
        if ((event.buttons & 2) !== 0)
          setStatus(
            `Lift ${heldHeight.current.toFixed(2)} · up raises, down lowers`
          );
      }

      const sampledPoint = currentWorldPoint.current;
      previousSample.current = {
        x: sampledPoint[0],
        z: sampledPoint[1],
        clientY: event.clientY,
        time: event.timeStamp,
      };
    },
    [planePoint, scene]
  );

  const releaseHeldDice = useCallback(() => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    pointerId.current = undefined;
    previousSample.current = undefined;
    setDraggingFromTray(false);
    setGhostPoint(undefined);
    trayDragActive.current = false;
    if (!worldDieActive.current) {
      returnDieToTray('Dice returned to tray · drag onto dungeon floor');
      return;
    }

    const point = currentWorldPoint.current;
    const speed = Math.hypot(velocity.current[0], velocity.current[1]);
    const direction: readonly [number, number] =
      speed > 0.001
        ? [velocity.current[0] / speed, velocity.current[1] / speed]
        : [0, 0];
    const profile = createVisualThrowProfile({
      releasePosition: [0.5, 0.5],
      releaseDirection: direction,
      releaseSpeed: Math.min(1, speed / 12),
      shakeEnergy: Math.min(1, speed / 16),
      spinBias: 0,
      motionSeed: nextId.current * 2654435761,
    });
    setCommand({
      id: nextId.current++,
      type: 'release',
      position: point,
      height: heldHeight.current,
      profile,
    });
  }, [returnDieToTray]);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      releaseHeldDice();
    },
    [releaseHeldDice]
  );

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!pointerActive.current) return;
      const deltaY = event.clientY - lastPointerClientY.current;
      lastPointerClientY.current = event.clientY;
      if ((event.buttons & 2) === 0 || !worldDieActive.current) return;
      heldHeight.current = adjustDungeonDiceHeight(
        heldHeight.current,
        deltaY,
        DUNGEON_SURFACE_Y + 0.35,
        DUNGEON_SURFACE_Y + 3
      );
      setCommand({
        id: nextId.current++,
        type: 'hold',
        position: currentWorldPoint.current,
        height: heldHeight.current,
      });
      setStatus(
        `Lift ${heldHeight.current.toFixed(2)} · up raises, down lowers`
      );
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      if ((event.buttons & 1) === 0) releaseHeldDice();
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [releaseHeldDice]);

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerId.current !== event.pointerId) return;
      returnDieToTray('Dice returned to tray');
    },
    [returnDieToTray]
  );

  const presentationLayer = (
    <DungeonPhysicsLayer
      scene={scene}
      command={command}
      result={result}
      assist={assist}
      origin={origin}
      dieInTray={dieInTray}
      projectionRef={projectionRef}
      onOutOfBounds={() =>
        returnDieToTray('Off the table — reroll from the tray!')
      }
      onStatus={setStatus}
    />
  );

  return (
    <section
      className="dungeon-physics-spike"
      aria-labelledby="dungeon-physics-title"
    >
      <header className="physics-tray-spike__header">
        <div>
          <span>Dungeon-floor feasibility proof</span>
          <h4 id="dungeon-physics-title">Throw onto the reference tomb</h4>
          <p>
            The actual SessionCanvas supplies floors and walls. Closed doors
            collide; props and characters deliberately do not.
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
            onClick={() => returnDieToTray('Dice returned to tray')}
          >
            Return die to tray
          </button>
        </div>
      </header>
      <div className="physics-tray-spike__status" role="status">
        {status}
      </div>
      <div className="dungeon-physics-spike__surface">
        <SessionCanvas
          scene={scene}
          hexSize={HEX_SIZE}
          characterId="aldric"
          characterName="Aldric Vale"
          classRefId="fighter"
          myPosition={playerPosition}
          otherMembers={[...SESSION_COMBAT_MAP_FIXTURE.members]}
          pathIndex={SESSION_COMBAT_MAP_FIXTURE.pathIndex}
          presentationLayer={presentationLayer}
        />
        {(dieInTray || draggingFromTray) && (
          <button
            type="button"
            className="dungeon-physics-spike__launch-tray"
            data-handed-off={!dieInTray}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span aria-hidden="true">20</span>
            <small>Drag dice into dungeon</small>
          </button>
        )}
        {ghostPoint && dieInTray && (
          <span
            className="dungeon-physics-spike__drag-ghost"
            style={{ left: ghostPoint[0], top: ghostPoint[1] }}
            aria-hidden="true"
          >
            20
          </span>
        )}
        {!dieInTray && !draggingFromTray && (
          <div
            className="physics-tray-spike__gesture-layer"
            role="button"
            tabIndex={0}
            aria-label="Grab and throw d20 on dungeon floor"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={(event) => event.preventDefault()}
          />
        )}
      </div>
    </section>
  );
}
