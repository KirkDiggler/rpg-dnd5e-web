/**
 * THE STUDIO WRITES BACK WHAT IT READ (rpg-project#857, Kirk: "if it runs, we
 * should load it"). The studio loads whatever the engine runs: the dungeonspec
 * compiler is the validator; fields the studio does not author are preserved,
 * never refused.
 *
 * `spliceYaml` is how a saved or exported document keeps them. It takes the
 * file as it was read (`source`), what the studio's encoder writes for the
 * document as it was read (`base`), and what it writes now (`current`), and
 * edits the source TEXT only where `base` and `current` differ. A field the
 * studio never read is in neither, so its bytes are never touched; neither are
 * comments, flow maps or quoting anywhere the author did not change. An
 * unchanged document returns `source` byte for byte.
 *
 * Edits are byte-range splices over the parsed source's node ranges:
 * - a changed scalar, or a collection that changed shape, is replaced in place;
 * - a map recurses key by key: a key added by the studio is inserted before
 *   the next key it writes that the source already has, else after the last;
 *   a key the studio stopped writing is removed with its lines;
 * - a sequence recurses item by item, appends, or drops trailing items.
 * A map that both gains and loses keys, or any case a splice cannot place
 * safely, is rewritten as one node from the source's own value with the
 * studio's changes applied, so its unread keys still survive.
 */
import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  stringify,
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

/** The source's own value with the studio's base → current changes applied:
 * keys the studio never wrote (in `own`, not in `base`) are kept. */
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
  if (Array.isArray(own) && Array.isArray(base) && Array.isArray(current))
    return current.map((item, i) =>
      i < base.length && i < own.length
        ? mergeValue(own[i], base[i], item)
        : item
    );
  return current;
}

export function spliceYaml(source: string, base: Json, current: Json): string {
  if (sameValue(base, current)) return source;
  const document = parseDocument(source);
  if (document.errors.length || !document.contents) return render(current);
  const pad = /\{ \S/.test(source) || !/\{\S/.test(source);
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
  /** The start of the comment lines directly above a line, at its indent. */
  const commentsAbove = (at: number) => {
    let start = lineStart(at);
    const indent = column(at);
    while (start > 0) {
      const prev = lineStart(start - 1);
      const line = source.slice(prev, start - 1);
      if (!/^\s*#/.test(line) || line.search(/\S/) !== indent) break;
      start = prev;
    }
    return start;
  };

  const flow = (value: Json) =>
    stringify(value, {
      collectionStyle: 'flow',
      lineWidth: 0,
      flowCollectionPadding: pad,
    }).trimEnd();
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

  /** Replace a node with `value` rendered in its own style. */
  function replace(node: Node, value: Json, inFlow: boolean) {
    const start = node.range![0];
    const end = endOf(node);
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
    const removed = Object.keys(b).filter(
      (key) => !Object.hasOwn(c, key) && pairs.has(key)
    );
    if ((added.length && removed.length) || removed.length === map.items.length)
      return replace(map, mergeValue(map.toJSON(), b, c), inFlow);
    for (const [key, pair] of pairs) {
      if (!Object.hasOwn(c, key)) continue;
      const value = pair.value as Node | null;
      if (value?.range) walk(value, b[key], c[key], inner);
      else if (!sameValue(b[key], c[key]))
        return replace(map, mergeValue(map.toJSON(), b, c), inFlow);
    }
    for (const key of removed) removePair(map, pairs.get(key)!, inner);
    const order = Object.keys(c);
    for (const key of added) {
      const at = order.indexOf(key);
      const previous = order
        .slice(0, at)
        .reverse()
        .find((earlier) => pairs.has(earlier));
      const next = order.slice(at + 1).find((later) => pairs.has(later));
      insertPair(
        map,
        key,
        c[key],
        previous
          ? { after: pairs.get(previous)! }
          : next
            ? { before: pairs.get(next)! }
            : { after: map.items.at(-1) as Pair },
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
    edit(
      commentsAbove(keyStart),
      Math.min(lineEnd(pairEnd(pair)) + 1, source.length),
      ''
    );
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
      const at = commentsAbove((anchor.before.key as Node).range![0]);
      return edit(at, at, `${' '.repeat(indent)}${text}\n`);
    }
    const at = lineEnd(pairEnd(anchor.after));
    edit(at, at, `\n${' '.repeat(indent)}${text}`);
  }

  function walkSeq(seq: YAMLSeq, b: Json[], c: Json[], inFlow: boolean) {
    const inner = inFlow || seq.flow === true;
    const items = seq.items as (Node | null)[];
    if (items.length !== b.length || items.some((item) => !item?.range))
      return replace(seq, mergeValue(seq.toJSON(), b, c), inFlow);
    const shared = Math.min(b.length, c.length);
    for (let i = 0; i < shared; i++) walk(items[i]!, b[i], c[i], inner);
    if (c.length < b.length) {
      if (c.length === 0) return replace(seq, [], inFlow);
      for (let i = c.length; i < b.length; i++) {
        const item = items[i]!;
        if (inner) edit(endOf(items[i - 1]!), endOf(item), '');
        else
          edit(
            lineStart(item.range![0]),
            Math.min(lineEnd(endOf(item)) + 1, source.length),
            ''
          );
      }
    }
    if (c.length > b.length) {
      const last = items.at(-1);
      if (!last) return replace(seq, mergeValue(seq.toJSON(), b, c), inFlow);
      const extra = c.slice(b.length);
      if (inner)
        return edit(
          endOf(last),
          endOf(last),
          extra.map((v) => `, ${flow(v)}`).join('')
        );
      const indent = column(seq.range![0]);
      const at = lineEnd(endOf(last));
      edit(at, at, `\n${' '.repeat(indent)}${block(extra, indent)}`);
    }
  }

  walk(document.contents as Node, base, current, false);
  let out = source;
  for (const { start, end, text } of edits.sort(
    (x, y) => y.start - x.start || y.order - x.order
  ))
    out = out.slice(0, start) + text + out.slice(end);
  return out;
}

function render(value: Json): string {
  return stringify(value);
}
