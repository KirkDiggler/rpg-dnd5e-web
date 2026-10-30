import {
  ENDING_OUTCOMES,
  type EndingOutcome,
  type PredicateDoc,
  type PredicateForm,
} from '@/author/factionVocabulary';
import { useState } from 'react';
import { documentPlacementNames } from '../world-building/placementNames';
import { PredicateEditor } from '../world-building/PredicateEditor';
import { endingClause } from '../world-building/predicateSentence';
import {
  isLeaveEnding,
  validateSiteEndings,
  type SiteEnding,
} from '../world-building/siteScope';
import { AboutPanel } from './FieldHelp';
import type { EncounterStudioSession } from './studioSession';

/** An ending's forms: one key each, never `holds` (rpg-project#578, H4). */
const ENDING_FORMS: readonly PredicateForm[] = [
  'fact',
  'round',
  'down',
  'stance',
];

/** A leave ending's `if`: a state read when the party leaves
 * (`grammar.endingIf`), and `not` of one, which the editor offers after
 * these. */
const ENDING_IF_FORMS: readonly PredicateForm[] = ['down', 'fact', 'stance'];

interface Staged {
  /** The ending's index, or null for a new one. */
  index: number | null;
  id: string;
  when: PredicateDoc | undefined;
  /** A leave ending's `if` (rpg-project#716). */
  if?: PredicateDoc;
  outcome?: EndingOutcome;
}

/** The staged form of an authored ending. */
function stagedOf(index: number, ending: SiteEnding): Staged {
  return {
    index,
    id: ending.id,
    when: ending.when,
    if: ending.if,
    outcome: ending.outcome,
  };
}

/** The exit a leave names, and whether it is "any way out but" it. */
function leaveOf(
  when: PredicateDoc | undefined
): { exit: string; other: boolean } | undefined {
  if (when === undefined) return undefined;
  if ('left' in when) return { exit: when.left, other: false };
  if ('not' in when && 'left' in when.not)
    return { exit: when.not.left, other: true };
  return undefined;
}

function leaveWhen(exit: string, other: boolean): PredicateDoc {
  return other ? { not: { left: exit } } : { left: exit };
}

/** The Encounter home's Endings (rpg-project#578, H4): each ending as
 * "{id}: when {sentence}", in authored order. Any ending ends the run, so
 * "either" is two endings. Add and Edit are one staged form, applied once;
 * an ending with no `when` cannot be applied. */
