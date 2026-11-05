import { useEffect, useState } from 'react';
import { parseDocument, stringify } from 'yaml';
import {
  POST_DIRECTIONS,
  stateEntries,
  validateStates,
  type CreatureState,
  type CreatureStates,
} from './creatureStates';
import {
  patchStateHolds,
  setStateBlocks,
  setStateHolds,
} from './statePostEdits';

interface StatesEditorProps {
  owner: string;
  value?: CreatureStates;
  inherited?: CreatureStates;
  onChange?: (next: CreatureStates | undefined) => void;
  /** The doors a post may name (`roomDoorIds`); offered, never enforced. */
  doors?: readonly string[];
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
  doors = [],
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
          {value !== undefined && (
            <PostFields
              owner={owner}
              states={value}
              doors={doors}
              onChange={onChange}
            />
          )}
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

/** A state's post as fields (rpg-project#836, #852, #857): whether the body
 * blocks, and the door it holds, from which cells, which way, and the fact
 * that lets a mover through. Each change is one applied edit; the recipe
 * YAML above shows the same words. */
function PostFields({
  owner,
  states,
  doors,
  onChange,
}: {
  owner: string;
  states: CreatureStates;
  doors: readonly string[];
  onChange: (next: CreatureStates) => void;
}) {
  const doorList = `post-doors-${owner}`;
  return (
    <fieldset className="wb-policy-block">
      <legend>Posts</legend>
      <p className="wb-help">
        A state may block the creature’s cell and hold a door’s opening: no
        stranger crosses it while he stands on one of the post’s cells. The
        server checks the door, the cells and the pass when you play.
      </p>
      <datalist id={doorList}>
        {doors.map((door) => (
          <option key={door} value={door} />
        ))}
      </datalist>
      {stateEntries(states).map(([name, state]) => (
        <StatePost
          key={name}
          owner={owner}
          name={name}
          state={state}
          doors={doors}
          doorList={doorList}
          onBlocks={(on) => onChange(setStateBlocks(states, name, on))}
          onHolds={(holds) => onChange(setStateHolds(states, name, holds))}
          onPatch={(patch) => onChange(patchStateHolds(states, name, patch))}
        />
      ))}
    </fieldset>
  );
}

function StatePost({
  owner,
  name,
  state,
  doors,
  doorList,
  onBlocks,
  onHolds,
  onPatch,
}: {
  owner: string;
  name: string;
  state: CreatureState;
  doors: readonly string[];
  doorList: string;
  onBlocks: (on: boolean) => void;
  onHolds: (holds: CreatureState['holds']) => void;
  onPatch: (patch: Partial<NonNullable<CreatureState['holds']>>) => void;
}) {
  const label = `${owner} ${name}`;
  if (state.terminal)
    return (
      <p className="wb-help">
        {name} is terminal: it ends the machine and holds no post.
      </p>
    );
  const holds = state.holds;
  const cells = holds?.at ?? [];
  return (
    <div className="wb-state-post" aria-label={`Post for ${label}`}>
      <h5>{name}</h5>
      <label>
        <input
          type="checkbox"
          aria-label={`Blocks in ${label}`}
          checked={state.blocks === true}
          onChange={(event) => onBlocks(event.target.checked)}
        />
        <span>Body blocks</span>
      </label>
      <label>
        <input
          type="checkbox"
          aria-label={`Holds a door in ${label}`}
          checked={holds !== undefined}
          onChange={(event) =>
            onHolds(
              event.target.checked ? { door: doors[0] ?? 'door' } : undefined
            )
          }
        />
        <span>Holds a door</span>
      </label>
      {holds && (
        <>
          <DoorField
            label={label}
            doorList={doorList}
            door={holds.door}
            onCommit={(door) => onPatch({ door })}
          />
          {holds.door && !doors.includes(holds.door) && (
            <p className="wb-help">
              This site declares no door with the id “{holds.door}”.
            </p>
          )}
          <label>
            <span>Holds against</span>
            <select
              aria-label={`Holds against in ${label}`}
              value={holds.against || 'both'}
              onChange={(event) =>
                onPatch({
                  against:
                    event.target.value === 'both' && holds.against !== 'both'
                      ? undefined
                      : (event.target
                          .value as (typeof POST_DIRECTIONS)[number]),
                })
              }
            >
              {POST_DIRECTIONS.map((word) => (
                <option key={word} value={word}>
                  {word === 'both'
                    ? 'both ways'
                    : word === 'entering'
                      ? 'entering (from the post’s side)'
                      : 'leaving (into the post’s side)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Pass fact</span>
            <input
              aria-label={`Pass fact in ${label}`}
              value={holds.pass ?? ''}
              placeholder="nobody passes"
              onChange={(event) =>
                onPatch({ pass: event.target.value || undefined })
              }
            />
          </label>
          <div aria-label={`Post cells in ${label}`}>
            <span>Post cells</span>
            {cells.length === 0 && (
              <p className="wb-help">None: he holds it from his placed cell.</p>
            )}
            {cells.map((cell, index) => (
              <div key={index} className="wb-actions">
                {(['q', 'r'] as const).map((axis) => (
                  <input
                    key={axis}
                    type="number"
                    step={1}
                    aria-label={`Post cell ${index + 1} ${axis} in ${label}`}
                    value={cell[axis]}
                    onChange={(event) => {
                      const n = Number(event.target.value);
                      if (event.target.value === '' || !Number.isSafeInteger(n))
                        return;
                      onPatch({
                        at: cells.map((c, i) =>
                          i === index ? { ...c, [axis]: n } : c
                        ),
                      });
                    }}
                  />
                ))}
                <button
                  type="button"
                  aria-label={`Remove post cell ${index + 1} in ${label}`}
                  onClick={() => {
                    const at = cells.filter((_, i) => i !== index);
                    onPatch({ at: at.length ? at : undefined });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              aria-label={`Add post cell in ${label}`}
              onClick={() =>
                onPatch({
                  at: [...cells, { ...(cells.at(-1) ?? { q: 0, r: 0 }) }],
                })
              }
            >
              Add cell
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The held door as text the author can empty and retype: a post names a
 * door, so an empty field is shown and says so, and only a named door is
 * applied. */
function DoorField({
  label,
  doorList,
  door,
  onCommit,
}: {
  label: string;
  doorList: string;
  door: string;
  onCommit: (door: string) => void;
}) {
  const [text, setText] = useState(door);
  useEffect(() => setText(door), [door]);
  return (
    <>
      <label>
        <span>Door</span>
        <input
          aria-label={`Held door in ${label}`}
          list={doorList}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (event.target.value) onCommit(event.target.value);
          }}
        />
      </label>
      {!text && (
        <p className="wb-help">A post names the door it holds: pick one.</p>
      )}
    </>
  );
}
