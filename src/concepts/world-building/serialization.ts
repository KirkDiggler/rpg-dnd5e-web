import { PROP_KEYS } from '@/components/hex-grid/propManifest';
import type {
  Arrangement,
  ArrangementLibrary,
  KeyValueStorage,
  WorldGroup,
  WorldProp,
  WorldScene,
  WorldTransform,
} from './types';

export const SCENE_STORAGE_KEY = 'rpg.concepts.world-building.scene.v1';
export const LIBRARY_STORAGE_KEY = 'rpg.concepts.world-building.library.v1';
export const MAX_JSON_LENGTH = 500_000;
export const MAX_ITEMS = 200;
export const MAX_GROUPS = 80;
export const MAX_ARRANGEMENTS = 40;
export const WORLD_LIMIT = 12;

interface SceneEnvelope {
  kind: 'rpg-world-building-scene';
  version: 1;
  scene: WorldScene;
}

interface LibraryEnvelope {
  kind: 'rpg-world-building-library';
  version: 1;
  library: ArrangementLibrary;
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object.');
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown, field: string, max = 120): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(
      `${field} must be a non-empty string up to ${max} characters.`
    );
  }
  return value;
};

const optionalId = (value: unknown, field: string): string | undefined =>
  value === undefined ? undefined : string(value, field, 120);

function finiteNumber(
  value: unknown,
  field: string,
  min: number,
  max: number
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${field} must be a finite number between ${min} and ${max}.`
    );
  }
  return value;
}

function transform(value: unknown, field: string): WorldTransform {
  const input = object(value);
  return {
    x: finiteNumber(input.x, `${field}.x`, -WORLD_LIMIT, WORLD_LIMIT),
    y: finiteNumber(input.y, `${field}.y`, 0, 8),
    z: finiteNumber(input.z, `${field}.z`, -WORLD_LIMIT, WORLD_LIMIT),
    rotationY: finiteNumber(
      input.rotationY,
      `${field}.rotationY`,
      -Math.PI * 100,
      Math.PI * 100
    ),
  };
}

function prop(value: unknown, field: string): WorldProp {
  const input = object(value);
  if (input.kind !== 'prop') throw new Error(`${field}.kind must be prop.`);
  const assetRef = string(input.assetRef, `${field}.assetRef`, 160);
  if (!PROP_KEYS[assetRef]) {
    throw new Error(`${field}.assetRef is not in the local prop catalog.`);
  }
  return {
    id: string(input.id, `${field}.id`, 120),
    kind: 'prop',
    assetRef,
    label: string(input.label, `${field}.label`, 120),
    transform: transform(input.transform, `${field}.transform`),
    parentId: optionalId(input.parentId, `${field}.parentId`),
    supportId: optionalId(input.supportId, `${field}.supportId`),
  };
}

function group(value: unknown, field: string): WorldGroup {
  const input = object(value);
  if (input.kind !== 'group') throw new Error(`${field}.kind must be group.`);
  return {
    id: string(input.id, `${field}.id`, 120),
    kind: 'group',
    label: string(input.label, `${field}.label`, 120),
    transform: transform(input.transform, `${field}.transform`),
    parentId: optionalId(input.parentId, `${field}.parentId`),
  };
}

function entityArrays(
  input: Record<string, unknown>,
  field: string
): { items: WorldProp[]; groups: WorldGroup[] } {
  if (!Array.isArray(input.items) || input.items.length > MAX_ITEMS) {
    throw new Error(`${field}.items must contain at most ${MAX_ITEMS} props.`);
  }
  if (!Array.isArray(input.groups) || input.groups.length > MAX_GROUPS) {
    throw new Error(
      `${field}.groups must contain at most ${MAX_GROUPS} groups.`
    );
  }
  const items = input.items.map((value, index) =>
    prop(value, `${field}.items[${index}]`)
  );
  const groups = input.groups.map((value, index) =>
    group(value, `${field}.groups[${index}]`)
  );
  validateRelationships(items, groups, field);
  return { items, groups };
}

function validateRelationships(
  items: readonly WorldProp[],
  groups: readonly WorldGroup[],
  field: string
): void {
  const allIds = [
    ...items.map((item) => item.id),
    ...groups.map((group) => group.id),
  ];
  if (new Set(allIds).size !== allIds.length) {
    throw new Error(`${field} contains duplicate identities.`);
  }
  const itemIds = new Set(items.map((item) => item.id));
  const groupIds = new Set(groups.map((entry) => entry.id));
  const dependencies = new Map<string, string[]>();
  for (const entry of groups) {
    if (entry.parentId && !groupIds.has(entry.parentId)) {
      throw new Error(`${field} group ${entry.id} has an invalid parent.`);
    }
    dependencies.set(entry.id, entry.parentId ? [entry.parentId] : []);
  }
  for (const item of items) {
    if (item.parentId && !groupIds.has(item.parentId)) {
      throw new Error(`${field} prop ${item.id} has an invalid group parent.`);
    }
    if (item.supportId && !itemIds.has(item.supportId)) {
      throw new Error(`${field} prop ${item.id} has an invalid support.`);
    }
    dependencies.set(
      item.id,
      [item.parentId, item.supportId].filter((id): id is string => !!id)
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error(`${field} relationships must be acyclic.`);
    if (visited.has(id)) return;
    visiting.add(id);
    dependencies.get(id)?.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  allIds.forEach(visit);
}

export function validateScene(value: unknown): WorldScene {
  const input = object(value);
  if (input.version !== 1) throw new Error('Scene version must be 1.');
  const entities = entityArrays(input, 'scene');
  return {
    version: 1,
    id: string(input.id, 'scene.id', 120),
    name: string(input.name, 'scene.name', 120),
    ...entities,
  };
}

function validateArrangement(value: unknown, index: number): Arrangement {
  const input = object(value);
  if (input.version !== 1)
    throw new Error(`arrangements[${index}].version must be 1.`);
  const createdAt = string(
    input.createdAt,
    `arrangements[${index}].createdAt`,
    40
  );
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error(
      `arrangements[${index}].createdAt must be an ISO timestamp.`
    );
  }
  return {
    version: 1,
    id: string(input.id, `arrangements[${index}].id`, 120),
    name: string(input.name, `arrangements[${index}].name`, 120),
    createdAt,
    ...entityArrays(input, `arrangements[${index}]`),
  };
}

export function validateLibrary(value: unknown): ArrangementLibrary {
  const input = object(value);
  if (input.version !== 1) throw new Error('Library version must be 1.');
  if (
    !Array.isArray(input.arrangements) ||
    input.arrangements.length > MAX_ARRANGEMENTS
  ) {
    throw new Error(
      `Library must contain at most ${MAX_ARRANGEMENTS} arrangements.`
    );
  }
  const arrangements = input.arrangements.map(validateArrangement);
  if (
    new Set(arrangements.map((entry) => entry.id)).size !== arrangements.length
  ) {
    throw new Error('Arrangement identities must be unique.');
  }
  return { version: 1, arrangements };
}

function parseJson(json: string): unknown {
  if (json.length > MAX_JSON_LENGTH) {
    throw new Error(
      `JSON is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('JSON could not be parsed.');
  }
}

