/**
 * bundles — THE NESTED TABLE'S NAMES in the studio (rpg-project#670, R12–R16).
 *
 * A bundle is a named group of rows declared once under the root `bundles:`
 * and used as ONE row, `use: <id>`, wherever a table wants it. The engine
 * resolves every `use:` into a group whose rows are the bundle's with its
 * parameters substituted (`dungeonspec/bundles.go`); this file is the same
 * resolution, so the studio can SHOW a use as one line and expand it to the
 * rows it makes, and say what the engine will refuse in the engine's words.
 *
 * THE FORM NEVER PRE-JUDGES. Nothing here blocks a save: a name that names no
 * bundle, a parameter the bundle does not take, a bundle that uses itself —
 * each is the ENGINE's refusal at `PutDungeon`, and `groupRefusals` reports
 * the same sentence at the same path so the studio can show it where it
 * belongs. `TablesPanel` keeps the same rule for a `table:` name.
 *
 * A PARAMETER IS A WHOLE SCALAR: `$distance` in a bundle's rows is replaced by
 * the use's value for it, so a parameter can be a number, a word or a route.
 */
import {
  ANSWER_SOUND_KINDS,
  GROUP_SENTENCES,
  MAX_GROUP_DEPTH,
  patternOf,
  patternRegExp,
  writtenNameMatches,
} from '@/author/answerVocabulary';
import {
  isUseEntry,
  validateAnswerRows,
  type AnswerEntryShape,
  type AnswerTableShape,
  type OptionShape,
} from './answerTableShape';
import { walkFacts } from './factWalk';
import type { RoomDraft } from './roomDraft';
import type { SiteBundle, SiteBundles, SiteScope } from './siteScope';

/** One refusal the engine will make, at the engine's own path. */
export interface GroupRefusal {
  readonly path: string;
  readonly message: string;
}

/** A use resolved: the bundle's rows with the parameters substituted, every
 * parameter's value as the record shows it, and the first refusal the engine
 * would make of this use, if any. `rows` is empty when it could not be
 * resolved. */
export interface ResolvedUse {
  readonly bundle: string;
  readonly params: Readonly<Record<string, string>>;
  readonly rows: readonly AnswerEntryShape[];
  readonly refusal?: GroupRefusal;
}

const sorted = (keys: Iterable<string>): string[] => [...keys].sort();

/** The name a scalar names as a parameter, when it is one: `$` and a name. */
function parameterName(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 1 && value.startsWith('$')
    ? value.slice(1)
    : undefined;
}

/** Every `$name` written in a bundle's rows. */
export function parameterRefs(value: unknown): string[] {
  const name = parameterName(value);
  if (name !== undefined) return [name];
  if (Array.isArray(value)) return value.flatMap(parameterRefs);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(parameterRefs);
  return [];
}

/** A deep copy of `value` with every parameter scalar replaced, whole, by a
 * deep copy of its value. */
function substitute(value: unknown, values: Record<string, unknown>): unknown {
  const name = parameterName(value);
  if (name !== undefined && Object.hasOwn(values, name))
    return structuredClone(values[name]);
  if (Array.isArray(value)) return value.map((v) => substitute(v, values));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substitute(v, values)])
    );
  return value;
}

/** A parameter's value as a line shows it: a scalar as written, a route by its
 * length, anything else as JSON. */
export function paramText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `a route of ${value.length} waypoints`;
  return JSON.stringify(value);
}

/**
 * Resolve one `use:` row against the site's bundles: the engine's checks in
 * the engine's order (the name, a cycle, the depth guard, the parameters),
 * then the bundle's rows with the parameters filled, judged as rows of
 * `trigger`. `at` is the row's engine path, `…time[4]`; `stack` is the
 * bundles being resolved around it.
 */
