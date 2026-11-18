/**
 * SET A MACHINE (rpg-project#996): the Edit tab of a marked state's box.
 *
 * It lists the state's steps in file order, one row each: what fires it
 * (`on`), where it goes (`to`, or stays), the list it does one of (`pick`),
 * its reason, Remove. "Add a step" appends one; "Add a state" makes a new
 * box. "List" opens a pop-up with the list's rows, edited with the Bundles
 * page's row editor, where a new list can be made too.
 *
 * A step's `when` and its other acts are kept as written and said as the
 * engine says the step (its read-back sentence, found by the step's path);
 * this slice edits no condition. A step the drawing gathers across several
 * states is one row in each state's own list, edited here only. Every
 * change is the whole definition set as one undoable commit
 * (`commitBehaviorDefinition`); the engine checks it at once and its
 * refusals show where they show today.
 */
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useId, useRef, useState } from 'react';
import type { AnswerEntryShape } from '../world-building/answerTableShape';
import { isUseEntry } from '../world-building/answerTableShape';
import { STATE_BEATS } from '../world-building/creatureStates';
import { AnswerEntryRow, EntryList } from '../world-building/SitePolicies';
import {
  newNameRefusal,
  newStep,
  statesOf,
  stepOf,
  tableKeysOf,
  tableRowsOf,
  transitionPath,
  transitionsOf,
  withListAdded,
  withStateAdded,
  withStepOn,
  withStepPick,
  withStepReason,
  withStepTo,
  withTableRows,
  withTransitions,
  type Node,
} from './machineEdit';
import type { RefusalTarget } from './refusalJump';

const STAYS = '';
const NONE = '';
/** A new row, as the Bundles page makes one. */
const NEW_ROW: AnswerEntryShape = { when: { enemy: 'none' }, hold: {} };

/** The engine's sentence for the statement at `path`, or undefined. */
function sentenceAt(said: ReadBack | null, path: string): string | undefined {
  if (!said) return undefined;
  for (const section of said.sections)
    for (const group of section.groups)
      for (const statement of group.statements)
        if (statement.path === path) return statement.sentence;
  return undefined;
}

