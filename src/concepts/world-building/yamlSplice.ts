/**
 * THE STUDIO WRITES BACK WHAT IT READ (rpg-project#857, Kirk: "if it runs, we
 * should load it"). The studio loads whatever the engine runs; the dungeonspec
 * compiler is the validator; fields the studio does not author are preserved
 * and written back unchanged.
 *
 * `spliceYaml` is how a saved or exported document keeps the file's own
 * bytes. It takes the file as it was read (`source`), what the studio's
 * encoder writes for the document as it was read (`base`), and what it writes
 * now (`current`), and edits the source TEXT only where `base` and `current`
 * differ. Comments, flow maps, quoting and layout are untouched anywhere the
 * author did not change; an unchanged document returns `source` byte for byte.
 *
 * Edits are byte-range splices over the parsed source's node ranges:
 * - a changed scalar, or a value that changed shape, is replaced in place (an
 *   empty value, `key:`, gains its space: `key: 3`);
 * - a map recurses key by key: a key the studio adds is inserted after the
 *   previous key it writes that stays, else before the next; a key it stops
 *   writing is removed with its lines and the comment lines directly above;
 * - a sequence ALIGNS its items before it walks them (`alignItems`): by `id`
 *   when every item on both sides has a unique one, else by the longest
 *   common subsequence of equal items, with the items between two matches
 *   paired in order. Matched items that keep their relative order are walked
 *   in place; every other old item is removed from wherever it stands, and
 *   every other new item is inserted where it now stands, carrying the
 *   source's own value for an item that only moved (`mergeValue`);
 * - a flow sequence that gains, loses or reorders items is rewritten whole
 *   from that merged value: flow sequences are one line, and hold no comments.
 * - AN ANCHOR IS NOT SHARED BY AN EDIT: the studio reads `*b` as a copy of
 *   `&b`, so when the anchored value changes, each alias of it that the edit
 *   did not reach is first written out as the value it had.
 */
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  stringify,
  visit,
  type Alias,
  type Document,
  type Node,
  type Pair,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';

type Json = unknown;

interface Edit {
  start: number;
  end: number;
  text: string;
  order: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Structural equality over parsed YAML values; key order does not count. */
export function sameValue(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every(
      (key) => Object.hasOwn(b, key) && sameValue(a[key], b[key])
    );
  }
  return Number.isNaN(a) && Number.isNaN(b);
}

/** The `id` of every item, when every item is a map with a unique text or
 * number id; else null. */
function idsOf(items: readonly Json[]): (string | number)[] | null {
  const ids: (string | number)[] = [];
  for (const item of items) {
    if (!isObject(item)) return null;
    const id = item.id;
    if (typeof id !== 'string' && typeof id !== 'number') return null;
    ids.push(id);
  }
  return new Set(ids).size === ids.length ? ids : null;
}

/**
 * Which old item each new item is, as `[oldIndex, newIndex]` pairs in new
 * order: by `id` when both lists carry unique ids, else by the longest common
 * subsequence of equal items, with the items between two matches paired in
 * order (an edited item between two unchanged ones is the same item). Before
 * that in-order pairing, a new item outside the common order that equals an
 * old one outside it is that item, moved (rpg-project#998: a swap matches
 * only one of the two rows in common order; the other only moved, and keeps
 * its own text). Without ids, a row that moved AND changed in one write is
 * read as one removed and one added. Equal rows (twins) pair in order. An
 * old item in no pair was removed; a new item in no pair was added.
 */
export function alignItems(
  base: readonly Json[],
  current: readonly Json[]
): [number, number][] {
  const baseIds = idsOf(base);
  const currentIds = idsOf(current);
  if (baseIds && currentIds) {
    const at = new Map(baseIds.map((id, i) => [id, i]));
    return currentIds.flatMap((id, j): [number, number][] =>
      at.has(id) ? [[at.get(id)!, j]] : []
    );
  }
  const n = base.length;
  const m = current.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = sameValue(base[i], current[j])
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (sameValue(base[i], current[j])) anchors.push([i++, j++]);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  // An item outside the common order that equals one on the other side
  // only moved (rpg-project#998). Paired first, so the in-order pairing of
  // the items left between two matches never reads a move as an edit.
  const usedOld = new Set(anchors.map(([i]) => i));
  const usedNew = new Set(anchors.map(([, j]) => j));
  const pairs: [number, number][] = [...anchors];
  for (let j = 0; j < m; j++) {
    if (usedNew.has(j)) continue;
    for (let i = 0; i < n; i++)
      if (!usedOld.has(i) && sameValue(base[i], current[j])) {
        usedOld.add(i);
        usedNew.add(j);
        pairs.push([i, j]);
        break;
      }
  }
  let [pi, pj] = [0, 0];
  for (const [ai, aj] of [...anchors, [n, m] as [number, number]]) {
    const olds: number[] = [];
    const news: number[] = [];
    for (let i = pi; i < ai; i++) if (!usedOld.has(i)) olds.push(i);
    for (let j = pj; j < aj; j++) if (!usedNew.has(j)) news.push(j);
    for (let k = 0; k < Math.min(olds.length, news.length); k++)
      pairs.push([olds[k], news[k]]);
    [pi, pj] = [ai + 1, aj + 1];
  }
  // TWINS PAIR IN ORDER: among pairs whose rows are equal, the k-th old row
  // of a value is the k-th new row of it, so moving one of two identical
  // rows past another row carries each twin's own comment (rpg-project#998
  // review). The values are equal, so what is written does not change.
  const equal = pairs.filter(([i, j]) => sameValue(base[i], current[j]));
  const done = new Set<number>();
  for (let a = 0; a < equal.length; a++) {
    if (done.has(a)) continue;
    const twins = equal
      .map((pair, k) => [pair, k] as const)
      .filter(
        ([[i]], k) => !done.has(k) && sameValue(base[i], base[equal[a][0]])
      );
    const olds = twins.map(([[i]]) => i).sort((x, y) => x - y);
    const news = twins.map(([[, j]]) => j).sort((x, y) => x - y);
    twins.forEach(([pair, k], t) => {
      done.add(k);
      pair[0] = olds[t];
      pair[1] = news[t];
    });
  }
  return pairs.sort((x, y) => x[1] - y[1]);
}

