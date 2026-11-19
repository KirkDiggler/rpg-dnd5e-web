/**
 * A BEHAVIOUR'S MACHINE, AS THE ENGINE SAYS IT (rpg-project#995, the
 * studio half of rpg-project#993).
 *
 * The engine says a routine's shape as connections on the statements it
 * already makes (rpg-project#994). State ids are local to the routine; the
 * routine named in the statement's path scopes them, never its subject.
 *
 * | statement                              | connection                     |
 * |----------------------------------------|--------------------------------|
 * | `routine`                              | `{state, <initial>, starts}`   |
 * | `routine.state`                        | `{state, S, is}`; `{state, S, final}` when terminal |
 * | `routine.wake`                         | `{state, S, from}`; `{state, Y, to}` only when it moves; `{beat, <on>, on}`; `{table, <key>, picks}` per pick; what its guard reads (below) |
 * | `routine.row`                          | `{table, <key>, row-of}`       |
 * | `creature.post`, `creature.blocking`   | `{state, S, while}` per state  |
 *
 * A wake's guard says what it reads beside its shape (rpg-toolkit
 * `readback/routinewords.go`, `guardWords`): `{fact, F, wakes-on}`,
 * `{topic, T, wakes-on}` (noted about anyone), `{topic, T, asks}` (noted
 * about the one its beat names) and `{claim, held|failed, asks}` (the
 * verdict of a claim it heard, rpg-project#1000, #1012). Every connection
 * on a wake that is not one of its shape roles is one of its reads: it is
 * drawn in the step's label and keeps two steps apart, so a read the
 * engine adds later can never merge two different steps.
 *
 * This module reads those connections, the statements' `kind`, and the
 * routine their path is set under, and nothing else
 *
 * A STEP'S WHOLE CONDITION (rpg-project#1015, encounter v0.225.0): every
 * condition its `when` reads is a `{condition, <word>, asks}` connection
 * with its value (`is`), comparison (`op`), polarity hint (`negated`) and
 * place (`at`). Two steps gather into one arrow only when those are the
 * same, in order. An engine that sends no condition connections keeps the
 * reads above, as before; one that does says through them what the
 * wakes-on, claim and topic reads said, so those are not said twice.
 * The words a label is said in are the engine's (`machineWords.ts`): it never reads a sentence or the file to place
 * or connect anything. A read-back without the shape (an older engine), or
 * with a shape that does not hold together (a step from or to a state the
 * routine does not say), gives no machine at all: the studio draws nothing
 * rather than guess.
 */
import type {
  ReadBack,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  actWords,
  beatWordOf,
  beatWords,
  compareAt,
  conditionWordOf,
  conditionWords,
  type MachineWords,
  type StepCondition,
} from './machineWords';

export type { StepCondition } from './machineWords';

const ROUTINE = 'routine';
const KIND_ROUTINE = 'routine';
const KIND_STATE = 'routine.state';
const KIND_WAKE = 'routine.wake';
/** A flag the routine remembers (encounter v0.228.0): `{flag, <name>,
 * declares, is}`. */
const KIND_FLAG = 'routine.flag';
const ROUTINE_KINDS = new Set([
  KIND_ROUTINE,
  KIND_STATE,
  KIND_WAKE,
  'routine.row',
  KIND_FLAG,
]);
const underRoutine = (path: string, routineId: string): boolean => {
  const at = `behaviorDefinitions.${routineId}`;
  return path === at || path.startsWith(`${at}.`);
};
const KIND_CREATURE_ROUTINE = 'creature.routine';
const HOLD_KINDS = new Set(['creature.post', 'creature.blocking']);
const STATE = 'state';
const ROLE_STARTS = 'starts';
const ROLE_IS = 'is';
const ROLE_FINAL = 'final';
const ROLE_FROM = 'from';
const ROLE_TO = 'to';
const ROLE_ON = 'on';
const ROLE_PICKS = 'picks';
const ROLE_WHILE = 'while';
const ROLE_USES = 'uses';
/** A wake's guard reads: the engine's role for a fact or topic a step
 * wakes on (`{fact, guards-turned, wakes-on}`). */
