import { parseRef } from '@/utils/refs';
import { objectShape, rejectUnknownKeys } from './strictShape';
import type { WorldScene } from './types';

/** Editor palette recipe, not a live actor or an additional stat block. */
export interface CreaturePaletteEntry {
  id: string;
  name: string;
  ref: string;
  /** Absent uses the standard monster appearance; never changes its rules ref. */
  modelRef?: string;
  /** The cast member's default faction, stamped onto a new placement's
   * binding (rpg-project#575 decision 1). Studio presentation only: the
   * toolkit carries room.scene through unread. */
  faction?: string;
}
export function validateCreaturePalette(
  value: unknown
): CreaturePaletteEntry[] {
  if (!Array.isArray(value))
    throw new Error('scene.creaturePalette must be a list.');
  const ids = new Set<string>();
  return value.map((item, index) => {
    const path = `scene.creaturePalette[${index}]`;
    const entry = objectShape(item, path);
    rejectUnknownKeys(
      entry,
      ['id', 'name', 'ref', 'modelRef', 'faction'],
      path
    );
    for (const key of ['id', 'name', 'faction'] as const) {
      if (key === 'faction' && !Object.hasOwn(entry, key)) continue;
      if (
        typeof entry[key] !== 'string' ||
        !entry[key].trim() ||
        entry[key].length > 120
      )
        throw new Error(
          `${path}.${key} must be nonblank text up to 120 characters.`
        );
    }
    const id = entry.id as string;
    if (ids.has(id)) throw new Error(`${path}.id is duplicated.`);
    ids.add(id);
    if (
      typeof entry.ref !== 'string' ||
      parseRef(entry.ref)?.type !== 'monsters'
    )
      throw new Error(`${path}.ref must be a monster reference.`);
    if (
      Object.hasOwn(entry, 'modelRef') &&
      (typeof entry.modelRef !== 'string' || !parseRef(entry.modelRef))
    )
      throw new Error(`${path}.modelRef must be an appearance reference.`);
    return {
      id,
      name: entry.name as string,
      ref: entry.ref,
      ...(Object.hasOwn(entry, 'modelRef')
        ? { modelRef: entry.modelRef as string }
        : {}),
      ...(Object.hasOwn(entry, 'faction')
        ? { faction: entry.faction as string }
        : {}),
    };
  });
}
/** Per-instance authoring labels. Never used as runtime/rulebook names. */
export function validateActorNames(value: unknown): Record<string, string> {
  const names = objectShape(value, 'scene.actorNames');
  return Object.fromEntries(
    Object.entries(names).map(([id, name]) => {
      if (
        !id.trim() ||
        id.length > 120 ||
        typeof name !== 'string' ||
        !name.trim() ||
        name.length > 120
      )
        throw new Error(
          'Actor map names and ids must be nonblank text up to 120 characters.'
        );
      return [id, name];
    })
  );
}
export function authoredActorName(
  names: Readonly<Record<string, string>> | undefined,
  id: string
): string | undefined {
  return names && Object.hasOwn(names, id) ? names[id] : undefined;
}
export function setActorName(
  scene: WorldScene,
  id: string,
  name: string | null
): WorldScene {
  const current = authoredActorName(scene.actorNames, id);
  if ((name === null && current === undefined) || name === current)
    return scene;
  if (name !== null) validateActorNames({ [id]: name });
  const names = { ...scene.actorNames };
  if (name === null) delete names[id];
  else names[id] = name;
  const next: WorldScene = {
    ...scene,
    version: scene.version >= 5 ? scene.version : 5,
  };
  if (Object.keys(names).length) next.actorNames = names;
  else delete next.actorNames;
  return next;
}

export function setCreaturePalette(
  scene: WorldScene,
  entries: readonly CreaturePaletteEntry[]
): WorldScene {
  const valid = validateCreaturePalette(entries);
  if (JSON.stringify(valid) === JSON.stringify(scene.creaturePalette ?? []))
    return scene;
  const next: WorldScene = {
    ...scene,
    version: scene.version >= 5 ? scene.version : 5,
  };
  if (valid.length) next.creaturePalette = valid;
  else delete next.creaturePalette;
  return next;
}
