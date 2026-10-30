/**
 * A SERVER REFUSAL LANDS AT THE THING (rpg-project#545 R17). The server's
 * `FieldError{path, message}` addresses the file as written: the draft under
 * `room.room.*`, the root policies at the root, `line N` for a parse failure
 * and an empty path for a whole-file failure. This maps a path to the studio
 * noun that holds it, by prefix: the longest known head wins and any tail
 * after it is ignored, so a deeper path still lands on its noun. A path with
 * no studio noun, or one naming an id the document no longer holds, is a
 * sentence (`target: null`).
 */
import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type {
  RoomDraftDocument,
  RoomHexCell,
} from '../world-building/roomDraft';
import { rowOfPath } from '../world-building/rowRefusals';
import type { StudioDoorTarget } from '../world-building/studioDoorEditing';

/** The Encounter home sections a refusal opens when the noun has no focus of
 * its own there yet (S6-Q4). */
export type RefusalHomeSection =
  | 'tables'
  | 'bundles'
  | 'factions'
  | 'dispositions'
  | 'intel'
  | 'concealments';

export type RefusalTarget =
  | { kind: 'creature'; id: string }
  | { kind: 'prop'; id: string }
  | { kind: 'door'; target: StudioDoorTarget }
  | { kind: 'hex'; cell: RoomHexCell }
  | { kind: 'castMember'; ref: string }
  | {
      kind: 'home';
      section: RefusalHomeSection;
      id?: string;
      /** The table or bundle row the refusal names, by its path
       * (`tables.<id>.on.time[9]`), which the section opens and scrolls to
       * (rpg-project#720). Absent for a refusal of the whole noun. */
      row?: string;
    }
  | { kind: 'ending'; id: string };

export interface RefusalJump {
  path: string;
  message: string;
  target: RefusalTarget | null;
}

const MONSTER_PREFIX = 'dnd5e:monsters:';

/** `a.b[2].c` → `['a', 'b', 2, 'c']`. Null for a path that is not a field
 * path at all (`line 12`, prose, empty). */
function segmentsOf(path: string): (string | number)[] | null {
  const trimmed = path.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const out: (string | number)[] = [];
  for (const part of trimmed.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) return null;
    if (match[1]) out.push(match[1]);
    for (const index of match[2].matchAll(/\[(\d+)\]/g))
      out.push(Number(index[1]));
  }
  return out;
}

function doorTarget(
  document: Readonly<RoomDraftDocument>,
  doorId: string
): StudioDoorTarget | null {
  for (const wall of document.draft.room.walls ?? [])
    for (const opening of wall.openings)
      if (opening.door?.id === doorId)
        return { kind: 'door', wallId: wall.id, openingId: opening.id, doorId };
  return null;
}

function hasSceneItem(
  document: Readonly<RoomDraftDocument>,
  id: string
): boolean {
  return document.draft.scene.items.some((item) => item.id === id);
}

function roomTarget(
  rest: readonly (string | number)[],
  document: Readonly<RoomDraftDocument>
): RefusalTarget | null {
  const [field, key, , subIndex] = rest;
  const room = document.draft.room;
  switch (field) {
    case 'monsterBindings':
      return typeof key === 'string' &&
        room.monsterDeclarations.some((monster) => monster.id === key)
        ? { kind: 'creature', id: key }
        : null;
    case 'monsterDeclarations': {
      const id =
        typeof key === 'number' ? room.monsterDeclarations[key]?.id : undefined;
      return id ? { kind: 'creature', id } : null;
    }
    case 'propBindings':
    case 'propDeclarations':
      return typeof key === 'string' && hasSceneItem(document, key)
        ? { kind: 'prop', id: key }
        : null;
    case 'doorBindings': {
      const target = typeof key === 'string' ? doorTarget(document, key) : null;
      return target ? { kind: 'door', target } : null;
    }
    case 'walls': {
      // `walls[i].openings[j].door…` is that door; any other wall path has
      // no studio noun of its own here and stays a sentence.
      if (typeof key !== 'number' || rest[2] !== 'openings') return null;
      if (typeof subIndex !== 'number' || rest[4] !== 'door') return null;
      const doorId = room.walls?.[key]?.openings[subIndex]?.door?.id;
      const target = doorId ? doorTarget(document, doorId) : null;
      return target ? { kind: 'door', target } : null;
    }
    default:
      return null;
  }
}

function targetOf(
  path: string,
  document: Readonly<RoomDraftDocument>
): RefusalTarget | null {
  const segments = segmentsOf(path);
  if (!segments || segments.length === 0) return null;
  const [head, key] = segments;
  const scope = document.scope;
  if (head === 'room' && segments[1] === 'room')
    return roomTarget(segments.slice(2), document);
  switch (head) {
    case 'exits': {
      const exit = typeof key === 'number' ? scope.exits?.[key] : undefined;
      return exit ? { kind: 'hex', cell: { ...exit.cell } } : null;
    }
    case 'templates':
      return typeof key === 'string' &&
        scope.templates &&
        Object.hasOwn(scope.templates, key)
        ? { kind: 'castMember', ref: `${MONSTER_PREFIX}${key}` }
        : null;
    case 'tables':
    case 'bundles':
    case 'concealments': {
      const map =
        head === 'tables'
          ? scope.tables
          : head === 'bundles'
            ? scope.bundles
            : scope.concealments;
      if (!(typeof key === 'string' && map && Object.hasOwn(map, key)))
        return null;
      const row = head === 'concealments' ? undefined : rowOfPath(path);
      return row
        ? { kind: 'home', section: head, id: key, row }
        : { kind: 'home', section: head, id: key };
    }
    case 'factions': {
      // The file writes factions as a list (`factions[0]`); a keyed path
      // (`factions.<id>`) is read the same way, by id.
      const faction =
        typeof key === 'number'
          ? scope.factions?.[key]
          : scope.factions?.find((entry) => entry.id === key);
      return faction
        ? { kind: 'home', section: 'factions', id: faction.id }
        : null;
    }
    case 'dispositions':
      // A disposition has no id; the section opens and the sentence names it.
      return typeof key === 'number' && scope.dispositions?.[key]
        ? { kind: 'home', section: 'dispositions' }
        : null;
    case 'intel': {
      const record = typeof key === 'number' ? scope.intel?.[key] : undefined;
      return record ? { kind: 'home', section: 'intel', id: record.id } : null;
    }
    case 'endings': {
      const ending = typeof key === 'number' ? scope.endings?.[key] : undefined;
      return ending ? { kind: 'ending', id: ending.id } : null;
    }
    default:
      return null;
  }
}

/** Every refusal, in the server's order, with the noun it lands on or null. */
export function refusalJumps(
  errors: readonly Pick<FieldError, 'path' | 'message'>[],
  document: Readonly<RoomDraftDocument>
): RefusalJump[] {
  return errors.map((error) => ({
    path: error.path,
    message: error.message,
    target: targetOf(error.path, document),
  }));
}
