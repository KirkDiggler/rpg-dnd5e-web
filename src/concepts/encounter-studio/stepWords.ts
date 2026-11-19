/**
 * A STEP BUILT FROM THE ENGINE'S WORDS (rpg-project#1018, slice S6 of
 * rpg-project#993).
 *
 * Every word in `GetMachineWords` says where it is written (`written`: the
 * part of the step, the key, the field its own name is spelled in) and what
 * it takes (`args`: each input's place — after the word's colon, as the
 * key's value, in a field of the key's map, or implied — its kind, its
 * closed values, what it names). This module reads a step's conditions and
 * acts against that table and writes them back from it. It holds no word of
 * its own: a word the engine adds appears in the editor and is written
 * correctly with no change here.
 *
 * The one thing it knows besides the table is the shape of a guard tree
 * (rpg-toolkit `mind/machine` Guard): a `when` node is a map of exactly one
 * key, `all` and `any` hold a list of nodes, `not` holds one, and every
 * other key is a leaf. A condition is EDITABLE when it is FLAT: absent, one
 * leaf, or `all` of leaves, where a leaf may sit under one `not`. Anything
 * else (`any`, an `all` inside an `all`, a `not` over a group) is NESTED and
 * kept as written; so is a leaf the table names no word for.
 *
 * An unchanged condition or act is kept as the very node the file holds, so
 * a step opened and saved unchanged writes the same bytes; an edited one is
 * rebuilt in place, its keys in their written order.
 */
