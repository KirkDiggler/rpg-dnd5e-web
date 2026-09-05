import { refLabel } from '@/utils/refs';
import type {
  Arrangement,
  IdFactory,
  SceneHistory,
  WorldGroup,
  WorldPoint,
  WorldProp,
  WorldScene,
  WorldTransform,
} from './types';

const cloneScene = (scene: WorldScene): WorldScene => structuredClone(scene);

export function createEmptyScene(id: string): WorldScene {
  return {
    version: 1,
    id,
    name: 'Untitled world',
    items: [],
    groups: [],
  };
}

export function defaultId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `world-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function addProp(
  scene: WorldScene,
  assetRef: string,
  transform: WorldTransform,
  id: string,
  relations: Pick<WorldProp, 'parentId' | 'supportId'> = {}
): WorldScene {
  if (entityById(scene, id)) throw new Error(`Identity already exists: ${id}`);
  return {
    ...cloneScene(scene),
    items: [
      ...scene.items.map((item) => structuredClone(item)),
      {
        id,
        kind: 'prop',
        assetRef,
        label: refLabel(assetRef),
        transform: { ...transform },
        ...relations,
      },
    ],
  };
}

export function entityById(
  scene: WorldScene,
  id: string
): WorldProp | WorldGroup | undefined {
  return (
    scene.items.find((item) => item.id === id) ??
    scene.groups.find((group) => group.id === id)
  );
}

function childIds(scene: WorldScene, id: string): string[] {
  return [
    ...scene.groups
      .filter((group) => group.parentId === id)
      .map((group) => group.id),
    ...scene.items
      .filter((item) => item.parentId === id || item.supportId === id)
      .map((item) => item.id),
  ];
}

export function selectionClosure(
  scene: WorldScene,
  selectedIds: readonly string[]
): Set<string> {
  const included = new Set<string>();
  const visit = (id: string) => {
    if (included.has(id) || !entityById(scene, id)) return;
    included.add(id);
    childIds(scene, id).forEach(visit);
  };
  selectedIds.forEach(visit);
  return included;
}

function mapTransforms(
  scene: WorldScene,
  included: ReadonlySet<string>,
  update: (transform: WorldTransform) => WorldTransform
): WorldScene {
  return {
    ...scene,
    items: scene.items.map((item) =>
      included.has(item.id)
        ? { ...item, transform: update(item.transform) }
        : item
    ),
    groups: scene.groups.map((group) =>
      included.has(group.id)
        ? { ...group, transform: update(group.transform) }
        : group
    ),
  };
}

export function moveSelection(
  scene: WorldScene,
  selectedIds: readonly string[],
  delta: Pick<WorldTransform, 'x' | 'y' | 'z'>
): WorldScene {
  const included = selectionClosure(scene, selectedIds);
  return mapTransforms(scene, included, (transform) => ({
    ...transform,
    x: transform.x + delta.x,
    y: transform.y + delta.y,
    z: transform.z + delta.z,
  }));
}

function rotatedAround(
  transform: WorldTransform,
  pivot: WorldTransform,
  angle: number
): WorldTransform {
  const x = transform.x - pivot.x;
  const z = transform.z - pivot.z;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    ...transform,
    // Match Three.js's right-handed positive-Y yaw: +X turns toward -Z.
    x: pivot.x + x * cos + z * sin,
    z: pivot.z - x * sin + z * cos,
    rotationY: transform.rotationY + angle,
  };
}

function topLevelSelectedIds(
  scene: WorldScene,
  selectedIds: readonly string[]
): string[] {
  const selected = new Set(selectedIds);
  return [...selected].sort().filter((candidate) => {
    const entity = entityById(scene, candidate);
    if (!entity) return false;
    const parents =
      entity.kind === 'prop'
        ? [entity.parentId, entity.supportId]
        : [entity.parentId];
    const frontier = parents.filter((id): id is string => !!id);
    const visited = new Set<string>();
    while (frontier.length > 0) {
      const parentId = frontier.pop()!;
      if (selected.has(parentId)) return false;
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      const parent = entityById(scene, parentId);
      if (parent?.parentId) frontier.push(parent.parentId);
      if (parent?.kind === 'prop' && parent.supportId) {
        frontier.push(parent.supportId);
      }
    }
    return true;
  });
}

export function rotateSelection(
  scene: WorldScene,
  selectedIds: readonly string[],
  angle: number
): WorldScene {
  const roots = topLevelSelectedIds(scene, selectedIds);
  if (roots.length === 0) return scene;
  const pivot = selectionCenter(scene, roots);
  const included = selectionClosure(scene, roots);
  // Build one transform plan from the original scene. A prop can be reachable
  // through both a group and a support, but the union ensures it rotates once.
  return mapTransforms(scene, included, (transform) =>
    rotatedAround(transform, pivot, angle)
  );
}

function selectionCenter(
  scene: WorldScene,
  ids: readonly string[]
): WorldTransform {
  const transforms = ids.flatMap((id) => {
    const entity = entityById(scene, id);
    return entity ? [entity.transform] : [];
  });
  if (transforms.length === 0) {
    throw new Error('Select at least one scene object.');
  }
  const total = transforms.reduce(
    (sum, transform) => ({
      x: sum.x + transform.x,
      y: sum.y + transform.y,
      z: sum.z + transform.z,
    }),
    { x: 0, y: 0, z: 0 }
  );
  return {
    x: total.x / transforms.length,
    y: total.y / transforms.length,
    z: total.z / transforms.length,
    rotationY: 0,
  };
}

export function selectionPivot(
  scene: WorldScene,
  selectedIds: readonly string[]
): WorldTransform | null {
  const roots = topLevelSelectedIds(scene, selectedIds);
  return roots.length > 0 ? selectionCenter(scene, roots) : null;
}

export function previewSelectionTransform(
  scene: WorldScene,
  selectedIds: readonly string[],
  mode: 'move' | 'rotate',
  change: Pick<WorldTransform, 'x' | 'y' | 'z' | 'rotationY'>
): WorldScene {
  return mode === 'move'
    ? moveSelection(scene, selectedIds, change)
    : rotateSelection(scene, selectedIds, change.rotationY);
}

export function groupSelection(
  scene: WorldScene,
  selectedIds: readonly string[],
  groupId: string,
  label: string
): WorldScene {
  const exact = [...new Set(selectedIds)].filter((id) => entityById(scene, id));
  if (exact.length < 2)
    throw new Error('Select at least two objects to group.');
  if (entityById(scene, groupId))
    throw new Error(`Identity already exists: ${groupId}`);
  if (exact.some((id) => entityById(scene, id)?.parentId)) {
    throw new Error('Ungroup nested members before creating a new group.');
  }
  const group: WorldGroup = {
    id: groupId,
    kind: 'group',
    label: label.trim() || 'Arrangement group',
    transform: selectionCenter(scene, exact),
  };
  return {
    ...scene,
    items: scene.items.map((item) =>
      exact.includes(item.id) ? { ...item, parentId: groupId } : item
    ),
    groups: [
      ...scene.groups.map((existing) =>
        exact.includes(existing.id)
          ? { ...existing, parentId: groupId }
          : existing
      ),
      group,
    ],
  };
}

export function ungroup(scene: WorldScene, groupId: string): WorldScene {
  if (!scene.groups.some((group) => group.id === groupId)) return scene;
  return {
    ...scene,
    items: scene.items.map((item) =>
      item.parentId === groupId ? { ...item, parentId: undefined } : item
    ),
    groups: scene.groups
      .filter((group) => group.id !== groupId)
      .map((group) =>
        group.parentId === groupId ? { ...group, parentId: undefined } : group
      ),
  };
}

function remappedRelation(
  relation: string | undefined,
  idMap: ReadonlyMap<string, string>,
  keepExternal: boolean
): string | undefined {
  if (!relation) return undefined;
  return idMap.get(relation) ?? (keepExternal ? relation : undefined);
}

function copyEntities(
  scene: WorldScene,
  included: ReadonlySet<string>,
  idFactory: IdFactory,
  keepExternalRelations: boolean,
  forbiddenIds: readonly string[] = []
): {
  items: WorldProp[];
  groups: WorldGroup[];
  idMap: Map<string, string>;
  createdIds: string[];
} {
  const sourceItems = scene.items.filter((item) => included.has(item.id));
  const sourceGroups = scene.groups.filter((group) => included.has(group.id));
  const idMap = new Map<string, string>();
  const createdIds: string[] = [];
  const usedIds = new Set([
    ...scene.items.map((item) => item.id),
    ...scene.groups.map((group) => group.id),
    ...forbiddenIds,
  ]);
  [...sourceItems, ...sourceGroups].forEach((entity) => {
    const next = idFactory();
    if (!next || usedIds.has(next)) {
      throw new Error('ID factory returned a duplicate identity.');
    }
    usedIds.add(next);
    idMap.set(entity.id, next);
    createdIds.push(next);
  });
  const items = sourceItems.map((item) => ({
    ...structuredClone(item),
    id: idMap.get(item.id)!,
    parentId: remappedRelation(item.parentId, idMap, keepExternalRelations),
    supportId: remappedRelation(item.supportId, idMap, keepExternalRelations),
  }));
  const groups = sourceGroups.map((group) => ({
    ...structuredClone(group),
    id: idMap.get(group.id)!,
    parentId: remappedRelation(group.parentId, idMap, keepExternalRelations),
  }));
  return { items, groups, idMap, createdIds };
}

export function duplicateSelection(
  scene: WorldScene,
  selectedIds: readonly string[],
  idFactory: IdFactory = defaultId
): { scene: WorldScene; createdIds: string[] } {
  const included = selectionClosure(scene, selectedIds);
  const copied = copyEntities(scene, included, idFactory, false);
  const shiftedItems = copied.items.map((item) => ({
    ...item,
    transform: {
      ...item.transform,
      x: item.transform.x + 0.45,
      z: item.transform.z + 0.45,
    },
  }));
  const shiftedGroups = copied.groups.map((group) => ({
    ...group,
    transform: {
      ...group.transform,
      x: group.transform.x + 0.45,
      z: group.transform.z + 0.45,
    },
  }));
  return {
    scene: {
      ...scene,
      items: [...scene.items, ...shiftedItems],
      groups: [...scene.groups, ...shiftedGroups],
    },
    createdIds: copied.createdIds,
  };
}

export function deleteSelection(
  scene: WorldScene,
  selectedIds: readonly string[]
): WorldScene {
  const included = selectionClosure(scene, selectedIds);
  return {
    ...scene,
    items: scene.items.filter((item) => !included.has(item.id)),
    groups: scene.groups.filter((group) => !included.has(group.id)),
  };
}

export function saveArrangement(
  scene: WorldScene,
  selectedIds: readonly string[],
  id: string,
  name: string,
  createdAt = new Date().toISOString()
): Arrangement {
  const included = selectionClosure(scene, selectedIds);
  if (included.size === 0) throw new Error('Select scene objects to save.');
  const selectedEntities = [...included]
    .map((entityId) => entityById(scene, entityId))
    .filter((entity): entity is WorldProp | WorldGroup => !!entity);
  const pivot = selectionCenter(scene, topLevelSelectedIds(scene, selectedIds));
  const localTransform = (transform: WorldTransform): WorldTransform => ({
    ...transform,
    // Arrangement X/Z are pivot-local, while Y remains authored height above
    // the shared floor. stampArrangement likewise adds only X/Z.
    x: transform.x - pivot.x,
    y: transform.y,
    z: transform.z - pivot.z,
  });
  return {
    version: 1,
    id,
    name: name.trim() || 'Untitled arrangement',
    createdAt,
    items: selectedEntities
      .filter((entity): entity is WorldProp => entity.kind === 'prop')
      .map((item) => ({
        ...structuredClone(item),
        transform: localTransform(item.transform),
        parentId: included.has(item.parentId ?? '') ? item.parentId : undefined,
        supportId: included.has(item.supportId ?? '')
          ? item.supportId
          : undefined,
      })),
    groups: selectedEntities
      .filter((entity): entity is WorldGroup => entity.kind === 'group')
      .map((group) => ({
        ...structuredClone(group),
        transform: localTransform(group.transform),
        parentId: included.has(group.parentId ?? '')
          ? group.parentId
          : undefined,
      })),
  };
}

export function stampArrangement(
  scene: WorldScene,
  arrangement: Arrangement,
  point: WorldPoint,
  idFactory: IdFactory = defaultId
): { scene: WorldScene; createdIds: string[] } {
  const templateScene: WorldScene = {
    version: 1,
    id: arrangement.id,
    name: arrangement.name,
    items: arrangement.items,
    groups: arrangement.groups,
  };
  const included = new Set([
    ...arrangement.items.map((item) => item.id),
    ...arrangement.groups.map((group) => group.id),
  ]);
  const copied = copyEntities(templateScene, included, idFactory, false, [
    ...scene.items.map((item) => item.id),
    ...scene.groups.map((group) => group.id),
  ]);
  const atPoint = <T extends WorldProp | WorldGroup>(entity: T): T => ({
    ...entity,
    transform: {
      ...entity.transform,
      x: entity.transform.x + point.x,
      z: entity.transform.z + point.z,
    },
  });
  return {
    scene: {
      ...scene,
      items: [...scene.items, ...copied.items.map(atPoint)],
      groups: [...scene.groups, ...copied.groups.map(atPoint)],
    },
    createdIds: copied.createdIds,
  };
}

export function createHistory(scene: WorldScene): SceneHistory {
  return { past: [], present: cloneScene(scene), future: [] };
}

export function updateHistory(
  history: SceneHistory,
  next: WorldScene
): SceneHistory {
  return {
    past: [...history.past, history.present].slice(-80),
    present: cloneScene(next),
    future: [],
  };
}

export function undoHistory(history: SceneHistory): SceneHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: cloneScene(previous),
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: SceneHistory): SceneHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present].slice(-80),
    present: cloneScene(next),
    future: history.future.slice(1),
  };
}