const ROLE_WAKES_ON = 'wakes-on';
/** The engine's connection to the verdict a step's heard-claim condition
 * asks (`{claim, failed, asks}`): its id is the engine's word, `held` or
 * `failed`, and names no thing in the file. */
const CLAIM = 'claim';
const ROLE_ASKS = 'asks';
/** The roles that say a wake's place in its machine. Every other
 * connection on a wake is something its condition reads. */
const SHAPE_ROLES = new Set([ROLE_FROM, ROLE_TO, ROLE_ON, ROLE_PICKS]);
/** One condition a step's `when` reads (encounter v0.225.0). */
const CONDITION = 'condition';
/** One act of a step, `{act, <word>, does, is?, at}` (encounter v0.228.0). */
const ACT = 'act';
/** A flag a step asks, sets or clears, or a routine declares. */
const FLAG = 'flag';
const ROLE_DECLARES = 'declares';
/** Between a beat's words and its condition's, and between the parts of a
 * staying step's line. */
const SEP = ' · ';

/** One connection a step's condition reads, as the engine says it. */
export interface StepRead {
  kind: string;
  id: string;
  role: string;
  /** A condition connection's value, comparison, polarity and place;
   * empty on every other. */
  is?: string;
  op?: string;
  negated?: boolean;
  at?: string;
}

/** One step of the machine: one `routine.wake`. */
export interface MachineStep {
  statement: ReadBackStatement;
  from: string;
  /** Where it moves, or null when it stays in `from`. A `to` equal to its
   * `from` stays too. */
  to: string | null;
  /** What fires it: the engine's beat id (`heard`, `barred`, `fact`,
   * `time`, …). */
  beat: string;
  /** The tables it acts from, in the engine's order. */
  picks: string[];
  /** What its guard reads, as the engine connects it (`fact guards-turned`). */
  wakesOn: { kind: string; id: string }[];
  /** The verdicts of a heard claim its condition asks (`failed`), in the
   * engine's order; empty when it asks none. The connection says what is
   * asked, not whether the condition wants it or its opposite (a `not`
   * keeps it): the sentence says which. */
  claims: string[];
  /** Every connection that is not its shape (`from`, `to`, `on`,
   * `picks`), in the engine's order: the wakes-on reads, the claim, a
   * topic it asks about the one heard, and any the drawing does not yet
   * know. */
  reads: StepRead[];
  /** Its whole condition, as its `condition` connections say it, in `at`
   * order; empty from an engine that sends none. */
  conditions: StepCondition[];
  /** Every act it does, as its `act` connections say them, in the author's
   * order (`to` first, then `do[i]`); empty from an engine that sends none
   * (before encounter v0.228.0). */
  acts: StepAct[];
  /** The `flag` connections no condition or act already says, for the
   * grouping key only (`asks warned` with no `flag:warned` condition). */
  flagReads: StepRead[];
}

/** One act of a step. `is` is the engine's JSON literal (`"3"` is text,
 * `3` a number), or empty where the act carries no value. */
export interface StepAct {
  /** As authored, open part filled: `to:challenged`, `pick:barred`,
   * `anchor`, `wake_in`, `set:seen`. */
  id: string;
  is: string;
  at: string;
}

/** A flag the machine remembers: its name and starting value (a JSON
 * literal), from its `routine.flag` statement. */
export interface MachineFlag {
  name: string;
  is: string;
  statement: ReadBackStatement;
}

/** A creature's post or blocking that holds while the machine is in a
 * state. */
export interface MachineHold {
  statement: ReadBackStatement;
  /** The creature the statement is about. */
  creature: string;
  /** The engine's kind: `creature.post` or `creature.blocking`. */
  kind: string;
}

export interface MachineState {
  id: string;
  /** The `routine.state` statement that says it. */
  statement: ReadBackStatement;
  initial: boolean;
  /** The engine says it is terminal (`{state, S, final}`). */
  final: boolean;
  /** No step leaves it: no wake of this routine has it as `from` and a
   * `to` other than it. A fact of the drawn graph, apart from `final`;
   * never said of a machine's only state, where it tells nothing. */
  noWayOut: boolean;
  /** Steps from this state that stay in it, in the engine's order. */
  stays: MachineStep[];
  holds: MachineHold[];
}

