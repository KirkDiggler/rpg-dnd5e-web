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
 * it never resolves a door or fact target, never decides who may hold a record,
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
import type { SiteIntelReveals, SiteScope } from './siteScope';

/** The ONE target kind this panel AUTHORS: `fact`, the thing a failed
 * persuasion teaches and an `arrives` reads — the driving case.
 *
 * `reveals: { door: … }` is deliberately NOT authorable here. The
 * concealed-door coupling is the edge Kirk deferred (2026-09-20), so the form
 * does not open it. A file that already carries a door reveal is still CARRIED
 * and shown — dropping it on re-save would be the silent data loss this whole
 * slice exists to prevent — but it is a readout, not a picker. */
type RevealKind = 'door' | 'fact';

function revealKind(reveals: SiteIntelReveals): RevealKind {
  return 'door' in reveals ? 'door' : 'fact';
}

function revealTarget(reveals: SiteIntelReveals): string {
  return 'door' in reveals ? reveals.door : reveals.fact;
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
  const monsterIds = room.monsters.map((monster) => monster.id);

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
            const kind = revealKind(record.reveals);
            const holders = intelHolders(room.monsterBindings, record.id);
            return (
              <li
                key={record.id}
                className="wb-policy-faction"
                data-testid={`intel-${record.id}`}
              >
                <label>
                  <span>Id</span>
                  <input
                    aria-label={`Intel id for ${record.id}`}
                    value={record.id}
                    onChange={(event) =>
                      onChange(
                        renameIntelRecord(scope, record.id, event.target.value)
                      )
                    }
                  />
                </label>
                <label>
                  <span>Reveals a fact</span>
                  <input
                    aria-label={`Intel reveals fact for ${record.id}`}
                    value={kind === 'fact' ? revealTarget(record.reveals) : ''}
                    placeholder="cellar-is-clear"
                    disabled={kind === 'door'}
                    onChange={(event) =>
                      onChange(
                        setIntelReveals(scope, record.id, {
                          fact: event.target.value,
                        })
                      )
                    }
                  />
                </label>
                {kind === 'door' && (
                  // CARRIED, NOT AUTHORED: a door reveal came from a file that
                  // already had one, and re-saving must not lose it. Editing it
                  // is the concealed-door coupling this slice defers, so it is a
                  // readout and the fact box above is disabled while it stands.
                  <p className="wb-help" data-testid={`intel-door-${record.id}`}>
                    Reveals door “{revealTarget(record.reveals)}”. Door reveals
                    are carried as written — authoring them is a later slice.
                  </p>
                )}
                <p className="wb-help" data-testid={`intel-held-by-${record.id}`}>
                  {holders.length === 0
                    ? 'Held by nobody yet — give it to a creature or prop.'
                    : `Held by ${holders.join(', ')}.`}
                </p>
                <button
                  type="button"
                  aria-label={`Remove intel ${record.id}`}
                  onClick={() => onChange(removeIntelRecord(scope, record.id))}
                >
                  Remove
                </button>
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