/** The pairs whose old indices rise with the new ones, longest first: the
 * items that stay where they are relative to each other. */
function steadyPairs(pairs: [number, number][]): Set<number> {
  const tails: number[] = [];
  const back: number[] = new Array(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][0] < pairs[k][0]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) back[k] = tails[lo - 1];
    tails[lo] = k;
  }
  const steady = new Set<number>();
  for (let k = tails.at(-1) ?? -1; k !== -1; k = back[k]) steady.add(k);
  return steady;
}

/** The source's own value with the studio's base → current changes applied:
 * keys the studio never wrote (in `own`, not in `base`) are kept, and list
 * items are matched as `alignItems` matches them. */
export function mergeValue(own: Json, base: Json, current: Json): Json {
  if (sameValue(base, current)) return own;
  if (isObject(own) && isObject(base) && isObject(current)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(own)) {
      if (Object.hasOwn(base, key) && !Object.hasOwn(current, key)) continue;
      out[key] =
        Object.hasOwn(current, key) && Object.hasOwn(base, key)
          ? mergeValue(own[key], base[key], current[key])
          : Object.hasOwn(current, key)
            ? current[key]
            : own[key];
    }
    for (const key of Object.keys(current))
      if (!Object.hasOwn(out, key) && !Object.hasOwn(own, key))
        out[key] = current[key];
    return out;
  }
  if (Array.isArray(own) && Array.isArray(base) && Array.isArray(current)) {
    const from = new Map(
      alignItems(base, current).map(([i, j]) => [j, i] as const)
    );
    return current.map((item, j) => {
      const i = from.get(j);
      return i !== undefined && i < own.length
        ? mergeValue(own[i], base[i], item)
        : item;
    });
  }
  return current;
}

/** A moved item that also changed: its own text (`own`, its lines at
 * column `dash`, comments included) with the change spliced in, so its
 * comments and the layout of what did not change stay; null when that text
 * does not stand alone (an alias to an anchor elsewhere, a line written left
 * of the dash). */
function movedItemEdited(
  own: string,
  dash: number,
  base: Json,
  current: Json
): string | null {
  const pad = ' '.repeat(dash);
  const lines = own.split('\n');
  if (lines.some((line) => line.trim() !== '' && !line.startsWith(pad)))
    return null;
  try {
    // Its own small file, checked as any write is; not remembered beside
    // the files the studio reads.
    const text = `${lines.map((line) => line.slice(dash)).join('\n')}\n`;
    const document = parseDocument(text);
    if (document.errors.length) return null;
    return checkWrite(
      document.toJS(),
      [base],
      [current],
      spliceText(text, document, [base], [current]).out
    )
      .replace(/\n$/, '')
      .split('\n')
      .map((line) => (line === '' ? line : pad + line))
      .join('\n');
  } catch {
    return null;
  }
}

/** The sentence every refused write opens with (rpg-project#1014). */
export const UNSAFE_WRITE =
  'The studio could not write this change safely, so nothing was changed.';

/** A write the splice produced that does not read back as the edit meant
 * (rpg-project#1014). Its message is the sentence the studio shows. */
export class UnsafeWriteError extends Error {
  constructor(reason: string) {
    super(`${UNSAFE_WRITE} ${reason}`);
    this.name = 'UnsafeWriteError';
  }
}

/** Where two values first differ, as a path (`room.regions[1].q`); null when
 * they are the same under `sameValue`. */
export function firstDifference(a: Json, b: Json, path = ''): string | null {
  if (sameValue(a, b)) return null;
  const here = path || 'the document';
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return here;
    for (let i = 0; i < a.length; i++) {
      const at = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (at) return at;
    }
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const next = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) return next;
      const at = firstDifference(a[key], b[key], next);
      if (at) return at;
    }
  }
  return here;
}

/**
 * THE WRITE GUARD (rpg-project#1014): the splice's text must read back as
 * the edit meant it, or it is refused. `own` is the file's value as it was
 * read; the intended value is that with the studio's `base` → `current`
 * changes applied (`mergeValue`: keys the studio does not author stay). The
 * text must parse, and its value must equal the intended one under
 * `sameValue`: list order, every key, every scalar and its type (`3` is not
 * `"3"`, `null` is not missing) count; key order, comments, quoting and
 * layout do not, since nothing that reads the file (the engine's decoder,
 * the studio's) depends on them. Throws `UnsafeWriteError`, never returns
 * a write it did not check.
 */
export function checkWrite(
  own: Json,
  base: Json,
  current: Json,
  out: string
): string {
  const written = parseDocument(out);
  if (written.errors.length) {
    const [error] = written.errors;
    const line = error.linePos?.[0]?.line;
    throw new UnsafeWriteError(
      `The file it would write does not parse${line ? ` at line ${line}` : ''}.`
    );
  }
  let value: Json;
  try {
    value = written.toJS();
  } catch (error) {
    // An alias whose anchor the write lost, for one (rpg-project#1014
    // review): the text parses, but has no value.
    throw new UnsafeWriteError(
      `The file it would write cannot be read back: ${error instanceof Error ? error.message : String(error)}.`
    );
  }
  const at = firstDifference(value, mergeValue(own, base, current));
  if (at)
    throw new UnsafeWriteError(
      `The file it would write reads ${at} differently from the edit.`
    );
  return out;
}

