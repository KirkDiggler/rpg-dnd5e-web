/**
 * THE FORMS FOR A LINE'S WIRING (rpg-project#975 B): what it requires (a
 * list, every one of which must hold) and the conversation it advances.
 * A form, not a sentence: each label names the field; what the line does is
 * the engine's read-back. Conversations, their states and the beats their
 * recipes listen for are offered from the file (`SiteNamesContext`); a fact
 * and a topic are declared by mention, so each is typed, with the
 * topics the file mentions offered. A requirement written in a key the
 * studio does not edit (the retired `recognized` and `holds`) is shown as written and
 * kept; the engine's refusal names its new word.
 */
import { useContext, useId, useState } from 'react';
import { RevealDiv } from '../encounter-studio/RevealDiv';
import type { OptionShape } from './answerTableShape';
import {
  advanceOf,
  choiceOf,
  REQUIREMENT_CHOICES,
  requirementFor,
  setRequirement,
  withAdvance,
  withAdvanceBeat,
  withAdvanceConversation,
  withConversation,
  withRead,
  withState,
  type RequirementChoice,
} from './lineWiring';
import {
  isKnownRead,
  requirementPath,
  requirementsOf,
  requiresRead,
  writtenRead,
  type OptionRequirement,
  type OptionRequires,
} from './predicateNot';
import { SiteNamesContext } from './siteNames';
import { movesInWords, StepWordsContext } from './stepWordsContext';

