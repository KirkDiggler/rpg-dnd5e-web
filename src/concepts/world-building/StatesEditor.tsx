import { useState } from 'react';
import { parseDocument, stringify } from 'yaml';
import { validateStates, type CreatureStates } from './creatureStates';

interface StatesEditorProps {
  owner: string;
  value?: CreatureStates;
  inherited?: CreatureStates;
  onChange?: (next: CreatureStates | undefined) => void;
}

/** The canonical YAML recipe, applied as one undoable edit. In-progress text
 * is local; changing the selected owner or undoing an applied edit remounts
 * the draft from the actual document, never from stale textarea state. */
export function StatesEditor(props: StatesEditorProps) {
  const source = props.value === undefined ? '' : stringify(props.value);
  return (
    <RecipeDraft key={`${props.owner}:${source}`} {...props} source={source} />
  );
}

function RecipeDraft({
  owner,
  value,
  inherited,
  onChange,
  source,
}: StatesEditorProps & { source: string }) {
  const [text, setText] = useState(source);
  const [refusal, setRefusal] = useState('');
  function apply() {
    try {
      const document = parseDocument(text);
      if (document.errors.length) throw document.errors[0];
      const next = validateStates(document.toJS(), `${owner}.states`);
      onChange?.(next);
      setRefusal('');
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <fieldset className="wb-policy-block">
      <legend>States</legend>
      <p className="wb-help">
        A recipe says what wakes this creature and which table key it picks. Its
        own recipe replaces the faction’s whole recipe.
      </p>
      {value === undefined && (
        <p className="wb-help">
          {inherited
            ? 'Inherits its faction’s states.'
            : 'No authored recipe: the default picks time each round.'}
        </p>
      )}
      {value === undefined && inherited && (
        <pre aria-label={`Inherited states for ${owner}`}>
          {stringify(inherited)}
        </pre>
      )}
      {onChange ? (
        <>
          <label>
            <span>Recipe YAML</span>
            <textarea
              aria-label={`States YAML for ${owner}`}
              rows={12}
              spellCheck={false}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                'initial: asleep\nasleep:\n  transitions:\n    - { on: heard, within: 2, to: awake }\nawake:\n  transitions:\n    - { on: time, do: [{ pick: time }] }'
              }
            />
          </label>
          <details>
            <summary>Recipe words</summary>
            <p>
              Write initial and each named state. A state has transitions in
              priority order, or terminal: true. Each transition has on and may
              have when, within, regions, rounds, to, do and reason.
            </p>
            <p>
              Listen for time, heard, deed (or deed:attacked), seen, fact, or
              clock:world / clock:fight / clock:bell:alarm. within and regions
              scope heard, deed and seen. rounds counts from an anchor.
            </p>
            <p>
              when reads enemy (seen, remembered, none), fact, or not around one
              condition. do lists acts: {'{ pick: time }'}, {'{ wake_in: 3 }'},{' '}
              {'{ anchor: true }'}. A pick can name your own table key, such as
              march. Use the Tables section to author its rows.
            </p>
          </details>
          {refusal && <p role="alert">{refusal}</p>}
          <div className="wb-actions">
            <button
              type="button"
              aria-label={`Apply states for ${owner}`}
              disabled={text === source}
              onClick={apply}
            >
              Apply states
            </button>
            <button
              type="button"
              aria-label={`Cancel states for ${owner}`}
              disabled={text === source && !refusal}
              onClick={() => {
                setText(source);
                setRefusal('');
              }}
            >
              Cancel states
            </button>
            {value !== undefined && (
              <button
                type="button"
                aria-label={`Use inherited states for ${owner}`}
                onClick={() => onChange(undefined)}
              >
                Use inherited / default states
              </button>
            )}
          </div>
        </>
      ) : (
        value && <pre aria-label={`States for ${owner}`}>{source}</pre>
      )}
    </fieldset>
  );
}