/** Steps that move, gathered: the same beat, the same target, the same
 * reads and the same tables picked, from one or more states. Drawn once. */
export interface MachineEdge {
  /** Stable within the machine: beat, target, reads and picks. */
  id: string;
  from: string[];
  to: string;
  beat: string;
  wakesOn: { kind: string; id: string }[];
  claims: string[];
  reads: StepRead[];
  conditions: StepCondition[];
  acts: StepAct[];
  flagReads: StepRead[];
  steps: MachineStep[];
}

export interface MachineView {
  routine: string;
  initial: string;
  /** In the engine's order. */
  states: MachineState[];
  /** Every step, in the engine's order. */
  steps: MachineStep[];
  /** The moving steps, gathered, in the order their first step is said. */
  edges: MachineEdge[];
  /** What the machine remembers, in the engine's order; empty when it
   * declares no flag. */
  flags: MachineFlag[];
}

const connected = (
  statement: ReadBackStatement,
  kind: string,
  role: string
): string[] =>
  statement.connects
    .filter((c) => c.kind === kind && c.role === role)
    .map((c) => c.id);

/** The routine's machine, or null when the read-back does not say its
 * shape. */
export function machineOf(
  readBack: ReadBack,
  routineId: string
): MachineView | null {
  const groups = readBack.sections.flatMap((section) => section.groups);
  const group = groups.find(
    (g) => g.about?.kind === ROUTINE && g.about.id === routineId
  );
  if (!group) return null;
  // A state id is scoped by the routine its statement's path names, never
  // by its subject: the engine repeats a step under a fact or topic hub
  // (`fact.ask`, `topic.ask`) with its shape connections and the hub as its
  // subject. Only the routine's own kinds, set under its own definition,
  // build its machine.
  const own = group.statements.filter(
    (st) => ROUTINE_KINDS.has(st.kind) && underRoutine(st.path, routineId)
  );
  const head = own.find((st) => st.kind === KIND_ROUTINE);
  const initial = head ? connected(head, STATE, ROLE_STARTS)[0] : undefined;
  if (!head || !initial) return null;

  const states = new Map<string, MachineState>();
  for (const statement of own) {
    if (statement.kind !== KIND_STATE) continue;
    const id = connected(statement, STATE, ROLE_IS)[0];
    if (!id) return null;
    if (states.has(id)) continue;
    states.set(id, {
      id,
      statement,
      initial: id === initial,
      final: connected(statement, STATE, ROLE_FINAL).includes(id),
      noWayOut: true,
      stays: [],
      holds: [],
    });
  }
  if (!states.has(initial)) return null;

  const steps: MachineStep[] = [];
  for (const statement of own) {
    if (statement.kind !== KIND_WAKE) continue;
    const from = connected(statement, STATE, ROLE_FROM)[0];
    const beat = connected(statement, 'beat', ROLE_ON)[0];
    if (!from || !beat || !states.has(from)) return null;
    const to = connected(statement, STATE, ROLE_TO)[0] ?? null;
    if (to !== null && !states.has(to)) return null;
    steps.push({
      statement,
      from,
      to: to === from ? null : to,
      beat,
      picks: connected(statement, 'table', ROLE_PICKS),
      wakesOn: statement.connects
        .filter((c) => c.role === ROLE_WAKES_ON)
        .map((c) => ({ kind: c.kind, id: c.id })),
      claims: connected(statement, CLAIM, ROLE_ASKS),
      reads: statement.connects
        .filter(
          (c) => !SHAPE_ROLES.has(c.role) && c.kind !== ACT && c.kind !== FLAG
        )
        .map((c) =>
          c.kind === CONDITION
            ? {
                kind: c.kind,
                id: c.id,
                role: c.role,
                is: c.is,
                op: c.op,
                negated: c.negated,
                at: c.at,
              }
            : { kind: c.kind, id: c.id, role: c.role }
        ),
      conditions: conditionsOf(statement),
      acts: actsOf(statement),
      flagReads: flagReadsOf(statement),
    });
  }
  for (const step of steps)
    if (step.to === null) states.get(step.from)!.stays.push(step);
    else states.get(step.from)!.noWayOut = false;
  if (states.size < 2) for (const s of states.values()) s.noWayOut = false;

  // The creatures that run this routine, as their own `creature.routine`
  // statements say (`{routine, id, uses}`); each one's posts and blocking
  // hang on the states their `while` names. A `while` names a state id
  // and no routine, so a creature running two routines with a same-named
  // state would show it in both; no castle creature does (an engine
  // follow-up can say the routine).
  const runners = new Set(
    groups.flatMap((g) =>
      g.statements
        .filter(
          (st) =>
            st.kind === KIND_CREATURE_ROUTINE &&
            st.about !== undefined &&
            st.connects.some(
              (c) =>
                c.kind === ROUTINE && c.id === routineId && c.role === ROLE_USES
            )
        )
        .map((st) => st.about!.id)
    )
  );
  for (const g of groups)
    for (const statement of g.statements) {
      if (!HOLD_KINDS.has(statement.kind)) continue;
      const creature = statement.about?.id;
      if (!creature || !runners.has(creature)) continue;
      for (const id of new Set(connected(statement, STATE, ROLE_WHILE)))
        states
          .get(id)
          ?.holds.push({ statement, creature, kind: statement.kind });
    }

  return {
    routine: routineId,
    initial,
    states: [...states.values()],
    steps,
    edges: edgesOf(steps),
    flags: own.flatMap((statement) => {
      if (statement.kind !== KIND_FLAG) return [];
      const c = statement.connects.find(
        (x) => x.kind === FLAG && x.role === ROLE_DECLARES
      );
      return c ? [{ name: c.id, is: c.is, statement }] : [];
    }),
  };
}

