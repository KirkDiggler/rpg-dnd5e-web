/**
 * THE ONE PARSER FOR THE DIALECT'S PATHS (rpg-project#983). The engine and
 * the server name a place in the file by path (`room.room.monsterBindings
 * .gate-1.options[1].failure[0]`, `intel[4]`, `factions[1].options[0]`).
 * `locate` reads such a path once: which THING holds it (its kind, its id,
 * the entry the draft holds for it) and the REST of the path inside that
 * thing. Everything that turns a path into something else goes through
 * here:
 *
 * - `targetOfPath` (refusalJump.ts): the studio selection a jump makes;
 * - `keyOfPath` (revealKey.ts): the reveal key a jump lands on;
 * - `placeName` (placeName.ts): the place in words.
 *
 * A path whose thing the draft no longer holds (a stale index, a removed
 * id) locates to nothing: the callers say it as a sentence or in the
 * path's own words, never as an invented thing.
 *
 * TO ADD A NEW KIND OF THING: add its head here (one `case`, returning its
 * kind, id and entry), then teach each caller what it means — a target in
 * `targetOfPath`, words in `placeName` — and register its item under
 * `{kind, id}` (see CONTRACT.md, "Reveal").
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';

export type Segment = string | number;

/** `a.b[2].c` → `['a', 'b', 2, 'c']`. Null for a path that is not a field
 * path at all (`line 12`, prose, empty). */
export function segmentsOf(path: string): Segment[] | null {
  const trimmed = path.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const out: Segment[] = [];
  for (const part of trimmed.split('.')) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!match) return null;
    if (match[1]) out.push(match[1]);
    for (const index of match[2].matchAll(/\[(\d+)\]/g))
      out.push(Number(index[1]));
  }
  return out;
}

export type LocatedKind =
  | 'creature'
  | 'prop'
  | 'door'
  | 'region'
  | 'wall'
  | 'partyStart'
  | 'exit'
  | 'template'
  | 'routine'
  | 'bundle'
  | 'concealment'
  | 'faction'
  | 'disposition'
  | 'record'
  | 'ending'
  | 'conversation'
  | 'table'
  | 'key';

export interface Located {
  kind: LocatedKind;
  /** The thing's id; a disposition's is its index, a wall's its id. */
  id: string;
  /** The rest of the path inside the thing. */
  rest: Segment[];
  /** What the draft holds for it, where it holds an entry. */
  entry?: unknown;
  /** Its index, for a thing the file writes in a list. */
  index?: number;
}

const has = (map: unknown, key: Segment | undefined): key is string =>
  typeof key === 'string' &&
  map !== null &&
  typeof map === 'object' &&
  Object.hasOwn(map, key);

function locateRoom(
  rest: Segment[],
  document: Readonly<RoomDraftDocument>
): Located | null {
  const [field, key, ...inside] = rest;
  const room = document.draft.room;
  switch (field) {
    case 'monsterBindings':
      return typeof key === 'string' &&
        room.monsterDeclarations.some((monster) => monster.id === key)
        ? {
            kind: 'creature',
            id: key,
            rest: inside,
            entry: room.monsterBindings?.[key],
          }
        : null;
    case 'monsterDeclarations': {
      const monster =
        typeof key === 'number' ? room.monsterDeclarations[key] : undefined;
      return monster
        ? {
            kind: 'creature',
            id: monster.id,
            rest: inside,
            entry: room.monsterBindings?.[monster.id],
            index: key as number,
          }
        : null;
    }
    case 'propBindings':
    case 'propDeclarations':
      return typeof key === 'string' &&
        document.draft.scene.items.some((item) => item.id === key)
        ? {
            kind: 'prop',
            id: key,
            rest: inside,
            entry: (room.propBindings as Record<string, unknown> | undefined)?.[
              key
            ],
          }
        : null;
    case 'doorBindings':
      return typeof key === 'string' && doorExists(document, key)
        ? { kind: 'door', id: key, rest: inside }
        : null;
    case 'regions': {
      const region = typeof key === 'number' ? room.regions[key] : undefined;
      return region
        ? {
            kind: 'region',
            id: region.id,
            rest: inside,
            entry: region,
            index: key as number,
          }
        : null;
    }
    case 'walls': {
      const wall = typeof key === 'number' ? room.walls?.[key] : undefined;
      if (!wall) return null;
      // `walls[i].openings[j].door…` is that door.
      const [openings, at, door, ...tail] = inside;
      const opening =
        openings === 'openings' && typeof at === 'number'
          ? wall.openings[at]
          : undefined;
      if (door === 'door' && opening?.door?.id)
        return { kind: 'door', id: opening.door.id, rest: tail };
      return {
        kind: 'wall',
        id: wall.id,
        rest: inside,
        entry: wall,
        index: key as number,
      };
    }
    case 'partyStart':
      return { kind: 'partyStart', id: 'partyStart', rest: rest.slice(1) };
    default:
      return null;
  }
}

function doorExists(
  document: Readonly<RoomDraftDocument>,
  doorId: string
): boolean {
  return (document.draft.room.walls ?? []).some((wall) =>
    wall.openings.some((opening) => opening.door?.id === doorId)
  );
}

export function locate(
  path: string,
  document: Readonly<RoomDraftDocument>
): Located | null {
  const segments = segmentsOf(path);
  if (!segments || segments.length === 0) return null;
  const [head, key, ...rest] = segments;
  if (head === 'room' && key === 'room')
    return locateRoom(segments.slice(2), document);
  const scope = document.scope;
  const listed = <T extends { id: string }>(
    kind: LocatedKind,
    list: readonly T[] | undefined
  ): Located | null => {
    const index =
      typeof key === 'number'
        ? key
        : (list?.findIndex((entry) => entry.id === key) ?? -1);
    const entry = index >= 0 ? list?.[index] : undefined;
    return entry ? { kind, id: entry.id, rest, entry, index } : null;
  };
  const named = (kind: LocatedKind, map: unknown): Located | null =>
    has(map, key)
      ? {
          kind,
          id: key,
          rest,
          entry: (map as Record<string, unknown>)[key],
        }
      : null;
  switch (head) {
    case 'key':
      return { kind: 'key', id: 'key', rest: segments.slice(1) };
    case 'exits':
      return listed('exit', scope.exits);
    case 'factions':
      return listed('faction', scope.factions);
    case 'intel':
      return listed('record', scope.intel);
    case 'endings':
      return listed('ending', scope.endings);
    case 'dispositions': {
      const entry =
        typeof key === 'number' ? scope.dispositions?.[key] : undefined;
      return entry
        ? {
            kind: 'disposition',
            id: String(key),
            rest,
            entry,
            index: key as number,
          }
        : null;
    }
    case 'templates':
      return named('template', scope.templates);
    case 'behaviorDefinitions':
      return named('routine', scope.unread?.behaviorDefinitions);
    case 'bundles':
      return named('bundle', scope.bundles);
    case 'concealments':
      return named('concealment', scope.concealments);
    case 'interactions':
      return named('conversation', scope.unread?.interactions);
    case 'tables':
      return named('table', scope.tables);
    default:
      return null;
  }
}
