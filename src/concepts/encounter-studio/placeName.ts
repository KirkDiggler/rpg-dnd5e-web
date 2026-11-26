/**
 * A PLACE IN THE FILE, IN WORDS (rpg-project#983). The engine and the
 * server name places by path (`room.room.monsterBindings.gate-1.options[1]
 * .failure[0].give`); an author reads them as words from the dialect's
 * own grammar and the draft: "gate-1 · line `straggler` · on a miss ·
 * give". The thing comes first by its id, then each place inside it,
 * ids in code style. It names a LOCATION only — never what runs there. A
 * shape it does not know falls back to its last two segments in words.
 */
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { locate, segmentsOf, type Segment } from './locatePath';

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
  while (index < rest.length) {
    const head = rest[index];
    const next = rest[index + 1];
    // A carrier's `options`, or a conversation's `lines` (rpg-project#1025).
    if ((head === 'options' || head === 'lines') && typeof next === 'number') {
      const list = isRecord(owner) ? owner[head] : undefined;
      const option = Array.isArray(list) ? list[next] : undefined;
      // A line is named by its id; one the draft does not hold (or one with
      // no id) is said by its place, plainly — never an invented id. A
      // `use:` names the conversation whose lines it says.
      words.push(
        isRecord(option) && typeof option.use === 'string'
          ? `the lines of ${code(option.use)}`
          : isRecord(option) && typeof option.id === 'string'
            ? `line ${code(option.id)}`
            : `line ${next + 1}`
      );
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
    // A conversation's outcome (rpg-project#975 C): what follows its
    // entering a state, then which of them.
    if (head === 'outcomes' && typeof next === 'string') {
      words.push(`on entering ${code(next)}`);
      index += 2;
      const item = rest[index];
      if (typeof item === 'number') {
        if (item > 0) words.push(`outcome ${item + 1}`);
        index += 1;
      }
      continue;
    }
    if (head === 'openings' && typeof next === 'number') {
      words.push(`opening ${next + 1}`);
      index += 2;
      continue;
    }
    words.push(wordOf(head, next));
    index += typeof next === 'number' ? 2 : 1;
  }
  return words;
}

/** A field name (`blockingStates`) reads as words; anything else is an id
 * and is shown verbatim, in code style. */
const FIELD = /^[a-z][a-zA-Z]*$/;

/** A segment in words: `blockingStates` "blocking states", `requires[1]`
 * "requires 2". */
function wordOf(head: Segment | undefined, next?: Segment): string {
  const raw = String(head ?? '');
  const word = FIELD.test(raw)
    ? raw.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    : code(raw);
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
  const located = locate(trimmed, document);
  if (!located) return fallback(segments);
  const { kind, id, rest, entry } = located;
  const join = (first: string, inside = insideWords(rest, entry)): string =>
    [first, ...inside].join(SEP);
  switch (kind) {
    case 'creature':
    case 'prop':
    case 'faction':
      return join(id);
    case 'door':
      return join(`door ${code(id)}`, insideWords(rest, undefined));
    case 'region': {
      const region = entry as { id: string; name?: string };
      return join(`region ${code(region.name || region.id)}`);
    }
    case 'wall':
      return join(
        `wall ${(located.index ?? 0) + 1}`,
        insideWords(rest, undefined)
      );
    case 'partyStart':
      return join('party start', insideWords(rest, undefined));
    case 'key':
      return 'the site key';
    case 'record':
      return join(`record ${code(id)}`, insideWords(rest, undefined));
    case 'disposition': {
      const disposition = entry as { between: string[] };
      return join(
        `how ${disposition.between.map(code).join(' and ')} stand`,
        insideWords(rest, undefined)
      );
    }
    case 'ending':
      return join(`ending ${code(id)}`, insideWords(rest, undefined));
    case 'exit':
      return join(`exit ${code(id)}`, insideWords(rest, undefined));
    case 'concealment':
      return join(`secret ${code(id)}`, insideWords(rest, undefined));
    case 'conversation':
      return join(`conversation ${code(id)}`, insideWords(rest, undefined));
    case 'shared-lines':
      return join(`the lines of ${code(id)}`);
    case 'bundle':
      return join(`bundle ${code(id)}`, insideWords(rest, undefined));
    case 'template':
      return join(`stat block ${code(id)}`, insideWords(rest, undefined));
    case 'item':
      return join(`item ${code(id)}`, insideWords(rest, undefined));
    case 'status':
      return join(`status ${code(id)}`, insideWords(rest, undefined));
    case 'table':
      return join(`table ${code(id)}`, insideWords(rest, undefined));
    case 'routine':
      return [id, ...behaviourWords(rest)].join(SEP);
  }
}