/** The order of an act's place: `to` first, then by its `do[i]`, whatever
 * follows it (`do[1].clear[0]` is a clear of `do[1]`). Acts at one `do[i]`
 * keep the order the engine sends them in, which is the order it applies
 * them (rpg-toolkit `readback/routines.go` `actConnections`). */
const actRank = (at: string): number => {
  if (at === 'to') return -1;
  const m = /^do\[(\d+)\]/.exec(at);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

/** A step's act connections, each once, in the author's order. */
function actsOf(statement: ReadBackStatement): StepAct[] {
  const seen = new Set<string>();
  const out: StepAct[] = [];
  for (const c of statement.connects) {
    if (c.kind !== ACT) continue;
    const act = { id: c.id, is: c.is, at: c.at };
    const key = JSON.stringify([act.id, act.is, act.at]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(act);
  }
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => actRank(x.a.at) - actRank(y.a.at) || x.i - y.i)
    .map(({ a }) => a);
}

/** A step's `flag` connections that neither a condition (`flag:<name>`
 * for `asks`) nor an act (`set:<name>`, `clear:<name>` for `sets`,
 * `clears`) already says. */
function flagReadsOf(statement: ReadBackStatement): StepRead[] {
  const said = new Set(
    statement.connects
      .filter((c) => c.kind === CONDITION || c.kind === ACT)
      .map((c) => c.id)
  );
  const covers: Record<string, string> = {
    asks: 'flag:',
    sets: 'set:',
    clears: 'clear:',
  };
  return statement.connects
    .filter(
      (c) =>
        c.kind === FLAG &&
        !(covers[c.role] !== undefined && said.has(`${covers[c.role]}${c.id}`))
    )
    .map((c) => ({ kind: c.kind, id: c.id, role: c.role }));
}

/** An act's value as the JSON literal says it: the value, and its text as
 * written (`"3"` stays quoted, so text and number read apart). Null for an
 * act with no value. */
export function actValueOf(
  is: string
): { value: unknown; text: string } | null {
  if (!is) return null;
  try {
    const value: unknown = JSON.parse(is);
    return { value, text: typeof value === 'string' ? is : String(value) };
  } catch {
    return { value: is, text: is };
  }
}

/** A step's condition connections, each once, in `at` order (the engine's
 * order among equals). */
function conditionsOf(statement: ReadBackStatement): StepCondition[] {
  const seen = new Set<string>();
  const out: StepCondition[] = [];
  for (const c of statement.connects) {
    if (c.kind !== CONDITION) continue;
    const condition = {
      id: c.id,
      is: c.is,
      op: c.op,
      negated: c.negated,
      at: c.at,
    };
    const key = conditionKey(condition);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(condition);
  }
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => compareAt(a.c.at, b.c.at) || a.i - b.i)
    .map(({ c }) => c);
}

