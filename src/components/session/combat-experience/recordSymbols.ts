import type { RecordRow } from '../recordFeed';

/**
 * recordSymbols is THE RECORD CARRIES ITS OWN SYMBOLS (rpg-project#674).
 *
 * An `answered` beat names its rows by index: the entry that fired and a
 * verdict for every row of the key. The encounter writes the table itself
 * into the record as a `table` beat, once, before the first `answered` that
 * indexes it, and again only when the table changes. Reading the record in
 * order and keeping the latest `table` per (creature, option, key) is what
 * lets an `answered` row read in the table's own words, with no trip to the
 * file. With no `table` seen (aged out of the buffer, or a prop's answer) the
 * row reads by index and says so.
 *
 * Debug only: the combat log shows the roll and the result, never this.
 */

/** One row of a described table, as the `table` beat carries it. */
export interface TableRowSymbol {
  readonly entry: number;
  readonly when: readonly string[];
  readonly word: string;
  readonly selector: string;
  readonly weight: number;
  readonly say: string;
  readonly fact: string;
  readonly search: {
    readonly distance: number;
    readonly heading: string;
  } | null;
}

/** A described table: the `table` beat's fields. */
export interface TableSymbol {
  readonly creature: string;
  readonly option: string;
  readonly key: string;
  readonly temper: string;
  readonly rows: readonly TableRowSymbol[];
}

/** One row's verdict, as the `answered` beat carries it. */
export interface RowVerdict {
  readonly entry: number;
  readonly held: boolean;
  readonly affordable: boolean;
  readonly weight: number;
  readonly percent: number;
  readonly loaded: number;
}

/** The fields of an `answered` beat this module reads. */
export interface AnsweredSymbol {
  readonly creature: string;
  readonly option: string;
  readonly key: string;
  readonly roll: number;
  readonly of: number;
  readonly entry: number;
  readonly temper: string;
  readonly word: string;
  readonly selector: string;
  readonly say: string;
  readonly rows: readonly RowVerdict[];
}

/** The sentence and the row lines one `answered` beat renders as. */
export interface AnswerReading {
  /** "gate-1 · time · rolled 36 of 100 · enemy remembered → toward enemy" */
  readonly sentence: string;
  /** One line per row of the key, with ✓ load or ✗ reason. */
  readonly lines: readonly string[];
  /** False when no `table` beat for this answer was seen. */
  readonly described: boolean;
}

/** The note an answer read by index carries. */
export const TABLE_NOT_IN_RECORD = 'table not in record';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function scopeOf(creature: string, option: string, key: string): string {
  return `${creature}\u0000${option}\u0000${key}`;
}

function tableOf(fields: Readonly<Record<string, unknown>>): TableSymbol {
  const rows = Array.isArray(fields.rows) ? fields.rows : [];
  return {
    creature: str(fields.creature),
    option: str(fields.option),
    key: str(fields.key),
    temper: str(fields.temper),
    rows: rows.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const search = row.search as Record<string, unknown> | null | undefined;
      return {
        entry: num(row.entry),
        when: Array.isArray(row.when) ? row.when.map(str) : [],
        word: str(row.word),
        selector: str(row.selector),
        weight: num(row.weight),
        say: str(row.say),
        fact: str(row.fact),
        search:
          search && typeof search === 'object'
            ? { distance: num(search.distance), heading: str(search.heading) }
            : null,
      };
    }),
  };
}

/** The `answered` beat's fields, or undefined for one this cannot read. */
export function answeredOf(
  fields: Readonly<Record<string, unknown>> | undefined
): AnsweredSymbol | undefined {
  if (!fields || typeof fields.key !== 'string') return undefined;
  const rows = Array.isArray(fields.rows) ? fields.rows : [];
  return {
    creature: str(fields.creature) || str(fields.prop),
    option: str(fields.option),
    key: fields.key,
    roll: num(fields.roll),
    of: num(fields.of),
    entry: typeof fields.entry === 'number' ? fields.entry : -1,
    temper: str(fields.temper),
    word: str(fields.word),
    selector: str(fields.selector),
    say: str(fields.say),
    rows: rows.map((r) => {
      const v = (r ?? {}) as Record<string, unknown>;
      return {
        entry: num(v.entry),
        held: v.held === true,
        affordable: v.affordable === true,
        weight: num(v.weight),
        percent: num(v.percent),
        loaded: num(v.loaded),
      };
    }),
  };
}

/**
 * symbolsOf reads the record in order and answers, for every `answered` row,
 * the `table` beat that described its (creature, option, key) most recently
 * before it — the table that row's indexes point into.
 */
export function symbolsOf(
  rows: readonly RecordRow[]
): ReadonlyMap<string, TableSymbol> {
  const latest = new Map<string, TableSymbol>();
  const out = new Map<string, TableSymbol>();
  for (const row of rows) {
    if (!row.fields) continue;
    if (row.beat === 'table') {
      const table = tableOf(row.fields);
      latest.set(scopeOf(table.creature, table.option, table.key), table);
    } else if (row.beat === 'answered') {
      const answer = answeredOf(row.fields);
      if (!answer) continue;
      const table = latest.get(
        scopeOf(answer.creature, answer.option, answer.key)
      );
      if (table) out.set(row.id, table);
    }
  }
  return out;
}

/** What a row does, in the file's words: "toward enemy", "search 6 went". */
function doesPhrase(row: TableRowSymbol): string {
  if (row.search) return `search ${row.search.distance} ${row.search.heading}`;
  if (row.word === 'fact') return `fact ${row.fact}`;
  if (row.word === '') return row.say ? `say "${row.say}"` : 'nothing';
  return row.selector ? `${row.word} ${row.selector}` : row.word;
}

/** A row in words: its conditions, then what it does. */
export function rowPhrase(row: TableRowSymbol): string {
  const when = row.when.length ? row.when.join(' and ') : 'always';
  return `${when} → ${doesPhrase(row)}`;
}

function verdictLine(
  v: RowVerdict,
  row: TableRowSymbol | undefined,
  temper: string
): string {
  const what = row ? rowPhrase(row) : `entry ${v.entry}`;
  if (v.held && v.affordable) {
    const word = temper ? `${temper} ` : '';
    return `✓ ${what} · ${v.weight} × ${word}${v.percent}% = ${v.loaded}`;
  }
  return `✗ ${what}: ${v.held ? 'unaffordable' : 'condition'}`;
}

/** An `answered` beat in the table's own words, or by index without it. */
export function readAnswer(
  answer: AnsweredSymbol,
  table: TableSymbol | undefined
): AnswerReading {
  const head = [answer.creature, answer.key, answer.option].filter(Boolean);
  let picked: string;
  if (answer.entry < 0) {
    picked = 'held: nothing eligible';
  } else if (table && table.rows[answer.entry]) {
    picked = rowPhrase(table.rows[answer.entry]);
  } else {
    picked = `entry ${answer.entry}`;
  }
  const rolled =
    answer.of > 0 ? `rolled ${answer.roll} of ${answer.of}` : 'no roll';
  const parts = [...head, rolled, picked];
  if (!table) parts.push(TABLE_NOT_IN_RECORD);
  return {
    sentence: parts.join(' · '),
    lines: answer.rows.map((v) =>
      verdictLine(v, table?.rows[v.entry], answer.temper)
    ),
    described: table !== undefined,
  };
}
