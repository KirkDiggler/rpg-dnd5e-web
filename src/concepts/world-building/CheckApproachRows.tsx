import { APPROACH_ABILITIES } from '@/author/types';
import type { RoomCheckApproach } from './roomDraft';

/** Configuration only: ability/tool resolution and the meaning of a DC belong
 * to the engine. Unknown imported refs remain visible, never rewritten. */
export function CheckApproachRows({
  id,
  rows,
  minimum = 1,
  testIdPrefix,
  onPatch,
  onRemove,
  onAdd,
}: {
  id: string;
  rows: readonly RoomCheckApproach[];
  minimum?: number;
  testIdPrefix?: string;
  onPatch: (index: number, patch: Partial<RoomCheckApproach>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <>
      {rows.map((row, index) => (
        <div
          className="wb-approach-row"
          key={index}
          data-testid={
            testIdPrefix ? `${testIdPrefix}-approach-${index}` : undefined
          }
        >
          <label>
            <span>ability</span>
            <select
              aria-label={`Ability for approach ${index} of ${id}`}
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
              onChange={(event) =>
                onPatch(index, { tool: event.target.value || undefined })
              }
            />
          </label>
          <label className="wb-approach-dc">
            <span>dc</span>
            <input
              aria-label={`DC for approach ${index} of ${id}`}
              type="number"
              min={1}
              step={1}
              value={row.dc}
              onChange={(event) =>
                onPatch(index, { dc: Number(event.target.value) })
              }
            />
          </label>
          <button
            type="button"
            aria-label={`Remove approach ${index} from ${id}`}
            disabled={rows.length <= minimum}
            onClick={() => onRemove(index)}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="wb-actions">
        <button
          type="button"
          aria-label={`Add approach to ${id}`}
          onClick={onAdd}
        >
          Add approach
        </button>
      </div>
    </>
  );
}