const conditionKey = (c: StepCondition): string =>
  JSON.stringify([c.id, c.is, c.op, c.negated, c.at]);

const wakesKey = (step: Pick<MachineStep, 'wakesOn'>): string =>
  step.wakesOn
    .map((w) => `${w.kind} ${w.id}`)
    .sort()
    .join(',');

/** Every read but the wakes-on ones, by role, kind and id, sorted: the
 * claim, a topic asked about the one heard, and any connection the drawing
 * does not yet know. Empty for a step that reads none, so such a step's
 * edge id is the one it always had. */
const otherReadsKey = (step: Pick<MachineStep, 'reads'>): string =>
  step.reads
    .filter((r) => r.role !== ROLE_WAKES_ON && r.kind !== CONDITION)
    .map((r) => `${r.role} ${r.kind} ${r.id}`)
    .sort()
    .join(',');

/** The whole condition, in order: id, value, comparison, polarity and
 * place of each. Empty for a step that has none. */
const conditionsKey = (step: Pick<MachineStep, 'conditions'>): string =>
  step.conditions.map(conditionKey).join(',');

/** Every act, in order, with its value and place, and every flag
 * connection no condition or act says. Empty from an engine that sends
 * neither, so such a step's edge id is the one it had. */
const actsKey = (step: Pick<MachineStep, 'acts' | 'flagReads'>): string =>
  [
    ...step.acts.map((a) => JSON.stringify([a.id, a.is, a.at])),
    ...step.flagReads.map((r) => `${r.role} ${r.kind} ${r.id}`).sort(),
  ].join(',');

/** Moving steps gathered by beat, target, reads and picks, in the order
 * their first step is said. Any part that differs keeps two steps apart. */
function edgesOf(steps: readonly MachineStep[]): MachineEdge[] {
  const edges = new Map<string, MachineEdge>();
  for (const step of steps) {
    if (step.to === null) continue;
    const others = otherReadsKey(step);
    const whole = conditionsKey(step);
    const does = actsKey(step);
    const id =
      `${step.beat}>${step.to}>${wakesKey(step)}>${step.picks.join(',')}` +
      (others ? `>${others}` : '') +
      (whole ? `>when ${whole}` : '') +
      (does ? `>do ${does}` : '');
    const edge = edges.get(id);
    if (edge) {
      if (!edge.from.includes(step.from)) edge.from.push(step.from);
      edge.steps.push(step);
    } else
      edges.set(id, {
        id,
        from: [step.from],
        to: step.to,
        beat: step.beat,
        wakesOn: step.wakesOn,
        claims: step.claims,
        reads: step.reads,
        conditions: step.conditions,
        acts: step.acts,
        flagReads: step.flagReads,
        steps: [step],
      });
  }
  return [...edges.values()];
}

/** The reads the drawing knows, by role and kind, as the engine's
 * `guardWords` says them today. */
const KNOWN_READS = new Set([
  `${ROLE_WAKES_ON} fact`,
  `${ROLE_WAKES_ON} topic`,
  `${ROLE_ASKS} ${CLAIM}`,
  `${ROLE_ASKS} topic`,
]);

/** A connection the drawing does not know: not a shape role, condition,
 * act or flag, and not a wakes-on or asks read it understands. It keeps
 * two steps apart (the grouping key) but is not drawn: an engine release
 * that adds one changes nothing visible until the studio learns to say it
 * (rpg-project#1015). */
const unknownRead = (r: StepRead): boolean =>
  r.kind !== CONDITION && !KNOWN_READS.has(`${r.role} ${r.kind}`);

/** The connections a step's mark lists raw after "also:" in its hover
 * text: every one the drawing does not know, as `role kind id`. */
