/**
 * A PLACE IN THE FILE, IN WORDS (rpg-project#983). The engine and the
 * server name places by path (`room.room.monsterBindings.gate-1.options[1]
 * .failure[0].recognize`); an author reads them as words from the dialect's
 * own grammar and the draft: "gate-1 · line `straggler` · on a miss ·
 * recognize". The thing comes first by its id, then each place inside it,
 * ids in code style. It names a LOCATION only — never what runs there. A
 * shape it does not know falls back to its last two segments in words.
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { segmentsOf } from './refusalJump';

type Segment = string | number;

const SEP = ' · ';
const code = (id: string): string => `\`${id}\``;

const VERDICTS: Record<string, string> = {
  success: 'on a win',
  failure: 'on a miss',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The words for the places inside a creature, a prop or a faction: its
 * lines, their verdict rows, its posts and the rest by name. */
function insideWords(rest: readonly Segment[], owner: unknown): string[] {
  const words: string[] = [];
  let index = 0;
  const options = isRecord(owner) ? owner.options : undefined;
  while (index < rest.length) {
    const head = rest[index];
    const next = rest[index + 1];
    if (head === 'options' && typeof next === 'number') {
      const option = Array.isArray(options) ? options[next] : undefined;
      const id =
        isRecord(option) && typeof option.id === 'string'
          ? option.id
          : String(next + 1);
      words.push(`line ${code(id)}`);
      index += 2;
      const verdict = rest[index];
      if (typeof verdict === 'string' && VERDICTS[verdict]) {
        const row = rest[index + 1];
        words.push(
          typeof row === 'number' && row > 0
            ? `${VERDICTS[verdict]}, row ${row + 1}`
            : VERDICTS[verdict]!
        );
        index += typeof row === 'number' ? 2 : 1;
      }
      continue;
    }
    if (head === 'posts' && typeof next === 'string') {
      words.push(`post in ${code(next)}`);
      index += 2;
      continue;
    }
    if (head === 'behaviors' && typeof next === 'number') {
      words.push('behaviour');
      index += 2;
      continue;
    }
    words.push(wordOf(head, next));
    index += typeof next === 'number' ? 2 : 1;
  }
  return words;
}

/** A segment in words: `blockingStates` "blocking states", `requires[1]`
 * "requires 2". */
function wordOf(head: Segment | undefined, next?: Segment): string {
  const word = String(head ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return typeof next === 'number' ? `${word} ${next + 1}` : word;
}

/** The last two segments in words, for a shape this does not know. */
function fallback(segments: readonly Segment[]): string {
  const words: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (typeof segment === 'number') continue;
    words.push(wordOf(segment, segments[i + 1]));
  }
  return words.slice(-2).join(SEP) || 'the whole file';
}

function behaviourWords(rest: readonly Segment[]): string[] {
  const words: string[] = [];
  let index = 0;
  if (rest[0] === 'recipe') index = 1;
  if (rest[index] === 'states' && typeof rest[index + 1] === 'string') {
    words.push(`in ${code(String(rest[index + 1]))}`);
    index += 2;
    const kind = rest[index];
    const at = rest[index + 1];
    if (kind === 'transitions' && typeof at === 'number') {
      words.push(`transition ${at + 1}`);
      index += 2;
    }
  } else if (rest[0] === 'table' && typeof rest[1] === 'string') {
    const row = rest[2];
    words.push(
      typeof row === 'number'
        ? `${code(rest[1])} row ${row + 1}`
        : `${code(rest[1])} rows`
    );
    index = typeof row === 'number' ? 3 : 2;
  }
  for (; index < rest.length; index++) {
    const segment = rest[index]!;
    if (typeof segment === 'number') continue;
    words.push(wordOf(segment, rest[index + 1]));
  }
  return words;
}