/** One requirement's own fields, by its kind. */
function RequirementFields({
  requirement,
  of,
  holdable,
  onChange,
}: {
  requirement: OptionRequirement;
  /** "<n>[ k] for <owner>": the name every control carries. */
  of: { line: number; k: string; owner: string };
  holdable: readonly string[];
  onChange(next: OptionRequirement): void;
}): React.JSX.Element | null {
  const names = useContext(SiteNamesContext);
  const topicsId = useId();
  const factsId = useId();
  const read = requiresRead(requirement);
  const label = (what: string): string =>
    `Line ${of.line} requires ${what}${of.k} for ${of.owner}`;
  if ('fact' in read)
    return (
      <label>
        <span>Fact</span>
        <input
          aria-label={label('fact')}
          list={factsId}
          placeholder="a fact id"
          value={read.fact}
          onChange={(event) =>
            onChange(withRead(requirement, { fact: event.target.value }))
          }
        />
        <datalist id={factsId}>
          {names.facts.map((fact) => (
            <option key={fact} value={fact} />
          ))}
        </datalist>
      </label>
    );
  if (!isKnownRead(read))
    return (
      <span aria-label={label('as written')} className="wb-help">
        {writtenRead(read)} — kept as written
      </span>
    );
  if ('carries' in read)
    return (
      <label>
        <span>Carries</span>
        <select
          aria-label={label('prop')}
          value={read.carries}
          onChange={(event) =>
            onChange(withRead(requirement, { carries: event.target.value }))
          }
        >
          {!holdable.includes(read.carries) && (
            <option value={read.carries}>
              {read.carries || '(none)'} — nobody can pick it up
            </option>
          )}
          {holdable.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
    );
  if ('noted' in read)
    return (
      <label>
        <span>Topic</span>
        <input
          aria-label={label('topic')}
          list={topicsId}
          placeholder="a topic"
          value={read.noted}
          onChange={(event) =>
            onChange(withRead(requirement, { noted: event.target.value }))
          }
        />
        <datalist id={topicsId}>
          {names.topics.map((topic) => (
            <option key={topic} value={topic} />
          ))}
        </datalist>
      </label>
    );
  const { id, in: states } = read.interaction;
  const conversation = names.conversations.find((entry) => entry.id === id);
  const offered = [
    ...(conversation?.states ?? []),
    ...states.filter((state) => !conversation?.states.includes(state)),
  ];
  return (
    <>
      <label>
        <span>Conversation</span>
        <select
          aria-label={label('conversation')}
          value={id}
          onChange={(event) =>
            onChange(withConversation(requirement, event.target.value, names))
          }
        >
          {conversation === undefined && (
            <option value={id}>{id || '(choose a conversation)'}</option>
          )}
          {names.conversations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="wb-requirement-states">
        <legend>In</legend>
        {offered.map((state) => {
          const ticked = states.includes(state);
          return (
            <label key={state} className="wb-check">
              <input
                type="checkbox"
                aria-label={label(`${id} in ${state}`)}
                checked={ticked}
                // The last state ticked stays: a state list is never empty.
                disabled={ticked && states.length === 1}
                onChange={(event) =>
                  onChange(
                    withState(requirement, state, event.target.checked, names)
                  )
                }
              />
              <span>{state}</span>
            </label>
          );
        })}
      </fieldset>
    </>
  );
}

/** A LINE'S REQUIREMENTS: a list, every one of which must hold. With none,
 * one row reads "Always offered"; choosing a requirement there starts the
 * list, and "Add a requirement" grows it. */
export function RequiresFields({
  owner,
  line,
  at,
  requires,
  isProp,
  holdable,
  onCommit,
}: {
  owner: string;
  /** The line's number, from 1. */
  line: number;
  /** The line's path in the file, for each requirement's reveal. */
  at?: string;
  requires: OptionRequires | undefined;
  isProp: boolean;
  holdable: readonly string[];
  onCommit(requires: OptionRequires | undefined): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const items = requirementsOf(requires);
  const choices = REQUIREMENT_CHOICES.filter(
    (choice) => !isProp || !choice.value.endsWith('noted')
  );
  const rows: (OptionRequirement | undefined)[] =
    items.length === 0 ? [undefined] : items;
  return (
    <div
      className="wb-requirements"
      role="group"
      aria-label={`Line ${line} requirements for ${owner}`}
    >
      <span className="wb-option-label">
        Offered when{items.length > 1 ? ' — every one must be true' : ''}
      </span>
      <ol className="wb-requirement-list">
        {rows.map((requirement, index) => {
          const k = index === 0 ? '' : ` ${index + 1}`;
          const choice = requirement ? choiceOf(requirement) : '';
          const path =
            at && requires !== undefined && requirement
              ? `${at}.${requirementPath(requires, index)}`
              : undefined;
          return (
            <RevealDiv
              key={index}
              path={path}
              className="wb-requirement"
              role="listitem"
            >
              <label>
                <select
                  aria-label={`Line ${line} requires${k} for ${owner}`}
                  value={choice}
                  onChange={(event) => {
                    const value = event.target.value as RequirementChoice | '';
                    // A requirement kept as written is chosen away from,
                    // never re-chosen into.
                    if (
                      value !== '' &&
                      !REQUIREMENT_CHOICES.some((c) => c.value === value)
                    )
                      return;
                    onCommit(
                      setRequirement(
                        requires,
                        index,
                        value === ''
                          ? undefined
                          : requirementFor(value, requirement, holdable, names)
                      )
                    );
                  }}
                >
                  {items.length === 0 && (
                    <option value="">Always offered</option>
                  )}
                  {choices.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={
                        (option.value.endsWith('carries') &&
                          holdable.length === 0 &&
                          !choice.endsWith('carries')) ||
                        // A conversation requirement needs a conversation.
                        (option.value.endsWith('interaction') &&
                          names.conversations.length === 0 &&
                          !choice.endsWith('interaction'))
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                  {choice !== '' &&
                    !choices.some((option) => option.value === choice) && (
                      <option value={choice}>{choice}</option>
                    )}
                </select>
              </label>
              {requirement && (
                <RequirementFields
                  requirement={requirement}
                  of={{ line, k, owner }}
                  holdable={holdable}
                  onChange={(next) =>
                    onCommit(setRequirement(requires, index, next))
                  }
                />
              )}
              {requirement && (
                <button
                  type="button"
                  className="wb-danger"
                  aria-label={`Remove requirement${k} from line ${line} of ${owner}`}
                  onClick={() =>
                    onCommit(setRequirement(requires, index, undefined))
                  }
                >
                  Remove
                </button>
              )}
            </RevealDiv>
          );
        })}
      </ol>
      {items.length > 0 && (
        <button
          type="button"
          aria-label={`Add a requirement to line ${line} of ${owner}`}
          onClick={() =>
            onCommit(
              setRequirement(
                requires,
                items.length,
                requirementFor('fact', undefined, holdable, names)
              )
            )
          }
        >
          Add a requirement
        </button>
      )}
    </div>
  );
}

/** What the chosen step does, under its select, in full. */
function StepDoes({ id, words }: { id: string; words: string | undefined }) {
  return words === undefined ? null : (
    <span id={id} className="wb-help wb-step-does">
      {words}
    </span>
  );
}

/** A LINE ADVANCES A CONVERSATION: which one, and the beat a win steps it
 * on and the beat a miss does, offered from its recipe. A plain line (no
 * check) cannot be missed and is offered no miss; while only one beat is
 * set it cannot be cleared, since an advance steps on at least one.
 *
 * CHOOSING A CONVERSATION PICKS NO STEP (rpg-project#1033): a conversation
 * newly chosen is held here, unwritten, with its step select on "choose a
 * step…"; choosing the step writes both. Each step is offered with what it
 * does, from the engine's read-back (`StepWordsContext`): the states it
 * moves the conversation from and to. */
export function AdvanceFields({
  owner,
  line,
  at,
  option,
  checked,
  onCommit,
}: {
  owner: string;
  line: number;
  at?: string;
  option: OptionShape;
  /** Whether the line has a check, and so can be missed. */
  checked: boolean;
  onCommit(option: OptionShape): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const stepWords = useContext(StepWordsContext);
  const advance = advanceOf(option);
  const stepsId = useId();
  // A conversation chosen but not yet written: its step is still to choose.
  const [pending, setPending] = useState<string | null>(null);
  const chosen = pending ?? advance?.interaction;
  const conversation =
    chosen !== undefined
      ? names.conversations.find((entry) => entry.id === chosen)
      : undefined;
  const beats = conversation?.beats ?? [];
  const steps = chosen !== undefined ? stepWords.stepsOf(chosen) : undefined;
  /** What a beat does, in full: shown under its select, never cut short
   * inside an option. */
  const beatDoes = (beat: string): string | undefined => {
    const step = steps?.find((entry) => entry.beat === beat);
    return step && step.moves.length > 0 ? movesInWords(step) : undefined;
  };
  const beatTitle = (beat: string): string | undefined =>
    steps?.find((entry) => entry.beat === beat)?.sentences.join(' ');
  const beatOptions = (value: string) => (
    <>
      {value !== '' && !beats.includes(value) && (
        <option value={value}>{value}</option>
      )}
      {beats.map((beat) => (
        <option key={beat} value={beat} title={beatTitle(beat)}>
          {beat}
        </option>
      ))}
    </>
  );
  const beatSelect = (verdict: 'success' | 'failure', words: string) => {
    const value = advance?.[verdict] ?? '';
    const other = verdict === 'success' ? advance?.failure : advance?.success;
    const doesId = `${stepsId}-${verdict}`;
    const described = beatDoes(value) !== undefined;
    return (
      <label>
        <span>{words}</span>
        <select
          aria-label={`Line ${line} ${words.toLowerCase()} for ${owner}`}
          value={value}
          aria-describedby={described ? doesId : undefined}
          onChange={(event) =>
            onCommit(withAdvanceBeat(option, verdict, event.target.value))
          }
        >
          {(other !== undefined || value === '') && (
            <option value="">None</option>
          )}
          {beatOptions(value)}
        </select>
        <StepDoes id={doesId} words={beatDoes(value)} />
      </label>
    );
  };
  return (
    <RevealDiv
      path={at && advance ? `${at}.advance` : undefined}
      className="wb-advance"
    >
      <label>
        <span className="wb-option-label">Moves the conversation</span>
        <select
          aria-label={`Line ${line} advances conversation for ${owner}`}
          value={chosen ?? ''}
          onChange={(event) => {
            const id = event.target.value;
            if (id === '') {
              setPending(null);
              if (advance) onCommit(withAdvanceConversation(option, '', names));
              return;
            }
            setPending(id === advance?.interaction ? null : id);
          }}
        >
          <option value="">None</option>
          {chosen !== undefined && conversation === undefined && (
            <option value={chosen}>{chosen}</option>
          )}
          {names.conversations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id}
            </option>
          ))}
        </select>
      </label>
      {pending !== null ? (
        <label>
          <span>On a win steps</span>
          <select
            aria-label={`Line ${line} on a win steps for ${owner}`}
            value=""
            onChange={(event) => {
              if (event.target.value === '') return;
              onCommit(withAdvance(option, pending, event.target.value));
              setPending(null);
            }}
          >
            <option value="" disabled>
              choose a step…
            </option>
            {beatOptions('')}
          </select>
        </label>
      ) : (
        <>
          {advance && beatSelect('success', 'On a win steps')}
          {advance &&
            (checked || advance.failure !== undefined) &&
            beatSelect('failure', 'On a miss steps')}
        </>
      )}
    </RevealDiv>
  );
}
