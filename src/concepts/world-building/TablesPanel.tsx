/**
 * TablesPanel — the site's root `tables:`, edited in the site scope
 * (rpg-toolkit#1897, rpg-dnd5e-web#1201).
 *
 * A TABLE IS A SITE NOUN, NOT A SELECTION. It is declared once and named from
 * whatever answers it — a faction or a creature — and it stands nowhere, so it
 * lives beside `Intel` and `Factions` rather than inside any one creature's
 * panel. That is the same argument `IntelPanel` makes, and it is the reason the
 * root is where the engine puts it (`rpg-project#488` rule 3: what is NOT
 * PLACED lives at the root).
 *
 * WHAT THIS REMOVES. Six goblins sharing one drill used to write it six times.
 * Worse, `time:` REPLACES the kind's whole default table, so authoring one
 * entry on a creature silently discarded everything its kind carried — this bit
 * the project three times, once losing `enemy: seen → toward` so a goblin stood
 * still in a fight it should have walked into. A named table does not merely add
 * reuse: it is TOTAL by construction, declared once and seen whole, so there is
 * no invisible partial edit left to lose a default in.
 *
 * THE BUILDER IS A FORM BUILDER. It writes the table and never resolves a name:
 * renaming or removing a table does NOT rewrite a faction's or a creature's
 * `table:`, and a name that resolves to nothing is the ENGINE's refusal, by name
 * and with the fix (`bindingTable`/`factionTable`). Semantic authority is the
 * server's, not the form's — the same discipline `IntelPanel` states for a
 * `holds` that outlives its record.
 *
 * THE GRAMMAR INSIDE A TABLE IS THE ONE GRAMMAR. Entries are edited by the SAME
 * `AnswerEntryRow` a faction's table uses, driven by the same one vocabulary
 * declaration, so a word the engine adds shows up here with no change. A root
 * table keeps the `at:` cell selector because a root table is what a FACTION
 * names, and `{ at: [col, row] }` is refused only on a placement.
 */
import { ANSWER_TRIGGERS, answerTrigger } from '@/author/answerVocabulary';
import { useState } from 'react';
import type { AnswerEntryShape, AnswerTableShape } from './answerTableShape';
import { AnswerEntryRow } from './SitePolicies';
import {
  addSiteTable,
  addSiteTableAnswerEntry,
  patchSiteTableAnswerEntry,
  removeSiteTable,
  removeSiteTableAnswerEntry,
  renameSiteTable,
} from './sitePolicyEdits';
import type { SiteScope } from './siteScope';

export interface TablesPanelProps {
  scope: SiteScope;
  /** The document mutator, shared with `Policies` and `IntelPanel`: one
   * undoable transaction per edit, and the same "the form never pre-judges"
   * boundary. */
  onChange: (nextScope: SiteScope) => void;
}

/** One root table's triggers and entries. Its own component so the id's
 * `<details>` state is keyed by the table, not by the list index — a table
 * renamed under an open row stays open. */
