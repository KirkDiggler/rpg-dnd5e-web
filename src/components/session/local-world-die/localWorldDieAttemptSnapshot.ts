import type { Scene3D } from '@/components/session/atlasToScene3D';
import {
  buildLocalWorldDieColliders,
  type LocalWorldDieCollider,
} from './localWorldDieColliders';

export interface LocalWorldDieAttemptSnapshot {
  readonly scopeKey: string;
  readonly scene: Scene3D;
  readonly colliders: readonly LocalWorldDieCollider[];
}

/** Captures all local collision inputs once for one presentation attempt. */
export function createLocalWorldDieAttemptSnapshot(
  input: Readonly<{
    scopeKey: string;
    scene: Scene3D;
    openDoorIds: ReadonlySet<string>;
  }>
): LocalWorldDieAttemptSnapshot {
  return Object.freeze({
    scopeKey: input.scopeKey,
    scene: input.scene,
    colliders: buildLocalWorldDieColliders(input.scene, input.openDoorIds),
  });
}
