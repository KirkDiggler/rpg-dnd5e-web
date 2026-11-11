import { useState } from 'react';
import {
  approachRefusal,
  interactionApproach,
  interactionIds,
  SPEAK_REACH_CELLS,
} from '../world-building/interactionApproach';
import {
  ABOUT_PARTY_IN_SIGHT,
  grantedTopics,
  HOLDER_SPOKEN_TO,
  outcomesOf,
  recipeStates,
  recognizeOf,
  withEntryRemoved,
  withHeard,
  withRecognizeAdded,
  withTopic,
  type Outcomes,
} from '../world-building/interactionOutcomes';
import { AboutPanel } from './FieldHelp';
import type { EncounterStudioSession } from './studioSession';

/**
 * The Encounter home's Interactions (rpg-project#923): each root interaction
 * the site authors, and the one field the studio edits on it, the hail
 * distance. Its recipe and any other key ride along as written.
 */
export function StudioInteractions({
  session,
}: {
  session: Pick<
    EncounterStudioSession,
    'document' | 'commitInteractionApproach' | 'commitInteractionOutcomes'
  >;
}): React.JSX.Element {
  const ids = interactionIds(session.document.scope);
  return (
    <section
      aria-label="Interactions"
      className="es-social-panel es-interactions"
    >
      <h2>Interactions</h2>
      <AboutPanel>
        <p>
          A conversation a site remembers, shared by every creature whose lines
          name it. With a hail distance, a creature carrying it who sees a
          character come that close speaks first and opens the reply. Empty
          means it never hails. The distance is at most Speak reach,{' '}
          {SPEAK_REACH_CELLS} cells.
        </p>
        <p>
          What follows the interaction entering a state is authored here once,
          whichever line got it there. A recognition makes the creature the line
          was said to recognise the speaker’s party he sees, on a topic; a
          post’s pass or a line’s requirement can then ask for that topic.
        </p>
      </AboutPanel>
      {ids.length === 0 ? (
        <p className="es-help">None.</p>
      ) : (
        <ul className="es-inspector-list" aria-label="Authored interactions">
          {ids.map((id) => (
            <li key={id} data-interaction={id}>
              <strong>{id}</strong>
              <ApproachField
                id={id}
                authored={interactionApproach(session.document.scope, id)}
                commit={(within) =>
                  session.commitInteractionApproach(id, within)
                }
              />
              <OutcomesField
                id={id}
                outcomes={outcomesOf(session.document.scope, id)}
                states={recipeStates(session.document.scope, id)}
                topics={grantedTopics(session.document.scope)}
                commit={(outcomes) =>
                  session.commitInteractionOutcomes(id, outcomes)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function shown(authored: unknown): string {
  return authored === undefined ? '' : String(authored);
}

/**
 * One number field, staged as text so a half-typed value is not committed:
 * Enter or leaving the field applies it. Empty removes the distance; a
 * value outside 1 to Speak reach is refused here with the sentence the
 * edit itself throws, and nothing is written.
 */
function ApproachField({
  id,
  authored,
  commit,
}: {
  id: string;
  authored: unknown;
  commit: (within: number | null) => boolean;
}): React.JSX.Element {
  const [text, setText] = useState(shown(authored));
  const [refusal, setRefusal] = useState<string | null>(null);
  const [seen, setSeen] = useState(authored);
  if (!Object.is(seen, authored)) {
    // An undo or an import changed the file under the field.
    setSeen(authored);
    setText(shown(authored));
    setRefusal(null);
  }
  const apply = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (authored !== undefined) commit(null);
      setRefusal(null);
      return;
    }
    const within = Number(trimmed);
    const refused = approachRefusal(within);
    if (refused) {
      setRefusal(refused);
      return;
    }
    if (within !== authored) commit(within);
    setRefusal(null);
  };
  const label = `Hails within (cells) for ${id}`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label className="es-field">
        <span>Hails within N cells</span>
        <input
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={1}
          max={SPEAK_REACH_CELLS}
          step={1}
          placeholder="never hails"
          value={text}
          aria-invalid={refusal !== null}
          onChange={(event) => {
            setText(event.target.value);
            setRefusal(null);
          }}
          onBlur={apply}
        />
      </label>
      {refusal && (
        <p role="alert" className="es-warning">
          {refusal}
        </p>
      )}
    </form>
  );
}

/** The holder and subjects words in plain English. */
const HOLDER_WORDS: Record<string, string> = {
  [HOLDER_SPOKEN_TO]: 'the creature the line was said to',
};
const ABOUT_WORDS: Record<string, string> = {
  [ABOUT_PARTY_IN_SIGHT]: 'the speaker’s party he sees',
};

/**
 * One interaction's outcomes (rpg-project#928): for each state with any, its
 * recognitions in plain words, each with its topic to edit, whether the
 * witnessing carriers hear it, and a remove; and an add for a state the
 * recipe declares. The holder and subjects have one word each today, shown
 * and not offered. An entry this form cannot say (another kind, a word it
 * does not know) is shown as written and kept. Every change commits the
 * whole map, one undoable edit; the compiler judges it at Save & Play.
 */
function OutcomesField({
  id,
  outcomes,
  states,
  topics,
  commit,
}: {
  id: string;
  outcomes: Outcomes;
  states: readonly string[];
  topics: readonly string[];
  commit: (outcomes: Outcomes) => boolean;
}): React.JSX.Element {
  const [adding, setAdding] = useState(states[0] ?? '');
  const topicList = `outcome-topics-${id}`;
  const entered = Object.keys(outcomes);
  return (
    <div aria-label={`Outcomes for ${id}`} className="es-outcomes">
      <h3>When it enters a state</h3>
      <datalist id={topicList}>
        {topics.map((topic) => (
          <option key={topic} value={topic} />
        ))}
      </datalist>
      {entered.length === 0 && <p className="es-help">Nothing follows.</p>}
      {entered.map((state) => (
        <div key={state} aria-label={`Outcomes on entering ${state} in ${id}`}>
          <h4>Entering {state}</h4>
          <ul className="es-inspector-list">
            {outcomes[state].map((entry, index) => {
              const r = recognizeOf(entry);
              const label = `${id} ${state} ${index + 1}`;
              if (!r)
                return (
                  <li key={index}>
                    <pre aria-label={`Outcome as written ${label}`}>
                      {JSON.stringify(entry)}
                    </pre>
                    <p className="es-help">
                      This form does not edit it; it is kept as written.
                    </p>
                  </li>
                );
              return (
                <li key={index} aria-label={`Recognition ${label}`}>
                  <p>
                    {HOLDER_WORDS[r.holder] ?? r.holder} recognises{' '}
                    {ABOUT_WORDS[r.about] ?? r.about}
                    {r.heard
                      ? ', and every other carrier who saw it said does too.'
                      : '.'}
                  </p>
                  <label className="es-field">
                    <span>Topic</span>
                    <input
                      aria-label={`Recognition topic ${label}`}
                      list={topicList}
                      value={r.topic}
                      onChange={(event) =>
                        commit(
                          withTopic(outcomes, state, index, event.target.value)
                        )
                      }
                    />
                  </label>
                  <label className="es-field">
                    <input
                      type="checkbox"
                      aria-label={`Heard by the witnessing carriers ${label}`}
                      checked={r.heard}
                      onChange={(event) =>
                        commit(
                          withHeard(
                            outcomes,
                            state,
                            index,
                            event.target.checked
                          )
                        )
                      }
                    />
                    <span>The other carriers who saw it hear it</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove recognition ${label}`}
                    onClick={() =>
                      commit(withEntryRemoved(outcomes, state, index))
                    }
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {states.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            commit(
              withRecognizeAdded(outcomes, adding, topics[0] ?? 'admitted')
            );
          }}
        >
          <label className="es-field">
            <span>Add a recognition on entering</span>
            <select
              aria-label={`Add recognition state for ${id}`}
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
            >
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" aria-label={`Add recognition for ${id}`}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}
