/**
 * The Props panel: one placed prop's ORDERS — whether it can be taken, what it
 * carries, and whether it is here yet (rpg-project#488 R1, rpg-toolkit#1855).
 *
 * IT RENDERS CONTROLS OVER CONFIGURATION THE ENGINE ALREADY TAKES, and decides
 * nothing about what that configuration means. `holdable` is a checkbox,
 * `holds` names records the site declares, `arrives` is the one predicate
 * grammar the builder already authors on a `until` and on a creature's
 * `arrives`. Whether a ref resolves is the server's judgement, reported at its
 * own path in the publish panel.
 *
 * THE ENGINE COMPILES THIS BLOCK, AND IT ONLY RECENTLY COULD. `propBindings`
 * first decoded and was refused at compile, because a v4 item compiled to a
 * footprint that could not be held and could not arrive. rpg-toolkit#1854 gave
 * the dialect that primitive (`PlacedPropInput` gained `Holdable`/`Holds`/
 * `Arrives`, reach derived from every cell the footprint covers) and the
 * refusal is gone. So this panel authors a key the engine now runs — and its
 * own three ownership refusals, which STAY, are the ones to keep in mind when
 * choosing what may be offered: an id that declares no prop, an id that is also
 * a door, and an arrangement template.
 *
 * WHICH ITEMS IT OFFERS IS THE WEB'S QUESTION, AND ONLY BECAUSE THE ENGINE'S
 * IS STRICTER. A binding needs the item to own a `propDeclarations` entry (that
 * is where its footprint comes from) and must NOT be a door, because an id that
 * is both is "a door somebody picks up" and nothing says what that means yet.
 * So candidates are the declared, non-door props — and an item that already
 * carries a binding stays listed whatever else changed, so an authored block
 * can never be edited or removed only by luck.
 */
import {
  addPropHold,
  propBindingCandidateIds,
  removePropHold,
  setPropArrives,
  setPropHoldable,
  type PropBindings,
} from './propBindingEdits';
import type { RoomGameplayData, RoomPropBinding } from './roomDraft';
import { ArrivesEditor } from './SitePolicies';
import type { SiteScope } from './siteScope';
import type { WorldScene } from './types';

export interface PropOrdersProps {
  items: WorldScene['items'];
  bindings: PropBindings | undefined;
  /** The items that carry a `propDeclarations` entry — what makes a prop a
   * candidate at all. */
  declaredIds: ReadonlySet<string>;
  /** Which placed items are doors; a door may not also carry orders. */
  doorIds: ReadonlySet<string>;
  /** The intel record ids this site declares, in authored order — everything a
   * `holds` may name. */
  recordIds: readonly string[];
  /** The site scope and the room, for the shared `arrives` editor: a
   * `{ down }` picks a placement and a `{ stance }` picks a pair. */
  scope: SiteScope;
  room: RoomGameplayData;
  onChange: (id: string, next: RoomPropBinding | undefined) => void;
}

export function PropOrders({
  items,
  bindings,
  declaredIds,
  doorIds,
  recordIds,
  scope,
  room,
  onChange,
}: PropOrdersProps) {
  const candidates = propBindingCandidateIds(
    items,
    bindings,
    declaredIds,
    doorIds
  );
  if (candidates.length === 0) {
    return (
      <p className="wb-help" data-testid="prop-orders-empty">
        Nothing placed here can carry orders yet. A prop needs a declared
        footprint and must not be a door — declare one in the prop’s own panel
        and it appears here.
      </p>
    );
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <div aria-label="Placed props’ orders">
      {candidates.map((id) => {
        const item = byId.get(id);
        const name = item?.label ?? id;
        const binding = bindings?.[id];
        const holds = binding?.holds ?? [];
        const available = recordIds.filter(
          (recordId) => !holds.includes(recordId)
        );
        return (
          <div
            className="wb-policy-block"
            key={id}
            data-testid={`prop-orders-${id}`}
          >
            <h5>
              {name} · {id}
            </h5>
            <label>
              <span>Holdable</span>
              <input
                type="checkbox"
                aria-label={`Holdable for ${id}`}
                checked={binding?.holdable === true}
                onChange={(event) =>
                  onChange(id, setPropHoldable(binding, event.target.checked))
                }
              />
            </label>
            {holds.length > 0 && (
              <ul
                className="wb-actor-list"
                aria-label={`Records ${id} carries`}
              >
                {holds.map((recordId) => (
                  <li key={recordId} className="wb-actor-row">
                    <span>{recordId}</span>
                    <button
                      type="button"
                      aria-label={`Stop ${id} carrying ${recordId}`}
                      onClick={() =>
                        onChange(id, removePropHold(binding, recordId))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label>
              <span>Carries a record</span>
              <select
                aria-label={`Give ${id} an intel record`}
                value=""
                onChange={(event) => {
                  if (event.target.value !== '')
                    onChange(id, addPropHold(binding, event.target.value));
                }}
              >
                <option value="">(none)</option>
                {available.map((recordId) => (
                  <option key={recordId} value={recordId}>
                    {recordId}
                  </option>
                ))}
              </select>
            </label>
            <ArrivesEditor
              scope={scope}
              room={room}
              arrives={binding?.arrives}
              onCommit={(next) => onChange(id, setPropArrives(binding, next))}
            />
            <p className="wb-help" data-testid={`prop-orders-note-${id}`}>
              Held and arriving props compile since rpg-toolkit#1854: taking a
              placement reaches every cell its footprint covers, and a reserved
              one is on no atlas and blocks no step until its predicate holds.
            </p>
          </div>
        );
      })}
    </div>
  );
}