export function resolveUse(
  bundles: SiteBundles | undefined,
  entry: AnswerEntryShape,
  trigger: string,
  at = '',
  stack: readonly string[] = []
): ResolvedUse {
  const name = entry.use ?? '';
  const empty = (path: string, message: string): ResolvedUse => ({
    bundle: name,
    params: {},
    rows: [],
    refusal: { path, message },
  });
  const bundle: SiteBundle | undefined = bundles?.[name];
  if (name === '') return empty(`${at}.use`, GROUP_SENTENCES.noBundleNamed());
  if (bundle === undefined)
    return empty(
      `${at}.use`,
      GROUP_SENTENCES.unknownBundle(name, sorted(Object.keys(bundles ?? {})))
    );
  if (stack.includes(name))
    return empty(`${at}.use`, GROUP_SENTENCES.usesItself(name, stack));
  if (stack.length + 1 > MAX_GROUP_DEPTH)
    return empty(`${at}.use`, GROUP_SENTENCES.tooDeep(name, stack.length + 1));

  const declared = sorted(Object.keys(bundle.params ?? {}));
  const given = entry.with ?? {};
  for (const param of sorted(Object.keys(given))) {
    if (!declared.includes(param))
      return empty(
        `${at}.with.${param}`,
        GROUP_SENTENCES.unknownParam(name, param, declared)
      );
  }
  const values: Record<string, unknown> = {};
  for (const param of declared) {
    if (Object.hasOwn(given, param)) values[param] = given[param];
    else if (bundle.params?.[param] === null)
      return empty(`${at}.with`, GROUP_SENTENCES.missingParam(name, param));
    else values[param] = bundle.params?.[param];
  }
  const params = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, paramText(v)])
  );
  if (bundle.rows.length === 0) return { bundle: name, params, rows: [] }; // refused at the bundle's path

  let rows: AnswerEntryShape[];
  try {
    rows = validateAnswerRows(
      substitute(bundle.rows, values) as unknown[],
      `${at}.rows`,
      trigger
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      bundle: name,
      params,
      rows: [],
      refusal: { path: `${at}.use`, message },
    };
  }
  for (const [index, row] of rows.entries()) {
    if (!isUseEntry(row)) continue;
    const inner = resolveUse(bundles, row, trigger, `${at}.rows[${index}]`, [
      ...stack,
      name,
    ]);
    if (inner.refusal)
      return { bundle: name, params, rows, refusal: inner.refusal };
  }
  return { bundle: name, params, rows };
}

/** A `use:` row as ONE line: "pursuer · with distance 8 · ×2 · as toward". */
export function groupLineText(entry: AnswerEntryShape): string {
  const parts = [entry.use ?? ''];
  const given = Object.entries(entry.with ?? {});
  if (given.length > 0)
    parts.push(
      `with ${given.map(([k, v]) => `${k} ${paramText(v)}`).join(', ')}`
    );
  if (entry.weight !== undefined) parts.push(`×${entry.weight}`);
  if (entry.as !== undefined) parts.push(`as ${entry.as}`);
  return parts.join(' · ');
}

/** Every word row a list holds, a group's resolved rows in its place: what
 * "every row an author wrote" means once a row can be a table. */
export function wordRowsOf(
  bundles: SiteBundles | undefined,
  rows: readonly AnswerEntryShape[],
  trigger: string
): AnswerEntryShape[] {
  return rows.flatMap((row) =>
    isUseEntry(row)
      ? wordRowsOf(bundles, resolveUse(bundles, row, trigger).rows, trigger)
      : [row]
  );
}

/** The row lists one document carries, each with its engine path and its
 * trigger. */
export interface RowList {
  readonly path: string;
  readonly trigger: string;
  readonly rows: readonly AnswerEntryShape[];
}

/** An `on:` block's lists, at `<path>.on.<trigger>`. */
export function onLists(
  path: string,
  on: AnswerTableShape | undefined
): RowList[] {
  return Object.entries(on ?? {}).map(([trigger, rows]) => ({
    path: `${path}.on.${trigger}`,
    trigger,
    rows,
  }));
}

/** An options list's verdict rows, at `<path>.options[i].<verdict>`. */
export function optionLists(
  path: string,
  options: readonly OptionShape[] | undefined
): RowList[] {
  return (options ?? []).flatMap((option, index) => [
    {
      path: `${path}.options[${index}].success`,
      trigger: 'success',
      rows: option.success ?? [],
    },
    {
      path: `${path}.options[${index}].failure`,
      trigger: 'failure',
      rows: option.failure ?? [],
    },
  ]);
}

