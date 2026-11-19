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
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AnswerEntryShape } from '../world-building/answerTableShape';
import { isUseEntry } from '../world-building/answerTableShape';
import { STATE_BEATS } from '../world-building/creatureStates';
import { AnswerEntryRow, EntryList } from '../world-building/SitePolicies';
import {
  firstPickAt,
  machineStepKey,
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
  type StepRefusal,
} from './machineEdit';
import {
  BeatField,
  Refused,
  StepActs,
  StepConditions,
} from './MachineStepWords';
import { beatLabel, machineOf, stayLabel } from './machineView';
import type { MachineWords } from './machineWords';
import type { RefusalTarget } from './refusalJump';
import { RevealLi } from './RevealDiv';
import { stepChoicesOf } from './stepWords';

/** The studio root's class: its control and font styles are scoped under
 * it, so the pop-up is rendered inside it (encounterStudio.css). */
export const STUDIO_ROOT = 'encounter-studio';
/** The panel class whose label and input styles a pane's controls wear
 * (worldBuilding.css `.wb-panel …`). */
const PANEL = 'wb-panel';
/** One edit of a behaviour definition, run on the document's own copy. */
export type DefinitionEdit = (definition: Node) => Node;
const STAYS = '';
const stepNode = (step: unknown): Node =>
  step !== null && typeof step === 'object' && !Array.isArray(step)
    ? (step as Node)
    : {};
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
  words = null,
  refusals = [],
}: {
  routine: string;
  state: string;
  definition: Node;
  readBack: ReadBack | null;
  readBackIsCurrent: boolean;
  /** Commit one edit of the definition. The edit runs inside the commit,
   * on the document as it is then, so a helper's refusal (a state no longer
   * declared, a name taken) is the session's rejected edit, said where any
   * rejected edit is. */
  onCommit(edit: DefinitionEdit): boolean;
  onJump?(target: RefusalTarget): void;
  /** The engine's machine words (`useMachineWords`): with them the step's
   * beat, condition and acts are offered and written from the table
   * (rpg-project#1018); without them the editor is as before. */
  words?: MachineWords | null;
  /** The engine's refusals of this state's steps (rpg-project#1018): each
   * is shown on its step's row, on the condition or act it names where
   * the row shows one. */
  refusals?: readonly StepRefusal[];
}): React.JSX.Element {
  const choices = words ? stepChoicesOf(definition, readBack, routine) : null;
  // The drawn machine, for each card's one-line summary; only while the
  // read-back is this draft's, so a step's index still names it.
  const view = useMemo(
    () => (readBack && readBackIsCurrent ? machineOf(readBack, routine) : null),
    [readBack, readBackIsCurrent, routine]
  );
  const steps = transitionsOf(definition, state);
  const states = statesOf(definition);
  const lists = tableKeysOf(definition);
  const [listOpen, setListOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const setSteps = (edit: (steps: unknown[]) => unknown[]): boolean =>
    onCommit((d) => withTransitions(d, state, edit(transitionsOf(d, state))));
  const setStep = (index: number, step: unknown): boolean =>
    setSteps((all) => all.map((s, i) => (i === index ? step : s)));
  return (
    <div ref={root} className="es-machine-edit" data-state={state}>
      <h3>Steps in {state}</h3>
      {steps.length === 0 && (
        <p className="es-help">No steps yet: it stays in {state}.</p>
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
          const refusedHere = refusals.filter((r) => r.index === index);
          // Its one line in the engine's words, as its arrow or box line
          // says it, so the card is found from the drawing.
          const drawn = view?.steps.find(
            (st) => st.statement.path === transitionPath(routine, state, index)
          );
          const summary = drawn
            ? drawn.to !== null
              ? `${beatLabel(drawn, words)} → ${drawn.to}`
              : stayLabel(drawn, words)
            : null;
          // A refusal the row shows no part for (the step itself, its beat,
          // its target, its pick; or any, without words) is said on the row.
          const pickAt = firstPickAt(
            Array.isArray(stepNode(raw).do)
              ? (stepNode(raw).do as unknown[])
              : []
          );
          const stepLevel = refusedHere.filter((r) => {
            if (!words) return true;
            if (r.rest === '.when' || r.rest.startsWith('.when.')) return false;
            const act = /^\.do\[(\d+)\]/.exec(r.rest);
            return !act || Number(act[1]) === pickAt;
          });
          return (
            <RevealLi
              key={index}
              revealKey={machineStepKey(routine, state, index)}
              className="es-machine-step"
              data-step={index}
              data-refused={refusedHere.length ? '' : undefined}
            >
              <div className="es-machine-step-head">
                <span className="es-machine-step-name">Step {index + 1}</span>
                {summary && (
                  <span className="es-machine-step-summary" data-summary="">
                    {summary}
                  </span>
                )}
                <button
                  type="button"
                  className="wb-danger"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setSteps((all) => all.filter((_, i) => i !== index))
                  }
                >
                  Remove step
                </button>
              </div>
              {words && choices ? (
                <BeatField
                  words={words}
                  on={step.on}
                  name={name}
                  choices={choices}
                  onChange={(on) => setStep(index, withStepOn(raw, on))}
                />
              ) : (
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
              )}
              <label>
                <span>Then</span>
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
                  {/* Staying is not a state: it is named for the marked
                      state and set apart from the states it may go to. */}
                  <option value={STAYS}>stays in {state}</option>
                  <optgroup label="Goes to another state">
                    {targets.map((target) => (
                      <option key={target} value={target}>
                        {target}
                      </option>
                    ))}
                  </optgroup>
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
              {words && choices && (
                <span className="es-machine-adds">
                  <StepConditions
                    show="add"
                    words={words}
                    step={stepNode(raw)}
                    beat={step.on}
                    name={name}
                    sentence={sentence}
                    choices={choices}
                    onStep={(next) => setStep(index, next)}
                  />
                  <StepActs
                    show="add"
                    words={words}
                    step={stepNode(raw)}
                    beat={step.on}
                    name={name}
                    choices={choices}
                    onStep={(next) => setStep(index, next)}
                  />
                </span>
              )}
              {words && choices ? (
                <>
                  <StepConditions
                    show="rows"
                    words={words}
                    step={stepNode(raw)}
                    beat={step.on}
                    name={name}
                    sentence={sentence}
                    choices={choices}
                    refusals={refusedHere}
                    onStep={(next) => setStep(index, next)}
                  />
                  <StepActs
                    show="rows"
                    words={words}
                    step={stepNode(raw)}
                    beat={step.on}
                    name={name}
                    choices={choices}
                    refusals={refusedHere}
                    onStep={(next) => setStep(index, next)}
                  />
                </>
              ) : (
                kept && (
                  <p className="es-help es-machine-kept" data-kept="">
                    Kept as written: {step.guarded ? 'its condition' : ''}
                    {step.guarded && step.otherActs > 0 ? ' and ' : ''}
                    {step.otherActs > 0 ? 'its other acts' : ''}.{' '}
                    {sentence ?? 'The engine says it once the file is checked.'}
                  </p>
                )
              )}
              <Refused list={stepLevel} />
            </RevealLi>
          );
        })}
      </ol>
      <div className="es-machine-actions">
        <button
          type="button"
          className="es-machine-add-step"
          onClick={() =>
            setSteps((all) => [
              ...all,
              newStep(words?.beats[0]?.word ?? STATE_BEATS[0]),
            ])
          }
        >
          Add a step
        </button>
        <NewName
          what="state"
          taken={states}
          onAdd={(name) => onCommit((d) => withStateAdded(d, name))}
        />
      </div>
      {listOpen !== null && (
        <ListDialog
          routine={routine}
          listKey={listOpen}
          definition={definition}
          onCommit={onCommit}
          onChoose={setListOpen}
          onClose={() => setListOpen(null)}
          onJump={onJump}
          host={root.current?.closest(`.${STUDIO_ROOT}`) ?? null}
        />
      )}
      <div className="es-machine-lists">
        <button type="button" onClick={() => setListOpen('')}>
          Make a list
        </button>
      </div>
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
  host,
}: {
  routine: string;
  /** The list shown; empty when there is none yet to show. */
  listKey: string;
  definition: Node;
  onCommit(edit: DefinitionEdit): boolean;
  onChoose(key: string): void;
  onClose(): void;
  onJump?(target: RefusalTarget): void;
  /** The studio root to render into, or null to render in place. */
  host: Element | null;
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
    onCommit((d) => withTableRows(d, listKey, next));
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
  // Rendered as a child of the studio root (`.encounter-studio`), so the
  // backdrop covers the whole studio above every pane while the studio's
  // tokens, font and control styles (`.encounter-studio button, input…`)
  // still apply; its body and footer are panels (`.wb-panel`), as the pane
  // it opens from is, for the panel's label and input styles.
  const dialog = (
    <div className="es-dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="es-dialog"
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
          <div className={`es-dialog-body ${PANEL}`}>
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
              className="es-dialog-add-row"
              aria-label={`Add a row to ${listKey}`}
              onClick={() => commitRows([...rows, { ...NEW_ROW }])}
            >
              Add row
            </button>
          </div>
        )}
        <footer className={`es-dialog-footer ${PANEL}`}>
          <NewName
            what="list"
            taken={tableKeysOf(definition)}
            onAdd={(name) => {
              const ok = onCommit((d) => withListAdded(d, name));
              if (ok) onChoose(name);
              return ok;
            }}
          />
        </footer>
      </div>
    </div>
  );
  return host ? createPortal(dialog, host) : dialog;
}
