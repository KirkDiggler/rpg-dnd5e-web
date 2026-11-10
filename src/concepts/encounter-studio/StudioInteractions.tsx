import { useState } from 'react';
import {
  approachRefusal,
  interactionApproach,
  interactionIds,
  SPEAK_REACH_CELLS,
} from '../world-building/interactionApproach';
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
    'document' | 'commitInteractionApproach'
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
