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
 * order (an edited item between two unchanged ones is the same item). An old
 * item in no pair was removed; a new item in no pair was added.
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
  const pairs: [number, number][] = [];
  let [pi, pj] = [0, 0];
  for (const [ai, aj] of [...anchors, [n, m] as [number, number]]) {
    for (let k = 0; k < Math.min(ai - pi, aj - pj); k++)
      pairs.push([pi + k, pj + k]);
    if (ai < n) pairs.push([ai, aj]);
    [pi, pj] = [ai + 1, aj + 1];
  }
  return pairs;
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

export function spliceYaml(source: string, base: Json, current: Json): string {
  if (sameValue(base, current)) return source;
  const document = parseDocument(source);
  if (document.errors.length || !document.contents)
    throw new Error(
      `the file this draft was read from no longer parses: ${document.errors[0]?.message ?? 'it is empty'}`
    );
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

  /** Replace a node with `value` rendered in its own style. */
  function replace(node: Node, value: Json, inFlow: boolean) {
    const start = node.range![0];
    const end = endOf(node);
    // `key:` with nothing after it: a zero-width empty value. The new value
    // goes after the colon's space, on the key's line, in flow.
    if (start === end) return edit(start, end, ` ${flow(value)}`);
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
    for (const [key, pair] of pairs) {
      if (!Object.hasOwn(c, key) || !Object.hasOwn(b, key)) continue;
      const value = pair.value as Node | null;
      if (value?.range) walk(value, b[key], c[key], inner);
      else if (!sameValue(b[key], c[key]))
        return replace(map, mergeValue(ownValue(map), b, c), inFlow);
    }
    for (const key of removed) removePair(map, pairs.get(key)!, inner);
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
      if (source.slice(lineStart(keyStart), keyStart).trim() !== '')
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
    for (const [i, j] of steady) walk(items[i]!, b[i], c[j], inner);
    if (!changesShape) return;
    const dash = column(seq.range![0]);
    for (let i = 0; i < b.length; i++) {
      if (stableOld.has(i)) continue;
      const item = items[i]!;
      edit(
        commentsAbove(lineStart(item.range![0]) + dash, dash),
        throughLine(endOf(item)),
        ''
      );
    }
    const itemText = (j: number) => {
      const from = movedFrom.get(j);
      const value =
        from === undefined
          ? c[j]
          : mergeValue(ownValue(items[from]!), b[from], c[j]);
      return `${' '.repeat(dash)}${block([value], dash)}`;
    };
    // Each new item goes after the steady item before it, or before the first.
    const firstSteady = items[steady[0][0]]!;
    for (let j = 0; j < c.length; j++) {
      if (stableNew.has(j)) continue;
      let before = -1;
      for (let k = j - 1; k >= 0; k--)
        if (stableNew.has(k)) {
          before = stableNew.get(k)!;
          break;
        }
      if (before === -1) {
        const at = commentsAbove(lineStart(firstSteady.range![0]) + dash, dash);
        edit(at, at, `${itemText(j)}\n`);
      } else {
        const at = lineEnd(endOf(items[before]!));
        edit(at, at, `\n${itemText(j)}`);
      }
    }
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
      throw new Error(
        `the studio could not place its edits in the file it read (bytes ${earlier.start}–${later.end}); nothing was written`
      );
  }
  let out = source;
  for (const { start, end, text } of sorted)
    out = out.slice(0, start) + text + out.slice(end);
  return out;
}
