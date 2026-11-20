/**
 * A LINE'S CARD FACE, FROM THE ENGINE'S STRUCTURE (rpg-project#1030).
 *
 * A closed card must be short, and the engine's sentences are long (a row's
 * sentence carries the whole hearing rule). So the face is built the way the
 * machine drawing builds a step's label (`machineView.ts`): from each
 * statement's CONNECTIONS — their role, kind and id — never from its
 * sentence. Each clause and chip keeps its statement's full sentence for the
 * tooltip and the card's details.
 *
 * Where a connection names a thing but not its value, or the engine gives a
 * value no connection, the value is read from the draft at the path the
 * engine named, as the line form reads it:
 * - the states a conversation is asked in (`<requires[k]>.interaction.in`,
 *   under `.not` when negated);
 * - whether a requirement is negated (`<requires[k]>.not`): the engine marks
 *   a negated topic on its connection, but a negated fact, prop or
 *   conversation carries the same connection as the plain one;
 * - a step's beat (`<advance>.success` / `.failure`);
 * - each reply row's words, weight, loudness and activity (`<row>.say`,
 *   `.weight`, `.loudness`, `.activity`).
 *
 * Replies are kept by ROW: each row's words with its own chips. When a
 * verdict has more than one row the engine picks one by weight (an omitted
 * weight is 1, `dungeonspec.AnswerSpec.Weight`), and the face says each
 * row's share.
 *
 * A connection the face does not know is never dropped and never guessed:
 * it is counted, and the card shows "+N more" opening the engine's words
 * (the drawing's "also:" policy).
 */