export function alsoOf(step: Pick<MachineStep, 'reads'>): string[] {
  return step.reads
    .filter(unknownRead)
    .map((r) => `${r.role} ${r.kind} ${r.id}`);
}

/** The lead of the raw list in a mark's hover text. */
export const ALSO_WORDS = 'also:';

/** One read's words: a known wakes-on read is its id (`guards-turned`), a
 * known asks read its kind and id (`claim failed`), and any other read its
 * role, kind and id (`asks-not claim held`), so a role the drawing does
 * not know can never be read as one it does. */
const readWords = (r: StepRead): string =>
  !KNOWN_READS.has(`${r.role} ${r.kind}`)
    ? `${r.role} ${r.kind} ${r.id}`
    : r.role === ROLE_WAKES_ON
      ? r.id
      : `${r.kind} ${r.id}`;

/** What a label is made from: a step or an edge. */
export type Labelled = Pick<MachineStep, 'beat' | 'reads'> &
  Partial<Pick<MachineStep, 'conditions' | 'acts' | 'flagReads'>>;

/** The acts a label says, in the author's order: every act but the move,
 * which the arrow itself says (`to:X`). A staying step's picks are left out
 * too (`picks: false`): its box says each as a line of its own ("acts from
 * the post list"). A moving step's arrow says them among its acts. */
const ownActs = (
  step: Labelled,
  { picks = true }: { picks?: boolean } = {}
): StepAct[] =>
  (step.acts ?? []).filter(
    (a) =>
      !a.id.startsWith('to:') &&
      a.id !== 'to' &&
      (picks || !a.id.startsWith('pick:'))
  );

/** One act's words: the engine's act label, its open part and value
 * filled (`waits 3 rounds`, `marks the moment`, `sets seen to true`); its
 * id and value without the words. */
function actSaid(a: StepAct, words: MachineWords | null): string {
  const value = actValueOf(a.is);
  const colon = a.id.indexOf(':');
  const word = colon < 0 ? a.id : a.id.slice(0, colon);
  const open = colon < 0 ? '' : a.id.slice(colon + 1);
  const said =
    words &&
    actWords(words, word, {
      id: open,
      value: value?.text ?? '',
      n: value?.text ?? '',
    });
  return said || `${a.id}${value ? ` ${value.text}` : ''}`;
}

/** A place inside `when` that only `all` leads to: the condition is
 * needed, whatever else the step asks. */
const NEEDED_AT = /^when(\.all\[\d+\])*$/;

/** The thing a beat that takes one is about, and the condition it is said
 * by (rpg-project#1015 review): the step's ONE condition whose word's open
 * part is of the beat's own kind (`fact:` on a `fact` beat, `noted.anyone:`
 * on a `topic` beat), asked true, not under a `not`, on a path only `all`
 * leads to. The engine's `wakes-on` read is not the source: it is said of
 * such a leaf under a `not`, inside an `any`, and asked false too. With
 * none or several, the beat says no thing and every condition is said. */
function thingOf(
  step: Labelled,
  words: MachineWords | null
): { id: string; condition: StepCondition } | undefined {
  if (!words) return undefined;
  const beat = beatWordOf(words, step.beat);
  if (!beat?.word.labelWith) return undefined;
  const named = (step.conditions ?? []).flatMap((c) => {
    const found = conditionWordOf(words, c.id);
    return found &&
      found.word.open === step.beat &&
      c.is === 'true' &&
      !c.negated &&
      NEEDED_AT.test(c.at)
      ? [{ id: found.open, condition: c }]
      : [];
  });
  return named.length === 1 ? named[0] : undefined;
}

/** What a step's label says after its beat: its condition (still to be
 * worded) and every read the drawing does not know, or, from an engine that
 * sends no condition connections, its reads as before. The condition the
 * beat's thing is said by is not said again. */
function partsOf(
  step: Labelled,
  words: MachineWords | null
): { conditions: StepCondition[]; reads: string[] } {
  const conditions = step.conditions ?? [];
  // A connection the drawing does not know is never drawn (it is listed
  // after "also:" in the mark's hover text, `alsoOf`).
  if (!conditions.length)
    return {
      conditions: [],
      reads: step.reads.filter((r) => !unknownRead(r)).map(readWords),
    };
  const reads: string[] = [];
  const thing = thingOf(step, words);
  return {
    conditions: thing
      ? conditions.filter((c) => c !== thing.condition)
      : conditions,
    reads,
  };
}