export function MachineStateEdit({
  routine,
  state,
  definition,
  readBack,
  readBackIsCurrent,
  onCommit,
  onJump,
}: {
  routine: string;
  state: string;
  definition: Node;
  readBack: ReadBack | null;
  readBackIsCurrent: boolean;
  onCommit(definition: Node): boolean;
  onJump?(target: RefusalTarget): void;
}): React.JSX.Element {
  const steps = transitionsOf(definition, state);
  const states = statesOf(definition);
  const lists = tableKeysOf(definition);
  const [listOpen, setListOpen] = useState<string | null>(null);
  const setSteps = (next: unknown[]): boolean =>
    onCommit(withTransitions(definition, state, next));
  const setStep = (index: number, step: unknown): boolean =>
    setSteps(steps.map((s, i) => (i === index ? step : s)));
  return (
    <div className="es-machine-edit" data-state={state}>
      <h3>Steps in {state}</h3>
      {steps.length === 0 && (
        <p className="es-help">No steps yet: it stays here.</p>
      )}
      <ol className="es-machine-steps" aria-label={`Steps in ${state}`}>
        {steps.map((raw, index) => {
          const step = stepOf(raw);
          const name = `${state} step ${index + 1}`;
          const beats: string[] = [...STATE_BEATS];
          if (step.on && !beats.includes(step.on)) beats.unshift(step.on);
          const targets = [...states];
          if (step.to !== null && !targets.includes(step.to))
            targets.unshift(step.to);
          const picks = [...lists];
          if (step.pick !== null && !picks.includes(step.pick))
            picks.unshift(step.pick);
          const kept = step.guarded || step.otherActs > 0;
          const sentence = readBackIsCurrent
            ? sentenceAt(readBack, transitionPath(routine, state, index))
            : undefined;
          return (
            <li key={index} className="es-machine-step" data-step={index}>
              <label>
                <span>On</span>
                <select
                  aria-label={`What fires ${name}`}
                  value={step.on}
                  onChange={(e) =>
                    setStep(index, withStepOn(raw, e.target.value))
                  }
                >
                  {step.on === '' && <option value="">(none)</option>}
                  {beats.map((beat) => (
                    <option key={beat} value={beat}>
                      {beat}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Goes to</span>
                <select
                  aria-label={`Where ${name} goes`}
                  value={step.to ?? STAYS}
                  onChange={(e) =>
                    setStep(
                      index,
                      withStepTo(
                        raw,
                        e.target.value === STAYS ? null : e.target.value
                      )
                    )
                  }
                >
                  <option value={STAYS}>stays here</option>
                  {targets.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Does one of</span>
                <select
                  aria-label={`The list ${name} does one of`}
                  value={step.pick ?? NONE}
                  onChange={(e) =>
                    setStep(
                      index,
                      withStepPick(
                        raw,
                        e.target.value === NONE ? null : e.target.value
                      )
                    )
                  }
                >
                  <option value={NONE}>none</option>
                  {picks.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label={`Open the list of ${name}`}
                disabled={step.pick === null}
                onClick={() => setListOpen(step.pick)}
              >
                List
              </button>
              <ReasonField
                key={`${index}:${step.reason}`}
                label={`The reason for ${name}`}
                reason={step.reason}
                onCommit={(reason) =>
                  reason !== step.reason &&
                  setStep(index, withStepReason(raw, reason))
                }
              />
              <button
                type="button"
                className="wb-danger"
                aria-label={`Remove ${name}`}
                onClick={() => setSteps(steps.filter((_, i) => i !== index))}
              >
                Remove
              </button>
              {kept && (
                <p className="es-help es-machine-kept" data-kept="">
                  Kept as written: {step.guarded ? 'its condition' : ''}
                  {step.guarded && step.otherActs > 0 ? ' and ' : ''}
                  {step.otherActs > 0 ? 'its other acts' : ''}.{' '}
                  {sentence ?? 'The engine says it once the file is checked.'}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => setSteps([...steps, newStep(STATE_BEATS[0])])}
      >
        Add a step
      </button>
      <NewName
        what="state"
        taken={states}
        onAdd={(name) => onCommit(withStateAdded(definition, name))}
      />
      {listOpen !== null && (
        <ListDialog
          routine={routine}
          listKey={listOpen}
          definition={definition}
          onCommit={onCommit}
          onChoose={setListOpen}
          onClose={() => setListOpen(null)}
          onJump={onJump}
        />
      )}
      <p className="es-help">
        Make a new list with <strong>List</strong> on any step that does one.
        {lists.length === 0 && ' '}
        {lists.length === 0 && (
          <button type="button" onClick={() => setListOpen('')}>
            Make a list
          </button>
        )}
      </p>
    </div>
  );
}

/** A step's reason, committed on blur or Enter. */
function ReasonField({
  label,
  reason,
  onCommit,
}: {
  label: string;
  reason: string;
  onCommit(reason: string): void;
}) {
  const [text, setText] = useState(reason);
  return (
    <label>
      <span>Reason</span>
      <input
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(text.trim());
        }}
      />
    </label>
  );
}

/** A name field and an Add button for a new state or list. */
function NewName({
  what,
  taken,
  onAdd,
}: {
  what: 'state' | 'list';
  taken: readonly string[];
  onAdd(name: string): boolean;
}) {
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const refusal = newNameRefusal(name.trim(), taken, what);
  const id = useId();
  return (
    <div className="es-machine-new" data-new={what}>
      <label htmlFor={id}>New {what}</label>
      <input
        id={id}
        aria-label={`New ${what} name`}
        aria-invalid={tried && refusal !== null}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          setTried(true);
          if (refusal === null && onAdd(name.trim())) {
            setName('');
            setTried(false);
          }
        }}
      >
        Add a {what}
      </button>
      {tried && refusal && (
        <p className="es-help" role="alert">
          {refusal}
        </p>
      )}
    </div>
  );
}

/** The pop-up of one list's rows (rpg-project#996). Focus stays inside;
 * Escape closes it and focus returns where it was. */
function ListDialog({
  routine,
  listKey,
  definition,
  onCommit,
  onChoose,
  onClose,
  onJump,
}: {
  routine: string;
  /** The list shown; empty when there is none yet to show. */
  listKey: string;
  definition: Node;
  onCommit(definition: Node): boolean;
  onChoose(key: string): void;
  onClose(): void;
  onJump?(target: RefusalTarget): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => before?.focus?.();
  }, []);
  const rows = tableRowsOf(definition, listKey) as AnswerEntryShape[];
  const commitRows = (next: unknown[]) =>
    onCommit(withTableRows(definition, listKey, next));
  const move = (index: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row!);
    commitRows(next);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const focusable = Array.from(
      ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="es-dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="es-dialog wb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="es-dialog-header">
          <h3 id={titleId}>{listKey === '' ? 'A new list' : listKey}</h3>
          <button type="button" aria-label="Close the list" onClick={onClose}>
            Close
          </button>
        </header>
        {listKey !== '' && (
          <>
            {rows.length === 0 && (
              <p className="es-help">No items yet. Add one.</p>
            )}
            <EntryList rows={rows}>
              {(row, index, key) => (
                <AnswerEntryRow
                  key={key}
                  trigger="time"
                  label={`${listKey} row ${index + 1}`}
                  at={[
                    `behaviorDefinitions.${routine}.table.${listKey}[${index}]`,
                  ]}
                  entry={row}
                  collapsed
                  onCommit={(next) =>
                    commitRows(rows.map((r, i) => (i === index ? next : r)))
                  }
                  onRemove={() =>
                    commitRows(rows.filter((_, i) => i !== index))
                  }
                  controls={
                    <>
                      {isUseEntry(row) && (
                        <span className="es-help" data-shared="">
                          shared bundle{' '}
                          {onJump && (
                            <button
                              type="button"
                              className="es-link"
                              aria-label={`Open bundle ${row.use} in Bundles`}
                              onClick={() =>
                                onJump({
                                  kind: 'home',
                                  section: 'bundles',
                                  id: row.use,
                                })
                              }
                            >
                              Open in Bundles
                            </button>
                          )}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Move ${listKey} row ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${listKey} row ${index + 1} down`}
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                    </>
                  }
                />
              )}
            </EntryList>
            <button
              type="button"
              aria-label={`Add a row to ${listKey}`}
              onClick={() => commitRows([...rows, { ...NEW_ROW }])}
            >
              Add row
            </button>
          </>
        )}
        <NewName
          what="list"
          taken={tableKeysOf(definition)}
          onAdd={(name) => {
            const ok = onCommit(withListAdded(definition, name));
            if (ok) onChoose(name);
            return ok;
          }}
        />
      </div>
    </div>
  );
}
