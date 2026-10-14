import {
  type PredicateDoc,
  type PredicateForm,
} from '@/author/factionVocabulary';
import { useState } from 'react';
import { documentPlacementNames } from '../world-building/placementNames';
import { PredicateEditor } from '../world-building/PredicateEditor';
import { predicateSentence } from '../world-building/predicateSentence';
import {
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

interface Staged {
  /** The ending's index, or null for a new one. */
  index: number | null;
  id: string;
  when: PredicateDoc | undefined;
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
      setStaged({ index, id: endings[index]!.id, when: endings[index]!.when });
      setRefusal(null);
    }
  }
  const sentence = (when: PredicateDoc): string =>
    predicateSentence(when, { names });
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
    const ending = { id: staged.id.trim(), when: staged.when };
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
                <strong>{ending.id}</strong>: when {sentence(ending.when)}
              </span>
              <span className="es-buttons">
                <button
                  type="button"
                  aria-label={`Edit ending ${ending.id}`}
                  onClick={() => {
                    setStaged({ index, id: ending.id, when: ending.when });
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
          <p className="es-help">
            {staged.when === undefined
              ? 'Choose the condition that ends the run.'
              : `The run ends when ${sentence(staged.when)}.`}
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
