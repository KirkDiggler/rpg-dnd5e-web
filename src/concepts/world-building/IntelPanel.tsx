/**
 * IntelPanel — the site's `intel:` records, edited in the site scope
 * (rpg-dnd5e-web#1176, the v4 port of the v2 intel panel web#933 /
 * rpg-project#326 R2/R7).
 *
 * A RECORD IS A SITE NOUN, NOT A SELECTION, so this is a document section
 * beside `Policies` rather than a creature's property panel: a record is held
 * by many things and belongs to none of them, so a select-then-declare panel
 * could never show it (the same argument the site design makes for a faction's
 * shared table).
 *
 * THE BUILDER IS A FORM BUILDER. It writes `{ id, reveals }` and nothing else:
 * it never resolves a fact target, never decides who may hold a record,
 * and never pre-judges whether a `holds` id still resolves. Those are the
 * engine's sentences at `PutDungeon`, and a rename here deliberately does not
 * rewrite a creature's `holds` — the server names the dangling reference.
 */
import {
  addIntelRecord,
  intelHolders,
  removeIntelRecord,
  renameIntelRecord,
  setIntelReveals,
} from './intelEdits';
import type { RoomGameplayData } from './roomDraft';
import {
  INTEL_REVEALS_DOOR_REFUSAL,
  type SiteIntelReveals,
  type SiteScope,
} from './siteScope';

/** The ONE target this panel authors, and the only one this dialect accepts:
 * `fact` — the thing a failed persuasion teaches and an `arrives` reads.
 *
 * `reveals: { door: … }` is REFUSED, not merely unauthored (rpg-project#488 R3,
 * rpg-toolkit#1855): revealing the way to a door needs a concealed door on a
 * crossing, and a single room has none. The design first said a door reveal was
 * "accepted and inert" and this panel first carried one read-only; the engine
 * made it a sentence, so the form refuses it with the engine's own words and
 * the validator will not store one. The refusal is reported HERE, beside the
 * control that would write it, rather than only at publish time. */
function revealTarget(reveals: SiteIntelReveals): string {
  if ('door' in reveals) return reveals.door;
  if ('concealment' in reveals) return reveals.concealment;
  return reveals.fact;
}

/** Whether a record names a door — the state this dialect refuses. A record in
 * the document cannot be one (the validator refuses it), so this exists for the
 * author's own words and for a document that arrived from another dialect. */
function revealsDoor(reveals: SiteIntelReveals): boolean {
  return 'door' in reveals;
}

/** Whether a record names a CONCEALMENT — carried, not authored (the form only
 * authors `fact`). A hand-written record that reveals a secret is shown
 * read-only, exactly as a `door` one is, so it is never silently edited into a
 * fact on re-save. The engine grades the target at `PutDungeon`. */
function revealsConcealment(reveals: SiteIntelReveals): boolean {
  return 'concealment' in reveals;
}

export interface IntelPanelProps {
  scope: SiteScope;
  room: RoomGameplayData;
  /** The document mutator, shared with `Policies`: one undoable transaction per
   * edit, and the same "the form never pre-judges" boundary. */
  onChange: (nextScope: SiteScope) => void;
}

