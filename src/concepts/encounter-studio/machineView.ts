/**
 * A BEHAVIOUR'S MACHINE, AS THE ENGINE SAYS IT (rpg-project#995, the
 * studio half of rpg-project#993).
 *
 * The engine says a routine's shape as connections on the statements it
 * already makes (rpg-project#994). State ids are local to the routine; the
 * statement's subject scopes them.
 *
 * | statement                              | connection                     |
 * |----------------------------------------|--------------------------------|
 * | `routine`                              | `{state, <initial>, starts}`   |
 * | `routine.state`                        | `{state, S, is}`; `{state, S, final}` when terminal |
 * | `routine.wake`                         | `{state, S, from}`; `{state, Y, to}` only when it moves; `{beat, <on>, on}`; `{table, <key>, picks}` per pick |
 * | `routine.row`                          | `{table, <key>, row-of}`       |
 * | `creature.post`, `creature.blocking`   | `{state, S, while}` per state  |
 *
 * This module reads those connections, the statements' `kind`, and the
 * routine their path is set under, and nothing else: it never reads a sentence or the file to place
 * or connect anything. A read-back without the shape (an older engine), or
 * with a shape that does not hold together (a step from or to a state the
 * routine does not say), gives no machine at all: the studio draws nothing
 * rather than guess.
 */
import type {
  ReadBack,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';

const ROUTINE = 'routine';
const KIND_ROUTINE = 'routine';
const KIND_STATE = 'routine.state';
const KIND_WAKE = 'routine.wake';
const ROUTINE_KINDS = new Set([
  KIND_ROUTINE,
  KIND_STATE,
  KIND_WAKE,
  'routine.row',
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
   * `to` other than it. A fact of the drawn graph, apart from `final`. */
  noWayOut: boolean;
  /** Steps from this state that stay in it, in the engine's order. */
  stays: MachineStep[];
  holds: MachineHold[];
}

/** Steps that move, gathered: the same beat, the same guard reads and the
 * same target from one or more states. Drawn once. */
export interface MachineEdge {
  /** Stable within the machine: beat, target and guard reads. */
  id: string;
  from: string[];
  to: string;
  beat: string;
  wakesOn: { kind: string; id: string }[];
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
    });
  }
  for (const step of steps)
    if (step.to === null) states.get(step.from)!.stays.push(step);
    else states.get(step.from)!.noWayOut = false;

  // The creatures that run this routine, as their own `creature.routine`
  // statements say (`{routine, id, uses}`); each one's posts and blocking
  // hang on the states their `while` names.
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
  };
}

const wakesKey = (step: Pick<MachineStep, 'wakesOn'>): string =>
  step.wakesOn
    .map((w) => `${w.kind} ${w.id}`)
    .sort()
    .join(',');

/** Moving steps gathered by beat, target and guard reads, in the order
 * their first step is said. */
function edgesOf(steps: readonly MachineStep[]): MachineEdge[] {
  const edges = new Map<string, MachineEdge>();
  for (const step of steps) {
    if (step.to === null) continue;
    const id = `${step.beat}>${step.to}>${wakesKey(step)}`;
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
        steps: [step],
      });
  }
  return [...edges.values()];
}

/** A step's words for a label: the beat it fires on and what its guard
 * reads, from connection ids alone (`on fact: guards-turned`). */
export function beatLabel(step: Pick<MachineStep, 'beat' | 'wakesOn'>): string {
  const reads = step.wakesOn.map((w) => w.id).join(', ');
  return reads ? `on ${step.beat}: ${reads}` : `on ${step.beat}`;
}

/** A staying step's line inside its box: its beat and the tables it picks
 * from (`on time: picks post`). */
export function stayLabel(step: MachineStep): string {
  const picks = step.picks.length ? `: picks ${step.picks.join(', ')}` : '';
  return `${beatLabel(step)}${picks}`;
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
