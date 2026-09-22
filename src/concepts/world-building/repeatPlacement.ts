import { addProp, groupSelection } from './sceneState';
import { MAX_ITEMS } from './serialization';
import type {
  IdFactory,
  WorldPoint,
  WorldScene,
  WorldTransform,
} from './types';

export interface RepeatLayoutInput {
  start: WorldPoint;
  end: WorldPoint;
  step: number;
  originOffset: number;
  maxCount: number;
}

export interface RepeatLayout {
  transforms: WorldTransform[];
  count: number;
  snappedEnd: WorldPoint;
}

export interface AddRepeatedPropsInput {
  scene: WorldScene;
  assetRef: string;
  transforms: readonly WorldTransform[];
  idFactory: IdFactory;
  label: string;
}

export interface AddRepeatedPropsOutput {
  scene: WorldScene;
  selectedIds: string[];
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
}

export function layoutRepeatedProps(input: RepeatLayoutInput): RepeatLayout {
  finite(input.start.x, 'start.x');
  finite(input.start.z, 'start.z');
  finite(input.end.x, 'end.x');
  finite(input.end.z, 'end.z');
  finite(input.step, 'step');
  finite(input.originOffset, 'originOffset');
  if (input.step <= 0) throw new Error('step must be positive.');
  if (input.originOffset < 0)
    throw new Error('originOffset cannot be negative.');
  if (
    !Number.isInteger(input.maxCount) ||
    input.maxCount < 1 ||
    input.maxCount > MAX_ITEMS
  ) {
    throw new Error(`maxCount must be an integer between 1 and ${MAX_ITEMS}.`);
  }

  const dx = input.end.x - input.start.x;
  const dz = input.end.z - input.start.z;
  const distance = Math.hypot(dx, dz);
  const rawCount = Math.round(distance / input.step);
  if (!Number.isSafeInteger(rawCount))
    throw new Error('Repeat count is not safe.');
  const count = Math.max(1, rawCount);
  if (count > input.maxCount) {
    throw new Error(
      `Repeat run exceeds the remaining capacity of ${input.maxCount}.`
    );
  }
  const ux = distance === 0 ? 1 : dx / distance;
  const uz = distance === 0 ? 0 : dz / distance;
  const rotationY = Math.atan2(-uz, ux);
  const transforms = Array.from({ length: count }, (_, index) => ({
    x: input.start.x + ux * (input.originOffset + index * input.step),
    y: 0,
    z: input.start.z + uz * (input.originOffset + index * input.step),
    rotationY,
  }));
  return {
    transforms,
    count,
    snappedEnd: {
      x: input.start.x + ux * count * input.step,
      z: input.start.z + uz * count * input.step,
    },
  };
}

export function addRepeatedProps(
  input: AddRepeatedPropsInput
): AddRepeatedPropsOutput {
  if (input.transforms.length < 1) {
    throw new Error('Repeat placement requires at least one transform.');
  }
  if (input.scene.items.length + input.transforms.length > MAX_ITEMS) {
    throw new Error(`Repeat run exceeds the scene capacity of ${MAX_ITEMS}.`);
  }
  let next = input.scene;
  const ids: string[] = [];
  for (const transform of input.transforms) {
    const id = input.idFactory();
    next = addProp(next, input.assetRef, transform, id);
    ids.push(id);
  }
  if (ids.length === 1) {
    return { scene: next, selectedIds: ids };
  }
  const groupId = input.idFactory();
  next = groupSelection(next, ids, groupId, input.label);
  return { scene: next, selectedIds: [groupId] };
}
