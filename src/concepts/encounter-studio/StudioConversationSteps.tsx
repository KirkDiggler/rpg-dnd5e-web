import { useEffect, useId, useRef, useState } from 'react';
import {
  NAME_RE,
  newNameRefusal,
  newStep,
  statesOf,
  stepOf,
  transitionsOf,
  withStateAdded,
  withStepOn,
  withStepReason,
  withStepTo,
  withTransitions,
  type Node,
} from './machineEdit';
import { RevealLi } from './RevealDiv';

/**
 * A conversation's states and steps (rpg-project#1040): each state in the
 * file's order, where the conversation starts and which state ends it, and
 * under each other state its steps, "On <step> → <state>", with why. A step
 * named here is offered to a line's "Moves the conversation". Every control
 * is one commit of the conversation's recipe; the rest of the recipe
 * (`ref`, `initial`, a state's `terminal`, anything unknown) rides along as
 * written. Renaming or removing a state, moving the start and ending a
 * conversation are not here.
 */

const mapping = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const STEP_REFUSAL = 'Letters, digits, - and _ only.';

/** Why `name` cannot be a step's name, or null when it can. */
const stepNameRefusal = (name: string): string | null =>
  name === '' ? 'Name the step.' : NAME_RE.test(name) ? null : STEP_REFUSAL;

/** The engine's refusals under one conversation's recipe. */
export interface RecipeRefusal {
  path: string;
  message: string;
}

/** The refusals of `path` beneath a state, split by where each belongs. */
function placeRefusals(id: string, refusals: readonly RecipeRefusal[]) {
  const base = `interactions.${id}.recipe`;
  const byState = new Map<string, RecipeRefusal[]>();
  const byStep = new Map<string, RecipeRefusal[]>();
  const rest: RecipeRefusal[] = [];
  const push = (
    map: Map<string, RecipeRefusal[]>,
    key: string,
    r: RecipeRefusal
  ) => map.set(key, [...(map.get(key) ?? []), r]);
  for (const refusal of refusals) {
    if (refusal.path !== base && !refusal.path.startsWith(`${base}.`)) continue;
    const step =
      /^[^.]+\.[^.]+\.recipe\.states\.([^.[\]]+)\.transitions\[(\d+)\]/.exec(
        refusal.path
      );
    const state = /^[^.]+\.[^.]+\.recipe\.states\.([^.[\]]+)/.exec(
      refusal.path
    );
    if (step) push(byStep, `${step[1]}#${step[2]}`, refusal);
    else if (state) push(byState, state[1]!, refusal);
    else rest.push(refusal);
  }
  return { byState, byStep, rest };
}

const Refused = ({ list }: { list: readonly RecipeRefusal[] | undefined }) =>
  list && list.length > 0 ? (
    <ul className="es-help es-warning" aria-label="The engine’s refusals here">
      {list.map((refusal, at) => (
        <li key={at} role="alert">
          {refusal.message}
        </li>
      ))}
    </ul>
  ) : null;

