/**
 * RegionPanel — the region inspector (design §1): `id`, `name`,
 * `archetype` (a static list this round — the assets' profile catalog is
 * Not now), and `lighting.intensity` as a 0–1 slider. The archetype
 * never decides mechanics; the slider is the dimmer on top of it.
 */
import { useId } from 'react';
import type { RegionDoc } from './dungeonYaml';
import { ARCHETYPES } from './types';

export interface RegionPanelProps {
  region: RegionDoc;
  onChange: (
    patch: Partial<Pick<RegionDoc, 'id' | 'name' | 'archetype' | 'lighting'>>
  ) => void;
  onRemove: () => void;
  /** Ids already taken by other regions — a rename into one is refused. */
  takenIds: Set<string>;
}

export function RegionPanel({
  region,
  onChange,
  onRemove,
  takenIds,
}: RegionPanelProps) {
  const uid = useId();
  return (
    <div className="flex flex-col gap-3" data-testid="region-panel">
      <h3 className="dg-h">Region</h3>
      <label className="dg-label" htmlFor={`${uid}-id`}>
        id
        <input
          id={`${uid}-id`}
          className="dg-input"
          value={region.id}
          pattern="[a-z0-9-]+"
          onChange={(e) => {
            const id = e.target.value;
            if (!takenIds.has(id)) onChange({ id });
          }}
        />
      </label>
      <label className="dg-label" htmlFor={`${uid}-name`}>
        name
        <input
          id={`${uid}-name`}
          className="dg-input"
          value={region.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="dg-label" htmlFor={`${uid}-arch`}>
        archetype
        <select
          id={`${uid}-arch`}
          className="dg-input"
          value={region.archetype}
          onChange={(e) => onChange({ archetype: e.target.value })}
        >
          {!ARCHETYPES.includes(region.archetype as never) && (
            <option value={region.archetype}>
              {region.archetype || '(none)'}
            </option>
          )}
          {ARCHETYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="dg-label" htmlFor={`${uid}-int`}>
        lighting intensity · {region.lighting.intensity.toFixed(2)}
        <input
          id={`${uid}-int`}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={region.lighting.intensity}
          aria-label="lighting intensity"
          onChange={(e) =>
            onChange({ lighting: { intensity: Number(e.target.value) } })
          }
        />
      </label>
      <div className="text-xs opacity-70">{region.cells.length} cells</div>
      <button type="button" className="dg-mini dg-danger" onClick={onRemove}>
        remove region
      </button>
    </div>
  );
}
