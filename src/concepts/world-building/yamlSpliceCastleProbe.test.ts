// @vitest-environment node
/**
 * EVERY LIST IN THE CASTLE, WRITTEN THROUGH THE SPLICE (rpg-project#1014).
 * The castle is hand edited, and the studio promises that an edit changes only
 * its own lines. This probe walks every sequence in the served castle, block,
 * flow and compact (`- - 3`), and through `spliceYaml` moves each row up and
 * down, removes it, adds it back, and edits one scalar in it. Every write must
 * parse to exactly the intended document, leave every byte outside the edited
 * list unchanged, and (for a move) keep the same comment lines.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isMap,
  isPair,
  isScalar,
  isSeq,
  parse,
  parseDocument,
  type Node,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import served from '../encounter-studio/fixtures/the-mad-king-served.yaml?raw';
import {
  mergeValue,
  sameValue,
  spliceInternals,
  spliceYaml,
} from './yamlSplice';

type Json = unknown;
type Path = (string | number)[];

/** Exact equality: values, scalar types, list order AND key order. */
function exact(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => exact(item, b[i]))
    );
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return (
      ka.length === kb.length &&
      ka.every(
        (key, i) =>
          key === kb[i] &&
          exact(
            (a as Record<string, Json>)[key],
            (b as Record<string, Json>)[key]
          )
      )
    );
  }
  return false;
}

interface List {
  path: Path;
  node: YAMLSeq;
  /** Its rows are lists written on the dash's line (`- - 3`). */
  compact: boolean;
  /** Bytes before `head` and from `tail` on are outside the list. */
  head: number;
  tail: number;
}

const lineStart = (text: string, at: number) =>
  text.lastIndexOf('\n', at - 1) + 1;

/** Every sequence with its path, and the bytes it owns. */
function listsOf(source: string): List[] {
  const document = parseDocument(source);
  const lists: List[] = [];
  const visit = (node: Node | null, path: Path) => {
    if (!node) return;
    if (isMap(node))
      for (const pair of node.items)
        if (isPair(pair) && isScalar(pair.key))
          visit(pair.value as Node, [...path, String(pair.key.value)]);
    if (isSeq(node)) {
      const compact =
        !node.flow &&
        node.items.some(
          (item) =>
            isSeq(item) &&
            !item.flow &&
            source
              .slice(lineStart(source, item.range![0]), item.range![0])
              .trim() !== ''
        );
      lists.push({ path, node, compact, ...ownedBytes(source, node) });
      node.items.forEach((item, i) => visit(item as Node, [...path, i]));
    }
  };
  visit(document.contents as Node, []);
  return lists;
}

