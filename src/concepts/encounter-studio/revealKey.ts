/**
 * WHERE A JUMP LANDS, AS A REVEAL KEY (rpg-project#983). The same path map
 * that turns a file path into a selection (`targetOfPath`) turns it into the
 * key of the item that shows it: the thing (`{kind, id}`) and, where the
 * path names one, the place inside it (`part`, the rest of the path in the
 * file's own form). Items register under keys built the same way, so a
 * jump's key and an item's key always agree.
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { segmentsOf, type RefusalTarget } from './refusalJump';
import type { RevealKey } from './useReveal';

type Segment = string | number;

/** `options[1].failure[0].recognize` back from segments. */
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
  const segments = segmentsOf(path);
  if (!segments || segments.length === 0) return null;
  const [head, key, ...rest] = segments;
  const scope = document.scope;
  if (head === 'room' && key === 'room') {
    const [field, id, ...inside] = rest;
    const room = document.draft.room;
    switch (field) {
      case 'monsterBindings':
        return typeof id === 'string' ? keyed('creature', id, inside) : null;
      case 'monsterDeclarations': {
        const monster =
          typeof id === 'number' ? room.monsterDeclarations[id] : undefined;
        return monster ? keyed('creature', monster.id, inside) : null;
      }
      case 'propBindings':
      case 'propDeclarations':
        return typeof id === 'string' ? keyed('prop', id, inside) : null;
      case 'doorBindings':
        return typeof id === 'string' ? keyed('door', id, inside) : null;
      case 'regions': {
        const region = typeof id === 'number' ? room.regions[id] : undefined;
        return region ? keyed('region', region.id, inside) : null;
      }
      default:
        return null;
    }
  }
  const byIndex = <T extends { id: string }>(
    kind: string,
    list: readonly T[] | undefined
  ): RevealKey | null => {
    const entry =
      typeof key === 'number'
        ? list?.[key]
        : list?.find((candidate) => candidate.id === key);
    return entry ? keyed(kind, entry.id, rest) : null;
  };
  const byName = (kind: string): RevealKey | null =>
    typeof key === 'string' ? keyed(kind, key, rest) : null;
  switch (head) {
    case 'factions':
      return byIndex('faction', scope.factions);
    case 'intel':
      return byIndex('record', scope.intel);
    case 'endings':
      return byIndex('ending', scope.endings);
    case 'exits':
      return byIndex('exit', scope.exits);
    case 'dispositions':
      return typeof key === 'number' && scope.dispositions?.[key]
        ? keyed('disposition', String(key), rest)
        : null;
    case 'concealments':
      return byName('concealment');
    case 'interactions':
      return byName('conversation');
    case 'bundles':
      return byName('bundle');
    case 'behaviorDefinitions':
      return byName('routine');
    case 'templates':
      return byName('template');
    default:
      return null;
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