export function stringifyScene(scene: WorldScene): string {
  const valid = validateScene(scene);
  return JSON.stringify(
    {
      kind: 'rpg-world-building-scene',
      version: 1,
      scene: valid,
    } satisfies SceneEnvelope,
    null,
    2
  );
}

export function parseSceneJson(json: string): WorldScene {
  const envelope = object(parseJson(json));
  if (envelope.kind !== 'rpg-world-building-scene' || envelope.version !== 1) {
    throw new Error('This is not a version 1 World Building scene.');
  }
  return validateScene(envelope.scene);
}

export function stringifyLibrary(library: ArrangementLibrary): string {
  const valid = validateLibrary(library);
  return JSON.stringify(
    {
      kind: 'rpg-world-building-library',
      version: 1,
      library: valid,
    } satisfies LibraryEnvelope,
    null,
    2
  );
}

export function parseLibraryJson(json: string): ArrangementLibrary {
  const envelope = object(parseJson(json));
  if (
    envelope.kind !== 'rpg-world-building-library' ||
    envelope.version !== 1
  ) {
    throw new Error(
      'This is not a version 1 World Building arrangement library.'
    );
  }
  return validateLibrary(envelope.library);
}

export interface PersistenceResult<T> {
  value: T;
  error: string | null;
}

export function loadScene(
  storage: KeyValueStorage,
  fallback: WorldScene
): PersistenceResult<WorldScene> {
  try {
    const stored = storage.getItem(SCENE_STORAGE_KEY);
    if (!stored) return { value: fallback, error: null };
    return { value: parseSceneJson(stored), error: null };
  } catch (error) {
    return {
      value: fallback,
      error: `Could not reopen the saved scene; the current scene was kept. ${messageOf(error)}`,
    };
  }
}

export function loadLibrary(
  storage: KeyValueStorage,
  fallback: ArrangementLibrary
): PersistenceResult<ArrangementLibrary> {
  try {
    const stored = storage.getItem(LIBRARY_STORAGE_KEY);
    if (!stored) return { value: fallback, error: null };
    return { value: parseLibraryJson(stored), error: null };
  } catch (error) {
    return {
      value: fallback,
      error: `Could not reopen the arrangement library; the current library was kept. ${messageOf(error)}`,
    };
  }
}

export function saveSceneToStorage(
  storage: KeyValueStorage,
  scene: WorldScene
): PersistenceResult<WorldScene> {
  try {
    storage.setItem(SCENE_STORAGE_KEY, stringifyScene(scene));
    return { value: scene, error: null };
  } catch (error) {
    return {
      value: scene,
      error: `The scene is still open, but local save failed. ${messageOf(error)}`,
    };
  }
}

export function saveLibraryToStorage(
  storage: KeyValueStorage,
  library: ArrangementLibrary
): PersistenceResult<ArrangementLibrary> {
  try {
    storage.setItem(LIBRARY_STORAGE_KEY, stringifyLibrary(library));
    return { value: library, error: null };
  } catch (error) {
    return {
      value: library,
      error: `The arrangement library is still open, but local save failed. ${messageOf(error)}`,
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
