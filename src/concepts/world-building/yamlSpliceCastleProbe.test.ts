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
import { checkWrite, spliceInternals, spliceYaml } from './yamlSplice';

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
  if (node.flow) return { head: start, tail: end };
  // A block list owns the comment lines directly above its first dash when
  // the dash starts its line, and every comment or blank line after its last
  // row up to the next line of content.
  let head = start;
  const line = lineStart(source, start);
  if (source.slice(line, start).trim() === '') {
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
  }
  let tail = source.indexOf('\n', end);
  tail = tail === -1 ? source.length : tail + 1;
  while (tail < source.length) {
    const next = source.indexOf('\n', tail);
    const text = source.slice(tail, next === -1 ? source.length : next);
    if (text.trim() !== '' && !/^\s*#/.test(text)) break;
    tail = next === -1 ? source.length : next + 1;
  }
  return { head, tail };
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
  if (c.move && !exact(comments(out), comments(c.source)))
    return 'changed the comment lines';
  return null;
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
      yield {
        label: `${name}.${key} removed`,
        list: map,
        source,
        base: own,
        current: without,
        move: false,
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

  it('moves every row of every list up and down', () => {
    const { writes, failures } = failuresOf(casesOf(served, () => false));
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

  it('empties every map, and removes the last key of every map', () => {
    const { writes, failures } = failuresOf(
      mapCasesOf(
        served,
        (map, key) => Object.keys(map.node.toJSON()).at(-1) === key,
        () => false
      )
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  it('the maps near the top of the castle: a key added back, and a first key added to the emptied map', () => {
    const { writes, failures } = failuresOf(
      mapCasesOf(
        served,
        (map, key) =>
          map.depth <= 2 && Object.keys(map.node.toJSON()).at(-1) === key,
        (map) => map.depth <= 2,
        (map) => map.depth <= 2
      )
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  it('replaces every scalar, each with one of text, a number, a flag, null, empty text and text that reads as another type', () => {
    const { writes, failures } = failuresOf(
      scalarCasesOf(served, (i) => [SCALARS[i % SCALARS.length]])
    );
    expect(writes).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 300_000);

  it.runIf(process.env.SPLICE_PROBE === 'all')(
    'every key of every map removed and added back, every map emptied and given a first key, every scalar replaced by every type',
    () => {
      const maps = failuresOf(
        mapCasesOf(
          served,
          () => true,
          () => true
        )
      );
      const scalars = failuresOf(scalarCasesOf(served, () => SCALARS));
      expect(maps.failures).toEqual([]);
      expect(scalars.failures).toEqual([]);
    },
    3_600_000
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

/** A random edit of the castle: a scalar set to another type, a key or row
 * removed, a key or row added, a map or list emptied, two rows swapped. */
function randomEdit(own: Json, paths: [Path, Json][], random: () => number) {
  for (;;) {
    const [path, value] = paths[Math.floor(random() * paths.length)];
    if (path.length === 0) continue;
    const next = copy(own);
    const parent = at(next, path.slice(0, -1)) as Record<string | number, Json>;
    const leaf = path.at(-1)!;
    const kind = Math.floor(random() * 6);
    if (kind === 0)
      parent[leaf] = SCALARS[Math.floor(random() * SCALARS.length)];
    else if (kind === 1) {
      if (Array.isArray(parent)) parent.splice(leaf as number, 1);
      else delete parent[leaf];
    } else if (kind === 2) {
      if (Array.isArray(parent)) parent.splice(leaf as number, 0, 'added');
      else parent[`added${Math.floor(random() * 99)}`] = 7;
    } else if (kind === 3 && value && typeof value === 'object')
      parent[leaf] = Array.isArray(value) ? [] : {};
    else if (kind === 4 && Array.isArray(value) && value.length > 1) {
      const target = at(next, path) as Json[];
      [target[0], target[1]] = [target[1], target[0]];
    } else if (
      kind === 5 &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    )
      (at(next, path) as Record<string, Json>)[
        `added${Math.floor(random() * 99)}`
      ] = 'x';
    else continue;
    return next;
  }
}

/** Ways a writer goes wrong, applied to the line `n` of a correct write. */
const FAULTS: ((lines: string[], n: number) => string[] | null)[] = [
  (l, n) => l.map((x, i) => (i === n ? ` ${x}` : x)),
  (l, n) => l.map((x, i) => (i === n ? `  ${x}` : x)),
  (l, n) =>
    l[n].startsWith(' ') ? l.map((x, i) => (i === n ? x.slice(1) : x)) : null,
  (l, n) =>
    l[n].startsWith('  ') ? l.map((x, i) => (i === n ? x.slice(2) : x)) : null,
  // The line's newline dropped: it joins the next.
  (l, n) =>
    n + 1 < l.length
      ? [...l.slice(0, n), l[n] + l[n + 1], ...l.slice(n + 2)]
      : null,
  // A newline added inside the line.
  (l, n) => {
    const at = l[n].indexOf(': ');
    return at < 0
      ? null
      : [
          ...l.slice(0, n),
          l[n].slice(0, at + 1),
          `  ${l[n].slice(at + 2)}`,
          ...l.slice(n + 1),
        ];
  },
  // A dash dropped, or a dash written for a key.
  (l, n) =>
    /^\s*- /.test(l[n])
      ? l.map((x, i) => (i === n ? x.replace('- ', '  ') : x))
      : null,
  (l, n) =>
    /^\s*- /.test(l[n])
      ? l.map((x, i) => (i === n ? x.replace('- ', 'k: ') : x))
      : /^\s*[\w-]+: /.test(l[n])
        ? l.map((x, i) => (i === n ? x.replace(/^(\s*)/, '$1- ') : x))
        : null,
  // A line written twice (a duplicate key, or a duplicate row).
  (l, n) => [...l.slice(0, n + 1), l[n], ...l.slice(n + 1)],
  // Truncated after the line.
  (l, n) => l.slice(0, n + 1),
];

describe('the short path agrees with the full parse (rpg-project#1014 second review)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('on seeded castle edits, and on faulty writes of each, the guard’s verdict is the full parse’s', () => {
    const random = seeded(1014);
    const own = parse(served) as Json;
    const paths = pathsOf(own);
    const real = spliceInternals.text;
    const disagreements: string[] = [];
    let cases = 0;
    let accepted = 0;
    for (let sample = 0; sample < 60; sample++) {
      const current = randomEdit(own, paths, random);
      const sound = written(served, own, current);
      if (sound === null) {
        disagreements.push(`sample ${sample}: a sound write was refused`);
        continue;
      }
      const lines = sound.split('\n');
      const changed =
        sound.slice(0, honestEdit(served, sound).start).split('\n').length - 1;
      for (let k = 0; k < 6; k++) {
        const n = Math.max(
          0,
          Math.min(lines.length - 1, changed + Math.floor(random() * 5) - 2)
        );
        const fault = FAULTS[Math.floor(random() * FAULTS.length)](lines, n);
        if (!fault) continue;
        const out = fault.join('\n');
        cases++;
        let full = true;
        try {
          checkWrite(own, own, current, out);
        } catch {
          full = false;
        }
        const spy = vi
          .spyOn(spliceInternals, 'text')
          .mockReturnValue({ out, edits: [honestEdit(served, out)] });
        const shipped = written(served, own, current) !== null;
        spy.mockRestore();
        if (shipped) accepted++;
        if (shipped !== full)
          disagreements.push(
            `sample ${sample} fault on line ${n + 1}: shipped ${shipped}, full ${full}`
          );
      }
    }
    expect(spliceInternals.text).toBe(real);
    expect(cases).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(cases);
    expect(disagreements).toEqual([]);
  }, 300_000);
});