/** The last few files read, parsed once: the studio splices the same source
 * on every save and every check (rpg-project#1014). Neither the document nor
 * its value is changed by a splice. `local` is the short path's file
 * precondition (L0 below); `scalars` are the source ranges of its scalars
 * that span lines (L5). */
interface Read {
  source: string;
  document: Document;
  own: Json;
  local: boolean;
  scalars: [number, number][];
}
const reads: Read[] = [];

function readOf(source: string): Read {
  const held = reads.find((read) => read.source === source);
  if (held) return held;
  const document = parseDocument(source);
  if (document.errors.length || !document.contents)
    throw new Error(
      `the file this draft was read from no longer parses: ${document.errors[0]?.message ?? 'it is empty'}`
    );
  let local = !/^(---|\.\.\.|%)/m.test(source) && !/[\t\r]/.test(source);
  const scalars: [number, number][] = [];
  visit(document, {
    Node(_key, node) {
      if (isAlias(node) || (node as { anchor?: string }).anchor || node.tag)
        local = false;
      if (
        isScalar(node) &&
        node.range &&
        source.slice(node.range[0], node.range[1]).includes('\n')
      )
        scalars.push([node.range[0], node.range[1]]);
    },
  });
  const read = {
    source,
    document,
    own: document.toJS() as Json,
    local,
    scalars,
  };
  reads.unshift(read);
  reads.length = Math.min(reads.length, 4);
  return read;
}

const startOfLine = (text: string, at: number) =>
  text.lastIndexOf('\n', at - 1) + 1;
const pastLine = (text: string, at: number) => {
  const end = text.indexOf('\n', at);
  return end === -1 ? text.length : end + 1;
};
const indentOf = (line: string) => line.search(/\S/);
/** A line that opens a block scalar (`|`, `>`, with their indicators), or
 * might: anything that ends in one is sent to the full parse (L5). */