import { refId } from '@/utils/refs';
import type {
  ReadBackConnection,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { LineReadBack } from './sharedLinesView';

/** Words, and ids shown in code style. */
export type FacePart = string | { id: string };

export interface FaceItem {
  parts: FacePart[];
  /** The statement's full sentence: the item's tooltip. */
  sentence: string;
  path: string;
}

/** One reply row: its words and what it does. */
export interface FaceRow {
  /** The row's path, as the engine named it (`…success[0]`). */
  path: string;
  /** What the listener says, read at the row's path. */
  say: string | null;
  /** Its weight (1 when omitted). */
  weight: number;
  chips: FaceItem[];
  /** The row's sentence: the tooltip for its words. */
  sentence: string;
}

export interface FaceSide {
  rows: FaceRow[];
  /** The sum of the rows' weights: a row's share is `weight in total`. */
  total: number;
  /** The step the verdict takes, if the line advances a conversation. */
  steps: FaceItem[];
  /** Connections and statements here the face does not know. */
  unknown: number;
}

export interface LineFace {
  /** One clause per distinct requirement. */
  offered: FaceItem[];
  offeredUnknown: number;
  pass: FaceSide;
  miss: FaceSide;
  /** Statements under the line the face has no place for. */
  moreUnknown: number;
}

/** The value the draft holds at a path the engine named. */
export type ValueAt = (path: string) => unknown;

/** The engine's who-words (`encounter.Who…`), in words. An unknown one is
 * shown as written. */
const WHO_WORDS: Record<string, string> = {
  spoken_to: 'the one spoken to',
  the_speaker: 'the speaker',
  speaker: 'the speaker',
  party_in_sight: 'the party in sight',
  carriers_who_witnessed: 'carriers who witnessed it',
};

const LOUDNESS_WORDS: Record<string, string> = {
  whisper: 'whispered',
  shout: 'shouted',
  scream: 'screamed',
};

const who = (id: string): string => WHO_WORDS[id] ?? id;

const pair = (c: ReadBackConnection): string => `${c.role} ${c.kind}`;

/** A requirement's connections the face knows. */
const REQUIRE_KNOWN = new Set([
  'asks fact',
  'asks prop',
  'asks conversation',
  'asks topic',
  'about who',
  'whose creature',
]);

/** A row's or a grant's connections the face knows. Those that only say
 * who may note a grant (`may-note`, `holds`) or which line it is `on` are
 * known and folded into the grant's chip. */
const ROW_KNOWN = new Set([
  'teaches fact',
  'grants topic',
  'about who',
  'takes who',
  'may-note creature',
  'holds creature',
  'on option',
  'tells record',
  'sends-to region',
  'gives status',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : [];

/** "a", "a or b", "a, b or c", with each id in code style. */
function orList(ids: readonly string[]): FacePart[] {
  const out: FacePart[] = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push(i === ids.length - 1 ? ' or ' : ', ');
    out.push({ id });
  });
  return out;
}

/** One requirement as a short clause, or null when the face cannot say it
 * from its connections. */
function requirementClause(
  statement: ReadBackStatement,
  value: ValueAt
): FacePart[] | null {
  const asks = statement.connects.find((c) => c.role === 'asks');
  if (!asks) return null;
  const negatedWritten = value(`${statement.path}.not`) !== undefined;
  const not = negatedWritten || asks.negated;
  switch (asks.kind) {
    case 'fact':
      return not
        ? ['does not know ', { id: asks.id }]
        : ['knows ', { id: asks.id }];
    case 'prop':
      return not
        ? ['does not carry ', { id: asks.id }]
        : ['carries ', { id: asks.id }];
    case 'conversation': {
      const at = negatedWritten ? `${statement.path}.not` : statement.path;
      const states = strings(value(`${at}.interaction.in`));
      return states.length > 0
        ? [{ id: asks.id }, not ? ' is not ' : ' is ', ...orList(states)]
        : [
            { id: asks.id },
            not ? ' is not in a state it names' : ' is in a state it names',
          ];
    }
    case 'topic': {
      const about = statement.connects.find(
        (c) => c.role === 'about' && c.kind === 'who'
      );
      return [
        not ? 'listener has not noted ' : 'listener has noted ',
        { id: asks.id },
        ...(about ? [` about ${who(about.id)}`] : []),
      ];
    }
    default:
      return null;
  }
}

/** A grant's chip: "gives `admitted` about the party in sight to the one
 * spoken to". */
function grantChip(
  statement: ReadBackStatement,
  topic: ReadBackConnection
): FacePart[] {
  const at = (c: ReadBackConnection) => c.at === '' || c.at === topic.id;
  const about = statement.connects.find(
    (c) => c.role === 'about' && c.kind === 'who' && at(c)
  );
  const takes = statement.connects
    .filter((c) => c.role === 'takes' && c.kind === 'who' && at(c))
    .map((c) => who(c.id));
  return [
    'gives ',
    { id: topic.id },
    ...(about ? [` about ${who(about.id)}`] : []),
    ...(takes.length > 0 ? [` to ${takes.join(' and ')}`] : []),
  ];
}

/** The chips one statement under a row gives from its connections. */
function connectionChips(statement: ReadBackStatement): {
  chips: FacePart[][];
  unknown: number;
} {
  const chips: FacePart[][] = [];
  let unknown = 0;
  for (const c of statement.connects) {
    if (!ROW_KNOWN.has(pair(c))) {
      unknown += 1;
      continue;
    }
    switch (pair(c)) {
      case 'teaches fact':
        chips.push(['teaches ', { id: c.id }]);
        break;
      case 'grants topic':
        chips.push(grantChip(statement, c));
        break;
      case 'tells record':
        chips.push(['tells ', { id: c.id }]);
        break;
      case 'sends-to region':
        chips.push(['sends to ', { id: c.id }]);
        break;
      case 'gives status':
        chips.push(['applies status ', { id: c.id }]);
        break;
    }
  }
  return { chips, unknown };
}

/** The chips a row's own values give: how loudly it is said and the
 * activity it plays. The engine gives these no connection. */
function valueChips(row: unknown): FacePart[][] {
  if (!isRecord(row)) return [];
  const chips: FacePart[][] = [];
  if (
    typeof row.loudness === 'string' &&
    row.loudness !== '' &&
    row.loudness !== 'speak'
  )
    chips.push([LOUDNESS_WORDS[row.loudness] ?? row.loudness]);
  if (isRecord(row.activity) && typeof row.activity.ref === 'string') {
    const cycles =
      typeof row.activity.cycles === 'number' ? row.activity.cycles : null;
    chips.push([
      'plays ',
      { id: refId(row.activity.ref) ?? row.activity.ref },
      ...(cycles !== null ? [` ×${cycles}`] : []),
    ]);
  }
  return chips;
}

const key = (parts: readonly FacePart[]): string => JSON.stringify(parts);

/** The row a statement under `<line>.<verdict>[k]` belongs to: the path up
 * to and including `[k]`. */
function rowPathOf(
  statementPath: string,
  linePath: string,
  verdict: 'success' | 'failure'
): string | null {
  const head = `${linePath}.${verdict}[`;
  if (!statementPath.startsWith(head)) return null;
  const close = statementPath.indexOf(']', head.length);
  if (close < 0) return null;
  const index = statementPath.slice(head.length, close);
  return /^\d+$/.test(index) ? `${head}${index}]` : null;
}

function side(
  statements: readonly ReadBackStatement[],
  linePath: string,
  verdict: 'success' | 'failure',
  value: ValueAt
): FaceSide {
  const rows = new Map<string, FaceRow>();
  const seen = new Map<string, Set<string>>();
  let unknown = 0;
  for (const statement of statements) {
    const rowPath = rowPathOf(statement.path, linePath, verdict);
    if (rowPath === null) {
      unknown += 1;
      continue;
    }
    let row = rows.get(rowPath);
    if (!row) {
      const written = value(rowPath);
      const weight =
        isRecord(written) && typeof written.weight === 'number'
          ? written.weight
          : 1;
      row = {
        path: rowPath,
        say:
          isRecord(written) &&
          typeof written.say === 'string' &&
          written.say !== ''
            ? written.say
            : null,
        weight,
        chips: [],
        sentence: '',
      };
      rows.set(rowPath, row);
      seen.set(rowPath, new Set());
      for (const parts of valueChips(written)) {
        seen.get(rowPath)!.add(key(parts));
        row.chips.push({ parts, sentence: '', path: rowPath });
      }
    }
    if (statement.path === rowPath) {
      row.sentence = statement.sentence;
      for (const chip of row.chips)
        if (chip.sentence === '') chip.sentence = statement.sentence;
    } else if (statement.kind !== 'line.row' && statement.connects.length === 0)
      unknown += 1;
    const found = connectionChips(statement);
    unknown += found.unknown;
    for (const parts of found.chips) {
      if (seen.get(rowPath)!.has(key(parts))) continue;
      seen.get(rowPath)!.add(key(parts));
      row.chips.push({
        parts,
        sentence: statement.sentence,
        path: statement.path,
      });
    }
  }
  const ordered = [...rows.values()];
  return {
    rows: ordered,
    total: ordered.reduce((sum, row) => sum + row.weight, 0),
    steps: [],
    unknown,
  };
}

/** The step a line takes on a pass and on a miss: "advances `front-gate`:
 * `admitted`", the beat read at the engine's `advance` path. */
function advanceChips(
  statements: readonly ReadBackStatement[],
  value: ValueAt,
  verdict: 'success' | 'failure'
): { chips: FaceItem[]; unknown: number } {
  const chips: FaceItem[] = [];
  let unknown = 0;
  for (const statement of statements) {
    for (const c of statement.connects) {
      if (pair(c) !== 'advances conversation') {
        if (verdict === 'success') unknown += 1;
        continue;
      }
      const beat = value(`${statement.path}.${verdict}`);
      if (typeof beat !== 'string' || beat === '') continue;
      chips.push({
        parts: ['advances ', { id: c.id }, ': ', { id: beat }],
        sentence: statement.sentence,
        path: statement.path,
      });
    }
    if (statement.connects.length === 0 && verdict === 'success') unknown += 1;
  }
  return { chips, unknown };
}

export function lineFaceOf(
  read: LineReadBack,
  linePath: string,
  value: ValueAt
): LineFace {
  const offered: FaceItem[] = [];
  let offeredUnknown = 0;
  const seen = new Set<string>();
  for (const statement of read.offered) {
    offeredUnknown += statement.connects.filter(
      (c) => !REQUIRE_KNOWN.has(pair(c))
    ).length;
    const parts = requirementClause(statement, value);
    if (!parts) {
      offeredUnknown += statement.connects.every((c) =>
        REQUIRE_KNOWN.has(pair(c))
      )
        ? 1
        : 0;
      continue;
    }
    if (seen.has(key(parts))) continue;
    seen.add(key(parts));
    offered.push({ parts, sentence: statement.sentence, path: statement.path });
  }
  const pass = side(read.pass, linePath, 'success', value);
  const miss = side(read.miss, linePath, 'failure', value);
  const passStep = advanceChips(read.advance, value, 'success');
  const missStep = advanceChips(read.advance, value, 'failure');
  return {
    offered,
    offeredUnknown,
    pass: {
      ...pass,
      steps: passStep.chips,
      unknown: pass.unknown + passStep.unknown,
    },
    miss: {
      ...miss,
      steps: missStep.chips,
      unknown: miss.unknown + missStep.unknown,
    },
    moreUnknown: read.more.length,
  };
}

/** A difficulty as typed on a card: a whole number, 0 or more, or null for
 * anything else (empty, negative, a fraction, an exponent), which is not
 * written. */
export function difficultyOf(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}
