/**
 * THE ENGINE'S MACHINE WORDS, AS THE DRAWING SAYS THEM (rpg-project#1015,
 * the studio half of rpg-project#1001 items 1, 3, 12 and 16).
 *
 * `AuthoringService.GetMachineWords` answers once per engine release with
 * every word a machine's step may use and a few plain words for each
 * (`label`, `label_with`, `label_not`, `value_labels`, the comparisons'
 * `ops`). This module fills those templates and nothing else: it holds no
 * word list and adds no prose of its own. Where the table has no word for an
 * id, the id is said as it is, as the drawing said it before the words.
 *
 * A STEP'S CONDITION is its `condition` connections (`id`, `is`, `op`,
 * `negated`, `at`). `at` is the author's place inside the step's `when`
 * (`when`, `when.all[1]`, `when.all[1].any[0].not`) and makes the structure
 * exact; `negated` is only a hint and is read only where `at` cannot be
 * (an empty `at`). The structure is said with the engine's own joins (the
 * `all` and `any` words' `join`); a `not` is said by the leaf's `label_not`
 * where the table gives one, else as the engine's word `not` around the
 * plain label, in parentheses, as the read-back's sentence says it.
 */
import type {
  GetMachineWordsResponse,
  MachineBeatWord,
  MachineConditionWord,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';

/** The engine's words, as the server answered (one answer per engine
 * release). A later slice's editor reads the same table. */
export type MachineWords = GetMachineWordsResponse;

/** One condition a step's `when` reads, as its `condition` connection says
 * it. */
export interface StepCondition {
  /** The word as authored, open part filled: `heard.claim`,
   * `noted:admitted`, `rounds`. */
  id: string;
  /** The value compared, as text (`failed`, `true`, `3`); empty when none. */
  is: string;
  /** The comparison where it is not equality (`gte`, `lte`); empty is `eq`. */
  op: string;
  /** Under an odd number of `not`s: a hint; `at` is the structure. */
  negated: boolean;
  /** Where it sits inside the step's `when`. */
  at: string;
}

const SLOT = /\{(id|value|n|op)\}/g;

/** A template with its known slots filled. A slot it has no value for, or
 * one this client does not know, stays as written (the proto's rule). */
export function fillSlots(
  template: string,
  slots: Partial<Record<'id' | 'value' | 'n' | 'op', string>>
): string {
  return template.replace(SLOT, (whole, name: 'id' | 'value' | 'n' | 'op') =>
    slots[name] !== undefined && slots[name] !== '' ? slots[name]! : whole
  );
}

/** A word looked up by its id: the whole word, else the prefix up to and
 * including its first colon with the rest as its open part
 * (`noted:admitted` → the `noted:` word, open `admitted`). */
function lookUp<T extends { word: string }>(
  list: readonly T[],
  id: string
): { word: T; open: string } | null {
  const whole = list.find((w) => w.word === id);
  if (whole) return { word: whole, open: '' };
  const colon = id.indexOf(':');
  if (colon < 0) return null;
  const prefix = list.find((w) => w.word === id.slice(0, colon + 1));
  return prefix ? { word: prefix, open: id.slice(colon + 1) } : null;
}

export function beatWordOf(
  words: MachineWords,
  beat: string
): { word: MachineBeatWord; open: string } | null {
  return lookUp(words.beats, beat);
}

export function conditionWordOf(
  words: MachineWords,
  id: string
): { word: MachineConditionWord; open: string } | null {
  return lookUp(words.conditions, id);
}

/** A beat's plain words: its `label`, its open part filled; or, given the
 * thing the step's beat is about (`thing`, from the engine's `wakes-on`
 * connection of the beat's own kind), its `label_with` filled with it. Null
 * when the table has no such beat. */
export function beatWords(
  words: MachineWords,
  beat: string,
  thing?: string
): string | null {
  const found = beatWordOf(words, beat);
  if (!found) return null;
  const { word, open } = found;
  if (thing && word.labelWith) return fillSlots(word.labelWith, { id: thing });
  return fillSlots(word.label || word.word, { id: open });
}

/** An act's plain words (`pick` post → "acts from the post list"), or null
 * when the table has no such act. */
export function actWords(
  words: MachineWords,
  act: string,
  slots: Partial<Record<'id' | 'value' | 'n' | 'op', string>>
): string | null {
  const word = words.acts.find((a) => a.word === act);
  return word ? fillSlots(word.label || word.word, slots) : null;
}

const opWords = (words: MachineWords, op: string): string =>
  words.ops.find((o) => o.op === op)?.words ?? op;

/** One condition's words, with its polarity: `positive` false says it is
 * asked to be false. A bool word asked `false` is its own negation. */
function leafWords(
  words: MachineWords | null,
  c: StepCondition,
  positive: boolean
): string {
  const found = words ? conditionWordOf(words, c.id) : null;
  if (!words || !found) {
    // No word for it: the id, its comparison and value, as the engine
    // spells them.
    const value =
      c.is && c.is !== 'true' ? ` ${c.op ? `${c.op} ` : ''}${c.is}` : '';
    const plain = `${c.id}${value}`;
    return positive ? plain : `not (${plain})`;
  }
  const { word, open } = found;
  const isBool = word.kind === 'bool';
  const polarity = isBool && c.is === 'false' ? !positive : positive;
  const fixedOp = word.args.find((a) => a.name === 'op')?.fixed ?? '';
  const slots = {
    id: open,
    value: c.is,
    n: c.is,
    op: opWords(words, c.op || fixedOp || 'eq'),
  };
  if (!polarity && word.labelNot) return fillSlots(word.labelNot, slots);
  const plain =
    !isBool && word.valueLabels[c.is] !== undefined
      ? word.valueLabels[c.is]!
      : fillSlots(word.label || word.word, slots);
  if (polarity) return plain;
  const not = words.conditions.find((w) => w.word === 'not');
  return `${not?.word ?? 'not'} (${plain})`;
}

type Segment = { node: 'all' | 'any'; i: number } | { node: 'not' };

/** `at` as its steps from `when`, or null when it is not the engine's
 * form. */
function segmentsOf(at: string): Segment[] | null {
  if (at !== 'when' && !at.startsWith('when.')) return null;
  const out: Segment[] = [];
  for (const part of at.split('.').slice(1)) {
    if (part === 'not') {
      out.push({ node: 'not' });
      continue;
    }
    const m = /^(all|any)\[(\d+)\]$/.exec(part);
    if (!m) return null;
    out.push({ node: m[1] as 'all' | 'any', i: Number(m[2]) });
  }
  return out;
}

/** The order of two conditions' places, by their indices, so `all[10]`
 * comes after `all[2]`. */
export function compareAt(a: string, b: string): number {
  const x = segmentsOf(a);
  const y = segmentsOf(b);
  if (!x || !y) return a < b ? -1 : a > b ? 1 : 0;
  for (let k = 0; k < Math.min(x.length, y.length); k++) {
    const p = x[k]!;
    const q = y[k]!;
    if (p.node !== q.node) return p.node < q.node ? -1 : 1;
    if (p.node !== 'not' && q.node !== 'not' && p.i !== q.i) return p.i - q.i;
  }
  return x.length - y.length;
}

interface Said {
  text: string;
  /** Joined from two or more parts: wrapped when it is itself a part. */
  compound: boolean;
}

/** A step's whole condition in the engine's words, from its condition
 * connections (in `at` order): leaves at one place are all needed; `all`
 * and `any` are joined by the engine's own `join`; a `not` is the leaf's
 * `label_not`, or `not (…)`. Empty when it has none. */
export function conditionWords(
  words: MachineWords | null,
  conditions: readonly StepCondition[]
): string {
  if (!conditions.length) return '';
  const joinOf = (node: 'all' | 'any'): string | undefined =>
    words?.conditions.find((w) => w.word === node)?.join || undefined;
  const placed = conditions.map((c) => ({ c, segs: segmentsOf(c.at) }));
  // No words for the structure, or a place the drawing cannot read: each
  // condition flat, by its hint, as the drawing listed reads before.
  if (!joinOf('all') || !joinOf('any') || placed.some((p) => p.segs === null))
    return conditions.map((c) => leafWords(words, c, !c.negated)).join(', ');
  const join = (parts: Said[], node: 'all' | 'any'): Said =>
    parts.length === 1
      ? parts[0]!
      : {
          text: parts
            .map((p) => (p.compound ? `(${p.text})` : p.text))
            .join(joinOf(node)!),
          compound: true,
        };
  const say = (
    items: { c: StepCondition; segs: Segment[] }[],
    positive: boolean
  ): Said => {
    const parts: Said[] = [];
    const leaves = items.filter((p) => p.segs.length === 0);
    for (const leaf of leaves)
      parts.push({ text: leafWords(words, leaf.c, positive), compound: false });
    const nots = items.filter((p) => p.segs[0]?.node === 'not');
    if (nots.length) {
      const inner = nots.map((p) => ({ ...p, segs: p.segs.slice(1) }));
      const single =
        inner.length === 1 && inner[0]!.segs.length === 0
          ? inner[0]!
          : undefined;
      if (single)
        parts.push({
          text: leafWords(words, single.c, !positive),
          compound: false,
        });
      else {
        const said = say(inner, true);
        const not = positive ? 'not' : '';
        parts.push({
          text: not ? `${not} (${said.text})` : said.text,
          compound: !not && said.compound,
        });
      }
    }
    for (const node of ['all', 'any'] as const) {
      const under = items.filter((p) => p.segs[0]?.node === node);
      if (!under.length) continue;
      const byIndex = new Map<number, typeof under>();
      for (const p of under) {
        const i = (p.segs[0] as { i: number }).i;
        byIndex.set(i, [
          ...(byIndex.get(i) ?? []),
          { ...p, segs: p.segs.slice(1) },
        ]);
      }
      const kids = [...byIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, list]) => say(list, positive));
      // Under a `not`, De Morgan is the engine's to say, not ours: the
      // node is said as written, inside the `not (…)` its caller adds.
      parts.push(join(kids, node));
    }
    return join(parts, 'all');
  };
  return say(placed as { c: StepCondition; segs: Segment[] }[], true).text;
}