export function StudioConversationSteps({
  id,
  holder,
  commit,
  refusals = [],
}: {
  id: string;
  /** `{ recipe }` as the file writes it. */
  holder: Node;
  commit(edit: (holder: Node) => Node): boolean;
  refusals?: readonly RecipeRefusal[];
}): React.JSX.Element {
  const recipe = mapping(holder.recipe) ? holder.recipe : {};
  const states = statesOf(holder);
  const initial = typeof recipe.initial === 'string' ? recipe.initial : null;
  const stateNodes = mapping(recipe.states) ? recipe.states : {};
  const known: string[] = [];
  for (const state of states)
    for (const raw of transitionsOf(holder, state)) {
      const on = stepOf(raw).on;
      if (on && !known.includes(on)) known.push(on);
    }
  const listId = useId();
  const placed = placeRefusals(id, refusals);
  // A refusal the section draws no row or state for (a terminal state's
  // step, an index that is not there, a state not listed) is never dropped:
  // it is listed under the label.
  const rest = [...placed.rest];
  for (const [key, list] of placed.byStep) {
    const [state, index] = key.split('#') as [string, string];
    const node = stateNodes[state];
    const drawn =
      mapping(node) &&
      node.terminal !== true &&
      Number(index) < transitionsOf(holder, state).length;
    if (!drawn) rest.push(...list);
  }
  for (const [state, list] of placed.byState)
    if (!states.includes(state)) rest.push(...list);
  return (
    <section
      className="es-conversation-steps"
      aria-label={`States and steps of ${id}`}
    >
      <h4 className="es-section-label">States and steps</h4>
      <datalist id={listId}>
        {known.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Refused list={rest} />
      <ul className="es-conversation-states">
        {states.map((state) => {
          const node = stateNodes[state];
          const terminal = mapping(node) && node.terminal === true;
          return (
            <li
              key={state}
              className="es-conversation-state"
              data-state={state}
            >
              <div className="es-conversation-state-head">
                <strong>{state}</strong>
                {state === initial && (
                  <span className="es-help">the conversation starts here</span>
                )}
                {terminal && (
                  <span className="es-help">ends the conversation</span>
                )}
              </div>
              <Refused list={placed.byState.get(state)} />
              {!terminal && (
                <StateSteps
                  id={id}
                  state={state}
                  holder={holder}
                  states={states}
                  listId={listId}
                  commit={commit}
                  refusals={placed.byStep}
                />
              )}
            </li>
          );
        })}
      </ul>
      <AddState id={id} states={states} commit={commit} />
    </section>
  );
}

function StateSteps({
  id,
  state,
  holder,
  states,
  listId,
  commit,
  refusals,
}: {
  id: string;
  state: string;
  holder: Node;
  states: readonly string[];
  listId: string;
  commit(edit: (holder: Node) => Node): boolean;
  refusals: ReadonlyMap<string, readonly RecipeRefusal[]>;
}): React.JSX.Element {
  const steps = transitionsOf(holder, state);
  const [draft, setDraft] = useState(false);
  /** The index of the step just added: its name field takes the focus. */
  const [added, setAdded] = useState<number | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  /** One write: the step at `index` replaced by `next`, or removed. */
  const write = (index: number, next: ((step: unknown) => Node) | null) =>
    commit((current) => {
      const all = [...transitionsOf(current, state)];
      if (next === null) all.splice(index, 1);
      else all[index] = next(all[index]);
      return withTransitions(current, state, all);
    });
  return (
    <div className="es-conversation-steps-of" data-steps-of={state}>
      <ul className="es-conversation-step-list">
        {steps.map((raw, index) => {
          const step = stepOf(raw);
          const targets = states.includes(step.to ?? '')
            ? states
            : step.to !== null
              ? [step.to, ...states]
              : states;
          const label = `${id} ${state} step ${index + 1}`;
          return (
            <RevealLi
              key={index}
              className="es-conversation-step"
              path={`interactions.${id}.recipe.states.${state}.transitions[${index}]`}
            >
              <StepRow
                label={label}
                listId={listId}
                on={step.on}
                to={step.to ?? ''}
                reason={step.reason}
                targets={targets}
                focusOnMount={added === index}
                onOn={(on) => write(index, (s) => withStepOn(s, on))}
                onTo={(to) => write(index, (s) => withStepTo(s, to))}
                onReason={(reason) =>
                  write(index, (s) => withStepReason(s, reason))
                }
                onRemove={() => write(index, null)}
              />
              <Refused list={refusals.get(`${state}#${index}`)} />
            </RevealLi>
          );
        })}
        {draft && (
          <li className="es-conversation-step" data-draft="">
            <DraftRow
              label={`${id} ${state} new step`}
              listId={listId}
              targets={states}
              onAdd={(on, to, reason) => {
                const index = transitionsOf(holder, state).length;
                const done = commit((current) => {
                  let step: Node = newStep(on);
                  step = withStepTo(step, to);
                  step = withStepReason(step, reason);
                  return withTransitions(current, state, [
                    ...transitionsOf(current, state),
                    step,
                  ]);
                });
                if (done) {
                  setAdded(index);
                  setDraft(false);
                }
              }}
              onCancel={() => {
                setDraft(false);
                // After the draft row is gone.
                queueMicrotask(() => addButton.current?.focus());
              }}
            />
          </li>
        )}
      </ul>
      <button
        ref={addButton}
        type="button"
        className="es-link"
        aria-label={`Add a step to ${id} ${state}`}
        disabled={draft || states.length === 0}
        onClick={() => {
          setAdded(null);
          setDraft(true);
        }}
      >
        Add a step
      </button>
    </div>
  );
}

/** A new step, staged whole: nothing is written until Add. */
function DraftRow({
  label,
  listId,
  targets,
  onAdd,
  onCancel,
}: {
  label: string;
  listId: string;
  targets: readonly string[];
  onAdd(on: string, to: string, reason: string): void;
  onCancel(): void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [to, setTo] = useState(targets[0] ?? '');
  const [why, setWhy] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const next = name.trim();
  const refusal = next === '' ? null : stepNameRefusal(next);
  const ready = next !== '' && refusal === null;
  const add = () => {
    if (ready) onAdd(next, to, why);
  };
  return (
    <div
      className="es-conversation-step-row"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <label className="es-field">
        <span className="wb-option-label">On</span>
        <input
          ref={field}
          aria-label={`Step name for ${label}`}
          list={listId}
          value={name}
          aria-invalid={refusal !== null}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
      </label>
      <span aria-hidden="true">→</span>
      <label className="es-field">
        <span className="wb-option-label">goes to</span>
        <select
          aria-label={`Goes to for ${label}`}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        >
          {targets.map((target) => (
            <option key={target} value={target}>
              {target}
            </option>
          ))}
        </select>
      </label>
      <label className="es-field es-conversation-because">
        <span className="wb-option-label">Because</span>
        <input
          aria-label={`Because for ${label}`}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
      </label>
      <span className="es-conversation-step-buttons">
        <button
          type="button"
          aria-label={`Add step ${label}`}
          disabled={!ready}
          onClick={add}
        >
          Add
        </button>
        <button
          type="button"
          className="wb-danger"
          aria-label={`Cancel ${label}`}
          onClick={onCancel}
        >
          Cancel
        </button>
      </span>
      {refusal && (
        <p role="alert" className="es-warning es-conversation-step-refusal">
          {refusal}
        </p>
      )}
    </div>
  );
}

/** One existing row: `On [step] → goes to [state]  Because [reason]  Remove`.
 * The text fields are staged and apply on Enter or leaving; a name the
 * engine would not read is said on the row and nothing is written. */
function StepRow({
  label,
  listId,
  on,
  to,
  reason,
  targets,
  focusOnMount = false,
  onOn,
  onTo,
  onReason,
  onRemove,
}: {
  label: string;
  listId: string;
  on: string;
  to: string;
  reason: string;
  targets: readonly string[];
  focusOnMount?: boolean;
  onOn(on: string): boolean | void;
  onTo(to: string): boolean | void;
  onReason(reason: string): boolean | void;
  onRemove(): void;
}): React.JSX.Element {
  const [name, setName] = useState(on);
  const [seenOn, setSeenOn] = useState(on);
  const [why, setWhy] = useState(reason);
  const [seenWhy, setSeenWhy] = useState(reason);
  const [refusal, setRefusal] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnMount) field.current?.focus();
  }, [focusOnMount]);
  if (seenOn !== on) {
    // An undo or an import changed the file under the field.
    setSeenOn(on);
    setName(on);
    setRefusal(null);
  }
  if (seenWhy !== reason) {
    setSeenWhy(reason);
    setWhy(reason);
  }
  const applyName = () => {
    const next = name.trim();
    if (next === on) {
      setRefusal(null);
      return;
    }
    const refused = stepNameRefusal(next);
    setRefusal(refused);
    if (refused) return;
    onOn(next);
  };
  const applyWhy = () => {
    if (why !== reason) onReason(why);
  };
  return (
    <div className="es-conversation-step-row">
      <label className="es-field">
        <span className="wb-option-label">On</span>
        <input
          ref={field}
          aria-label={`Step name for ${label}`}
          list={listId}
          value={name}
          aria-invalid={refusal !== null}
          onChange={(event) => {
            setName(event.target.value);
            setRefusal(null);
          }}
          onBlur={applyName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyName();
          }}
        />
      </label>
      <span aria-hidden="true">→</span>
      <label className="es-field">
        <span className="wb-option-label">goes to</span>
        <select
          aria-label={`Goes to for ${label}`}
          value={to}
          onChange={(event) => onTo(event.target.value)}
        >
          {targets.map((target) => (
            <option key={target} value={target}>
              {target}
            </option>
          ))}
        </select>
      </label>
      <label className="es-field es-conversation-because">
        <span className="wb-option-label">Because</span>
        <input
          aria-label={`Because for ${label}`}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          onBlur={applyWhy}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyWhy();
          }}
        />
      </label>
      <span className="es-conversation-step-buttons">
        <button
          type="button"
          className="wb-danger"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </span>
      {refusal && (
        <p role="alert" className="es-warning es-conversation-step-refusal">
          {refusal}
        </p>
      )}
    </div>
  );
}

function AddState({
  id,
  states,
  commit,
}: {
  id: string;
  states: readonly string[];
  commit(edit: (holder: Node) => Node): boolean;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <form
      className="es-conversation-add-state"
      aria-label={`Add a state to ${id}`}
      onSubmit={(event) => {
        event.preventDefault();
        const next = name.trim();
        const refused = newNameRefusal(next, states, 'state');
        setRefusal(refused);
        if (refused) return;
        if (commit((current) => withStateAdded(current, next))) setName('');
      }}
    >
      <label className="es-field">
        <span className="wb-option-label">New state</span>
        <input
          aria-label={`New state name for ${id}`}
          value={name}
          aria-invalid={refusal !== null}
          onChange={(event) => {
            setName(event.target.value);
            setRefusal(null);
          }}
        />
      </label>
      <button type="submit" aria-label={`Add a state to ${id}`}>
        Add a state
      </button>
      {refusal && (
        <p role="alert" className="es-warning">
          {refusal}
        </p>
      )}
    </form>
  );
}