const BLOCK_SCALAR = /(^|[\s:-])[|>][-+0-9]*\s*(#.*)?$/;

interface Region {
  path: (string | number)[];
  /** Source offsets of the region's whole lines (`start`..`end`). */
  start: number;
  end: number;
  /** The column its key (a line) or its first entry (a collection) is at. */
  column: number;
  /** One `key: scalar` line, rather than a block collection. */
  line?: string;
  /** A block collection: which kind it is. */
  kind?: 'map' | 'seq';
}

/** The deepest part of the file that holds `edit` and can be read on its
 * own: a block collection that starts its own line right of its parent
 * (L4), or a `key: scalar` written on one line (L3). Null when only the
 * document root holds it. */
function regionOf(read: Read, edit: Edit): Region | null {
  const { source } = read;
  let best: Region | null = null;
  let node = read.document.contents as Node | null;
  const path: (string | number)[] = [];
  while (node && (isMap(node) || isSeq(node))) {
    let next: Node | null = null;
    const seqColumn =
      isSeq(node) && node.range
        ? node.range[0] - startOfLine(source, node.range[0])
        : -1;
    const pairs = isMap(node)
      ? node.items
      : node.items.map((item, i) => ({ key: i, value: item }));
    for (const pair of pairs) {
      const key = isMap(node)
        ? isScalar(pair.key)
          ? String((pair.key as { value: unknown }).value)
          : null
        : (pair.key as number);
      const child = pair.value as Node | null;
      if (key === null) return best;
      // L3: `key: scalar` on one line, in a block map.
      if (
        isMap(node) &&
        !node.flow &&
        (isScalar(child) || child === null) &&
        isScalar(pair.key) &&
        pair.key.range
      ) {
        const keyAt = pair.key.range[0];
        const line = startOfLine(source, keyAt);
        const lineEnd = pastLine(source, keyAt) - 1;
        const valueEnd = child?.range?.[1] ?? keyAt;
        if (
          source.slice(line, keyAt).trim() === '' &&
          valueEnd <= lineEnd &&
          edit.start >= keyAt &&
          edit.end <= lineEnd &&
          !edit.text.includes('\n')
        )
          return {
            path: [...path, key],
            start: line,
            end: Math.min(lineEnd + 1, source.length),
            column: keyAt - line,
            line: key as string,
          };
      }
      if (!child?.range || !(isMap(child) || isSeq(child))) continue;
      let end = child.range[1];
      while (end > child.range[0] && /\s/.test(source[end - 1])) end--;
      const line = startOfLine(source, child.range[0]);
      const stop = pastLine(source, end);
      if (edit.start < line || edit.end > stop) continue;
      path.push(key);
      next = child;
      const column = child.range[0] - line;
      // L4: right of its parent, the key (or the dash) it belongs to; a
      // list may sit at its key's own column, and is not read alone then.
      const parent = isMap(node)
        ? (pair.key as Node).range![0] -
          startOfLine(source, (pair.key as Node).range![0])
        : seqColumn;
      if (
        !child.flow &&
        column > parent &&
        source.slice(line, child.range[0]).trim() === ''
      )
        best = {
          path: [...path],
          start: line,
          end: stop,
          column,
          kind: isMap(child) ? 'map' : 'seq',
        };
      break;
    }
    node = next;
  }
  return best;
}

function withValueAt(value: Json, path: (string | number)[], leaf: Json): Json {
  if (path.length === 0) return leaf;
  const [head, ...rest] = path;
  const copy = (
    Array.isArray(value) ? [...value] : { ...(value as object) }
  ) as Record<string | number, Json>;
  copy[head] = withValueAt(copy[head], rest, leaf);
  return copy;
}

/** A region's new text read on its own (L3, L4, L5), or undefined when it
 * cannot be. */
function readRegion(region: Region, text: string): { value: Json } | undefined {
  // L2: whole lines; the text ends where a line ends.
  if (text !== '' && !text.endsWith('\n')) return undefined;
  const lines = text.split('\n').slice(0, -1);
  const content = lines.filter((line) => line.trim() !== '');
  // L5: no block scalar is opened inside it.
  if (content.some((line) => BLOCK_SCALAR.test(line))) return undefined;
  if (content.some((line) => indentOf(line) < region.column)) return undefined;
  const first = content.find((line) => !/^\s*#/.test(line));
  if (first === undefined) return undefined;
  // L3 and L4: its first entry stays at exactly the column it was at.
  if (indentOf(first) !== region.column) return undefined;
  if (region.line !== undefined && content.length !== 1) return undefined;
  const part = parseDocument(
    lines.map((line) => line.slice(region.column)).join('\n')
  );
  if (part.errors.length || part.warnings.length || !part.contents)
    return undefined;
  // L4: a block collection stays the kind it was.
  if (region.kind === 'map' && !(isMap(part.contents) && !part.contents.flow))
    return undefined;
  if (region.kind === 'seq' && !(isSeq(part.contents) && !part.contents.flow))
    return undefined;
  let value: Json;
  try {
    value = part.toJS();
  } catch {
    return undefined;
  }
  if (region.line === undefined) return { value };
  if (!isObject(value) || Object.keys(value).length !== 1) return undefined;
  if (!Object.hasOwn(value, region.line)) return undefined;
  return { value: value[region.line] };
}

/**
 * THE GUARD'S SHORT PATH (rpg-project#1014 review: a check on every
 * keystroke must not lag). It may only ever agree with the full parse:
 * true means the write is the one the full check would accept; false sends
 * it to the full check, which decides. Never a refusal of its own. It
 * applies only when every precondition holds, each one tested in
 * `yamlSplice.test.ts` › "the short path's preconditions":
 *
 * - L0 the file: no `---`, `...` or `%` line, no tab, no carriage return,
 *   no anchor, alias or tag.
 * - L1 every edit falls in a region (`regionOf`), and the write is the
 *   source byte for byte outside the regions.
 * - L2 each region is whole lines in the source and in the write: it
 *   starts at a line start and its new text ends with a newline, so it can
 *   join neither neighbour.
 * - L3 a `key: scalar` line stays one line, its key at exactly the column
 *   it was at (deeper would re-parent it under the line above), and reads
 *   alone as that one key.
 * - L4 a block collection starts its own line at a column right of its
 *   parent key's (or dash's) column; its first entry stays at exactly that
 *   column, no line goes left of it, and it stays the kind it was (a list
 *   is not rewritten as a map, which could join its parent's keys).
 * - L5 no block scalar (`|`, `>`) is opened inside a region, and no scalar
 *   that spans lines reaches the line before one or runs into it.
 * - L6 the source's value with each region's value in place equals the
 *   intended value.
 *
 * `yamlSplice.test.ts` › "the short path agrees with the full parse" checks
 * the shipped verdict against the full parse's on seeded castle edits and
 * faulty writers.
 */
function checkLocally(
  read: Read,
  base: Json,
  current: Json,
  out: string,
  edits: readonly Edit[]
): boolean {
  if (!read.local || edits.length === 0) return false;
  const { source } = read;
  const found: { region: Region; edits: Edit[] }[] = [];
  for (const edit of edits) {
    const region = regionOf(read, edit);
    if (!region) return false;
    // L5: a scalar that spans lines must not reach the region's line
    // before, or run into the region.
    const before = region.start > 0 ? startOfLine(source, region.start - 1) : 0;
    if (read.scalars.some(([from, to]) => from < region.start && to > before))
      return false;
    const held = found.find(
      (f) => f.region.start === region.start && f.region.end === region.end
    );
    if (held) held.edits.push(edit);
    else found.push({ region, edits: [edit] });
  }
  // A region inside another is the outer one's.
  const regions = found
    .filter(
      (f) =>
        !found.some(
          (g) =>
            g !== f &&
            g.region.start <= f.region.start &&
            f.region.end <= g.region.end &&
            (g.region.start < f.region.start || f.region.end < g.region.end)
        )
    )
    .sort((x, y) => x.region.start - y.region.start);
  for (const f of found)
    if (!regions.includes(f)) {
      const outer = regions.find(
        (g) => g.region.start <= f.region.start && f.region.end <= g.region.end
      );
      if (!outer) return false;
      outer.edits.push(...f.edits);
    }
  let whole = read.own;
  let from = 0;
  let at = 0;
  for (const { region, edits: held } of regions) {
    if (region.start < from) return false;
    // L1: byte for byte outside the regions.
    const gap = source.slice(from, region.start);
    if (out.slice(at, at + gap.length) !== gap) return false;
    at += gap.length;
    // L2: the region starts a line in the write.
    if (at > 0 && out[at - 1] !== '\n') return false;
    const grown = held.reduce(
      (sum, e) => sum + e.text.length - (e.end - e.start),
      0
    );
    const length = region.end - region.start + grown;
    if (length < 0) return false;
    const part = readRegion(region, out.slice(at, at + length));
    if (!part) return false;
    whole = withValueAt(whole, region.path, part.value);
    at += length;
    // L2: and ends where a line ends.
    if (at > 0 && at < out.length && out[at - 1] !== '\n') return false;
    from = region.end;
  }
  if (out.slice(at) !== source.slice(from)) return false;
  // L6.
  return sameValue(whole, mergeValue(read.own, base, current));
}

/** The writer below the guard; a test may stand a faulty one in its place
 * to show the guard refuses what it writes (rpg-project#1014 review). */
export const spliceInternals = { text: spliceText };

/**
 * The source with the studio's base → current changes spliced into its
 * text, checked before it is returned: a write that does not read back as
 * the edit meant throws `UnsafeWriteError` instead. FAIL CLOSED: anything
 * that goes wrong while writing or checking is that refusal too, never a
 * write let through unchecked.
 */
export function spliceYaml(source: string, base: Json, current: Json): string {
  if (sameValue(base, current)) return source;
  try {
    const read = readOf(source);
    const { out, edits } = spliceInternals.text(
      source,
      read.document,
      base,
      current
    );
    if (checkLocally(read, base, current, out, edits)) return out;
    return checkWrite(read.own, base, current, out);
  } catch (error) {
    if (error instanceof UnsafeWriteError) throw error;
    throw new UnsafeWriteError(
      `The check could not finish: ${error instanceof Error ? error.message : String(error)}.`
    );
  }
}

function spliceText(
  source: string,
  document: Document,
  base: Json,
  current: Json
): { out: string; edits: Edit[] } {
  const pad = /\{ \S/.test(source) || !/\{\S/.test(source);
  // Brackets keep their own spacing: the castle pads `{ q }` but not `[{`.
  const padBrackets = /\[ \S/.test(source) || !/\[\S/.test(source);
  const edits: Edit[] = [];
  let order = 0;
  const edit = (start: number, end: number, text: string) =>
    edits.push({ start, end, text, order: order++ });

  const lineStart = (at: number) => source.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = (at: number) => {
    const end = source.indexOf('\n', at);
    return end === -1 ? source.length : end;
  };
  const column = (at: number) => at - lineStart(at);
  /** The start of the comment lines directly above line `at`, written at
   * `indent`. */
  const commentsAbove = (at: number, indent = column(at)) => {
    let start = lineStart(at);
    while (start > 0) {
      const prev = lineStart(start - 1);
      const line = source.slice(prev, start - 1);
      if (!/^\s*#/.test(line) || line.search(/\S/) !== indent) break;
      start = prev;
    }
    return start;
  };
  /** Through the end of the line `at` ends on, newline included. */
  const throughLine = (at: number) => Math.min(lineEnd(at) + 1, source.length);

  const flow = (value: Json) => {
    const text = stringify(value, {
      collectionStyle: 'flow',
      lineWidth: 0,
      flowCollectionPadding: pad,
    }).trimEnd();
    return pad && !padBrackets
      ? text.replace(/\[ /g, '[').replace(/ \]/g, ']')
      : text;
  };
  /** Block YAML whose first line sits at `indent` and whose later lines are
   * indented by it. */
  const block = (value: Json, indent: number) =>
    stringify(value, { lineWidth: 0, flowCollectionPadding: pad })
      .trimEnd()
      .split('\n')
      .map((line, i) =>
        i === 0 || line === '' ? line : ' '.repeat(indent) + line
      )
      .join('\n');

  /** Where a node's text ends: a block collection's range runs past its
   * last line's newline, so step back over trailing whitespace. */
  const endOf = (node: Node) => {
    let at = node.range![1];
    while (at > node.range![0] && /\s/.test(source[at - 1])) at--;
    return at;
  };
  const valueEnd = (node: Node | null | undefined, fallback: number) =>
    node?.range ? endOf(node) : fallback;
  const pairEnd = (pair: Pair) =>
    valueEnd(pair.value as Node | null, endOf(pair.key as Node));
  const keyOf = (pair: Pair) =>
    isScalar(pair.key) ? String(pair.key.value) : undefined;
  const ownValue = (node: Node) => node.toJS(document as Document);

  // ANCHORS: each alias's value to write out, keyed by the alias node. An
  // alias the edit reaches is written as the new value; one it does not is
  // written as the value it had, when its anchor changes.
  const aliasesOf = new Map<string, Alias[]>();
  visit(document, {
    Alias(_key, node) {
      const list = aliasesOf.get(node.source) ?? [];
      list.push(node);
      aliasesOf.set(node.source, list);
    },
  });
  const aliasWrites = new Map<Alias, { value: Json; reached: boolean }>();
  /** Keys moved up onto their row's dash line when the keys before them
   * went: a key added before one is written on that line too. */
  const promotedHeads = new Set<Pair>();

  /** Replace a node with `value` rendered in its own style. */
  function replace(node: Node, value: Json, inFlow: boolean) {
    const start = node.range![0];
    const end = endOf(node);
    // `key:` with nothing after it: a zero-width empty value. The new value
    // goes after the colon's space, on the key's line, in flow.
    if (start === end) return edit(start, end, ` ${flow(value)}`);
    // A block collection emptied goes back up onto its key's line (or its
    // dash's): `key: {}`, `key: []`, as a reader would write it.
    const emptied =
      (isMap(node) || isSeq(node)) &&
      !node.flow &&
      !inFlow &&
      ((Array.isArray(value) && value.length === 0) ||
        (isObject(value) && Object.keys(value).length === 0));
    if (emptied) {
      let at = start;
      while (at > 0 && /\s/.test(source[at - 1])) at--;
      if (
        at > 0 &&
        (source[at - 1] === ':' || source[at - 1] === '-') &&
        source.slice(at, start).includes('\n')
      )
        return edit(at, end, ` ${flow(value)}`);
    }
    const keepFlow =
      inFlow ||
      isScalar(node) ||
      ((isMap(node) || isSeq(node)) && node.flow) ||
      !(isObject(value) || Array.isArray(value)) ||
      (Array.isArray(value) && value.length === 0) ||
      (isObject(value) && Object.keys(value).length === 0);
    if (
      isScalar(node) &&
      typeof value === 'string' &&
      value.includes('\n') &&
      !inFlow
    )
      return edit(start, end, block(value, column(start)));
    edit(start, end, keepFlow ? flow(value) : block(value, column(start)));
  }

  function walk(node: Node, b: Json, c: Json, inFlow: boolean) {
    if (sameValue(b, c)) return;
    if (isAlias(node)) {
      aliasWrites.set(node, { value: c, reached: true });
      return;
    }
    const anchor = (node as { anchor?: string }).anchor;
    if (anchor)
      for (const alias of aliasesOf.get(anchor) ?? [])
        if (!aliasWrites.get(alias)?.reached)
          aliasWrites.set(alias, { value: ownValue(node), reached: false });
    if (isMap(node) && isObject(b) && isObject(c))
      return walkMap(node, b, c, inFlow);
    if (isSeq(node) && Array.isArray(b) && Array.isArray(c))
      return walkSeq(node, b, c, inFlow);
    replace(node, c, inFlow);
  }

  function walkMap(
    map: YAMLMap,
    b: Record<string, unknown>,
    c: Record<string, unknown>,
    inFlow: boolean
  ) {
    const inner = inFlow || map.flow === true;
    const pairs = new Map<string, Pair>();
    for (const pair of map.items) {
      const key = keyOf(pair);
      if (key !== undefined) pairs.set(key, pair);
    }
    const added = Object.keys(c).filter((key) => !pairs.has(key));
    const removed = new Set(
      Object.keys(b).filter((key) => !Object.hasOwn(c, key) && pairs.has(key))
    );
    // Every pair the source wrote goes: nothing stays to anchor an insert.
    // A flow map that gains and loses keys is one line with no comments, and
    // its insert and removal would meet at one point: rewritten whole.
    if (
      added.length > 0 &&
      (removed.size === map.items.length || (inner && removed.size > 0))
    )
      return replace(map, mergeValue(ownValue(map), b, c), inFlow);
    // EVERY KEY GOES: the map is written `{}` where it stood. Removing its
    // lines one by one would leave `key:` behind, which reads as null, not
    // as an empty map (rpg-project#1014 review).
    if (map.items.length > 0 && removed.size === map.items.length)
      return replace(map, mergeValue(ownValue(map), b, c), inFlow);
    for (const [key, pair] of pairs) {
      if (!Object.hasOwn(c, key) || !Object.hasOwn(b, key)) continue;
      const value = pair.value as Node | null;
      if (value?.range) walk(value, b[key], c[key], inner);
      else if (!sameValue(b[key], c[key]))
        return replace(map, mergeValue(ownValue(map), b, c), inFlow);
    }
    // THE ROW'S FIRST KEY GOES (rpg-project#1014 review): it shares its line
    // with the row's dash (`- id: a`), so removing its lines would take the
    // dash too. The first key that stays moves up onto the dash line
    // instead, with the keys before it; the comment lines directly above it
    // are set above the dash line. (Every key going is `- {}`, above.)
    const gone = (pair: Pair) => {
      const key = keyOf(pair);
      return key !== undefined && removed.has(key);
    };
    const head = map.items[0] as Pair | undefined;
    const headAt = (head?.key as Node | null)?.range?.[0];
    let promoted = 0;
    if (
      !inner &&
      head &&
      headAt !== undefined &&
      gone(head) &&
      source.slice(lineStart(headAt), headAt).trim() !== ''
    ) {
      promoted = map.items.findIndex((pair) => !gone(pair as Pair));
      const next = map.items[promoted] as Pair;
      const to = (next.key as Node).range![0];
      const comments = source.slice(commentsAbove(to), lineStart(to));
      edit(headAt, to, '');
      if (comments) {
        const line = lineStart(headAt);
        const indent = ' '.repeat(source.slice(line).search(/\S/));
        edit(
          line,
          line,
          comments
            .split('\n')
            .filter((text) => text.trim())
            .map((text) => `${indent}${text.trim()}\n`)
            .join('')
        );
      }
      promotedHeads.add(next);
    }
    for (const key of removed) {
      const pair = pairs.get(key)!;
      if (map.items.indexOf(pair) < promoted) continue;
      removePair(map, pair, inner);
    }
    const order = Object.keys(c);
    const stays = (key: string) => pairs.has(key) && !removed.has(key);
    const lastStaying = [...map.items]
      .reverse()
      .find((pair) => !removed.has(keyOf(pair) ?? ''));
    for (const key of added) {
      const at = order.indexOf(key);
      const previous = order.slice(0, at).reverse().find(stays);
      const next = order.slice(at + 1).find(stays);
      insertPair(
        map,
        key,
        c[key],
        previous
          ? { after: pairs.get(previous)! }
          : next
            ? { before: pairs.get(next)! }
            : { after: lastStaying as Pair },
        inner
      );
    }
  }

  function removePair(map: YAMLMap, pair: Pair, inFlow: boolean) {
    const index = map.items.indexOf(pair);
    const keyStart = (pair.key as Node).range![0];
    if (inFlow) {
      if (index > 0)
        return edit(pairEnd(map.items[index - 1] as Pair), pairEnd(pair), '');
      const next = map.items[index + 1] as Pair | undefined;
      return edit(
        keyStart,
        next ? (next.key as Node).range![0] : pairEnd(pair),
        ''
      );
    }
    edit(commentsAbove(keyStart), throughLine(pairEnd(pair)), '');
  }

  function insertPair(
    map: YAMLMap,
    key: string,
    value: Json,
    anchor: { after: Pair } | { before: Pair },
    inFlow: boolean
  ) {
    if (inFlow) {
      const text = flow({ [key]: value }).replace(/^\{\s?|\s?\}$/g, '');
      if ('before' in anchor) {
        const at = (anchor.before.key as Node).range![0];
        return edit(at, at, `${text}, `);
      }
      if (anchor.after) {
        const at = pairEnd(anchor.after);
        return edit(at, at, `, ${text}`);
      }
      const open = map.range![0] + 1;
      return edit(open, open, pad ? ` ${text} ` : text);
    }
    const indent = column(map.range![0]);
    const text = block({ [key]: value }, indent);
    if ('before' in anchor) {
      const keyStart = (anchor.before.key as Node).range![0];
      // The first key of a sequence item shares its line with the dash
      // (`- relocate:`): the new key takes the dash's place on that line and
      // the old key moves down to the next, never above the dash, where it
      // would be read as the sequence's own key (rpg-project#958).
      if (
        source.slice(lineStart(keyStart), keyStart).trim() !== '' ||
        promotedHeads.has(anchor.before)
      )
        return edit(keyStart, keyStart, `${text}\n${' '.repeat(indent)}`);
      const at = commentsAbove(keyStart);
      return edit(at, at, `${' '.repeat(indent)}${text}\n`);
    }
    const at = lineEnd(pairEnd(anchor.after));
    edit(at, at, `\n${' '.repeat(indent)}${text}`);
  }

  function walkSeq(seq: YAMLSeq, b: Json[], c: Json[], inFlow: boolean) {
    const inner = inFlow || seq.flow === true;
    const items = seq.items as (Node | null)[];
    const whole = () => replace(seq, mergeValue(ownValue(seq), b, c), inFlow);
    if (items.length !== b.length || items.some((item) => !item?.range))
      return whole();
    const pairs = alignItems(b, c);
    const steadyAt = steadyPairs(pairs);
    const steady = pairs.filter((_, k) => steadyAt.has(k));
    const stableNew = new Map(steady.map(([i, j]) => [j, i] as const));
    const stableOld = new Set(steady.map(([i]) => i));
    const movedFrom = new Map(pairs.map(([i, j]) => [j, i] as const));
    const changesShape =
      steady.length !== b.length || steady.length !== c.length;
    // A flow sequence that only grew at its end gains its new items there;
    // any other change of shape rewrites the one line whole.
    if (changesShape && inner) {
      const appended =
        steady.length === b.length && steady.every(([i, j]) => i === j);
      const last = items.at(-1);
      if (!appended || !last) return whole();
      for (const [i, j] of steady) walk(items[i]!, b[i], c[j], inner);
      const at = endOf(last);
      return edit(
        at,
        at,
        c
          .slice(b.length)
          .map((v) => `, ${flow(v)}`)
          .join('')
      );
    }
    if (steady.length === 0) return whole();
    const dash = column(seq.range![0]);
    const spans = items.map((item) => itemSpan(item!, dash));
    // A COMPACT LIST (rpg-project#1014) starts on its parent's dash line,
    // `- - 3`: its first row shares that line, and every later row starts
    // its own. The first row that stays (`firstSteady`) takes the shared
    // line: the rows before it go as one run of text up to its value, and a
    // row inserted before it is written at that value, followed by a new
    // line and a dash for it. A comment line inside that run, or a later row
    // that does not start its line, has no place on the shared line: the
    // list is rewritten whole from its own value (formatting limited to it).
    const compact =
      changesShape &&
      source.slice(lineStart(seq.range![0]), seq.range![0]).trim() !== '';
    // Edits this list made before it found it must be rewritten whole.
    const mark = edits.length;
    /** The compact list rewritten whole from its own value. Its comment
     * lines would go with its text, so each one whose row stays (or moves)
     * is first set above the parent row's line, at that row's column; one
     * whose row is removed goes with it (rpg-project#1014 review). */
    const refuseCompact = () => {
      edits.length = mark;
      const kept = new Set(pairs.map(([i]) => i));
      const comments: string[] = [];
      const end = endOf(seq);
      for (
        let at = throughLine(seq.range![0]);
        at < end;
        at = throughLine(at)
      ) {
        const line = source.slice(at, lineEnd(at));
        if (!/^\s*#/.test(line)) continue;
        let owner = items.findIndex((item) => item!.range![0] > at);
        if (owner === -1) owner = items.length - 1;
        if (kept.has(owner)) comments.push(line.trim());
      }
      if (comments.length) {
        const line = lineStart(seq.range![0]);
        const indent = ' '.repeat(source.slice(line).search(/\S/));
        edit(
          line,
          line,
          comments.map((comment) => `${indent}${comment}\n`).join('')
        );
      }
      whole();
    };
    const firstSteady = steady[0][0];
    const head = compact ? items[firstSteady]!.range![0] : -1;
    if (compact) {
      if (spans.some((span, i) => i > 0 && !span)) return refuseCompact();
      const run = source.slice(items[0]!.range![0], head);
      if (/^\s*#/m.test(run)) return refuseCompact();
    }
    for (const [i, j] of steady) walk(items[i]!, b[i], c[j], inner);
    if (!changesShape) return;
    if (compact && firstSteady > 0) edit(items[0]!.range![0], head, '');
    for (let i = 0; i < b.length; i++) {
      if (stableOld.has(i) || (compact && i < firstSteady)) continue;
      const span = spans[i];
      if (span) edit(span.start, span.end, '');
      else
        edit(
          commentsAbove(lineStart(items[i]!.range![0]) + dash, dash),
          throughLine(endOf(items[i]!)),
          ''
        );
    }
    /** The new item's lines, without a final newline. A moved item is its
     * own source text (rpg-project#998): its comment lines, its layout and
     * quoting, byte for byte when it only moved; when it also changed, its
     * text with that change spliced in. A new item is written fresh. */
    const itemText = (j: number) => {
      const from = movedFrom.get(j);
      const fresh = (value: Json) =>
        `${' '.repeat(dash)}${block([value], dash)}`;
      if (from === undefined) return fresh(c[j]);
      const span = spans[from];
      const merged = () =>
        fresh(mergeValue(ownValue(items[from]!), b[from], c[j]));
      // The compact first row's own text is its value on the shared line
      // and the lines under it, which already sit at the row's content
      // column: given its own dash, it stands as a row.
      if (compact && from === 0) {
        const own = `${' '.repeat(dash)}- ${source
          .slice(items[0]!.range![0], rowEnd(items[0]!, dash))
          .replace(/\n$/, '')}`;
        if (sameValue(b[from], c[j])) return own;
        return movedItemEdited(own, dash, b[from], c[j]) ?? merged();
      }
      if (!span) return merged();
      const own = source.slice(span.start, span.end).replace(/\n$/, '');
      if (sameValue(b[from], c[j])) return own;
      const edited = movedItemEdited(own, dash, b[from], c[j]);
      return edited ?? `${source.slice(span.start, span.dash)}${merged()}`;
    };
    // Each new item goes after the steady item before it, or before the
    // first. After an item means after its span's last line, so the comment
    // lines that close it stay with it.
    const rowDash = `${' '.repeat(dash)}- `;
    for (let j = 0; j < c.length; j++) {
      if (stableNew.has(j)) continue;
      let before = -1;
      for (let k = j - 1; k >= 0; k--)
        if (stableNew.has(k)) {
          before = stableNew.get(k)!;
          break;
        }
      if (before === -1 && compact) {
        // Before the row on the shared line: this row takes the line, and
        // that row gets a dash on the next. A row that opens with its own
        // comment lines cannot sit on the shared line.
        const text = itemText(j);
        if (!text.startsWith(rowDash)) return refuseCompact();
        edit(head, head, `${text.slice(rowDash.length)}\n${rowDash}`);
      } else if (before === -1) {
        const at =
          spans[firstSteady]?.start ??
          commentsAbove(lineStart(items[firstSteady]!.range![0]) + dash, dash);
        edit(at, at, `${itemText(j)}\n`);
      } else {
        const span = spans[before];
        const at = span
          ? source[span.end - 1] === '\n'
            ? span.end - 1
            : span.end
          : lineEnd(endOf(items[before]!));
        edit(at, at, `\n${itemText(j)}`);
      }
    }
  }

  /**
   * A block sequence item's own source text (rpg-project#998), as offsets:
   * `start`, the first of the comment lines directly above its dash, written
   * at the dash's column — a blank line, or a line that is not such a
   * comment, ends the run, so a comment above the list's key, or one set off
   * from the first item by a blank line, is the list's and stays; `dash`,
   * the start of the dash's line; `end`, past the newline of its last line
   * (a comment on that line included), and past any comment lines directly
   * below it indented deeper than the dash, which close it. Null when the
   * dash does not start its line (`- - a`).
   */
  function itemSpan(
    item: Node,
    dash: number
  ): { start: number; dash: number; end: number } | null {
    if (!item.range) return null;
    const line = lineStart(item.range[0]);
    const at = line + dash;
    if (source.slice(line, at).trim() !== '' || source[at] !== '-') return null;
    return {
      start: commentsAbove(at, dash),
      dash: line,
      end: rowEnd(item, dash),
    };
  }

  /** Past the newline of an item's last line, and past the comment lines
   * directly below it indented deeper than its dash, which close it. */
  function rowEnd(item: Node, dash: number): number {
    let end = throughLine(endOf(item));
    while (end < source.length) {
      const next = source.slice(end, lineEnd(end));
      if (!/^\s*#/.test(next) || next.search(/\S/) <= dash) break;
      end = throughLine(end);
    }
    return end;
  }

  walk(document.contents as Node, base, current, false);
  for (const [alias, { value }] of aliasWrites) replace(alias, value, true);
  // NO TWO EDITS MAY MEET: an insert where a removal starts, or two ranges
  // that overlap, could garble the file. A conflict is refused loudly, never
  // written.
  const sorted = edits.sort((x, y) => y.start - x.start || y.order - x.order);
  for (let k = 1; k < sorted.length; k++) {
    const later = sorted[k - 1];
    const earlier = sorted[k];
    const meets =
      earlier.end > later.start ||
      (earlier.start === later.start &&
        (earlier.end > earlier.start || later.end > later.start));
    if (meets)
      throw new UnsafeWriteError(
        `Its edits to the file meet each other (bytes ${earlier.start}–${later.end}).`
      );
  }
  let out = source;
  for (const { start, end, text } of sorted)
    out = out.slice(0, start) + text + out.slice(end);
  return { out, edits: sorted };
}