function ownedBytes(source: string, node: YAMLSeq | YAMLMap) {
  const [start] = node.range!;
  let end = node.range![1];
  while (end > start && /\s/.test(source[end - 1])) end--;
  if (node.flow) return { head: start, tail: end, rowHead: start };
  // A block list owns the comment lines directly above its first dash when
  // the dash starts its line, and every comment or blank line after its last
  // row up to the next line of content.
  let head = start;
  const line = lineStart(source, start);
  // A row's map starts on its dash line (`- id: a`). Its `rowHead` is the
  // dash line and the comment lines directly above it: removing the row's
  // FIRST key sets the next key's comment above the dash (rpg-project#1014),
  // and only that case is measured from there.
  let rowHead = start;
  if (isMap(node) && /^\s*(- )+$/.test(source.slice(line, start))) {
    rowHead = line;
    while (rowHead > 0) {
      const prev = lineStart(source, rowHead - 1);
      if (!/^\s*#/.test(source.slice(prev, rowHead - 1))) break;
      rowHead = prev;
    }
  } else if (source.slice(line, start).trim() === '') {
    head = line;
    while (head > 0) {
      const prev = lineStart(source, head - 1);
      if (!/^\s*#/.test(source.slice(prev, head - 1))) break;
      head = prev;
    }
    // An emptied collection goes up onto its key's (or dash's) line: from
    // just after the `:` or `-` on, the bytes are the collection's.
    let back = head;
    while (back > 0 && /\s/.test(source[back - 1])) back--;
    if (source[back - 1] === ':' || source[back - 1] === '-') head = back;
    rowHead = head;
  }
  let tail = source.indexOf('\n', end);
  tail = tail === -1 ? source.length : tail + 1;
  while (tail < source.length) {
    const next = source.indexOf('\n', tail);
    const text = source.slice(tail, next === -1 ? source.length : next);
    if (text.trim() !== '' && !/^\s*#/.test(text)) break;
    tail = next === -1 ? source.length : next + 1;
  }
  return { head, tail, rowHead };
}

function at(value: Json, path: Path): Json {
  return path.reduce<Json>(
    (v, key) => (v as Record<string | number, Json>)[key],
    value
  );
}

/** A deep copy that shares nothing: the studio reads an alias as a copy. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function withList(value: Json, path: Path, edit: (rows: Json[]) => void) {
  const next = copy(value);
  edit(at(next, path) as Json[]);
  return next;
}

/** The row with its first scalar changed (a number +1, text gains a letter,
 * a flag flips); null when the row holds no scalar. */
function editedRow(row: Json): Json | null {
  if (typeof row === 'number') return row + 1;
  if (typeof row === 'string') return `${row}x`;
  if (typeof row === 'boolean') return !row;
  if (row === null) return 0;
  if (Array.isArray(row)) {
    for (let i = 0; i < row.length; i++) {
      const edited = editedRow(row[i]);
      if (edited !== null) return row.map((v, k) => (k === i ? edited : v));
    }
    return null;
  }
  if (typeof row === 'object') {
    for (const [key, v] of Object.entries(row as Record<string, Json>)) {
      const edited = editedRow(v);
      if (edited !== null) return { ...(row as object), [key]: edited };
    }
  }
  return null;
}

const comments = (text: string) =>
  text
    .split('\n')
    .filter((line) => /^\s*#/.test(line))
    .map((line) => line.trim())
    .sort();

interface Case {
  label: string;
  /** The edited node's bytes: everything outside them must not change. */
  list: { head: number; tail: number };
  base: Json;
  current: Json;
  /** The source the write splices into (the castle, or the castle with the
   * row removed, for an add). */
  source: string;
  move: boolean;
  /** The comment lines the write must keep, as a multiset; a move keeps
   * the source's. */
  comments?: string[];
}

/** What is wrong with one write, or null. `spliceYaml` checks its own
 * output (rpg-project#1014): a write it returns parses, and reads back as
 * the intended value under `sameValue`. `strict` re-reads it here too, and
 * also holds key order. */
function check(c: Case, strict = false): string | null {
  let out: string;
  try {
    out = spliceYaml(c.source, c.base, c.current);
  } catch (error) {
    return `refused: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (strict) {
    const document = parseDocument(out);
    if (document.errors.length)
      return `does not parse: ${document.errors[0].message.split('\n')[0]}`;
    if (!exact(document.toJS(), c.current))
      return 'parses to a different value';
  }
  const { head, tail } = c.list;
  if (
    !out.startsWith(c.source.slice(0, head)) ||
    !out.endsWith(c.source.slice(tail))
  )
    return 'changed bytes outside the list';
  const kept = c.comments ?? (c.move ? comments(c.source) : undefined);
  if (kept && !exact(comments(out), kept)) return 'changed the comment lines';
  return null;
}

/** The source's comment lines without those in `from`..`to` (whole lines). */
function commentsWithout(source: string, from: number, to: number): string[] {
  const gone = comments(source.slice(lineStart(source, from), to));
  const all = comments(source);
  for (const line of gone) all.splice(all.indexOf(line), 1);
  return all;
}

/** Where a removed pair's own text ends: through the line its value ends
 * on. */
function pairEndOf(
  source: string,
  map: YAMLMap,
  key: string
): [number, number] {
  const pair = map.items.find(
    (item) => isScalar(item.key) && String(item.key.value) === key
  )!;
  const keyAt = (pair.key as Node).range![0];
  const value = pair.value as Node | null;
  let end = value?.range ? value.range[1] : (pair.key as Node).range![1];
  while (end > keyAt && /\s/.test(source[end - 1])) end--;
  const stop = source.indexOf('\n', end);
  // The comment lines directly above a key that starts its line are its own.
  let from = keyAt;
  if (source.slice(lineStart(source, keyAt), keyAt).trim() === '') {
    from = lineStart(source, keyAt);
    const column = keyAt - from;
    while (from > 0) {
      const prev = lineStart(source, from - 1);
      const text = source.slice(prev, from - 1);
      if (!/^\s*#/.test(text) || text.search(/\S/) !== column) break;
      from = prev;
    }
  }
  return [from, stop === -1 ? source.length : stop + 1];
}

/** Every write the probe makes. `rows` limits which rows get the remove,
 * add and edit writes (every row is moved). */
function* casesOf(
  source: string,
  rows: (list: List, i: number) => boolean,
  which: (list: List) => boolean = () => true
): Generator<Case> {
  const own = parse(source) as Json;
  for (const list of listsOf(source).filter(which)) {
    const items = at(own, list.path) as Json[];
    const name = list.path.join('.');
    for (let i = 0; i < items.length; i++) {
      // Row i down is row i + 1 up: one swap per neighbouring pair moves
      // every row both ways.
      if (i + 1 < items.length)
        yield {
          label: `${name}[${i}] down, [${i + 1}] up`,
          list,
          source,
          base: own,
          current: withList(own, list.path, (r) => {
            [r[i], r[i + 1]] = [r[i + 1], r[i]];
          }),
          move: true,
        };
      if (!rows(list, i)) continue;
      const without = withList(own, list.path, (r) => void r.splice(i, 1));
      yield {
        label: `${name}[${i}] removed`,
        list,
        source,
        base: own,
        current: without,
        move: false,
      };
      const edited = editedRow(items[i]);
      if (edited !== null)
        yield {
          label: `${name}[${i}] edited`,
          list,
          source,
          base: own,
          current: withList(own, list.path, (r) => {
            r[i] = edited;
          }),
          move: false,
        };
    }
  }
  // Adds splice into the castle with the row removed: the row comes back.
  for (const list of listsOf(source).filter(which)) {
    const items = at(own, list.path) as Json[];
    for (let i = 0; i < items.length; i++) {
      if (!rows(list, i) || items.length < 2) continue;
      const without = withList(own, list.path, (r) => void r.splice(i, 1));
      let removed: string;
      try {
        removed = spliceYaml(source, own, without);
        if (!exact(parse(removed), without)) continue;
      } catch {
        continue;
      }
      const reread = listsOf(removed).find(
        (l) => l.path.join('.') === list.path.join('.')
      );
      if (!reread) continue;
      yield {
        label: `${list.path.join('.')}[${i}] added back`,
        list: reread,
        source: removed,
        base: parse(removed),
        current: own,
        move: false,
      };
    }
  }
}

interface MapAt {
  path: Path;
  node: YAMLMap;
  depth: number;
  head: number;
  tail: number;
  rowHead: number;
}

/** Every mapping with its path and the bytes it owns. */
function mapsOf(source: string): MapAt[] {
  const document = parseDocument(source);
  const maps: MapAt[] = [];
  const visit = (node: Node | null, path: Path) => {
    if (!node) return;
    if (isMap(node)) {
      maps.push({
        path,
        node,
        depth: path.length,
        ...ownedBytes(source, node),
      });
      for (const pair of node.items)
        if (isPair(pair) && isScalar(pair.key))
          visit(pair.value as Node, [...path, String(pair.key.value)]);
    }
    if (isSeq(node))
      node.items.forEach((item, i) => visit(item as Node, [...path, i]));
  };
  visit(document.contents as Node, []);
  return maps;
}

function withMap(
  value: Json,
  path: Path,
  edit: (map: Record<string, Json>) => void
) {
  const next = copy(value);
  edit(at(next, path) as Record<string, Json>);
  return next;
}

/** Map writes: each key removed (`keys`), the map emptied, and, splicing
 * into the castle as those writes left it, the key added back and a first
 * key added to the emptied map (`reverse`). */
function* mapCasesOf(
  source: string,
  keys: (map: MapAt, key: string) => boolean,
  reverse: (map: MapAt) => boolean,
  emptied: (map: MapAt) => boolean = () => true
): Generator<Case> {
  const own = parse(source) as Json;
  for (const map of mapsOf(source)) {
    const value = at(own, map.path) as Record<string, Json>;
    const name = map.path.join('.') || 'the document';
    if (map.path.length === 0) continue;
    for (const key of Object.keys(value)) {
      if (!keys(map, key)) continue;
      const without = withMap(own, map.path, (m) => void delete m[key]);
      const first = Object.keys(value)[0] === key;
      const [from, to] = pairEndOf(source, map.node, key);
      yield {
        label: `${name}.${key} removed`,
        // Only a row's first key going moves bytes above the dash.
        list: first ? { head: map.rowHead, tail: map.tail } : map,
        source,
        base: own,
        current: without,
        move: false,
        comments: commentsWithout(source, from, to),
      };
      if (!reverse(map)) continue;
      const removed = written(source, own, without);
      const reread = removed && find(mapsOf(removed), map.path);
      if (reread)
        yield {
          label: `${name}.${key} added back`,
          list: reread,
          source: removed,
          base: parse(removed),
          current: own,
          move: false,
          comments: comments(removed),
        };
    }
    if (!emptied(map)) continue;
    const cleared = withMap(own, map.path, (m) => {
      for (const key of Object.keys(m)) delete m[key];
    });
    yield {
      label: `${name} emptied`,
      list: map,
      source,
      base: own,
      current: cleared,
      move: false,
      // The map's own lines go, comments among them.
      comments: commentsWithout(source, map.node.range![0], map.node.range![1]),
    };
    if (!reverse(map)) continue;
    const empty = written(source, own, cleared);
    const reread = empty && find(mapsOf(empty), map.path);
    if (reread)
      yield {
        label: `${name} emptied, then given a first key`,
        list: reread,
        source: empty,
        base: parse(empty),
        current: withMap(parse(empty), map.path, (m) => {
          m.probe = 1;
        }),
        move: false,
        comments: comments(empty),
      };
  }
}

/** The write's text when it is sound, else null (its own case fails). */
function written(source: string, base: Json, current: Json): string | null {
  try {
    return spliceYaml(source, base, current);
  } catch {
    return null;
  }
}

function find<T extends { path: Path }>(items: T[], path: Path): T | undefined {
  const name = path.join('.');
  return items.find((item) => item.path.join('.') === name);
}

/** The values a scalar is replaced with: each type, and text that reads as
 * another type when it is not quoted. */
const SCALARS: Json[] = ['text', 42, true, null, '', '42', 'true', 1.5, 'a: b'];

/** Scalar writes: each scalar (a map's value or a list's item) replaced by
 * the values `pick` chooses from `SCALARS`. Its own line or lines are its
 * bytes. */
function* scalarCasesOf(
  source: string,
  pick: (index: number) => Json[]
): Generator<Case> {
  const document = parseDocument(source);
  const own = parse(source) as Json;
  let index = 0;
  const cases: Case[] = [];
  type Bytes = { head: number; tail: number };
  const visit = (node: Node | null, path: Path, list?: Bytes) => {
    if (!node) return;
    if (isMap(node))
      for (const pair of node.items)
        if (isPair(pair) && isScalar(pair.key))
          visit(pair.value as Node, [...path, String(pair.key.value)], list);
    if (isSeq(node)) {
      const bytes = ownedBytes(source, node);
      node.items.forEach((item, i) => visit(item as Node, [...path, i], bytes));
    }
    if (isScalar(node) && node.range && path.length > 0) {
      const old = at(own, path);
      const head = lineStart(source, node.range[0]);
      let tail = source.indexOf('\n', node.range[1]);
      tail = tail === -1 ? source.length : tail + 1;
      for (const value of pick(index++)) {
        if (Object.is(value, old)) continue;
        const parent = path.slice(0, -1);
        const leaf = path.at(-1)!;
        const next = copy(own);
        (at(next, parent) as Record<string | number, Json>)[leaf] = value;
        // A list whose rows all carry an id aligns them by it: a row whose
        // id changes is another row, written where the old one stood, so
        // the list's bytes are the write's.
        const byId = leaf === 'id' && typeof path.at(-2) === 'number';
        cases.push({
          label: `${path.join('.')} = ${JSON.stringify(value)}`,
          list: byId && list ? list : { head, tail },
          source,
          base: own,
          current: next,
          move: false,
        });
      }
    }
  };
  visit(document.contents as Node, []);
  yield* cases;
}

/** Run every write the probe makes and list what went wrong. */
function failuresOf(cases: Iterable<Case>, strict = false) {
  const failures: string[] = [];
  let writes = 0;
  for (const c of cases) {
    writes++;
    const problem = check(c, strict);
    if (problem) failures.push(`${c.label}: ${problem}`);
  }
  return { writes, failures };
}

/** The ground paint's runs: the compact `q` lists and the runs in them. */
const paintRuns = (list: List) =>
  list.path.includes('paint') && list.path.includes('q');

/** The whole probe, or (in CI) a fixed sample of it: every `n`-th. */
const everything = process.env.SPLICE_PROBE === 'all';
const everyNth = (n: number) => {
  let i = 0;
  return () => everything || i++ % n === 0;
};
const sampledMaps = new Set(
  mapsOf(served)
    .filter((_, i) => everything || i % 12 === 0)
    .map((map) => map.path.join('.'))
);
const sampledMap = (map: MapAt) => sampledMaps.has(map.path.join('.'));

describe('every castle list writes back through the splice (rpg-project#1014)', () => {
  it('finds the compact ground-paint rows the castle writes', () => {
    expect(listsOf(served).some((l) => l.compact && paintRuns(l))).toBe(true);
  });

  it('moves, removes, adds back and edits every row of the ground paint’s compact runs, each write exact (key order too)', () => {
    const { writes, failures } = failuresOf(
      casesOf(served, () => true, paintRuns),
      true
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 120_000);

  it('moves the rows of every fourth list up and down (every list with SPLICE_PROBE=all)', () => {
    const { writes, failures } = failuresOf(
      casesOf(served, () => false, everyNth(4))
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  // The deep probe (about six minutes): every list's first and last rows
  // removed, added back and edited too. Run it with SPLICE_PROBE=all.
  it.runIf(process.env.SPLICE_PROBE === 'all')(
    'removes, adds back and edits the first and last row of every list',
    () => {
      const { writes, failures } = failuresOf(
        casesOf(
          served,
          (list, i) => i === 0 || i === list.node.items.length - 1
        )
      );
      expect(writes).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    },
    900_000
  );

  it('empties every twelfth map, and removes its last key (every map with SPLICE_PROBE=all)', () => {
    const { writes, failures } = failuresOf(
      mapCasesOf(
        served,
        (map, key) =>
          sampledMap(map) && Object.keys(map.node.toJSON()).at(-1) === key,
        () => false,
        sampledMap
      )
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  it('removes the first key of castle rows, with a comment above the row or without: the row keeps its dash and its other lines', () => {
    const own = parse(served) as Json;
    const lists = listsOf(served);
    const failures: string[] = [];
    for (const path of [
      ['bundles', 'guard-base', 'rows', 1, 'use'],
      ['dispositions', 0, 'between'],
      ['bundles', 'pursuer', 'rows', 0, 'when'],
      ['factions', 0, 'id'],
      ['factions', 1, 'options', 0, 'success', 0, 'say'],
    ] as Path[]) {
      const row = path.slice(0, -1);
      const list = find(lists, row.slice(0, -1))!;
      const current = withMap(own, row, (m) => void delete m[path.at(-1)!]);
      const c: Case = {
        label: `${path.join('.')} removed`,
        list,
        source: served,
        base: own,
        current,
        move: false,
      };
      const problem = check(c, true);
      if (problem) failures.push(`${c.label}: ${problem}`);
      else if (
        !exact(comments(spliceYaml(served, own, current)), comments(served))
      )
        failures.push(`${c.label}: lost a comment`);
    }
    expect(failures).toEqual([]);
  });

  it('a writer that drops the comment above a row is caught, though the value is right: its first key or its last removed', () => {
    const real = spliceInternals.text;
    const own = parse(served) as Json;
    const path: Path = ['bundles', 'guard-base', 'rows', 1];
    const map = find(mapsOf(served), path)!;
    // The comment line directly above the row's dash.
    const dash = lineStart(served, map.node.range![0]);
    const above = served.slice(lineStart(served, dash - 1), dash);
    expect(above).toMatch(/^\s*#/);
    const keys = Object.keys(at(own, path) as object);
    for (const [key, first] of [
      [keys[0], true],
      [keys.at(-1)!, false],
    ] as const) {
      const current = withMap(own, path, (m) => void delete m[key]);
      const [from, to] = pairEndOf(served, map.node, key);
      const c: Case = {
        label: `${path.join('.')}.${key} removed`,
        // As the map probe measures it: a first key from the dash line.
        list: first ? { head: map.rowHead, tail: map.tail } : map,
        source: served,
        base: own,
        current,
        move: false,
        comments: commentsWithout(served, from, to),
      };
      expect(check(c, true)).toBe(null);
      vi.spyOn(spliceInternals, 'text').mockImplementation((...args) => {
        const written = real(...args);
        return { ...written, out: written.out.replace(above, '') };
      });
      try {
        // Inside the measured bytes (a first key), only the comment check
        // can catch it; outside (a last key), the byte check does too.
        expect(check(c, true)).toMatch(
          first
            ? /^changed the comment lines$/
            : /^changed (bytes outside|the comment)/
        );
      } finally {
        vi.restoreAllMocks();
      }
    }
  });

  it('the maps near the top of the castle: a key added back, and a first key added to the emptied map', () => {
    const { writes, failures } = failuresOf(
      mapCasesOf(
        served,
        (map, key) =>
          map.depth <= 1 && Object.keys(map.node.toJSON()).at(-1) === key,
        (map) => map.depth <= 1,
        (map) => map.depth <= 1
      )
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  it('replaces every twelfth scalar with one of text, a number, a flag, null, empty text and text that reads as another type (every scalar with SPLICE_PROBE=all)', () => {
    const { writes, failures } = failuresOf(
      scalarCasesOf(served, (i) =>
        everything
          ? [SCALARS[i % SCALARS.length]]
          : i % 12 === 0
            ? [SCALARS[(i / 12) % SCALARS.length]]
            : []
      )
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  it.runIf(everything)(
    'every key of every map removed and added back, every map emptied and given a first key',
    () => {
      const maps = failuresOf(
        mapCasesOf(
          served,
          () => true,
          () => true
        )
      );
      expect(maps.failures).toEqual([]);
    },
    10_800_000
  );

  it.runIf(everything)(
    'every scalar replaced by every type',
    () => {
      const scalars = failuresOf(scalarCasesOf(served, () => SCALARS));
      expect(scalars.failures).toEqual([]);
    },
    10_800_000
  );
});

/** A seeded generator (mulberry32): the same sample on every run. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The one edit that turns `source` into `out`, as an honest writer
 * reports it. */
function honestEdit(source: string, out: string) {
  let head = 0;
  while (
    head < source.length &&
    head < out.length &&
    source[head] === out[head]
  )
    head++;
  let tail = 0;
  while (
    tail < source.length - head &&
    tail < out.length - head &&
    source[source.length - 1 - tail] === out[out.length - 1 - tail]
  )
    tail++;
  return {
    start: head,
    end: source.length - tail,
    text: out.slice(head, out.length - tail),
    order: 0,
  };
}

/** Every path in a value, with what is there. */
function pathsOf(value: Json, path: Path = []): [Path, Json][] {
  const here: [Path, Json][] = [[path, value]];
  if (Array.isArray(value))
    return here.concat(...value.map((v, i) => pathsOf(v, [...path, i])));
  if (value && typeof value === 'object')
    return here.concat(
      ...Object.entries(value).map(([k, v]) => pathsOf(v, [...path, k]))
    );
  return here;
}

/** Values an edit sets: each type, and text that reads as another type or
 * as YAML when it is not quoted. */
const EDIT_VALUES: Json[] = [
  'text',
  42,
  true,
  null,
  '',
  '42',
  'true',
  1.5,
  'a: b',
  'x #y',
  '- z',
  '{q}',
  'multi\nline',
  0,
  -3,
  'yes',
];

/** A random edit of the castle, as the third review's differential made
 * them: set a value, remove or add a key or row, empty a collection, move a
 * row, add a key, remove a map's first key, change a scalar slightly. */
function randomEdit(own: Json, paths: [Path, Json][], random: () => number) {
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)];
  const index = (n: number) => Math.floor(random() * n);
  for (;;) {
    const [path, value] = pick(paths);
    if (path.length === 0) continue;
    const next = copy(own);
    const parent = at(next, path.slice(0, -1)) as Record<string | number, Json>;
    const leaf = path.at(-1)!;
    const here = () => at(next, path) as Record<string, Json> & Json[];
    const kind = index(9);
    if (kind <= 1) parent[leaf] = pick(EDIT_VALUES);
    else if (kind === 2) {
      if (Array.isArray(parent)) parent.splice(leaf as number, 1);
      else delete parent[leaf];
    } else if (kind === 3) {
      if (Array.isArray(parent))
        parent.splice(leaf as number, 0, copy(pick(parent as Json[])));
      else parent[`added${index(99)}`] = pick(EDIT_VALUES);
    } else if (kind === 4 && value && typeof value === 'object')
      parent[leaf] = Array.isArray(value) ? [] : {};
    else if (kind === 5 && Array.isArray(value) && value.length > 1) {
      const [row] = here().splice(index(value.length), 1);
      here().splice(index(value.length), 0, row);
    } else if (
      kind === 6 &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    )
      here()[`added${index(99)}`] = pick(EDIT_VALUES);
    else if (
      kind === 7 &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length
    )
      delete here()[Object.keys(value)[0]];
    else if (kind === 8 && typeof value !== 'object')
      parent[leaf] =
        typeof value === 'number'
          ? value + 1
          : typeof value === 'string'
            ? `${value}_x`
            : !value;
    else continue;
    return { next, kind, path };
  }
}

const lead = (line: string) => line.match(/^ */)![0];
const NBSP = ' ';

/** The ways a writer goes wrong, applied at line `n` of a sound write: the
 * third review's 37 fault kinds (rpg-project#1014), tabs, no-break spaces,
 * document markers and flow-for-block among them. */
const FAULTS: [string, (l: string[], n: number) => string[] | null][] = [
  ['indent+1', (l, n) => l.map((x, i) => (i === n ? ' ' + x : x))],
  ['indent+2', (l, n) => l.map((x, i) => (i === n ? '  ' + x : x))],
  ['indent+3', (l, n) => l.map((x, i) => (i === n ? '   ' + x : x))],
  ['indent+4', (l, n) => l.map((x, i) => (i === n ? '    ' + x : x))],
  [
    'indent-1',
    (l, n) =>
      l[n].startsWith(' ') ? l.map((x, i) => (i === n ? x.slice(1) : x)) : null,
  ],
  [
    'indent-2',
    (l, n) =>
      l[n].startsWith('  ')
        ? l.map((x, i) => (i === n ? x.slice(2) : x))
        : null,
  ],
  [
    'indent-4',
    (l, n) =>
      l[n].startsWith('    ')
        ? l.map((x, i) => (i === n ? x.slice(4) : x))
        : null,
  ],
  [
    'block+2',
    (l, n) => {
      const c = lead(l[n]).length;
      let e = n + 1;
      while (e < l.length && (l[e].trim() === '' || lead(l[e]).length > c)) e++;
      return l.map((x, i) => (i >= n && i < e && x ? '  ' + x : x));
    },
  ],
  [
    'block-2',
    (l, n) => {
      if (!l[n].startsWith('  ')) return null;
      const c = lead(l[n]).length;
      let e = n + 1;
      while (e < l.length && (l[e].trim() === '' || lead(l[e]).length > c)) e++;
      return l.map((x, i) =>
        i >= n && i < e && x.startsWith('  ') ? x.slice(2) : x
      );
    },
  ],
  [
    'later-lines+1',
    (l, n) => l.map((x, i) => (i > n && i <= n + 3 && x ? ' ' + x : x)),
  ],
  [
    'tab-indent',
    (l, n) =>
      lead(l[n]).length
        ? l.map((x, i) =>
            i === n ? '\t'.repeat(lead(x).length) + x.trimStart() : x
          )
        : null,
  ],
  [
    'tab-one',
    (l, n) =>
      lead(l[n]).length
        ? l.map((x, i) => (i === n ? '\t' + x.slice(1) : x))
        : null,
  ],
  [
    'nbsp-indent',
    (l, n) =>
      lead(l[n]).length
        ? l.map((x, i) =>
            i === n ? NBSP.repeat(lead(x).length) + x.trimStart() : x
          )
        : null,
  ],
  [
    'nbsp-one',
    (l, n) =>
      lead(l[n]).length
        ? l.map((x, i) =>
            i === n ? lead(x).slice(1) + NBSP + x.trimStart() : x
          )
        : null,
  ],
  [
    'nbsp-blank-line',
    (l, n) => [...l.slice(0, n + 1), NBSP, ...l.slice(n + 1)],
  ],
  ['bom-line', (l, n) => l.map((x, i) => (i === n ? '﻿' + x : x))],
  [
    'doc-end-line',
    (l, n) => [...l.slice(0, n + 1), lead(l[n]) + '...', ...l.slice(n + 1)],
  ],
  [
    'doc-start-line',
    (l, n) => [...l.slice(0, n + 1), lead(l[n]) + '---', ...l.slice(n + 1)],
  ],
  [
    'flow-wrap',
    (l, n) =>
      /^\s*[\w-]+: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? lead(x) + '{' + x.trimStart() + '}' : x))
        : null,
  ],
  [
    'block-scalar',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: .*/, ': |') : x))
        : null,
  ],
  [
    'to-null',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: .*/, ':') : x))
        : null,
  ],
  [
    'lone-cr',
    (l, n) =>
      n + 1 < l.length
        ? [...l.slice(0, n), l[n] + '\r' + l[n + 1], ...l.slice(n + 2)]
        : null,
  ],
  ['crlf-line', (l, n) => l.map((x, i) => (i === n ? x + '\r' : x))],
  [
    'join-next',
    (l, n) =>
      n + 1 < l.length
        ? [...l.slice(0, n), l[n] + l[n + 1], ...l.slice(n + 2)]
        : null,
  ],
  [
    'split-value',
    (l, n) => {
      const a = l[n].indexOf(': ');
      return a < 0
        ? null
        : [
            ...l.slice(0, n),
            l[n].slice(0, a + 1),
            '  ' + l[n].slice(a + 2),
            ...l.slice(n + 1),
          ];
    },
  ],
  [
    'dash-drop',
    (l, n) =>
      /^\s*- /.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace('- ', '  ') : x))
        : null,
  ],
  [
    'dash-add',
    (l, n) =>
      /^\s*[\w-]+: /.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/^(\s*)/, '$1- ') : x))
        : null,
  ],
  ['double', (l, n) => [...l.slice(0, n + 1), l[n], ...l.slice(n + 1)]],
  ['delete', (l, n) => [...l.slice(0, n), ...l.slice(n + 1)]],
  [
    'swap-next',
    (l, n) =>
      n + 1 < l.length
        ? [...l.slice(0, n), l[n + 1], l[n], ...l.slice(n + 2)]
        : null,
  ],
  ['truncate', (l, n) => l.slice(0, n + 1)],
  [
    'unclosed-quote',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: (.*)/, ': "$1') : x))
        : null,
  ],
  [
    'open-flow',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: (.*)/, ': [$1,') : x))
        : null,
  ],
  [
    'anchor',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: /, ': &zz ') : x))
        : null,
  ],
  [
    'alias',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: .*/, ': *zz') : x))
        : null,
  ],
  [
    'tag-str',
    (l, n) =>
      /: \S/.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/: /, ': !!str ') : x))
        : null,
  ],
  [
    'dup-sibling-key',
    (l, n) => {
      const c = lead(l[n]);
      const sibling = l.find(
        (x, i) => i !== n && lead(x) === c && /^\s*[\w-]+: /.test(x)
      );
      return sibling
        ? [...l.slice(0, n + 1), sibling, ...l.slice(n + 1)]
        : null;
    },
  ],
];

/** What the file means, read independently of the guard: its value, or
 * undefined when it does not parse or cannot be read. */
function meaning(text: string): { value: Json } | undefined {
  const document = parseDocument(text);
  if (document.errors.length) return undefined;
  try {
    return { value: document.toJS() };
  } catch {
    return undefined;
  }
}

/** Which documented writer limit an edit the writer cannot make falls
 * under, by its shape; null for any other (rpg-project#1014 known limits:
 * a multi-line string written into a flow row, keys removed from a flow
 * map). */
function knownLimit(
  document: ReturnType<typeof parseDocument>,
  edit: { kind: number; path: Path },
  current: Json
): string | null {
  const inFlow = (path: Path) => {
    for (let n = path.length; n >= 0; n--) {
      const node = document.getIn(path.slice(0, n), true) as Node | undefined;
      if (node && (isMap(node) || isSeq(node)) && node.flow) return true;
    }
    return false;
  };
  const parent = edit.path.slice(0, -1);
  const multiLine = (value: Json) =>
    typeof value === 'string' && value.includes('\n');
  const here = at(current, edit.path) as Json;
  if (
    inFlow(edit.path) &&
    ((edit.kind <= 1 && multiLine(here)) ||
      (edit.kind === 6 &&
        here !== null &&
        typeof here === 'object' &&
        Object.values(here).some(multiLine)))
  )
    return 'multi-line text into a flow row';
  if (
    (edit.kind === 2 && inFlow(parent)) ||
    (edit.kind === 7 && inFlow(edit.path))
  )
    return 'a key removed from a flow map';
  return null;
}

describe('the guard refuses every write that means something else (rpg-project#1014 reviews)', () => {
  afterEach(() => vi.restoreAllMocks());

  // A regression test of the guard as a whole: it is true by construction
  // while the guard parses the whole write, and fails if a shortcut that
  // reads only part of it comes back.
  it('on seeded castle edits, every sound write passes, and every faulty write of one passes only if it means the edit', () => {
    const random = seeded(1014);
    const own = parse(served) as Json;
    const paths = pathsOf(own);
    const document = parseDocument(served);
    const real = spliceInternals.text;
    const limits: Record<string, number> = {};
    const wrong: string[] = [];
    let faulty = 0;
    let refused = 0;
    for (let sample = 0; sample < 30; sample++) {
      const edit = randomEdit(own, paths, random);
      const current = edit.next;
      const intended = mergeValue(own, own, current);
      // The writer's own text, unchecked: when it means the edit, the
      // guard must pass it. When it does not, the writer cannot make this
      // write, and only the known limits may be why (rpg-project#1014).
      const honest = real(served, document, own, current).out;
      const sound = written(served, own, current);
      if (!sameValue(meaning(honest)?.value, intended)) {
        const limit = knownLimit(document, edit, current);
        if (!limit)
          wrong.push(
            `sample ${sample}: the writer cannot make it (edit ${edit.kind} at ${edit.path.join('.')})`
          );
        else limits[limit] = (limits[limit] ?? 0) + 1;
        if (sound !== null)
          wrong.push(
            `sample ${sample}: a write that means something else passed`
          );
        continue;
      }
      if (sound === null) {
        wrong.push(`sample ${sample}: a sound write was refused`);
        continue;
      }
      const lines = sound.split('\n');
      const changed =
        sound.slice(0, honestEdit(served, sound).start).split('\n').length - 1;
      for (let k = 0; k < 8; k++) {
        const n = Math.max(
          0,
          Math.min(lines.length - 1, changed + Math.floor(random() * 11) - 5)
        );
        const [kind, fault] = FAULTS[Math.floor(random() * FAULTS.length)];
        const broken = fault(lines, n);
        if (!broken) continue;
        const out = broken.join('\n');
        if (out === sound) continue;
        faulty++;
        const spy = vi
          .spyOn(spliceInternals, 'text')
          .mockReturnValue({ out, edits: [honestEdit(served, out)] });
        const passed = written(served, own, current) !== null;
        spy.mockRestore();
        if (!passed) refused++;
        const means = meaning(out);
        if (passed && !(means && sameValue(means.value, intended)))
          wrong.push(`sample ${sample}, ${kind} at line ${n + 1}: passed`);
      }
    }
    expect(faulty).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
    // The known limits are named, not skipped: any other cause fails above.
    for (const name of Object.keys(limits))
      expect([
        'multi-line text into a flow row',
        'a key removed from a flow map',
      ]).toContain(name);
  }, 120_000);
});
