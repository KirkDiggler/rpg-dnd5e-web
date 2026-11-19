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
import { describe, expect, it } from 'vitest';
import {
  isMap,
  isPair,
  isScalar,
  isSeq,
  parse,
  parseDocument,
  type Node,
  type YAMLSeq,
} from 'yaml';
import served from '../encounter-studio/fixtures/the-mad-king-served.yaml?raw';
import { spliceYaml } from './yamlSplice';

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

function ownedBytes(source: string, node: YAMLSeq) {
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
  list: List;
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
});
