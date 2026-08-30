import type { Scene3D } from '@/components/session/atlasToScene3D';
import type { VisualThrowProfileV1 } from '@/components/ui/dice/visualThrowProfile';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { IcosahedronGeometry } from 'three';
import type { LocalWorldDieHeldState } from './LocalWorldDieLayer';
import type { LocalWorldDieCollider } from './localWorldDieColliders';
import { isLocalWorldDieFloorPoint } from './localWorldDieFloor';
import { localWorldDieLaunch } from './localWorldDieMotion';

export interface LocalWorldDieRigidBodyState {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  readonly linearVelocity: Readonly<{ x: number; y: number; z: number }>;
  readonly angularVelocity: Readonly<{ x: number; y: number; z: number }>;
}

export interface LocalWorldDiePlanTerminal {
  readonly kind: 'settled' | 'off-table';
  readonly step: number;
  readonly elapsedMs: number;
  readonly fingerprint: Uint8Array;
  readonly initialState: LocalWorldDieRigidBodyState;
  readonly terminalState: LocalWorldDieRigidBodyState;
}

let initialized: Promise<void> | undefined;
function ensureRapier() {
  initialized ??= RAPIER.init();
  return initialized;
}

const hull = (() => {
  const geometry = new IcosahedronGeometry(0.275, 0);
  const points = new Float32Array(
    geometry.getAttribute('position').array as ArrayLike<number>
  );
  geometry.dispose();
  return points;
})();

function rotationY(angle: number) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

function snapshotState(body: RAPIER.RigidBody): LocalWorldDieRigidBodyState {
  const position = body.translation();
  const rotation = body.rotation();
  const linearVelocity = body.linvel();
  const angularVelocity = body.angvel();
  return Object.freeze({
    position: Object.freeze({ ...position }),
    rotation: Object.freeze({ ...rotation }),
    linearVelocity: Object.freeze({ ...linearVelocity }),
    angularVelocity: Object.freeze({ ...angularVelocity }),
  });
}

async function colliderFingerprint(
  colliders: readonly LocalWorldDieCollider[]
): Promise<Uint8Array> {
  const canonical = colliders.map((collider) => ({
    id: collider.id,
    kind: collider.kind,
    position: collider.position,
    halfExtents: collider.halfExtents,
    rotationY: collider.rotationY,
  }));
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonical))
  );
  return new Uint8Array(digest);
}

export async function preSimulateLocalWorldDie(
  input: Readonly<{
    scene: Scene3D;
    colliders: readonly LocalWorldDieCollider[];
    held: LocalWorldDieHeldState;
    profile: VisualThrowProfileV1;
  }>
): Promise<LocalWorldDiePlanTerminal> {
  const started = performance.now();
  const fingerprint = await colliderFingerprint(input.colliders);
  await ensureRapier();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  try {
    for (const collider of input.colliders) {
      const material =
        collider.kind === 'floor'
          ? { friction: 0.9, restitution: 0.25 }
          : { friction: 0.72, restitution: 0.55 };
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(...collider.halfExtents)
          .setTranslation(...collider.position)
          .setRotation(rotationY(collider.rotationY))
          .setFriction(material.friction)
          .setRestitution(material.restitution)
      );
    }
    const launch = localWorldDieLaunch(input.profile);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          input.held.position[0],
          input.held.height,
          input.held.position[1]
        )
        .setLinvel(
          launch.linearVelocity.x,
          launch.linearVelocity.y,
          launch.linearVelocity.z
        )
        .setAngvel(launch.angularVelocity)
        .setLinearDamping(0.22)
        .setAngularDamping(0.16)
        .setCcdEnabled(true)
        .setCanSleep(true)
    );
    const initialState = snapshotState(body);
    const dieCollider = RAPIER.ColliderDesc.convexHull(hull);
    if (!dieCollider) throw new Error('invalid d20 hull');
    world.createCollider(
      dieCollider.setDensity(1).setFriction(0.72).setRestitution(0.48),
      body
    );

    const terminal = (
      kind: LocalWorldDiePlanTerminal['kind'],
      step: number
    ): LocalWorldDiePlanTerminal => ({
      kind,
      step,
      elapsedMs: performance.now() - started,
      fingerprint,
      initialState,
      terminalState: snapshotState(body),
    });

    for (let step = 1; step <= 180; step += 1) {
      world.step();
      const position = body.translation();
      const overFloor = isLocalWorldDieFloorPoint(
        input.scene,
        position.x,
        position.z
      );
      const offTable =
        position.y < DUNGEON_SURFACE_Y - 0.5 ||
        (position.y < DUNGEON_SURFACE_Y + 0.05 && !overFloor);
      if (offTable) return terminal('off-table', step);
      const linear = body.linvel();
      const angular = body.angvel();
      if (
        overFloor &&
        Math.hypot(linear.x, linear.y, linear.z) < 0.28 &&
        Math.hypot(angular.x, angular.y, angular.z) < 1.1
      ) {
        return terminal('settled', step);
      }
    }
    return terminal('settled', 180);
  } finally {
    world.free();
  }
}
