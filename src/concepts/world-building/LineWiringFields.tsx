/**
 * THE FORMS FOR A LINE'S WIRING (rpg-project#975 B): what it requires (a
 * list, every one of which must hold) and the conversation it advances.
 * A form, not a sentence: each label names the field; what the line does is
 * the engine's read-back. Conversations, their states and the beats their
 * recipes listen for are offered from the file (`SiteNamesContext`); a fact
 * and a holding are declared by mention, so each is typed, with the
 * holdings the file mentions offered. A requirement written in a key the
 * studio does not edit (the retired `recognized`) is shown as written and
 * kept; the engine's refusal names its new word.
 */
import { useContext, useId } from 'react';
import { RevealDiv } from '../encounter-studio/RevealDiv';
import type { OptionShape } from './answerTableShape';
import {
  advanceOf,
  choiceOf,
  REQUIREMENT_CHOICES,
  requirementFor,
  setRequirement,
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
  if ('holds' in read)
    return (
      <label>
        <span>Holding</span>
        <input
          aria-label={label('holding')}
          list={topicsId}
          placeholder="a holding"
          value={read.holds}
          onChange={(event) =>
            onChange(withRead(requirement, { holds: event.target.value }))
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
    (choice) => !isProp || !choice.value.endsWith('holds')
  );
  const rows: (OptionRequirement | undefined)[] =
    items.length === 0 ? [undefined] : items;
  return (
    <div
      className="wb-requirements"
      role="group"
      aria-label={`Line ${line} requirements for ${owner}`}
    >
      <span>Requires{items.length > 1 ? ' — every one must be true' : ''}</span>
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

/** A LINE ADVANCES A CONVERSATION: which one, and the beat a win steps it
 * on and the beat a miss does, offered from its recipe. A plain line (no
 * check) cannot be missed and is offered no miss; while only one beat is
 * set it cannot be cleared, since an advance steps on at least one. */
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
  const advance = advanceOf(option);
  const conversation = advance
    ? names.conversations.find((entry) => entry.id === advance.interaction)
    : undefined;
  const beats = conversation?.beats ?? [];
  const beatSelect = (verdict: 'success' | 'failure', words: string) => {
    const value = advance?.[verdict] ?? '';
    const other = verdict === 'success' ? advance?.failure : advance?.success;
    return (
      <label>
        <span>{words}</span>
        <select
          aria-label={`Line ${line} ${words.toLowerCase()} for ${owner}`}
          value={value}
          onChange={(event) =>
            onCommit(withAdvanceBeat(option, verdict, event.target.value))
          }
        >
          {(other !== undefined || value === '') && (
            <option value="">None</option>
          )}
          {value !== '' && !beats.includes(value) && (
            <option value={value}>{value}</option>
          )}
          {beats.map((beat) => (
            <option key={beat} value={beat}>
              {beat}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <RevealDiv
      path={at && advance ? `${at}.advance` : undefined}
      className="wb-advance"
    >
      <label>
        <span>Advances</span>
        <select
          aria-label={`Line ${line} advances conversation for ${owner}`}
          value={advance?.interaction ?? ''}
          onChange={(event) =>
            onCommit(withAdvanceConversation(option, event.target.value, names))
          }
        >
          <option value="">None</option>
          {advance && conversation === undefined && (
            <option value={advance.interaction}>{advance.interaction}</option>
          )}
          {names.conversations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id}
            </option>
          ))}
        </select>
      </label>
      {advance && beatSelect('success', 'On a win steps')}
      {advance &&
        (checked || advance.failure !== undefined) &&
        beatSelect('failure', 'On a miss steps')}
    </RevealDiv>
  );
}