import type {
  MachineArg,
  MachineWritten,
  ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { statesOf, tableKeysOf, type Node } from './machineEdit';
import type { MachineWords } from './machineWords';

/** What a condition word and an act word share: enough to place one. */
export interface StepWord {
  word: string;
  on: string[];
  label: string;
  written?: MachineWritten;
  args: MachineArg[];
}

/** A value's kind as the table spells it. */
export type ArgKind = 'bool' | 'int' | 'string';

const mapping = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The guard tree's own nodes (rpg-toolkit `machine.Guard`). */
const ALL = 'all';
const NOT = 'not';
const GROUPS = new Set([ALL, 'any', NOT]);

/** A node's one key and its value, or null when it has none or several. */
function single(node: unknown): [string, unknown] | null {
  if (!mapping(node)) return null;
  const keys = Object.keys(node);
  return keys.length === 1 ? [keys[0]!, node[keys[0]!]] : null;
}

/** A word that holds other conditions (`all`, `any`, `not`). */
const holdsConditions = (word: StepWord): boolean =>
  word.args.some((arg) => arg.kind === 'condition');

/** The condition words a leaf can be: written in a `when`, holding none. */
export function leafWordsOf(words: MachineWords): StepWord[] {
  return words.conditions.filter(
    (w) => w.written?.part === 'when' && !holdsConditions(w)
  );
}

/** The act words written in a step's `do`. */
export function doWordsOf(words: MachineWords): StepWord[] {
  return words.acts.filter((w) => w.written?.part === 'do');
}

const isOpen = (word: StepWord): boolean => word.word.endsWith(':');

/** Does `payload` hold what `word` writes, and nothing it does not? For a
 * word spelled by its key alone (`scope`, `rounds`, `flag`). */
function fits(word: StepWord, payload: unknown): boolean {
  const fields = word.args.filter((a) => a.goes === 'field');
  const byValue = word.args.some((a) => a.goes === 'value');
  if (byValue) return payload !== undefined && !mapping(payload);
  if (!mapping(payload)) return fields.length === 0;
  const known = new Set(fields.map((a) => a.field));
  if (!Object.keys(payload).every((k) => known.has(k))) return false;
  return fields.every(
    (a) => a.optional || payload[a.field] !== undefined || a.fixed !== ''
  );
}

/** The word a one-key node is written as, among `candidates`, or null. A
 * word spelled in a field (`fact: { name: … }`) is found by that name,
 * whole first, else the longest open word it starts with; a word spelled
 * by its key alone is the one candidate whose inputs the node holds. */
export function wordOfNode(
  candidates: readonly StepWord[],
  node: unknown
): StepWord | null {
  const kv = single(node);
  if (!kv) return null;
  const [key, payload] = kv;
  const under = candidates.filter((w) => w.written?.key === key);
  const spelled = under.filter((w) => w.written!.field !== '');
  if (spelled.length && mapping(payload)) {
    const field = spelled[0]!.written!.field;
    const name = payload[field];
    if (typeof name === 'string') {
      const whole = spelled.find((w) => w.word === name);
      if (whole) return whole;
      const open = spelled
        .filter((w) => isOpen(w) && name.startsWith(w.word))
        .sort((a, b) => b.word.length - a.word.length)[0];
      if (open) return open;
    }
  }
  const bare = under.filter((w) => w.written!.field === '' && fits(w, payload));
  return bare.length === 1 ? bare[0]! : null;
}

/** One input of a word as the node writes it; undefined when absent. */
export function argValue(
  word: StepWord,
  node: unknown,
  arg: MachineArg
): unknown {
  const kv = single(node);
  const payload = kv ? kv[1] : undefined;
  switch (arg.goes) {
    case 'open': {
      const field = word.written?.field ?? '';
      const spelled = field && mapping(payload) ? payload[field] : undefined;
      return typeof spelled === 'string' && spelled.startsWith(word.word)
        ? spelled.slice(word.word.length)
        : undefined;
    }
    case 'value':
      return payload;
    case 'field':
      return mapping(payload) ? payload[arg.field] : undefined;
    default:
      return arg.fixed || undefined;
  }
}

/** A text the table gives (a `fixed`, a `default_value`) as its kind. */
export function typed(kind: string, text: string): unknown {
  if (kind === 'int') return Number(text);
  if (kind === 'bool') return text === 'true';
  return text;
}

/** The node with one input set where the table says it goes. Every other
 * key keeps its place; a field not yet written is added last. */
export function withArg(
  word: StepWord,
  node: unknown,
  arg: MachineArg,
  value: unknown
): Node {
  const kv = single(node);
  const key = word.written?.key ?? '';
  const payload = kv ? kv[1] : undefined;
  switch (arg.goes) {
    case 'open': {
      const field = word.written?.field ?? '';
      if (!field) return mapping(node) ? node : {};
      const base = mapping(payload) ? payload : {};
      return { [key]: { ...base, [field]: `${word.word}${String(value)}` } };
    }
    case 'value':
      return { [key]: value };
    case 'field': {
      const base = mapping(payload) ? payload : {};
      return { [key]: { ...base, [arg.field]: value } };
    }
    default:
      return mapping(node) ? node : {};
  }
}

/** What an input starts as in a new condition or act: its fixed value, its
 * default, its first closed value or choice, else a plain one. */
export function startingValue(
  arg: MachineArg,
  kind: ArgKind,
  choices: readonly string[]
): unknown {
  // Only an input that names a thing takes a choice of the document's.
  const first =
    arg.fixed ||
    arg.defaultValue ||
    arg.values[0] ||
    (arg.names ? choices[0] : undefined);
  const one =
    first !== undefined && first !== ''
      ? typed(kind, first)
      : kind === 'bool'
        ? true
        : kind === 'int'
          ? 1
          : '';
  return arg.many ? (one === '' ? [] : [one]) : one;
}

/** A new node for `word`, every input at its starting value. `choicesOf`
 * and `kindOf` say what the document offers for an input. */
export function newNode(
  word: StepWord,
  choicesOf: (arg: MachineArg) => readonly string[],
  kindOf: (arg: MachineArg, node: Node) => ArgKind
): Node {
  const key = word.written?.key ?? '';
  const field = word.written?.field ?? '';
  let node: Node = { [key]: field ? { [field]: word.word } : {} };
  for (const arg of word.args) {
    if (arg.goes === 'implied') continue;
    node = withArg(
      word,
      node,
      arg,
      startingValue(arg, kindOf(arg, node), choicesOf(arg))
    );
  }
  return node;
}

/** The inputs an author sets: every one not implied or fixed. */
export const authoredArgs = (word: StepWord): MachineArg[] =>
  word.args.filter((a) => a.goes !== 'implied' && a.fixed === '');

/** The beat word a beat is: the whole word, else the longest open word it
 * starts with (`deed:attacked` → `deed:`). */
export function beatWordFor(
  words: MachineWords,
  beat: string
): (MachineWords['beats'][number] & { open: string }) | null {
  const whole = words.beats.find((b) => b.word === beat);
  if (whole) return { ...whole, open: '' };
  const prefix = words.beats
    .filter((b) => b.word.endsWith(':') && beat.startsWith(b.word))
    .sort((a, b) => b.word.length - a.word.length)[0];
  return prefix ? { ...prefix, open: beat.slice(prefix.word.length) } : null;
}

/** May `word` be used on a step fired by `beat`? Its `on` empty means any
 * beat; else the beat, or its open family's word, is listed. */
export function allowedOn(
  words: MachineWords,
  word: StepWord,
  beat: string
): boolean {
  if (word.on.length === 0) return true;
  if (word.on.includes(beat)) return true;
  const family = beatWordFor(words, beat);
  return family !== null && word.on.includes(family.word);
}

const SLOT = /\{(id|value|n|op)\}/g;

/** A word's label for a dropdown: its slots shown as "…". */
export const optionLabel = (word: { label: string; word: string }): string =>
  (word.label || word.word).replace(SLOT, '…');

/** The engine's rule for a word not allowed on a beat, in its words: the
 * beats it may be used on, by their labels. */
export function onlyOnWords(words: MachineWords, word: StepWord): string {
  const beats = word.on.map((b) => {
    const found = words.beats.find((w) => w.word === b);
    return found ? optionLabel(found) : b;
  });
  return `Only on: ${beats.join(', ')}.`;
}

/** One condition of a flat `when`: the node as written (a leaf, or `not`
 * over one), the leaf, its polarity and its word. */
export interface ConditionRow {
  node: unknown;
  leaf: unknown;
  negated: boolean;
  word: StepWord;
}

export type WhenShape =
  | {
      kind: 'flat';
      /** How the file writes it: no `when`, one node, or an `all`. */
      form: 'none' | 'one' | 'all';
      rows: ConditionRow[];
    }
  /** Kept as written: nested, or a leaf the table names no word for. */
  | { kind: 'kept'; why: 'nested' | 'unknown' };

function rowOf(
  leaves: readonly StepWord[],
  node: unknown
): ConditionRow | 'nested' | 'unknown' {
  const kv = single(node);
  if (!kv) return 'unknown';
  let [key, leaf] = [kv[0], node];
  let negated = false;
  if (key === NOT) {
    const inner = single(kv[1]);
    if (!inner) return 'unknown';
    if (GROUPS.has(inner[0])) return 'nested';
    negated = true;
    leaf = kv[1];
    key = inner[0];
  }
  if (GROUPS.has(key)) return 'nested';
  const word = wordOfNode(leaves, leaf);
  return word ? { node, leaf, negated, word } : 'unknown';
}

/** A step's `when`, flat (with one row per condition) or kept. */
export function whenShapeOf(words: MachineWords, when: unknown): WhenShape {
  if (when === undefined) return { kind: 'flat', form: 'none', rows: [] };
  const leaves = leafWordsOf(words);
  const kv = single(when);
  const nodes = kv && kv[0] === ALL && Array.isArray(kv[1]) ? kv[1] : null;
  const rows: ConditionRow[] = [];
  for (const node of nodes ?? [when]) {
    const row = rowOf(leaves, node);
    if (typeof row === 'string') return { kind: 'kept', why: row };
    rows.push(row);
  }
  return { kind: 'flat', form: nodes ? 'all' : 'one', rows };
}

/** A flat `when` written back from its rows' nodes: none when empty; one
 * node as one node unless the file wrote an `all`; else an `all`. */
export function whenOfRows(
  form: 'none' | 'one' | 'all',
  nodes: readonly unknown[]
): unknown {
  if (nodes.length === 0) return undefined;
  if (form !== 'all' && nodes.length === 1) return nodes[0];
  return { [ALL]: [...nodes] };
}

/** A row's node with its polarity set: the leaf, or `not` over it. */
export const withNegated = (leaf: unknown, negated: boolean): unknown =>
  negated ? { [NOT]: leaf } : leaf;

/** The table has the `not` word, so a condition can be asked false. */
export const canNegate = (words: MachineWords): boolean =>
  words.conditions.some((w) => w.written?.key === NOT);

/** One act of a step's `do`, at its index, with its word or null. */
export interface ActRow {
  index: number;
  node: unknown;
  word: StepWord | null;
}

/** A step's acts, in order, but for the one at `skip` (the pick "Does one
 * of" edits). */
export function actRowsOf(
  words: MachineWords,
  acts: readonly unknown[],
  skip: number
): ActRow[] {
  const known = doWordsOf(words);
  return acts.flatMap((node, index) =>
    index === skip ? [] : [{ index, node, word: wordOfNode(known, node) }]
  );
}

/** A value's kind as the table and the document say it: `int`, `bool` or
 * `string`; an "of" input takes the kind of the flag its `kind_of` input
 * names, from `flagKind`, else of the value it holds. */
export function kindOfArg(
  word: StepWord,
  arg: MachineArg,
  node: unknown,
  flagKind: (flag: string) => ArgKind | null
): ArgKind {
  if (arg.kind === 'int' || arg.kind === 'bool') return arg.kind;
  if (arg.kind !== 'of') return 'string';
  const named = word.args.find((a) => a.name === arg.kindOf);
  const flag = named ? argValue(word, node, named) : undefined;
  const declared = typeof flag === 'string' ? flagKind(flag) : null;
  if (declared) return declared;
  const held = argValue(word, node, arg);
  return typeof held === 'boolean'
    ? 'bool'
    : typeof held === 'number'
      ? 'int'
      : 'string';
}

/** A JSON literal or a written value's kind. */
export function kindOfValue(value: unknown): ArgKind {
  return typeof value === 'boolean'
    ? 'bool'
    : typeof value === 'number'
      ? 'int'
      : 'string';
}

/** What the document offers for an input that names a kind of thing. */
export interface StepChoices {
  /** The things an input may name, and whether that list is the whole set
   * (a select) or suggestions beside free text. Null offers free text. */
  of(arg: MachineArg): { options: string[]; closed: boolean } | null;
  /** The kind a flag of this machine is declared with, or null. */
  flagKind(flag: string): ArgKind | null;
  /** The machine declares flags (its bag, or the engine's `routine.flag`). */
  hasFlags: boolean;
}

/** What this machine's document and the engine's read-back offer for an
 * input that names a thing: its states, lists and flags (closed), and the
 * facts, topics, clocks… the read-back connects anywhere (suggestions). */
export function stepChoicesOf(
  definition: Node,
  said: ReadBack | null,
  routine: string
): StepChoices {
  const recipe = definition.recipe;
  const bag =
    recipe && typeof recipe === 'object' && !Array.isArray(recipe)
      ? (recipe as Node).bag
      : undefined;
  const bagged: Node =
    bag && typeof bag === 'object' && !Array.isArray(bag) ? (bag as Node) : {};
  const statements = (said?.sections ?? []).flatMap((s) =>
    s.groups.flatMap((g) => g.statements)
  );
  const declared = new Map<string, string>();
  const own = `behaviorDefinitions.${routine}`;
  for (const st of statements)
    if (
      st.kind === 'routine.flag' &&
      (st.path === own || st.path.startsWith(`${own}.`))
    )
      for (const c of st.connects)
        if (c.kind === 'flag' && c.role === 'declares')
          declared.set(c.id, c.is);
  const flags = [...new Set([...Object.keys(bagged), ...declared.keys()])];
  const said_ = (kind: string): string[] =>
    [
      ...new Set(
        statements.flatMap((st) =>
          st.connects.filter((c) => c.kind === kind).map((c) => c.id)
        )
      ),
    ].sort();
  return {
    of(arg) {
      switch (arg.names) {
        case 'state':
          return { options: statesOf(definition), closed: true };
        case 'list':
          return { options: tableKeysOf(definition), closed: true };
        case 'flag':
          return flags.length ? { options: flags, closed: true } : null;
        case '':
        case 'op':
        case 'condition':
          return null;
        default: {
          const options = said_(arg.names);
          return options.length ? { options, closed: false } : null;
        }
      }
    },
    flagKind(flag) {
      if (Object.hasOwn(bagged, flag)) return kindOfValue(bagged[flag]);
      const literal = declared.get(flag);
      if (literal === undefined) return null;
      try {
        return kindOfValue(JSON.parse(literal));
      } catch {
        return null;
      }
    },
    hasFlags: flags.length > 0,
  };
}
