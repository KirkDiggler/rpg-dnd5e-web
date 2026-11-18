/**
 * SET A MACHINE (rpg-project#996, slice S3 of rpg-project#993): pure edits
 * over one behaviour definition as the file writes it,
 * `behaviorDefinitions.<id>` on the scope's `unread`:
 *
 *   gate-1-policy:
 *     recipe:
 *       initial: posted
 *       states:
 *         alert:
 *           transitions:
 *             - on: barred           # what fires the step
 *               when: { … }          # kept as written, never edited here
 *               to: challenged       # absent = stays
 *               do:
 *                 - pick: barred     # the list it does one of
 *                 - anchor: true     # any other act is kept as written
 *               reason: walked into him
 *     table:
 *       barred: [ …rows… ]
 *
 * The studio edits a step's `on`, `to`, its one `pick` and its `reason`, the
 * rows of one table key, a new table key and a new state. Every other key —
 * a step's `when`, its other acts, an unknown key, the recipe's `ref`,
 * `initial`, `bag` — rides along as written. The dungeonspec compiler is the
 * validator: nothing here judges a beat, a target or a row.
 */
import type { SiteScope } from '../world-building/siteScope';

/** A definition, a state, a step: the file's own mapping. */
export type Node = Record<string, unknown>;

const mapping = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function definitionsOf(scope: Readonly<SiteScope>): Node {
  const definitions = scope.unread?.behaviorDefinitions;
  return mapping(definitions) ? definitions : {};
}

/** The definition as written, or undefined when the file authors none by
 * that id. */
export function definitionOf(
  scope: Readonly<SiteScope>,
  id: string
): Node | undefined {
  const definition = definitionsOf(scope)[id];
  return mapping(definition) ? definition : undefined;
}

function statesNode(definition: Node): Node {
  const recipe = definition.recipe;
  return mapping(recipe) && mapping(recipe.states) ? recipe.states : {};
}

/** The recipe's states, in the file's order. */
export function statesOf(definition: Node): string[] {
  return Object.keys(statesNode(definition));
}

/** The definition's table keys (its lists), in the file's order. */
export function tableKeysOf(definition: Node): string[] {
  return mapping(definition.table) ? Object.keys(definition.table) : [];
}

/** One list's rows as written; empty when the key is absent or not a list. */
export function tableRowsOf(definition: Node, key: string): unknown[] {
  const table = definition.table;
  if (!mapping(table)) return [];
  const rows = table[key];
  return Array.isArray(rows) ? rows : [];
}

/** A state's steps as written, in file order. An entry that is not a
 * mapping is kept and offered as-is (the compiler names it). */
export function transitionsOf(definition: Node, state: string): unknown[] {
  const node = statesNode(definition)[state];
  return mapping(node) && Array.isArray(node.transitions)
    ? node.transitions
    : [];
}

/** The engine's path to one step: the read-back's statement path. */
export const transitionPath = (
  id: string,
  state: string,
  index: number
): string =>
  `behaviorDefinitions.${id}.recipe.states.${state}.transitions[${index}]`;

/** What the form shows of one step. */
export interface StepView {
  on: string;
  /** Where it goes, or null when it stays. */
  to: string | null;
  /** The list its first `pick` does one of, or null. */
  pick: string | null;
  reason: string;
  /** It carries a `when`, which this slice keeps and does not edit. */
  guarded: boolean;
  /** Acts other than its first pick (`anchor`, `wake_in`, `set`, `clear`,
   * a second pick), kept as written. */
  otherActs: number;
}

const firstPickAt = (acts: unknown[]): number =>
  acts.findIndex((act) => mapping(act) && typeof act.pick === 'string');

export function stepOf(step: unknown): StepView {
  const node = mapping(step) ? step : {};
  const acts = Array.isArray(node.do) ? node.do : [];
  const at = firstPickAt(acts);
  return {
    on: typeof node.on === 'string' ? node.on : '',
    to: typeof node.to === 'string' ? node.to : null,
    pick: at >= 0 ? ((acts[at] as Node).pick as string) : null,
    reason: typeof node.reason === 'string' ? node.reason : '',
    guarded: node.when !== undefined,
    otherActs: acts.length - (at >= 0 ? 1 : 0),
  };
}

/** The order the recipe writes a step's keys in; a key the step lacks is
 * inserted at its place so the file reads as it would by hand. */
const STEP_ORDER = ['on', 'when', 'to', 'do', 'reason'];

/** The node with `key` set: in place when present, else before the first
 * key that follows it in `order`, else last. `undefined` removes it. */