function TableRow({
  scope,
  id,
  table,
  onChange,
}: {
  scope: SiteScope;
  id: string;
  table: AnswerTableShape;
  onChange: (next: SiteScope) => void;
}) {
  const authored = ANSWER_TRIGGERS.map((trigger) => trigger.key).filter(
    (key) => table[key] !== undefined
  );
  const available = ANSWER_TRIGGERS.map((trigger) => trigger.key).filter(
    (key) => table[key] === undefined
  );
  /** `time` FIRST when it is offered, for `FactionTableEditor`'s reason: it is
   * the trigger a behavior table is mostly about and the only one the `when`
   * editor is legal on. Opening on the vocabulary's first key (`intimidated`)
   * lands an author on the social half, where no condition control can appear. */
  const [newTrigger, setNewTrigger] = useState(
    available.includes('time') ? 'time' : (available[0] ?? '')
  );
  /** The id is edited as a local draft and committed on blur/Enter, so a
   * half-typed name never becomes a table's id mid-keystroke — `FactionRow`
   * already keeps this rule for the same reason. */
  const [typedId, setTypedId] = useState(id);

  /** A rename onto a name that is already taken is REFUSED here rather than
   * silently replacing the other declaration. The edit helper returns the scope
   * unchanged; saying so is this form's job, because a control that looks like
   * it worked and did nothing is worse than one that says no. */
  const idTaken = typedId !== id && Object.hasOwn(scope.tables ?? {}, typedId);
  const commitId = () => {
    if (typedId === id) return;
    if (idTaken) {
      setTypedId(id);
      return;
    }
    onChange(renameSiteTable(scope, id, typedId));
  };

  return (
    <li className="wb-policy-faction" data-table-id={id}>
      <details className="wb-policy-row" data-testid={`site-table-${id}`}>
        {/* THE LINE IS THE ID AND HOW MUCH IT CARRIES: "what does this table
            say" is the fact worth reading at a glance, and the entry count is
            the honest answer when the triggers are closed. */}
        <summary aria-label={`Table ${id}`}>
          {id}
          <span className="wb-policy-summary-note">
            {' '}
            ·{' '}
            {authored.length === 0
              ? 'empty'
              : `${authored.length} trigger${authored.length === 1 ? '' : 's'}`}
          </span>
        </summary>
        <div className="wb-policy-form">
          <label>
            <span>Id</span>
            <input
              aria-label={`Table id for ${id}`}
              value={typedId}
              onChange={(event) => setTypedId(event.target.value)}
              onBlur={commitId}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitId();
              }}
            />
          </label>
          {idTaken && (
            <p className="wb-help wb-danger" data-testid="table-id-taken">
              This site already declares a table called “{typedId}”. References
              to it would become ambiguous, so the declaration was left alone.
            </p>
          )}
          <p className="wb-help">
            A creature’s or a faction’s `table` names this id. Renaming writes
            the declaration and nothing else — the server refuses any reference
            that no longer resolves.
          </p>

          {authored.length === 0 ? (
            <p className="wb-help" data-testid={`site-table-${id}-empty`}>
              No triggers yet. A table may stand empty until a creature names it
              — the grammar is judged whether or not anything references it.
            </p>
          ) : (
            authored.map((trigger) => (
              <div key={trigger} className="wb-policy-trigger-block">
                <p className="wb-policy-trigger">
                  <code>{trigger}</code>{' '}
                  {answerTrigger(trigger)?.label ?? 'Unknown trigger'}
                </p>
                <ul className="wb-policy-entries">
                  {(table[trigger] ?? []).map((entry, index) => (
                    <AnswerEntryRow
                      key={index}
                      trigger={trigger}
                      entry={entry}
                      onCommit={(next: AnswerEntryShape) =>
                        onChange(
                          patchSiteTableAnswerEntry(
                            scope,
                            id,
                            trigger,
                            index,
                            next
                          )
                        )
                      }
                      onRemove={() =>
                        onChange(
                          removeSiteTableAnswerEntry(scope, id, trigger, index)
                        )
                      }
                    />
                  ))}
                </ul>
              </div>
            ))
          )}

          {available.length > 0 && (
            <div className="wb-actions">
              <select
                aria-label={`Add trigger to ${id}`}
                value={newTrigger}
                onChange={(event) => setNewTrigger(event.target.value)}
              >
                {available.map((key) => (
                  <option key={key} value={key}>
                    {answerTrigger(key)?.label ?? key} ({key})
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Add entry on ${newTrigger} to ${id}`}
                onClick={() =>
                  onChange(addSiteTableAnswerEntry(scope, id, newTrigger))
                }
              >
                Add entry on {newTrigger}
              </button>
            </div>
          )}

          <button
            type="button"
            className="wb-danger"
            aria-label={`Remove table ${id}`}
            onClick={() => onChange(removeSiteTable(scope, id))}
          >
            Remove table
          </button>
        </div>
      </details>
    </li>
  );
}

export function TablesPanel({ scope, onChange }: TablesPanelProps) {
  const tables = scope.tables ?? {};
  const ids = Object.keys(tables);
  return (
    <div className="wb-tables-panel" data-testid="site-tables">
      <h4>Tables</h4>
      <div className="wb-actions">
        <button type="button" onClick={() => onChange(addSiteTable(scope))}>
          Add table
        </button>
      </div>
      {ids.length === 0 ? (
        <p className="wb-help" data-testid="site-tables-none">
          This site declares no shared answer tables. A table declared here is
          written once and named by any number of creatures or a whole faction,
          instead of pasted onto each one.
        </p>
      ) : (
        <ul className="wb-policy-list" aria-label="Site tables">
          {ids.map((id) => (
            <TableRow
              key={id}
              scope={scope}
              id={id}
              table={tables[id] ?? {}}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
