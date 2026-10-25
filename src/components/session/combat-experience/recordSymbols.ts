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
  /** A GROUP row (rpg-project#670): the bundle it was compiled from, its
   * parameters, the word it counts as, and its own rows. Absent on a word
   * row. */
  readonly from?: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly as?: string;
  readonly rows?: readonly TableRowSymbol[];
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
  /** A group's verdict holds its rows' verdicts, and the inner die when the
   * pick descended into it (rpg-project#670). */
  readonly rows?: readonly RowVerdict[];
  readonly roll?: number;
  readonly of?: number;
}

/** The fields of an `answered` beat this module reads. */
export interface AnsweredSymbol {
  readonly creature: string;
  readonly option: string;
  readonly key: string;
  readonly roll: number;
  readonly of: number;
  readonly entry: number;
  /** The row picked at every level (rpg-project#670): `[4]` for a word row,
   * `[4, 1]` for the second row inside the group at entry 4. A beat from
   * before groups carries none, and reads as `[entry]`. */
  readonly path: readonly number[];
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
    rows: rows.map(tableRowOf),
  };
}

/** One described row, a group's rows read the same way beneath it. */
function tableRowOf(r: unknown): TableRowSymbol {
  const row = (r ?? {}) as Record<string, unknown>;
  const search = row.search as Record<string, unknown> | null | undefined;
  const out: TableRowSymbol = {
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
  if (!Array.isArray(row.rows)) return out;
  const params =
    row.params && typeof row.params === 'object'
      ? Object.fromEntries(
          Object.entries(row.params as Record<string, unknown>).map(
            ([k, v]) => [k, str(v)]
          )
        )
      : {};
  return {
    ...out,
    from: str(row.from),
    params,
    as: str(row.as),
    rows: row.rows.map(tableRowOf),
  };
}

/** One row's verdict, a group's verdicts read the same way beneath it. */
function verdictOf(r: unknown): RowVerdict {
  const v = (r ?? {}) as Record<string, unknown>;
  const out: RowVerdict = {
    entry: num(v.entry),
    held: v.held === true,
    affordable: v.affordable === true,
    weight: num(v.weight),
    percent: num(v.percent),
    loaded: num(v.loaded),
  };
  if (!Array.isArray(v.rows)) return out;
  return {
    ...out,
    rows: v.rows.map(verdictOf),
    roll: num(v.roll),
    of: num(v.of),
  };
}

/** The `answered` beat's fields, or undefined for one this cannot read. */
export function answeredOf(
  fields: Readonly<Record<string, unknown>> | undefined
): AnsweredSymbol | undefined {
  if (!fields || typeof fields.key !== 'string') return undefined;
  const rows = Array.isArray(fields.rows) ? fields.rows : [];
  const entry = typeof fields.entry === 'number' ? fields.entry : -1;
  const path = Array.isArray(fields.path)
    ? fields.path.filter((i): i is number => typeof i === 'number')
    : entry >= 0
      ? [entry]
      : [];
  return {
    creature: str(fields.creature) || str(fields.prop),
    option: str(fields.option),
    key: fields.key,
    roll: num(fields.roll),
    of: num(fields.of),
    entry,
    path,
    temper: str(fields.temper),
    word: str(fields.word),
    selector: str(fields.selector),
    say: str(fields.say),
    rows: rows.map(verdictOf),
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

/** A group in words: its bundle and the parameters it was used with,
 * "pursuer {distance 6, heading went}". */
function groupPhrase(row: TableRowSymbol): string {
  const params = Object.entries(row.params ?? {});
  return params.length
    ? `${row.from} {${params.map(([k, v]) => `${k} ${v}`).join(', ')}}`
    : (row.from ?? '');
}

/** A row in words: its conditions, then what it does — for a group, the
 * bundle it uses. */
export function rowPhrase(row: TableRowSymbol): string {
  const when = row.when.length ? row.when.join(' and ') : 'always';
  return row.rows
    ? `${when} → ${groupPhrase(row)}`
    : `${when} → ${doesPhrase(row)}`;
}

/** A row's verdict line, a group's rows' lines beneath it, each one level
 * deeper marked "↳". */
function verdictLines(
  v: RowVerdict,
  row: TableRowSymbol | undefined,
  temper: string,
  depth = 0
): string[] {
  const lead = '↳ '.repeat(depth);
  const what = row ? rowPhrase(row) : `entry ${v.entry}`;
  const word = temper ? `${temper} ` : '';
  const line =
    v.held && v.affordable
      ? `${lead}✓ ${what} · ${v.weight} × ${word}${v.percent}% = ${v.loaded}`
      : `${lead}✗ ${what}: ${v.held ? 'unaffordable' : 'condition'}`;
  return [
    line,
    ...(v.rows ?? []).flatMap((inner) =>
      verdictLines(inner, row?.rows?.[inner.entry], temper, depth + 1)
    ),
  ];
}

/** The path through the tree in words (rpg-project#670): every level's die
 * and the group it landed on, then the last level's die and the row that
 * fired — "rolled 61 of 200 → pursuer (2×100) · rolled 7 of 100 → enemy lost
 * → search 6 went". undefined when a level is not in the table. */
function pathPhrase(
  answer: AnsweredSymbol,
  table: TableSymbol
): string | undefined {
  const parts: string[] = [];
  let rows: readonly TableRowSymbol[] | undefined = table.rows;
  let verdicts: readonly RowVerdict[] | undefined = answer.rows;
  let roll = answer.roll;
  let of = answer.of;
  for (const [level, index] of answer.path.entries()) {
    const row: TableRowSymbol | undefined = rows?.[index];
    if (!row) return undefined;
    if (level === answer.path.length - 1) {
      parts.push(`rolled ${roll} of ${of} → ${rowPhrase(row)}`);
      break;
    }
    const v: RowVerdict | undefined = verdicts?.find(
      (candidate) => candidate.entry === index
    );
    parts.push(
      `rolled ${roll} of ${of} → ${row.from} (${v?.weight ?? row.weight}×${v?.percent ?? 100})`
    );
    roll = v?.roll ?? 0;
    of = v?.of ?? 0;
    rows = row.rows;
    verdicts = v?.rows;
  }
  return parts.join(' · ');
}

/** An `answered` beat in the table's own words, or by index without it. */
export function readAnswer(
  answer: AnsweredSymbol,
  table: TableSymbol | undefined
): AnswerReading {
  const head = [answer.creature, answer.key, answer.option].filter(Boolean);
  const lines = answer.rows.flatMap((v) =>
    verdictLines(v, table?.rows[v.entry], answer.temper)
  );
  // A PICK INTO A GROUP reads level by level (rpg-project#670).
  const path =
    table && answer.path.length > 1 ? pathPhrase(answer, table) : undefined;
  if (path !== undefined)
    return { sentence: [...head, path].join(' · '), lines, described: true };
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
    lines,
    described: table !== undefined,
  };
}
