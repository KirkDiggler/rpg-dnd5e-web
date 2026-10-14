import { APPROACH_ABILITIES } from '@/author/types';
import { abilityPhrase } from '../world-building/answerVocabulary';

export interface StudioCheck {
  ability: string;
  dc: number;
  tool?: string;
}

/** A check's routes, any one of which beats it: an ability or skill from
 * the one approach list, an optional tool ref, and a DC (rpg-project#578).
 * Each change applies at once. Whether a tool resolves and what a DC means
 * are the engine's to judge. */
export function StudioCheckRows({
  owner,
  rows,
  minimum = 0,
  onPatch,
  onRemove,
  onAdd,
}: {
  /** Names the check in every control's label: "the lock", "stash search". */
  owner: string;
  rows: readonly StudioCheck[];
  /** Rows that cannot be removed: a concealment's search needs one. */
  minimum?: number;
  onPatch(index: number, patch: Partial<StudioCheck>): void;
  onRemove(index: number): void;
  onAdd(): void;
}): React.JSX.Element {
  return (
    <div className="es-check-rows">
      {rows.length === 0 && <p className="es-help">None.</p>}
      {rows.map((row, index) => {
        const n = index + 1;
        return (
          <div className="es-check-row" key={index}>
            <label>
              <span>Ability</span>
              <select
                aria-label={`Ability for check ${n} of ${owner}`}
                value={row.ability}
                onChange={(event) =>
                  onPatch(index, { ability: event.target.value })
                }
              >
                {!APPROACH_ABILITIES.includes(row.ability as never) && (
                  <option value={row.ability}>{row.ability || '(none)'}</option>
                )}
                {APPROACH_ABILITIES.map((ability) => (
                  <option key={ability} value={ability}>
                    {abilityPhrase(ability)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>DC</span>
              <input
                aria-label={`DC for check ${n} of ${owner}`}
                type="number"
                min={1}
                step={1}
                value={row.dc}
                onChange={(event) => {
                  if (event.target.value !== '')
                    onPatch(index, { dc: Number(event.target.value) });
                }}
              />
            </label>
            <label>
              <span>Tool</span>
              <input
                aria-label={`Tool for check ${n} of ${owner}`}
                value={row.tool ?? ''}
                placeholder="none"
                onChange={(event) =>
                  onPatch(index, { tool: event.target.value || undefined })
                }
              />
            </label>
            <button
              type="button"
              aria-label={`Remove check ${n} from ${owner}`}
              disabled={rows.length <= minimum}
              onClick={() => onRemove(index)}
            >
              Remove
            </button>
          </div>
        );
      })}
      <div className="es-buttons">
        <button
          type="button"
          aria-label={`Add check to ${owner}`}
          onClick={onAdd}
        >
          Add check
        </button>
      </div>
    </div>
  );
}