/** The scope's own lists: its root tables and its factions' orders. */
export function scopeLists(scope: SiteScope): RowList[] {
  return [
    ...Object.entries(scope.tables ?? {}).flatMap(([id, on]) =>
      onLists(`tables.${id}`, on)
    ),
    ...(scope.factions ?? []).flatMap((f, i) =>
      onLists(`factions[${i}]`, f.on)
    ),
  ];
}

/** Every row list a document carries: the scope's, and every monster
 * binding's `on:` and options and every prop binding's options, at the
 * engine's paths. */
export function documentRowLists(
  scope: SiteScope,
  draft: RoomDraft
): RowList[] {
  const room = draft.room;
  return [
    ...scopeLists(scope),
    ...Object.entries(room.monsterBindings ?? {}).flatMap(([id, b]) => [
      ...onLists(`room.room.monsterBindings.${id}`, b.on),
      ...optionLists(`room.room.monsterBindings.${id}`, b.options),
    ]),
    ...Object.entries(room.propBindings ?? {}).flatMap(([id, b]) =>
      optionLists(`room.room.propBindings.${id}`, b.options)
    ),
  ];
}

/** Every fact the lists can teach (one group down and further) and the
 * scope's records reveal: the names a `fact` pattern may match. */
export function factsSet(
  scope: SiteScope,
  lists: readonly RowList[]
): Set<string> {
  const out = new Set<string>();
  for (const record of scope.intel ?? [])
    if ('fact' in record.reveals && record.reveals.fact)
      out.add(record.reveals.fact);
  for (const list of lists)
    for (const row of wordRowsOf(scope.bundles, list.rows, list.trigger))
      if (row.fact) out.add(row.fact);
  return out;
}

/**
 * Every refusal the engine will make of the document's bundles and patterns,
 * at the engine's paths and in its sentences: each bundle judged once (rows
 * written, no undeclared `$name`), each `use:` resolved, and each `fact`
 * pattern asked whether it matches a fact the document sets.
 *
 * `lists` is every row list the document carries — the scope's
 * (`scopeLists`) and the room's bindings' — so the fact universe is the
 * document's whole.
 */
export function groupRefusals(
  scope: SiteScope,
  lists: readonly RowList[] = scopeLists(scope)
): GroupRefusal[] {
  const out: GroupRefusal[] = [];
  for (const id of sorted(Object.keys(scope.bundles ?? {}))) {
    const bundle = scope.bundles![id];
    const declared = sorted(Object.keys(bundle.params ?? {}));
    if (bundle.rows.length === 0) {
      out.push({
        path: `bundles.${id}.rows`,
        message: GROUP_SENTENCES.noRows(),
      });
      continue;
    }
    for (const ref of parameterRefs(bundle.rows))
      if (!declared.includes(ref))
        out.push({
          path: `bundles.${id}.rows`,
          message: GROUP_SENTENCES.undeclaredRef(ref, id, declared),
        });
  }
  const facts = factsSet(scope, lists);
  const judge = (
    list: RowList,
    rows: readonly AnswerEntryShape[],
    at: string
  ) => {
    rows.forEach((row, index) => {
      const path = `${at}[${index}]`;
      walkFacts(row.when, (fact) => {
        if (patternOf(fact) === undefined) return;
        if (![...facts].some((id) => writtenNameMatches(fact, id)))
          out.push({
            path: `${path}.when`,
            message: GROUP_SENTENCES.factPatternNoFact(fact),
          });
      });
      if (!isUseEntry(row)) return;
      const resolved = resolveUse(scope.bundles, row, list.trigger, path);
      if (resolved.refusal) out.push(resolved.refusal);
      else judge(list, resolved.rows, `${path}.rows`);
    });
  };
  for (const list of lists) judge(list, list.rows, list.path);
  return out;
}

/** Whether a `heard` kind written as a pattern matches a sound this build
 * makes — for a field that shows the match as the author types. */
export function heardPatternMatches(kind: string): boolean {
  const pattern = patternOf(kind);
  if (pattern === undefined) return ANSWER_SOUND_KINDS.includes(kind);
  const re = patternRegExp(pattern);
  return re !== undefined && ANSWER_SOUND_KINDS.some((k) => re.test(k));
}
