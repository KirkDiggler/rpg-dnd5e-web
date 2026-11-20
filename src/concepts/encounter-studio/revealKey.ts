/**
 * WHERE A JUMP LANDS, AS A REVEAL KEY (rpg-project#983). The same path map
 * that turns a file path into a selection (`targetOfPath`) turns it into the
 * key of the item that shows it: the thing (`{kind, id}`) and, where the
 * path names one, the place inside it (`part`, the rest of the path in the
 * file's own form). Items register under keys built the same way, so a
 * jump's key and an item's key always agree.
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { locate, type Segment } from './locatePath';
import { placeName } from './placeName';
import type { RefusalTarget } from './refusalJump';
import type { RevealKey } from './useReveal';

/** `options[1].failure[0].give` back from segments. */
export function partOf(rest: readonly Segment[]): string | undefined {
  let out = '';
  for (const segment of rest)
    out +=
      typeof segment === 'number'
        ? `[${segment}]`
        : `${out === '' ? '' : '.'}${segment}`;
  return out === '' ? undefined : out;
}

const keyed = (
  kind: string,
  id: string,
  rest: readonly Segment[]
): RevealKey => {
  const part = partOf(rest);
  return part ? { kind, id, part } : { kind, id };
};

export function keyOfPath(
  path: string,
  document: Readonly<RoomDraftDocument>
): RevealKey | null {
  const located = locate(path, document);
  if (!located) return null;
  switch (located.kind) {
    case 'wall':
    case 'partyStart':
    case 'key':
      return null;
    default:
      return keyed(located.kind, located.id, located.rest);
  }
}

/** The kind each Encounter section's items register under. */
const SECTION_KINDS: Record<string, string> = {
  factions: 'faction',
  dispositions: 'disposition',
  intel: 'record',
  concealments: 'concealment',
  interactions: 'conversation',
  bundles: 'bundle',
  behaviours: 'routine',
};

/** The thing a target selects or opens, when no path names a place in it. */
export function keyOfTarget(target: RefusalTarget): RevealKey | null {
  switch (target.kind) {
    case 'creature':
    case 'prop':
    case 'region':
    case 'ending':
      return { kind: target.kind, id: target.id };
    case 'door':
      return { kind: 'door', id: target.target.doorId };
    case 'castMember':
      return { kind: 'cast', id: target.ref };
    case 'hex':
      return null;
    case 'home': {
      const kind = SECTION_KINDS[target.section];
      return kind && target.id ? { kind, id: target.id } : null;
    }
    default:
      return null;
  }
}

/** A key's place in the file, the inverse of `keyOfPath` for the kinds a
 * file path names; null for a kind the file has no path for (a hub, a join,
 * a cast member). */
export function pathOfKey(
  key: RevealKey,
  document: Readonly<RoomDraftDocument>
): string | null {
  const scope = document.scope;
  const indexIn = (list: readonly { id: string }[] | undefined): number =>
    list?.findIndex((entry) => entry.id === key.id) ?? -1;
  const listed = (
    head: string,
    list: readonly { id: string }[] | undefined
  ) => {
    const index = indexIn(list);
    return index >= 0 ? `${head}[${index}]` : null;
  };
  const base = ((): string | null => {
    switch (key.kind) {
      case 'creature':
        return `room.room.monsterBindings.${key.id}`;
      case 'prop':
        return `room.room.propBindings.${key.id}`;
      case 'door':
        return `room.room.doorBindings.${key.id}`;
      case 'region':
        return listed('room.room.regions', document.draft.room.regions);
      case 'faction':
        return listed('factions', scope.factions);
      case 'record':
        return listed('intel', scope.intel);
      case 'ending':
        return listed('endings', scope.endings);
      case 'exit':
        return listed('exits', scope.exits);
      case 'disposition':
        return `dispositions[${key.id}]`;
      case 'concealment':
        return `concealments.${key.id}`;
      case 'conversation':
        return `interactions.${key.id}`;
      case 'shared-lines':
        return `conversations.${key.id}`;
      case 'bundle':
        return `bundles.${key.id}`;
      case 'routine':
        return `behaviorDefinitions.${key.id}`;
      case 'template':
        return `templates.${key.id}`;
      case 'table':
        return `tables.${key.id}`;
      default:
        return null;
    }
  })();
  if (!base) return null;
  if (!key.part) return base;
  return key.part.startsWith('[')
    ? `${base}${key.part}`
    : `${base}.${key.part}`;
}

/** The words a revealed item is announced by: its place, or its kind and
 * id where the file has no path for it. */
export function nameOfKey(
  key: RevealKey,
  document: Readonly<RoomDraftDocument>
): string {
  const path = pathOfKey(key, document);
  return path ? placeName(path, document) : `${key.kind} ${key.id}`;
}