function withKey(
  node: Node,
  key: string,
  value: unknown,
  order: readonly string[] = STEP_ORDER
): Node {
  if (value === undefined) {
    if (!Object.hasOwn(node, key)) return node;
    const next = { ...node };
    delete next[key];
    return next;
  }
  if (Object.hasOwn(node, key)) return { ...node, [key]: value };
  const rank = order.indexOf(key);
  const keys = Object.keys(node);
  const before = keys.findIndex((k) => {
    const r = order.indexOf(k);
    return rank >= 0 && r > rank;
  });
  const entries = Object.entries(node);
  entries.splice(before < 0 ? entries.length : before, 0, [key, value]);
  return Object.fromEntries(entries);
}

const stepNode = (step: unknown): Node => (mapping(step) ? step : {});

/** The step fired by another beat. */
export function withStepOn(step: unknown, on: string): Node {
  return withKey(stepNode(step), 'on', on);
}

/** The step going to `to`, or staying (null removes `to`). */
export function withStepTo(step: unknown, to: string | null): Node {
  return withKey(stepNode(step), 'to', to ?? undefined);
}

/** The step doing one of `key`'s list, or none (null). The first pick act
 * is replaced in place; a step with none gains one first in its `do`. Every
 * other act is kept; a `do` left empty is removed. */
export function withStepPick(step: unknown, key: string | null): Node {
  const node = stepNode(step);
  const acts = Array.isArray(node.do) ? [...node.do] : [];
  const at = firstPickAt(acts);
  if (key === null) {
    if (at < 0) return node;
    acts.splice(at, 1);
  } else if (at >= 0) acts[at] = { ...(acts[at] as Node), pick: key };
  else acts.unshift({ pick: key });
  return withKey(node, 'do', acts.length > 0 ? acts : undefined);
}

/** The step's reason; empty text removes it. */
export function withStepReason(step: unknown, reason: string): Node {
  return withKey(stepNode(step), 'reason', reason === '' ? undefined : reason);
}

/** A new step: fired by `on`, staying, doing nothing yet. */
export const newStep = (on: string): Node => ({ on });

/** The definition with one state's steps set whole. Throws for a state the
 * recipe does not declare. Every other key of the state is kept. */
export function withTransitions(
  definition: Node,
  state: string,
  transitions: unknown[]
): Node {
  const recipe = definition.recipe;
  const states = statesNode(definition);
  const node = states[state];
  if (!mapping(recipe) || !mapping(node))
    throw new Error(
      `recipe.states.${state}: the recipe declares no such state`
    );
  return {
    ...definition,
    recipe: {
      ...recipe,
      states: { ...states, [state]: { ...node, transitions } },
    },
  };
}

/** A name a new state or list may take: a word of letters, digits, `_` or
 * `-`. */
export const NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Why `name` cannot be a new key beside `taken`, or null when it can. */
export function newNameRefusal(
  name: string,
  taken: readonly string[],
  what: 'state' | 'list'
): string | null {
  if (name === '') return `Name the ${what}.`;
  if (!NAME_RE.test(name))
    return `A ${what}'s name is letters, digits, "_" or "-".`;
  if (taken.includes(name)) return `There is already a ${what} "${name}".`;
  return null;
}

/** The definition with a new state that has no steps. Throws when the name
 * is refused or the definition has no recipe. */
export function withStateAdded(definition: Node, name: string): Node {
  const refusal = newNameRefusal(name, statesOf(definition), 'state');
  if (refusal) throw new Error(refusal);
  const recipe = definition.recipe;
  if (!mapping(recipe)) throw new Error('this behaviour writes no recipe');
  return {
    ...definition,
    recipe: {
      ...recipe,
      states: { ...statesNode(definition), [name]: { transitions: [] } },
    },
  };
}

/** The definition with one list's rows set whole; a key not yet written is
 * added last (a new list). */
export function withTableRows(
  definition: Node,
  key: string,
  rows: unknown[]
): Node {
  const table = mapping(definition.table) ? definition.table : {};
  return withKey(definition, 'table', { ...table, [key]: rows }, [
    'ref',
    'parameters',
    'end',
    'body',
    'recipe',
    'table',
  ]);
}

/** The definition with a new, empty list. Throws when the name is refused. */
export function withListAdded(definition: Node, name: string): Node {
  const refusal = newNameRefusal(name, tableKeysOf(definition), 'list');
  if (refusal) throw new Error(refusal);
  return withTableRows(definition, name, []);
}

/** The scope with one definition set whole. Throws for an id the file does
 * not author. Every other definition and root key is kept as written. */
export function setBehaviorDefinition(
  scope: Readonly<SiteScope>,
  id: string,
  definition: Node
): SiteScope {
  const definitions = definitionsOf(scope);
  if (!mapping(definitions[id]))
    throw new Error(
      `behaviorDefinitions.${id}: this site authors no such behaviour`
    );
  return {
    ...scope,
    unread: {
      ...scope.unread,
      behaviorDefinitions: { ...definitions, [id]: definition },
    },
  };
}
