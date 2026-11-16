import { useContext, useState } from 'react';
import {
  approachRefusal,
  interactionApproach,
  interactionIds,
  SPEAK_REACH_CELLS,
} from '../world-building/interactionApproach';
import {
  ABOUT_PARTY_IN_SIGHT,
  arrestOf,
  arrests,
  HEARD_BY_WITNESSES,
  jailOf,
  newOutcome,
  OUTCOME_KINDS,
  outcomeKindOf,
  outcomesOf,
  recipeStates,
  recognizeOf,
  withAbout,
  withArrestCell,
  withArrestCells,
  withArrestRegion,
  withEntry,
  withEntryRemoved,
  withHeard,
  withJail,
  withOutcomeAdded,
  withTopic,
  type OutcomeKind,
  type Outcomes,
} from '../world-building/interactionOutcomes';
import { fromRows, rowCellCount } from '../world-building/regionRuns';
import type { RoomCellRow, RoomHexCell } from '../world-building/roomDraft';
import { useRoutePicking } from '../world-building/routePicking';
import {
  RecognitionFields,
  RegionField,
  RoundsField,
  WordsField,
} from '../world-building/RowGrantFields';
import { SiteNamesContext } from '../world-building/siteNames';
import { AboutPanel } from './FieldHelp';
import { RevealLi } from './RevealDiv';
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
      aria-label="Conversations"
      className="es-social-panel es-interactions"
    >
      <h2>Conversations</h2>
      <AboutPanel>
        <p>
          A conversation a site remembers, shared by every creature whose lines
          name it. With a hail distance, a creature carrying it who sees a
          character come that close speaks first and opens the reply. Empty
          means it never hails. The distance is at most Speak reach,{' '}
          {SPEAK_REACH_CELLS} cells.
        </p>
        <p>
          What follows the conversation entering a state is authored here once,
          whichever line got it there. A recognition makes the creature the line
          was said to recognise the speaker’s party he sees, on a topic; a
          post’s pass or a line’s requirement can then ask for that topic.
        </p>
      </AboutPanel>
      {ids.length === 0 ? (
        <p className="es-help">None.</p>
      ) : (
        <ul className="es-inspector-list" aria-label="Authored conversations">
          {ids.map((id) => (
            <RevealLi
              key={id}
              revealKey={{ kind: 'conversation', id }}
              data-interaction={id}
            >
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
                commit={(outcomes) =>
                  session.commitInteractionOutcomes(id, outcomes)
                }
              />
            </RevealLi>
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

const KIND_LABELS: Record<OutcomeKind, string> = {
  recognize: 'Recognises',
  arrest: 'Arrests',
  jail: 'Jails',
};

/**
 * One conversation's outcomes (rpg-project#928, #975 C): for each state it
 * enters, what follows — each entry ONE kind, chosen like a row's grant: it
 * recognises, arrests or jails. A form, not a sentence: what an arrest does
 * is the engine's read-back (here and in the places view's arrest passage).
 *
 * An arrest and a jail are a relocation reached from a conversation (R33),
 * and use the relocation's parts: an arrest its Region, as where the taken
 * are "Held in", with where they are "Seized in" (regions, and cells picked
 * on the map); a jail its Words and Rounds — it moves the taken into the
 * arrest's cell, so it names no region — and the fact taught when one
 * escapes.
 *
 * The engine's refusals are prevented by construction: one kind per entry;
 * Jails only beside an arrest; the last place an arrest seizes in cannot be
 * taken away; states from the recipe. An entry of another kind is shown as
 * written and kept. Every change commits the whole map, one undoable edit.
 */
function OutcomesField({
  id,
  outcomes,
  states,
  commit,
}: {
  id: string;
  outcomes: Outcomes;
  states: readonly string[];
  commit: (outcomes: Outcomes) => boolean;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const picking = useRoutePicking();
  const [adding, setAdding] = useState(states[0] ?? '');
  const [addingKind, setAddingKind] = useState<OutcomeKind>('recognize');
  const entered = Object.keys(outcomes);
  const siteRegions = names.regions.map((region) => region.id);
  const canJail = arrests(outcomes);
  return (
    <div aria-label={`Outcomes for ${id}`} className="es-outcomes">
      {entered.length === 0 && (
        <p className="es-help">Nothing follows a state yet.</p>
      )}
      <ul className="es-outcome-list" aria-label={`Outcomes of ${id}`}>
        {entered.flatMap((state) =>
          outcomes[state]!.map((entry, index) => {
            const label = `${id} ${state} ${index + 1}`;
            const path = `interactions.${id}.outcomes.${state}[${index}]`;
            const kind = outcomeKindOf(entry);
            const set = (next: unknown) =>
              commit(withEntry(outcomes, state, index, next));
            const remove = (
              <button
                type="button"
                className="wb-danger es-outcome-remove"
                aria-label={`Remove outcome ${label}`}
                onClick={() => commit(withEntryRemoved(outcomes, state, index))}
              >
                Remove
              </button>
            );
            // THE CARD'S TITLE: the state it follows, and which one of
            // that state's outcomes when it has several.
            const title = (
              <h4 className="es-outcome-title">
                On entering <code>{state}</code>
                {outcomes[state]!.length > 1 ? ` · ${index + 1}` : ''}
              </h4>
            );
            if (!kind)
              return (
                <RevealLi
                  key={`${state}:${index}`}
                  path={path}
                  className="es-outcome"
                >
                  <div className="es-outcome-head">
                    {title}
                    {remove}
                  </div>
                  <pre aria-label={`Outcome as written ${label}`}>
                    {JSON.stringify(entry)}
                  </pre>
                  <p className="es-help">
                    This form does not edit it; it is kept as written.
                  </p>
                </RevealLi>
              );
            const jailOffered = arrests(outcomes, { state, index });
            const recognize =
              kind === 'recognize' ? recognizeOf(entry) : undefined;
            const arrest = arrestOf(entry);
            const jail = jailOf(entry);
            const seizedCells = arrest?.area.cells ?? [];
            return (
              <RevealLi
                key={`${state}:${index}`}
                path={path}
                className="es-outcome"
              >
                <div className="es-outcome-head">
                  {title}
                  <label className="es-outcome-kind">
                    <span>This state</span>
                    <select
                      aria-label={`Outcome kind ${label}`}
                      value={kind}
                      onChange={(event) =>
                        set(
                          newOutcome(event.target.value as OutcomeKind, names)
                        )
                      }
                    >
                      {OUTCOME_KINDS.map((option) => (
                        <option
                          key={option}
                          value={option}
                          disabled={
                            option === 'jail' && !jailOffered && kind !== 'jail'
                          }
                        >
                          {KIND_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {remove}
                </div>
                <div className="es-outcome-fields">
                  {kind === 'recognize' && (
                    <RecognitionFields
                      label={label}
                      recognize={
                        recognize
                          ? {
                              topic: recognize.topic,
                              about: recognize.about,
                              heard_by: recognize.heard
                                ? HEARD_BY_WITNESSES
                                : undefined,
                            }
                          : { topic: '', about: ABOUT_PARTY_IN_SIGHT }
                      }
                      canBeWitnessed
                      onChange={(patch) => {
                        let next = outcomes;
                        if (patch.topic !== undefined)
                          next = withTopic(next, state, index, patch.topic);
                        if (patch.about !== undefined)
                          next = withAbout(next, state, index, patch.about);
                        if (patch.heard !== undefined)
                          next = withHeard(next, state, index, patch.heard);
                        commit(next);
                      }}
                    />
                  )}
                  {arrest && (
                    <>
                      <RegionField
                        label={label}
                        name="Held in"
                        region={arrest.cell}
                        onChange={(cell) => set(withArrestCell(arrest, cell))}
                      />
                      <fieldset className="es-outcome-seized">
                        <legend>Seized in</legend>
                        <div className="es-outcome-regions">
                          {[
                            ...siteRegions,
                            ...(arrest.area.regions ?? []).filter(
                              (region) => !siteRegions.includes(region)
                            ),
                          ].map((region) => {
                            const seized = (arrest.area.regions ?? []).includes(
                              region
                            );
                            const last =
                              seized &&
                              (arrest.area.regions ?? []).length === 1 &&
                              seizedCells.length === 0;
                            return (
                              <label key={region} className="wb-check">
                                <input
                                  type="checkbox"
                                  aria-label={`Seized in ${region} for ${label}`}
                                  checked={seized}
                                  disabled={last}
                                  onChange={(event) =>
                                    set(
                                      withArrestRegion(
                                        arrest,
                                        region,
                                        event.target.checked,
                                        siteRegions
                                      )
                                    )
                                  }
                                />
                                <span>
                                  {names.regions.find((r) => r.id === region)
                                    ?.name ?? region}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="es-outcome-cells">
                          <span
                            className="es-help"
                            data-testid={`Seized cells ${label}`}
                          >
                            {`${rowCellCount(seizedCells)} cells`}
                          </span>
                          {picking && (
                            <button
                              type="button"
                              aria-label={`Pick seized cells on map for ${label}`}
                              onClick={() =>
                                picking.arm({
                                  mode: 'cells',
                                  label: `${id} on entering ${state}`,
                                  route: cellsOf(seizedCells),
                                  onDone: (cells) =>
                                    set(withArrestCells(arrest, cells)),
                                })
                              }
                            >
                              Pick on map
                            </button>
                          )}
                        </div>
                      </fieldset>
                    </>
                  )}
                  {jail && (
                    <>
                      <WordsField
                        label={label}
                        words={jail.words ?? ''}
                        onChange={(words) => set(withJail(jail, { words }))}
                      />
                      <RoundsField
                        label={label}
                        rounds={jail.rounds}
                        onChange={(rounds) => set(withJail(jail, { rounds }))}
                      />
                      <label className="es-outcome-escaped">
                        <span>Fact when they escape</span>
                        <input
                          aria-label={`Fact when they escape for ${label}`}
                          placeholder="a fact id, or none"
                          value={jail.escaped ?? ''}
                          onChange={(event) =>
                            set(withJail(jail, { escaped: event.target.value }))
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              </RevealLi>
            );
          })
        )}
      </ul>
      {states.length > 0 && (
        <form
          className="es-outcome-add"
          aria-label={`Add an outcome to ${id}`}
          onSubmit={(event) => {
            event.preventDefault();
            commit(
              withOutcomeAdded(
                outcomes,
                adding,
                newOutcome(addingKind, names),
                states
              )
            );
          }}
        >
          <h4 className="es-outcome-title">Add an outcome</h4>
          <label>
            <span>On entering</span>
            <select
              aria-label={`Add outcome state for ${id}`}
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
          <label>
            <span>It</span>
            <select
              aria-label={`Add outcome kind for ${id}`}
              value={addingKind}
              onChange={(event) =>
                setAddingKind(event.target.value as OutcomeKind)
              }
            >
              {OUTCOME_KINDS.map((option) => (
                <option
                  key={option}
                  value={option}
                  disabled={option === 'jail' && !canJail}
                >
                  {KIND_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" aria-label={`Add outcome for ${id}`}>
            Add outcome
          </button>
        </form>
      )}
    </div>
  );
}

/** Row runs as single cells, for a pick that starts from them. */
function cellsOf(rows: readonly RoomCellRow[]): RoomHexCell[] {
  try {
    return fromRows(rows, 'cells');
  } catch {
    return [];
  }
}
