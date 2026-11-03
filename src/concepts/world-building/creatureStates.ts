/** Authored recipe shapes from dungeonspec/states.go. This is a content
 * codec, never a machine interpreter. The server executes and judges the
 * recipe against the encounter; Studio preserves the author's words. */
import { ANSWER_WHEN, RETIRED_TRIGGER_KEYS } from '@/author/answerVocabulary';
import type { RoomMonsterBinding } from './roomDraft';
import type { SiteScope } from './siteScope';
import { objectShape, rejectUnknownKeys } from './strictShape';

export type StateCondition =
  | { enemy: 'seen' | 'remembered' | 'none' }
  | { fact: string }
  | { not: StateCondition };
export type StateAct =
  | { pick: string }
  | { wake_in: number }
  | { anchor: true };
export interface StateTransition {
  on: string;
  when?: StateCondition;
  within?: number;
  regions?: number;
  rounds?: number;
  to?: string;
  do?: StateAct[];
  reason?: string;
}
export interface CreatureState {
  terminal?: boolean;
  transitions?: StateTransition[];
}
/** Flat on disk: `initial` beside the named states, not another states map. */
export type CreatureStates = { initial: string } & Record<
  string,
  string | CreatureState
>;
export const STATE_BEATS = [
  'time',
  'heard',
  'deed',
  'seen',
  'fact',
  'clock:world',
  'clock:fight',
] as const;
const mapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be text');
  return value;
}
function count(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(path, 'must be a non-negative whole number');
  return value;
}
function condition(value: unknown, path: string): StateCondition {
  const raw = objectShape(value, path);
  if (Object.keys(raw).length !== 1)
    fail(path, "a state's when is one of { enemy }, { fact } or { not }");
  if ('not' in raw) return { not: condition(raw.not, `${path}.not`) };
  if ('enemy' in raw) {
    if (!['seen', 'remembered', 'none'].includes(String(raw.enemy)))
      fail(`${path}.enemy`, 'a state reads enemy as seen, remembered or none');
    return { enemy: raw.enemy as 'seen' | 'remembered' | 'none' };
  }
  if (typeof raw.fact === 'string' && raw.fact !== '')
    return { fact: raw.fact };
  return fail(
    path,
    "a state's when is one of { enemy }, { fact } or { not }: a deed, a sound and a threat are beats a state listens for"
  );
}
export function stateEntries(
  states: CreatureStates
): [string, CreatureState][] {
  return Object.entries(states).filter(
    (entry): entry is [string, CreatureState] =>
      entry[0] !== 'initial' && typeof entry[1] !== 'string'
  );
}
export function statePicks(states?: CreatureStates): string[] {
  return [
    ...new Set(
      states
        ? stateEntries(states).flatMap(([, state]) =>
            (state.transitions ?? []).flatMap((t) =>
              (t.do ?? []).flatMap((a) => ('pick' in a ? [a.pick] : []))
            )
          )
        : []
    ),
  ].sort();
}
export function validateStates(value: unknown, path: string): CreatureStates {
  const raw = objectShape(value, path);
  const initial = raw.initial;
  if (typeof initial !== 'string' || !initial)
    fail(
      `${path}.initial`,
      'a creature’s states name the one it starts in: write initial: <state>'
    );
  const names = Object.keys(raw).filter((n) => n !== 'initial');
  if (!names.includes(initial))
    fail(
      `${path}.initial`,
      `"${initial}" is not a state this block declares: they are ${names.join(', ')}`
    );
  const result: CreatureStates = { initial };
  for (const name of names) {
    const at = `${path}.${name}`;
    if (!name) fail(at, 'a state needs a name');
    const body = objectShape(raw[name], at);
    rejectUnknownKeys(body, ['terminal', 'transitions'], at);
    const state: CreatureState = {};
    if ('terminal' in body) {
      if (typeof body.terminal !== 'boolean')
        fail(`${at}.terminal`, 'must be a boolean');
      state.terminal = body.terminal;
    }
    if ('transitions' in body) {
      if (!Array.isArray(body.transitions))
        fail(`${at}.transitions`, 'must be a list');
      if (body.terminal && body.transitions.length)
        fail(
          `${at}.terminal`,
          'a terminal state ends the machine and listens for nothing'
        );
      state.transitions = body.transitions.map((value, index) => {
        const tp = `${at}.transitions[${index}]`;
        const t = objectShape(value, tp);
        rejectUnknownKeys(
          t,
          ['on', 'when', 'within', 'regions', 'rounds', 'to', 'do', 'reason'],
          tp
        );
        const on = text(t.on, `${tp}.on`);
        const deed =
          on.startsWith('deed:') && ANSWER_WHEN.deeds.includes(on.slice(5));
        if (
          !(STATE_BEATS as readonly string[]).includes(on) &&
          !deed &&
          !(on.startsWith('clock:') && on.length > 6)
        )
          fail(
            `${tp}.on`,
            `"${on}" is not a beat a state listens for: they are ${STATE_BEATS.join(', ')}, deed:<word> and clock:<name>`
          );
        const transition: StateTransition = { on };
        for (const key of ['within', 'regions', 'rounds'] as const) {
          if (key in t) transition[key] = count(t[key], `${tp}.${key}`);
        }
        if (
          (transition.within || transition.regions) &&
          !['heard', 'deed', 'seen'].includes(on) &&
          !deed
        )
          fail(
            `${tp}.within`,
            `${on} happened nowhere, so there is nothing to be within: within and regions are for heard, deed and seen`
          );
        if ('when' in t) transition.when = condition(t.when, `${tp}.when`);
        if ('to' in t) {
          transition.to = text(t.to, `${tp}.to`);
          if (transition.to && !names.includes(transition.to))
            fail(
              `${tp}.to`,
              `"${transition.to}" is not a state this block declares`
            );
        }
        if ('reason' in t) transition.reason = text(t.reason, `${tp}.reason`);
        if ('do' in t) {
          if (!Array.isArray(t.do)) fail(`${tp}.do`, 'must be a list');
          transition.do = t.do.map((value, index): StateAct => {
            const ap = `${tp}.do[${index}]`;
            const act = objectShape(value, ap);
            if (Object.keys(act).length !== 1)
              fail(
                ap,
                'an act is one of { pick: <key> }, { wake_in: N } or { anchor: true }'
              );
            if ('pick' in act) {
              const pick = text(act.pick, `${ap}.pick`);
              if (
                !pick ||
                ['success', 'failure', ...RETIRED_TRIGGER_KEYS].includes(pick)
              )
                fail(
                  `${ap}.pick`,
                  `"${pick}" is not a table key a state may pick`
                );
              return { pick };
            }
            if ('wake_in' in act) {
              const wake = count(act.wake_in, `${ap}.wake_in`);
              if (!wake) fail(`${ap}.wake_in`, 'a sleep is counted from 1');
              return { wake_in: wake };
            }
            if ('anchor' in act) {
              if (act.anchor !== true)
                fail(`${ap}.anchor`, 'an anchor act is { anchor: true }');
              return { anchor: true };
            }
            return fail(
              ap,
              'an act is one of { pick: <key> }, { wake_in: N } or { anchor: true }'
            );
          });
        }
        return transition;
      });
    }
    // defineProperty keeps even a state named __proto__ as authored data.
    Object.defineProperty(result, name, {
      value: state,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

/** Gather before table decoding, including recipes on placements. No global
 * registry: a typo in one document must not be licensed by another's recipe. */
export function documentStatePicks(
  factions: unknown,
  bindings?: unknown
): string[] {
  const owners: [string, unknown][] = [
    ...(Array.isArray(factions)
      ? factions.map((f, i): [string, unknown] => [`factions[${i}]`, f])
      : []),
    ...(mapping(bindings)
      ? Object.entries(bindings).map(([id, b]): [string, unknown] => [
          `room.room.monsterBindings.${id}`,
          b,
        ])
      : []),
  ];
  return [
    ...new Set(
      owners.flatMap(([path, owner]) =>
        mapping(owner) && Object.hasOwn(owner, 'states')
          ? statePicks(validateStates(owner.states, `${path}.states`))
          : []
      )
    ),
  ];
}

/** The content door judges each creature's resolved table/recipe, not just
 * the document's union of picks (dungeonspec.placeCreatureKeys). */
export function requireCreatureStateKeys(
  scope: SiteScope,
  bindings: Record<string, RoomMonsterBinding> = {},
  placements: readonly { id: string }[] = []
): void {
  for (const id of new Set([
    ...placements.map((p) => p.id),
    ...Object.keys(bindings),
  ])) {
    const own = bindings[id] ?? {};
    const side = scope.factions?.find(
      (f) => f.id === (own.faction ?? 'monsters')
    );
    const table = {
      ...(side?.table ? scope.tables?.[side.table] : {}),
      ...side?.on,
      ...(own.table ? scope.tables?.[own.table] : {}),
      ...own.on,
    };
    const states = own.states ?? side?.states;
    const picks = statePicks(states);
    for (const key of Object.keys(table)) {
      if (key === 'time' || picks.includes(key)) continue;
      fail(
        `room.room.monsterBindings.${id}`,
        picks.length
          ? `this creature's table carries "${key}" and the states it runs never pick it: they pick ${picks.join(', ')}`
          : `this creature's table carries "${key}" and the states it runs pick no key (it runs the default, which picks time): give it states that pick "${key}", or a table without it`
      );
    }
  }
}
