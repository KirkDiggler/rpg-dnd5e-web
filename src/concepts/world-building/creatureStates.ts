/** Authored recipe shapes from dungeonspec/states.go. This is a content
 * codec, never a machine interpreter. The server executes and judges the
 * recipe against the encounter; Studio preserves the author's words. */
import { ANSWER_WHEN, RETIRED_TRIGGER_KEYS } from '@/author/answerVocabulary';
import type { RoomMonsterBinding } from './roomDraft';
import type { SiteScope } from './siteScope';
import {
  carriedCopy as carried,
  carryUnknownKeys,
  objectShape,
  putOwn as put,
} from './strictShape';

export type StateCondition =
  | { enemy: 'seen' | 'remembered' | 'none' }
  | { fact: string }
  | { not: StateCondition };
export type StateAct =
  | { pick: string }
  | { wake_in: number }
  | { anchor: true };
export interface StateTransition {
  /** A transition field a newer server added: kept as written, never read. */
  [future: string]: unknown;
  on: string;
  when?: StateCondition;
  within?: number;
  regions?: number;
  rounds?: number;
  to?: string;
  do?: StateAct[];
  reason?: string;
}
/** The ways a post holds (rpg-project#857, R6); absent reads as both. */
export const POST_DIRECTIONS = ['both', 'entering', 'leaving'] as const;
export type PostDirection = (typeof POST_DIRECTIONS)[number];
/** A state's post (dungeonspec `HoldsSpec`, rpg-project#852 and #857): the
 * door whose opening a creature in this state bars, the cells he holds it
 * from (none means his placed cell), the direction it holds, and the fact
 * that walks a mover through. Carried as written: whether the door exists,
 * the cells are floor and the pass is a fact the file sets is the server's
 * to judge at PutDungeon. */
export interface StateHolds {
  door: string;
  at?: { q: number; r: number }[];
  /** Empty, as absent, reads as both. */
  against?: PostDirection | '';
  pass?: string;
  /** A field a newer server added: kept as written, never read. */
  [future: string]: unknown;
}
export interface CreatureState {
  terminal?: boolean;
  transitions?: StateTransition[];
  /** The body blocks while in this state (rpg-project#836). */
  blocks?: boolean;
  holds?: StateHolds;
  /** A state field a newer server added: kept as written, never read, so a
   * document the server serves always imports (rpg-project#857). */
  [future: string]: unknown;
}
/** The transition fields this codec reads; any other is carried verbatim. */
export const TRANSITION_FIELDS = [
  'on',
  'when',
  'within',
  'regions',
  'rounds',
  'to',
  'do',
  'reason',
] as const;
/** The state fields this codec reads; any other is carried verbatim. */
export const STATE_FIELDS = [
  'terminal',
  'transitions',
  'blocks',
  'holds',
] as const;
/** Flat on disk: `initial` beside the named states, not another states map. */
export type CreatureStates = { initial: string } & Record<
  string,
  string | CreatureState
>;
/**
 * The beats a state listens for (dungeonspec/states.go). `barred` is a bump
 * (rpg-project#842): a step refused by this body, or a door verb refused by
 * its hold. It is heard by the barrier alone, at once, in the Move that
 * bumped, and is scoped like `heard`.
 */
export const STATE_BEATS = [
  'time',
  'heard',
  'barred',
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
function cell(value: unknown, path: string): { q: number; r: number } {
  const raw = objectShape(value, path);
  for (const axis of ['q', 'r'] as const)
    if (typeof raw[axis] !== 'number' || !Number.isSafeInteger(raw[axis]))
      fail(`${path}.${axis}`, 'must be a whole number');
  return carryUnknownKeys(raw, ['q', 'r'], {
    q: raw.q as number,
    r: raw.r as number,
  });
}
function holds(value: unknown, path: string): StateHolds {
  const raw = objectShape(value, path);
  if (typeof raw.door !== 'string' || !raw.door)
    fail(
      `${path}.door`,
      'a post names the door whose opening it holds: write door: <door id>'
    );
  const result = {} as StateHolds;
  for (const key of Object.keys(raw)) {
    const at = `${path}.${key}`;
    if (key === 'door') result.door = raw.door;
    else if (key === 'at') {
      if (!Array.isArray(raw.at)) fail(at, 'must be a list of { q, r }');
      result.at = raw.at.map((c, i) => cell(c, `${at}[${i}]`));
    } else if (key === 'against') {
      // Empty reads as both, as the server's PostDirection does.
      if (![...POST_DIRECTIONS, ''].includes(raw.against as string))
        fail(
          at,
          `"${String(raw.against)}" is not a way a post holds: write both, entering or leaving`
        );
      result.against = raw.against as PostDirection | '';
    } else if (key === 'pass') result.pass = text(raw.pass, at);
    else put(result, key, carried(raw[key]));
  }
  return result;
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
    // In the author's key order, so an untouched state writes back as read.
    const state: CreatureState = {};
    for (const key of Object.keys(body)) {
      if (key === 'terminal') {
        if (typeof body.terminal !== 'boolean')
          fail(`${at}.terminal`, 'must be a boolean');
        state.terminal = body.terminal;
      } else if (key === 'blocks') {
        if (typeof body.blocks !== 'boolean')
          fail(`${at}.blocks`, 'must be a boolean');
        state.blocks = body.blocks;
      } else if (key === 'holds') {
        state.holds = holds(body.holds, `${at}.holds`);
      } else if (key === 'transitions') {
        state.transitions = [];
      } else put(state, key, carried(body[key]));
    }
    if (body.terminal === true)
      for (const key of ['blocks', 'holds'] as const)
        if (key in body && (key === 'holds' || body.blocks))
          fail(
            `${at}.${key}`,
            `a terminal state ends the machine and holds no post: ${key} is for a state the creature stands in`
          );
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
          !['heard', 'barred', 'deed', 'seen'].includes(on) &&
          !deed
        )
          fail(
            `${tp}.within`,
            `${on} happened nowhere, so there is nothing to be within: within and regions are for heard, barred, deed and seen`
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
        // In the author's key order, so an untouched transition writes back
        // as read; a field this codec does not read is carried as written
        // (rpg-project#857).
        return Object.fromEntries(
          Object.keys(t).map((key) => [
            key,
            (TRANSITION_FIELDS as readonly string[]).includes(key)
              ? transition[key as keyof StateTransition]
              : carried(t[key]),
          ])
        ) as unknown as StateTransition;
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
