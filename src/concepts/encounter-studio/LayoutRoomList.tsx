import { markIfArmed } from '@/dev/perfMarks';
import { useLayoutEffect, useState } from 'react';
import { regionSizeText } from '../world-building/regionSize';
import type { RoomDraft } from '../world-building/roomDraft';
import type { WorkspaceBounds } from '../world-building/workspaceGeometry';
import { layoutFooterText } from './layoutFooterText';
import type { RegionOverview } from './overviewColours';
import { cellsBounds } from './overviewFrame';

/** Layout's regions list (R7, rpg-project#725 R5): every authored region by
 * its name — its label on the map — with its colour, its size and its light.
 * Selecting a row selects the region, the one selection the inspector reads,
 * and frames it. The radio picks the ACTIVE region, where Paint and Rectangle
 * put the cells they brush. New region creates one, named, and makes it
 * active. */
export function LayoutRoomList({
  draft,
  overview,
  selectedRegionId,
  activeRegionId,
  onSelect,
  onActivate,
  onCreate,
  onShowEntire,
  unappliedFinishes,
}: {
  draft: Readonly<RoomDraft>;
  /** Regions whose wall finish is authored but not applied: a stale pattern
   * start, missing material or unresolved wall boundary. A boundary can
   * resolve while its finish does not, so this is its own flag. */
  unappliedFinishes?: ReadonlySet<string>;
  overview: RegionOverview;
  selectedRegionId: string | null;
  /** The region paint lands in. */
  activeRegionId: string;
  /** Bounds are null for an unpainted region: it is selected, not framed. */
  onSelect(regionId: string, bounds: WorkspaceBounds | null): void;
  onActivate(regionId: string): void;
  /** False when the owner refuses the name; the field keeps it. */
  onCreate(name: string): boolean;
  onShowEntire(): void;
}): React.JSX.Element {
  const regions = draft.room.regions;
  const [name, setName] = useState('');
  // Benchmark harness: the list's commit of an opened document. A layout
  // effect, so in the commit the grid shares it lands before the grid's
  // passive first-paint mark.
  useLayoutEffect(() => markIfArmed('studio:regions:rendered'), [draft]);
  return (
    <aside className="es-room-list wb-panel" aria-label="Rooms">
      <div className="es-room-list-header">
        <h2>Rooms</h2>
        <button type="button" onClick={onShowEntire}>
          Show entire
        </button>
      </div>
      {regions.length === 0 ? (
        <p className="es-help">
          No rooms yet. A room or outdoor area is a named region of painted
          hexes.
        </p>
      ) : (
        <ul className="es-region-list" aria-label="Room list">
          {regions.map((region) => {
            const text = region.name || region.id;
            const size = overview.sizes.get(region.id) ?? null;
            const colour = size ? overview.colours.get(region.id) : undefined;
            const unapplied = unappliedFinishes?.has(region.id) ?? false;
            const light = Math.round(region.lighting.intensity * 100);
            return (
              <li key={region.id} className="es-region-row">
                <input
                  type="radio"
                  name="es-active-region"
                  aria-label={`Paint into ${text}`}
                  checked={activeRegionId === region.id}
                  onChange={() => onActivate(region.id)}
                />
                <button
                  type="button"
                  data-region-row={region.id}
                  aria-pressed={selectedRegionId === region.id}
                  aria-label={`Room ${text}, ${regionSizeText(size)}, light ${light}%${unapplied ? ', finish unapplied' : ''}`}
                  onClick={() =>
                    onSelect(region.id, size ? cellsBounds(size.cells) : null)
                  }
                >
                  <span
                    className="es-room-swatch"
                    aria-hidden="true"
                    data-swatch={colour ?? 'none'}
                    style={
                      colour
                        ? { background: colour, borderColor: colour }
                        : undefined
                    }
                  />
                  <span className="es-room-name">{text}</span>
                  <small className="es-room-size">
                    {regionSizeText(size)} · light {light}%
                    {unapplied && ' — finish unapplied'}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="es-buttons"
        aria-label="New region"
        onSubmit={(event) => {
          event.preventDefault();
          if (onCreate(name)) setName('');
        }}
      >
        <input
          aria-label="New region name"
          placeholder="Region name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          New region
        </button>
      </form>
    </aside>
  );
}

export function LayoutFooter({
  draft,
}: {
  draft: Readonly<RoomDraft>;
}): React.JSX.Element {
  return (
    <footer className="es-layout-footer" aria-label="Layout counts">
      {layoutFooterText(draft)}
    </footer>
  );
}
