/**
 * The Doors panel: one placed item's door state (rpg-project#485).
 *
 * IT RENDERS CONTROLS OVER CONFIGURATION THE ENGINE ALREADY TAKES, and it
 * decides nothing about what that configuration means. Four options, one per
 * authored state the engine has — no binding, `{}`, `{closed:true}`,
 * `{locked:[...]}` — and a lock row carries whichever ability, tool and DC the
 * author typed, including refs this build cannot resolve. Whether a lock is
 * beatable and whether a ref resolves are the server's judgement, reported at
 * its own path in the publish panel.
 *
 * WHICH ITEMS IT OFFERS IS THE WEB'S OWN QUESTION, AND ONLY BECAUSE THE ENGINE
 * CANNOT ANSWER IT. Nothing in the document says "this prop is a door" until
 * `doorBindings` does, so a candidate is found by the asset declaring a `leaf`
 * — the renderer's own signal that something swings. That is a convenience for
 * finding doors, not a rule: any candidate can be left "not a door", and an
 * item that already carries a binding stays listed even if its asset declares
 * no leaf at all, so an authored door can never be edited or removed only by
 * luck.
 */
import { APPROACH_ABILITIES } from '@/author/types';
import {
  addDoorApproach,
  doorBindingState,
  doorCandidateIds,
  patchDoorApproach,
  removeDoorApproach,
  setDoorBindingState,
  type DoorBindingState,
  type DoorBindings,
} from './doorBindingEdits';
import type { RoomDoorBinding } from './roomDraft';
import type { WorldScene } from './types';

/** The four states, in the engine's own vocabulary — `open doorway` is the
 * shape the v2 door inspector uses for `{}`, so the two dialects read the same
 * to an author. */
const DOOR_STATES: ReadonlyArray<{ value: DoorBindingState; label: string }> = [
  { value: 'none', label: 'not a door' },
  { value: 'open', label: 'open doorway' },
  { value: 'closed', label: 'closed' },
  { value: 'locked', label: 'locked' },
];

export interface DoorStatesProps {
  /** Every placed prop; the panel selects the candidates itself. */
  items: WorldScene['items'];
  bindings: DoorBindings | undefined;
  /** The items that already carry a `propDeclarations` entry — the door's own
   * footprint. The panel reports the ones that do not, because making them a
   * door is what gives them one. */
  declaredIds: ReadonlySet<string>;
  onChange: (id: string, next: RoomDoorBinding | undefined) => void;
}

export function DoorStates({
  items,
  bindings,
  declaredIds,
  onChange,
}: DoorStatesProps) {
  const candidates = doorCandidateIds(items, bindings);
  if (candidates.length === 0) {
    return (
      <p className="wb-help" data-testid="doors-empty">
        Nothing placed here is a door yet. A door is a prop with a state, so
        place a door asset — one whose model declares a leaf that swings — and
        it appears here to be given one.
      </p>
    );
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <div aria-label="Placed doors">
      {candidates.map((id) => {
        const item = byId.get(id);
        const name = item?.label ?? id;
        const binding = bindings?.[id];
        const state = doorBindingState(binding);
        const rows = binding?.locked ?? [];
        return (
          <div
            className="wb-policy-block"
            key={id}
            data-testid={`door-${id}`}
            data-door-state={state}
          >
            <label>
              <span>
                {name} · {id}
              </span>
              <select
                aria-label={`Door state for ${name} ${id}`}
                value={state}
                onChange={(event) =>
                  onChange(
                    id,
                    setDoorBindingState(
                      binding,
                      event.target.value as DoorBindingState
                    )
                  )
                }
              >
                {DOOR_STATES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {state !== 'none' && !declaredIds.has(id) && (
              <p className="wb-help" data-testid={`door-${id}-undeclared`}>
                Making this a door also gives it a footprint, measured from its
                model with both blocking flags left false — the door’s state
                decides what it blocks.
              </p>
            )}

            {state === 'locked' && (
              <>
                <p className="wb-help">
                  Any ONE of these beats the lock. A locked door is shut by
                  definition, so it is authored shut whatever its closed state
                  said.
                </p>
                {rows.map((row, index) => (
                  <div
                    className="wb-approach-row"
                    key={index}
                    data-testid={`door-${id}-approach-${index}`}
                  >
                    <label>
                      <span>ability</span>
                      <select
                        aria-label={`Ability for approach ${index} of ${id}`}
                        value={row.ability}
                        onChange={(event) =>
                          onChange(
                            id,
                            patchDoorApproach(binding, index, {
                              ability: event.target.value,
                            })
                          )
                        }
                      >
                        {/* An ability this build does not list is CARRIED, so
                          it stays visible as its own option rather than
                          silently snapping the document to the first word. */}
                        {!APPROACH_ABILITIES.includes(row.ability as never) && (
                          <option value={row.ability}>
                            {row.ability === '' ? '(none)' : row.ability}
                          </option>
                        )}
                        {APPROACH_ABILITIES.map((ability) => (
                          <option key={ability} value={ability}>
                            {ability}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>tool</span>
                      <input
                        aria-label={`Tool for approach ${index} of ${id}`}
                        value={row.tool ?? ''}
                        placeholder="(none)"
                        onChange={(event) => {
                          const tool = event.target.value;
                          onChange(
                            id,
                            patchDoorApproach(binding, index, {
                              tool: tool === '' ? undefined : tool,
                            })
                          );
                        }}
                      />
                    </label>
                    <label className="wb-approach-dc">
                      <span>dc</span>
                      <input
                        aria-label={`DC for approach ${index} of ${id}`}
                        type="number"
                        min={1}
                        value={row.dc}
                        onChange={(event) =>
                          onChange(
                            id,
                            patchDoorApproach(binding, index, {
                              dc: Number(event.target.value),
                            })
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove approach ${index} from ${id}`}
                      disabled={rows.length <= 1}
                      onClick={() =>
                        onChange(id, removeDoorApproach(binding, index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="wb-actions">
                  <button
                    type="button"
                    aria-label={`Add approach to ${id}`}
                    onClick={() => onChange(id, addDoorApproach(binding))}
                  >
                    Add approach
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
