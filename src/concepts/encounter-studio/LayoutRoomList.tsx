import { regionSizeText } from '../world-building/regionSize';
import type { RoomDraft } from '../world-building/roomDraft';
import type { WorkspaceBounds } from '../world-building/workspaceGeometry';
import { layoutFooterText } from './layoutFooterText';
import type { RegionOverview } from './overviewColours';
import { cellsBounds } from './overviewFrame';

/** Layout's room list (R7): every region by its label, with its colour and
 * its size. Selecting a row selects the region's label, the one selection
 * the inspector reads, and frames the region. */
export function LayoutRoomList({
  draft,
  overview,
  selectedLabelId,
  onSelect,
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
  selectedLabelId: string | null;
  /** Bounds are null for an unresolved region: it is selected, not framed. */
  onSelect(labelId: string, bounds: WorkspaceBounds | null): void;
  onCreate(): void;
  onShowEntire(): void;
}): React.JSX.Element {
  const regions = draft.scene.authoringRegions ?? [];
  const labels = draft.scene.mapLabels ?? [];
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
          No rooms yet. A room or outdoor area is a named label with a boundary.
        </p>
      ) : (
        <ul className="es-region-list" aria-label="Room list">
          {regions.map((region) => {
            const text =
              labels.find((label) => label.id === region.labelId)?.text ??
              region.id;
            const size = overview.sizes.get(region.id) ?? null;
            const colour = size ? overview.colours.get(region.id) : undefined;
            const unapplied = unappliedFinishes?.has(region.id) ?? false;
            return (
              <li key={region.id}>
                <button
                  type="button"
                  data-region-row={region.id}
                  aria-pressed={selectedLabelId === region.labelId}
                  aria-label={`Room ${text}, ${regionSizeText(size)}${unapplied ? ', finish unapplied' : ''}`}
                  onClick={() =>
                    onSelect(
                      region.labelId,
                      size ? cellsBounds(size.cells) : null
                    )
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
                    {regionSizeText(size)}
                    {unapplied && ' — finish unapplied'}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={onCreate}>
        New region
      </button>
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
