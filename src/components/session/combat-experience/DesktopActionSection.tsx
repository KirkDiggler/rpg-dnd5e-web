import {
  Slot,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ActionArt } from './ActionArt';
import { actionTooltipText, buildActionTooltip } from './actionTooltip';
import styles from './DesktopActionSurface.module.css';
import type { HotbarBand, HotbarGroup } from './desktopHotbarGroups';
import {
  currentFavorites,
  favoritePage,
  hotbarColumns,
  minimumFavoriteColumns,
  type FavoritePage,
  type HotbarRows,
} from './desktopHotbarLayout';
import type { ActionIconPresentation } from './organizedActionPresentation';

function costMark(slot: Slot): string {
  return slot === Slot.ACTION
    ? 'A'
    : slot === Slot.BONUS
      ? 'B'
      : slot === Slot.REACTION
        ? 'R'
        : '—';
}
function bandMinimum(
  band: HotbarBand,
  favorites: readonly string[],
  rows: HotbarRows
): number {
  return Math.max(
    band.label ? 92 : 132,
    minimumFavoriteColumns(band.offers, favorites, rows) * 40 - 4
  );
}
interface OfferGridProps {
  band: HotbarBand;
  page: FavoritePage<Declaration>;
  rows: HotbarRows;
  minimum: number;
  authorityFresh: boolean;
  icons?: Readonly<Record<string, ActionIconPresentation>>;
  editing: boolean;
  favoriteCount: number;
  armedId?: string;
  optionId?: string;
  onChoose: (id: string) => void;
  onInspect: (id: string | null) => void;
  onColumns: (band: string, columns: number) => void;
}
function OfferGrid({
  band,
  page,
  rows,
  minimum,
  authorityFresh,
  icons,
  editing,
  favoriteCount,
  armedId,
  optionId,
  onChoose,
  onInspect,
  onColumns,
}: OfferGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) onColumns(band.id, hotbarColumns(entry.contentRect.width));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [band.id, onColumns]);
  return (
    <div
      className={styles.band}
      data-band={band.id}
      style={{ minWidth: minimum, flexGrow: Math.max(1, band.offers.length) }}
    >
      <h4 aria-hidden={!band.label}>{band.label ?? '\u00a0'}</h4>
      <div
        ref={gridRef}
        className={styles.offers}
        data-section-grid={band.id}
        data-capacity={page.capacity}
        data-favorite-count={page.favoriteIds.length}
        data-total-offers={band.offers.length}
        data-grid-rows={rows}
        style={
          {
            '--hotbar-rows': rows,
            '--balanced-columns': page.columns,
          } as CSSProperties
        }
      >
        {page.cells.map((declaration, index) => {
          if (!declaration)
            return (
              <span
                className={styles.emptySlot}
                data-empty-slot
                key={`empty-${index}`}
                aria-hidden="true"
              />
            );
          const info = buildActionTooltip(declaration);
          const favorite = page.favoriteIds.includes(declaration.id);
          const capped = editing && favoriteCount >= 4 && !favorite;
          const disabled = !authorityFresh || !declaration.available;
          const art = icons?.[declaration.id];
          return (
            <div key={declaration.id} className={styles.offerSlot}>
              <button
                type="button"
                className={styles.offer}
                data-tone={art?.tone ?? 'gold'}
                data-offer-id={declaration.id}
                data-favorite={favorite}
                aria-label={
                  editing
                    ? `${favorite ? 'Unfavorite' : 'Favorite'} ${info.title}`
                    : info.title
                }
                aria-describedby={`${prefix}-${declaration.id}`}
                aria-disabled={editing ? capped : disabled}
                aria-pressed={
                  editing
                    ? favorite
                    : armedId === declaration.id || optionId === declaration.id
                }
                aria-haspopup={
                  !editing && declaration.options.length > 0
                    ? 'dialog'
                    : undefined
                }
                aria-expanded={
                  !editing && declaration.options.length > 0
                    ? optionId === declaration.id
                    : undefined
                }
                draggable={false}
                onPointerEnter={(event) => {
                  if (
                    event.pointerType === 'mouse' ||
                    event.pointerType === 'pen'
                  )
                    onInspect(declaration.id);
                }}
                onFocus={() => onInspect(declaration.id)}
                onClick={() => onChoose(declaration.id)}
              >
                <ActionArt art={art} label={info.title} />
                {(editing || favorite) && (
                  <span className={styles.favoriteMark} aria-hidden="true">
                    {favorite ? '★' : '☆'}
                  </span>
                )}
                <span className={styles.cost} aria-hidden="true">
                  {costMark(declaration.slot)}
                </span>
                {declaration.options.length > 0 && (
                  <span className={styles.choiceMark} aria-hidden="true">
                    ⌄
                  </span>
                )}
                {disabled && (
                  <span className={styles.unavailableMark} aria-hidden="true">
                    ×
                  </span>
                )}
              </button>
              <span
                className={styles.srOnly}
                id={`${prefix}-${declaration.id}`}
              >
                {editing
                  ? capped
                    ? 'Four favorites already selected in this section. Unstar one first. '
                    : 'Edit favorites only; this cannot execute an action. '
                  : favorite
                    ? 'Favorite. '
                    : ''}
                {actionTooltipText(info)}
                {!authorityFresh ? '. Actions may be out of date' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DesktopActionSection({
  group,
  rows,
  favorites: requested,
  authorityFresh,
  icons,
  editing,
  armedId,
  optionId,
  onChoose,
  onInspect,
}: {
  group: HotbarGroup;
  rows: HotbarRows;
  favorites: readonly string[];
  authorityFresh: boolean;
  icons?: Readonly<Record<string, ActionIconPresentation>>;
  editing: boolean;
  armedId?: string;
  optionId?: string;
  onChoose: (id: string) => void;
  onInspect: (id: string | null) => void;
}) {
  const [columns, setColumns] = useState<Record<string, number>>({});
  const [requestedPage, setPage] = useState(0);
  const favorites = currentFavorites(group.offers, requested);
  const measured = useCallback(
    (band: string, count: number) =>
      setColumns((current) =>
        current[band] === count ? current : { ...current, [band]: count }
      ),
    []
  );
  const previews = group.bands.map((band) =>
    favoritePage(
      band.offers,
      favorites,
      columns[band.id] ?? 1,
      rows,
      requestedPage
    )
  );
  const pages = Math.max(1, ...previews.map((page) => page.pages));
  const page = Math.min(requestedPage, pages - 1);
  useEffect(() => {
    setPage((current) => Math.min(current, pages - 1));
  }, [pages]);
  useEffect(() => onInspect(null), [page, rows, onInspect]);
  const minimum = group.offers.length
    ? group.bands.reduce(
        (total, band) => total + bandMinimum(band, favorites, rows),
        0
      ) +
      Math.max(0, group.bands.length - 1) * 10
    : 84;
  return (
    <section
      className={styles.group}
      aria-label={group.label}
      data-section={group.key}
      style={{
        minWidth: minimum,
        flexGrow: Math.max(1, Math.min(12, group.offers.length)),
      }}
    >
      <div className={styles.sectionHeading}>
        <h3>{group.label}</h3>
        {editing && (
          <span
            className={styles.favoriteCount}
            aria-label={`${group.label} favorites ${favorites.length} of 4`}
          >
            ★ {favorites.length}/4
          </span>
        )}
        {pages > 1 && (
          <nav className={styles.pager} aria-label={`${group.label} pages`}>
            <button
              type="button"
              aria-label={`Previous ${group.label} page`}
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              ‹
            </button>
            <span aria-label={`${group.label} page ${page + 1} of ${pages}`}>
              {page + 1}/{pages}
            </span>
            <button
              type="button"
              aria-label={`Next ${group.label} page`}
              disabled={page === pages - 1}
              onClick={() => setPage(page + 1)}
            >
              ›
            </button>
          </nav>
        )}
      </div>
      {group.offers.length ? (
        <div className={styles.bands}>
          {group.bands.map((band) => (
            <OfferGrid
              key={band.id}
              band={band}
              page={favoritePage(
                band.offers,
                favorites,
                columns[band.id] ?? 1,
                rows,
                page
              )}
              rows={rows}
              minimum={bandMinimum(band, favorites, rows)}
              authorityFresh={authorityFresh}
              icons={icons}
              editing={editing}
              favoriteCount={favorites.length}
              armedId={armedId}
              optionId={optionId}
              onChoose={onChoose}
              onInspect={onInspect}
              onColumns={measured}
            />
          ))}
        </div>
      ) : (
        <p className={styles.emptySection}>No offers</p>
      )}
    </section>
  );
}