export function StudioEndings({
  session,
  focus,
}: {
  session: EncounterStudioSession;
  /** An ending to open, from the fact index. */
  focus?: string | null;
}): React.JSX.Element {
  const document = session.document;
  const endings = document.scope.endings ?? [];
  const names = documentPlacementNames(document);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // A new focus from the fact index opens that ending; edits to the list
  // do not reopen it.
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  if (focus !== opened) {
    setOpened(focus);
    const index = endings.findIndex((ending) => ending.id === focus);
    if (focus && index >= 0) {
      setStaged(stagedOf(index, endings[index]!));
      setRefusal(null);
    }
  }
  const exits = (document.scope.exits ?? []).map((exit) => exit.id);
  const commit = (next: SiteEnding[]): boolean => {
    try {
      validateSiteEndings(next);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
      return false;
    }
    if (session.endings.set(next)) {
      setRefusal(null);
      return true;
    }
    setRefusal('The endings were refused; the notice says why.');
    return false;
  };
  const apply = (): void => {
    if (!staged || staged.when === undefined) return;
    // ONLY A LEAVE CARRIES AN `if`, and it always says what leaving means:
    // the form writes what the engine reads, and nothing it refuses.
    const leave = isLeaveEnding(staged.when);
    const ending: SiteEnding = { id: staged.id.trim(), when: staged.when };
    if (leave && staged.if !== undefined) ending.if = staged.if;
    if (staged.outcome !== undefined) ending.outcome = staged.outcome;
    else if (leave) ending.outcome = 'success';
    const next = [...endings];
    if (staged.index === null) next.push(ending);
    else next[staged.index] = ending;
    if (commit(next)) setStaged(null);
  };
  const move = (index: number, by: -1 | 1): void => {
    const next = [...endings];
    const [ending] = next.splice(index, 1);
    next.splice(index + by, 0, ending!);
    commit(next);
  };
  return (
    <section aria-label="Endings" className="es-social-panel es-endings">
      <h2>Endings</h2>
      <AboutPanel>
        <p>
          Any ending ends the run. An ending that should fire on either of two
          conditions is two endings. A fact here is known by anyone, not only a
          faction&apos;s mind.
        </p>
      </AboutPanel>
      {endings.length === 0 ? (
        <p className="es-help">No ending yet.</p>
      ) : (
        <ol className="es-inspector-list" aria-label="Authored endings">
          {endings.map((ending, index) => (
            <li key={`${index}:${ending.id}`} data-ending={ending.id}>
              <span>
                <strong>{ending.id}</strong>: when{' '}
                {endingClause(ending, { names })}
              </span>
              <span className="es-buttons">
                <button
                  type="button"
                  aria-label={`Edit ending ${ending.id}`}
                  onClick={() => {
                    setStaged(stagedOf(index, ending));
                    setRefusal(null);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Move ending ${ending.id} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  aria-label={`Move ending ${ending.id} down`}
                  disabled={index === endings.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  aria-label={`Remove ending ${ending.id}`}
                  onClick={() => {
                    if (staged?.index === index) setStaged(null);
                    commit(endings.filter((_, i) => i !== index));
                  }}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {staged ? (
        <form
          className="es-ending-form"
          aria-label={staged.index === null ? 'New ending' : 'Edit ending'}
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="es-field">
            <span>Ending id</span>
            <input
              aria-label="Ending id"
              value={staged.id}
              autoFocus
              onChange={(event) => {
                setStaged({ ...staged, id: event.target.value });
                setRefusal(null);
              }}
            />
          </label>
          {/* THE RUN ENDS AT THE DOOR (rpg-project#716): an ending fires on
              a condition, or when the last one standing walks out by a
              declared exit — and then says what leaving means. */}
          <label className="es-field">
            <span>Fires</span>
            <select
              aria-label="Ending fires"
              value={leaveOf(staged.when) ? 'left' : 'when'}
              onChange={(event) => {
                setRefusal(null);
                if (event.target.value === 'left')
                  setStaged({
                    ...staged,
                    when: leaveWhen(exits[0] ?? '', false),
                    outcome: staged.outcome ?? 'success',
                  });
                else setStaged({ ...staged, when: undefined, if: undefined });
              }}
            >
              <option value="when">when a condition holds</option>
              <option value="left">when the last one leaves by an exit</option>
            </select>
          </label>
          {leaveOf(staged.when) ? (
            <>
              <label className="es-field">
                <span>Exit</span>
                <select
                  aria-label="Ending exit"
                  value={leaveOf(staged.when)!.exit}
                  onChange={(event) => {
                    setStaged({
                      ...staged,
                      when: leaveWhen(
                        event.target.value,
                        leaveOf(staged.when)!.other
                      ),
                    });
                    setRefusal(null);
                  }}
                >
                  {exits.length === 0 && (
                    <option value="">(declare an exit first)</option>
                  )}
                  {exits.map((exit) => (
                    <option key={exit} value={exit}>
                      {exit}
                    </option>
                  ))}
                  {!exits.includes(leaveOf(staged.when)!.exit) &&
                    leaveOf(staged.when)!.exit !== '' && (
                      <option value={leaveOf(staged.when)!.exit}>
                        {leaveOf(staged.when)!.exit} (not declared here)
                      </option>
                    )}
                </select>
              </label>
              <label className="es-field">
                <input
                  type="checkbox"
                  aria-label="Ending by any other way out"
                  checked={leaveOf(staged.when)!.other}
                  onChange={(event) => {
                    setStaged({
                      ...staged,
                      when: leaveWhen(
                        leaveOf(staged.when)!.exit,
                        event.target.checked
                      ),
                    });
                    setRefusal(null);
                  }}
                />
                <span>by any way out but this one</span>
              </label>
              <div className="es-field">
                <PredicateEditor
                  value={staged.if}
                  onChange={(next) => {
                    setStaged({ ...staged, if: next });
                    setRefusal(null);
                  }}
                  forms={ENDING_IF_FORMS}
                  name="Ending if"
                  label="If"
                  none="(whatever else holds)"
                  scope={document.scope}
                  room={document.draft.room}
                  names={names}
                />
              </div>
            </>
          ) : (
            <div className="es-field">
              <PredicateEditor
                value={staged.when}
                onChange={(when) => {
                  setStaged({ ...staged, when });
                  setRefusal(null);
                }}
                forms={ENDING_FORMS}
                name="Ending when"
                label="When"
                scope={document.scope}
                room={document.draft.room}
                names={names}
              />
            </div>
          )}
          <label className="es-field">
            <span>Outcome</span>
            <select
              aria-label="Ending outcome"
              value={staged.outcome ?? ''}
              onChange={(event) => {
                setStaged({
                  ...staged,
                  outcome:
                    event.target.value === ''
                      ? undefined
                      : (event.target.value as EndingOutcome),
                });
                setRefusal(null);
              }}
            >
              {!leaveOf(staged.when) && <option value="">(not stated)</option>}
              {ENDING_OUTCOMES.map((word) => (
                <option key={word} value={word}>
                  {word}
                </option>
              ))}
            </select>
          </label>
          <p className="es-help">
            {staged.when === undefined
              ? 'Choose the condition that ends the run.'
              : `The run ends when ${endingClause(
                  {
                    id: staged.id,
                    when: staged.when,
                    ...(staged.if !== undefined && leaveOf(staged.when)
                      ? { if: staged.if }
                      : {}),
                    ...(staged.outcome !== undefined
                      ? { outcome: staged.outcome }
                      : {}),
                  },
                  { names }
                )}.`}
          </p>
          <div className="es-buttons">
            <button type="submit" disabled={staged.when === undefined}>
              Apply ending
            </button>
            <button
              type="button"
              onClick={() => {
                setStaged(null);
                setRefusal(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="es-buttons">
          <button
            type="button"
            onClick={() => {
              setStaged({ index: null, id: '', when: undefined });
              setRefusal(null);
            }}
          >
            Add ending
          </button>
        </div>
      )}
      {refusal && (
        <p role="alert" className="es-warning">
          {refusal}
        </p>
      )}
    </section>
  );
}