export function placeName(
  path: string,
  document: Readonly<RoomDraftDocument>
): string {
  const trimmed = path.trim();
  if (trimmed === '') return 'the whole file';
  if (trimmed === '(engine rule)') return 'an engine rule';
  const segments = segmentsOf(trimmed);
  if (!segments || segments.length === 0) return trimmed;
  const [head, key] = segments;
  const scope = document.scope;
  const room = document.draft.room;
  const join = (words: readonly string[]): string => words.join(SEP);
  if (head === 'room' && segments[1] === 'room') {
    const [field, id, ...rest] = segments.slice(2);
    switch (field) {
      case 'monsterBindings':
        return typeof id === 'string'
          ? join([id, ...insideWords(rest, room.monsterBindings?.[id])])
          : fallback(segments);
      case 'monsterDeclarations':
        return typeof id === 'number' && room.monsterDeclarations[id]
          ? join([
              room.monsterDeclarations[id]!.id,
              ...insideWords(rest, undefined),
            ])
          : fallback(segments);
      case 'propBindings':
      case 'propDeclarations':
        return typeof id === 'string'
          ? join([
              id,
              ...insideWords(
                rest,
                (room.propBindings as Record<string, unknown> | undefined)?.[id]
              ),
            ])
          : fallback(segments);
      case 'doorBindings':
        return typeof id === 'string'
          ? join([`door ${code(id)}`, ...insideWords(rest, undefined)])
          : fallback(segments);
      case 'regions': {
        const region = typeof id === 'number' ? room.regions[id] : undefined;
        return region
          ? join([
              `region ${code(region.name || region.id)}`,
              ...insideWords(rest, undefined),
            ])
          : 'regions';
      }
      case 'walls':
        return typeof id === 'number' ? `wall ${id + 1}` : 'walls';
      case 'partyStart':
        return 'party start';
      default:
        return fallback(segments);
    }
  }
  const rest = segments.slice(2);
  switch (head) {
    case 'key':
      return 'the site key';
    case 'intel': {
      const record = typeof key === 'number' ? scope.intel?.[key] : undefined;
      return record
        ? join([`record ${code(record.id)}`, ...insideWords(rest, undefined)])
        : fallback(segments);
    }
    case 'factions': {
      const faction =
        typeof key === 'number'
          ? scope.factions?.[key]
          : scope.factions?.find((entry) => entry.id === key);
      return faction
        ? join([faction.id, ...insideWords(rest, faction)])
        : fallback(segments);
    }
    case 'dispositions': {
      const disposition =
        typeof key === 'number' ? scope.dispositions?.[key] : undefined;
      return disposition
        ? join([
            `how ${disposition.between.map(code).join(' and ')} stand`,
            ...insideWords(rest, undefined),
          ])
        : fallback(segments);
    }
    case 'endings': {
      const ending = typeof key === 'number' ? scope.endings?.[key] : undefined;
      return ending
        ? join([`ending ${code(ending.id)}`, ...insideWords(rest, undefined)])
        : fallback(segments);
    }
    case 'exits': {
      const exit = typeof key === 'number' ? scope.exits?.[key] : undefined;
      return exit
        ? join([`exit ${code(exit.id)}`, ...insideWords(rest, undefined)])
        : fallback(segments);
    }
    case 'concealments':
      return typeof key === 'string'
        ? join([`secret ${code(key)}`, ...insideWords(rest, undefined)])
        : 'secrets';
    case 'interactions':
      return typeof key === 'string'
        ? join([`conversation ${code(key)}`, ...insideWords(rest, undefined)])
        : 'conversations';
    case 'bundles':
      return typeof key === 'string'
        ? join([`bundle ${code(key)}`, ...insideWords(rest, undefined)])
        : 'bundles';
    case 'templates':
      return typeof key === 'string'
        ? join([`stat block ${code(key)}`, ...insideWords(rest, undefined)])
        : 'stat blocks';
    case 'behaviorDefinitions':
      return typeof key === 'string'
        ? join([key, ...behaviourWords(segments.slice(2))])
        : 'behaviours';
    default:
      return fallback(segments);
  }
}