/** The beat's own words: the engine's label, or `on <beat>` without
 * words for it. */
const beatOf = (step: Labelled, words: MachineWords | null): string =>
  (words && beatWords(words, step.beat, thingOf(step, words)?.id)) ||
  `on ${step.beat}`;

/** A step's words for a label. With the engine's words: the beat's plain
 * label, then its whole condition (`hears something · it was a claim that
 * failed and has noted admitted about them`). Without them, the
 * connections' ids as before (`on fact: guards-turned`), or, for a
 * condition with structure the ids cannot say (an `any`, a `not`, a value
 * asked false), the beat and how many conditions it has. */
export function beatLabel(
  step: Labelled,
  words: MachineWords | null = null,
  { acts = true }: { acts?: boolean } = {}
): string {
  const { conditions, reads } = partsOf(step, words);
  const whole = conditionWords(words, conditions);
  if (whole === null) return shortBeatLabel(step, words, { acts });
  const parts = [
    ...(whole ? [whole] : []),
    ...reads,
    ...(acts ? ownActs(step).map((a) => actSaid(a, words)) : []),
  ];
  if (!words || !beatWords(words, step.beat))
    return parts.length
      ? `on ${step.beat}: ${parts.join(', ')}`
      : `on ${step.beat}`;
  return [beatOf(step, words), ...parts].join(SEP);
}

/** A step's label when its full one does not fit: the beat, and how many
 * conditions it has beyond it (`hears something +2`), so a cut label still
 * shows it has a condition. The full label is the mark's tooltip. */
export function shortBeatLabel(
  step: Labelled,
  words: MachineWords | null = null,
  { acts = true }: { acts?: boolean } = {}
): string {
  const beat =
    words && beatWords(words, step.beat)
      ? beatOf(step, words)
      : `on ${step.beat}`;
  const { conditions, reads } = partsOf(step, words);
  const n =
    conditions.length +
    reads.length +
    (acts ? ownActs(step).length : 0) +
    (step.flagReads?.length ?? 0);
  return n ? `${beat} +${n}` : beat;
}

/** A staying step's line inside its box: its label and the lists it acts
 * from, in the engine's words (`time passes · acts from the post list`),
 * or as before (`on time: picks post`). */
export function stayLabel(
  step: MachineStep,
  words: MachineWords | null = null
): string {
  return stayParts(step, words).join(SEP);
}

/** A staying step's line in its parts, for a box too narrow for it whole:
 * its label, then each list it acts from in the engine's words. Without
 * the words for them, one part as before (`on time: picks post`). */
export function stayParts(
  step: MachineStep,
  words: MachineWords | null = null
): string[] {
  const picked = words
    ? step.picks.map((id) => actWords(words, 'pick', { id }))
    : [];
  // Its other acts (encounter v0.228.0) under its lists, in the author's
  // order; none from an older engine.
  const acts = ownActs(step, { picks: false }).map((a) => actSaid(a, words));
  if (words && picked.length && picked.every((p) => p !== null))
    return [
      beatLabel(step, words, { acts: false }),
      ...(picked as string[]),
      ...acts,
    ];
  const picks = step.picks.length ? `: picks ${step.picks.join(', ')}` : '';
  return [`${beatLabel(step, words, { acts: false })}${picks}`, ...acts];
}

/** A hold's line inside its box: the creature, and what its statement
 * connects other than the state (`gate-1: holds door gate-wall-door`), or
 * the kind's own word (`gate-1: blocking`). */
export function holdLabel(hold: MachineHold): string {
  const said = hold.statement.connects
    .filter((c) => c.kind !== STATE)
    .map((c) => `${c.role} ${c.kind} ${c.id}`);
  const word = hold.kind.slice(hold.kind.lastIndexOf('.') + 1);
  return `${hold.creature}: ${said.length ? said.join(', ') : word}`;
}