export function IntelPanel({ scope, room, onChange }: IntelPanelProps) {
  const records = scope.intel ?? [];
  const monsterIds = room.monsterDeclarations.map((monster) => monster.id);

  return (
    <div className="wb-intel-panel" data-testid="intel-panel">
      {records.length === 0 ? (
        <p className="wb-help" data-testid="intel-none">
          This site declares no intel. A record is knowledge something carries —
          say what it reveals, then give it to a creature or prop.
        </p>
      ) : (
        <ul className="wb-policy-factions" aria-label="Intel records">
          {records.map((record) => {
            const holders = intelHolders(room.monsterBindings, record.id);
            return (
              <li
                key={record.id}
                className="wb-policy-faction"
                data-testid={`intel-${record.id}`}
              >
                <details
                  className="wb-policy-row"
                  data-testid={`intel-row-${record.id}`}
                >
                  {/* THE LINE IS THE ID AND WHAT IT REVEALS (web#1178
                      follow-up): a record is knowledge, and "what does this
                      tell you" is the fact worth reading at a glance. The id
                      and its target are the form behind it. */}
                  <summary aria-label={`Intel ${record.id}`}>
                    {record.id}
                    {!revealsDoor(record.reveals) && (
                      <span className="wb-policy-summary-note">
                        {' '}
                        ·{' '}
                        {revealsConcealment(record.reveals)
                          ? 'secret'
                          : 'fact'}{' '}
                        {revealTarget(record.reveals)}
                      </span>
                    )}
                  </summary>
                  <div className="wb-policy-form">
                    <label>
                      <span>Id</span>
                      <input
                        aria-label={`Intel id for ${record.id}`}
                        value={record.id}
                        onChange={(event) =>
                          onChange(
                            renameIntelRecord(
                              scope,
                              record.id,
                              event.target.value
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>
                        {revealsConcealment(record.reveals)
                          ? 'Reveals a secret'
                          : 'Reveals a fact'}
                      </span>
                      <input
                        aria-label={`Intel reveals ${
                          revealsConcealment(record.reveals) ? 'secret' : 'fact'
                        } for ${record.id}`}
                        value={revealTarget(record.reveals)}
                        placeholder="cellar-is-clear"
                        disabled={
                          revealsDoor(record.reveals) ||
                          revealsConcealment(record.reveals)
                        }
                        onChange={(event) =>
                          onChange(
                            setIntelReveals(scope, record.id, {
                              fact: event.target.value,
                            })
                          )
                        }
                      />
                    </label>
                    {revealsDoor(record.reveals) && (
                      // REFUSED, NOT CARRIED: this dialect will not run a record
                      // that reveals a door, so the form says so in the engine's own
                      // words at the record's own row instead of preserving bytes
                      // the server rejects (rpg-project#488 R3, rpg-toolkit#1855).
                      <p
                        className="wb-help"
                        data-testid={`intel-door-${record.id}`}
                        role="alert"
                      >
                        {INTEL_REVEALS_DOOR_REFUSAL}
                      </p>
                    )}
                    {revealsConcealment(record.reveals) && (
                      // CARRIED, NOT EDITED: the form authors only `fact`
                      // today; a hand-written record that reveals a CONCEALMENT
                      // is preserved read-only rather than degraded into a fact
                      // on re-save. The engine grades the target at `PutDungeon`
                      // (rpg-project#490).
                      <p
                        className="wb-help"
                        data-testid={`intel-concealment-${record.id}`}
                      >
                        Carried read-only — this record reveals a secret (a root
                        concealments entry). Editing it to a fact is a later
                        slice of the form.
                      </p>
                    )}
                    <p
                      className="wb-help"
                      data-testid={`intel-held-by-${record.id}`}
                    >
                      {holders.length === 0
                        ? 'Held by nobody yet — give it to a creature or prop.'
                        : `Held by ${holders.join(', ')}.`}
                    </p>
                    <button
                      type="button"
                      aria-label={`Remove intel ${record.id}`}
                      onClick={() =>
                        onChange(removeIntelRecord(scope, record.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        aria-label="Add intel record"
        onClick={() =>
          // A NEW record reveals a FACT, which is the only kind this slice
          // authors: the driving case is a failed persuasion teaching one, and
          // a door target is the deferred concealed-door coupling.
          onChange(addIntelRecord(scope, { fact: '' }))
        }
      >
        New intel
      </button>
      {monsterIds.length > 0 && records.length > 0 && (
        <p className="wb-help" data-testid="intel-give-hint">
          Give a record to a creature in its own panel — the creature carries it
          ({monsterIds.length} placed).
        </p>
      )}
      {/* A prop's id is not listed here: a holdable prop's records are authored
          on the prop's declaration in the Rooms surface. Stated so the absence
          is not read as an oversight. */}
      <p className="wb-help" data-testid="intel-layering-rule">
        Intel is declared once and carried by many: a record’s target is read by
        the engine when the record changes hands, and the form never resolves
        it.
      </p>
    </div>
  );
}
