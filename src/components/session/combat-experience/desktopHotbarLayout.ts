export type DesktopHotbarSection = 'actions' | 'features' | 'spells' | 'items';
export type HotbarRows = 1 | 2 | 3 | 4;
export interface DesktopHotbarLayout {
  rows: HotbarRows;
  /** Fixture-local selectors, not a durable production identity. */
  favoriteIdsBySection: Partial<
    Record<DesktopHotbarSection, readonly string[]>
  >;
}
export interface DesktopHotbarCustomization {
  layout: DesktopHotbarLayout;
  onChange: (layout: DesktopHotbarLayout) => void;
}
export const DEFAULT_HOTBAR_LAYOUT: DesktopHotbarLayout = {
  rows: 1,
  favoriteIdsBySection: {},
};
export const HOTBAR_FAVORITE_LIMIT = 4;
export const HOTBAR_ICON_SIZE = 36;
export const HOTBAR_ICON_GAP = 4;

export function hotbarRows(value: number): HotbarRows {
  return Math.max(
    1,
    Math.min(4, Number.isFinite(value) ? Math.floor(value) : 1)
  ) as HotbarRows;
}
export function hotbarColumns(width: number): number {
  return Math.max(
    1,
    Math.floor(
      ((Number.isFinite(width) ? Math.max(0, width) : 0) + HOTBAR_ICON_GAP) /
        (HOTBAR_ICON_SIZE + HOTBAR_ICON_GAP)
    )
  );
}
export function currentFavorites(
  offers: readonly { id: string }[],
  requested: readonly string[] = []
): string[] {
  const current = new Set(offers.map((offer) => offer.id));
  return [...new Set(requested)]
    .filter((id) => current.has(id))
    .slice(0, HOTBAR_FAVORITE_LIMIT);
}
export function toggleFavorite(
  offers: readonly { id: string }[],
  requested: readonly string[],
  id: string
): { favorites: string[]; refused: 'limit' | 'missing' | null } {
  const favorites = currentFavorites(offers, requested);
  if (!offers.some((offer) => offer.id === id))
    return { favorites, refused: 'missing' };
  if (favorites.includes(id))
    return { favorites: favorites.filter((key) => key !== id), refused: null };
  if (favorites.length === HOTBAR_FAVORITE_LIMIT)
    return { favorites, refused: 'limit' };
  return { favorites: [...favorites, id], refused: null };
}
export function minimumFavoriteColumns(
  offers: readonly { id: string }[],
  favorites: readonly string[],
  rows: HotbarRows
): number {
  const count = currentFavorites(offers, favorites).length;
  return Math.max(
    1,
    Math.ceil(
      (count +
        (new Set(offers.map((offer) => offer.id)).size > count ? 1 : 0)) /
        hotbarRows(rows)
    )
  );
}
export interface FavoritePage<T> {
  visible: readonly T[];
  cells: readonly (T | null)[];
  favoriteIds: readonly string[];
  page: number;
  pages: number;
  normalStart: number;
  capacity: number;
  columns: number;
  slots: number;
}
/** Full final windows overlap the previous tail; favorites repeat, never duplicate.
 * If measured width is too small, the renderer must provide horizontal overflow,
 * not silently discard favorites or force a different number of rows. */
export function favoritePage<T extends { id: string }>(
  offers: readonly T[],
  requestedFavorites: readonly string[],
  availableColumns: number,
  rows: HotbarRows,
  requestedPage: number
): FavoritePage<T> {
  const favoriteIds = currentFavorites(offers, requestedFavorites);
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  const pinned = favoriteIds.map((id) => byId.get(id)!);
  const normal = [...byId.values()].filter(
    (offer) => !favoriteIds.includes(offer.id)
  );
  const height = hotbarRows(rows);
  const measuredColumns = Number.isFinite(availableColumns)
    ? Math.max(1, Math.floor(availableColumns))
    : 1;
  const capacity = Math.max(
    measuredColumns * height,
    pinned.length + (normal.length ? 1 : 0),
    1
  );
  const normalCapacity = Math.max(1, capacity - pinned.length);
  const pages = Math.max(1, Math.ceil(normal.length / normalCapacity));
  const page = Math.max(
    0,
    Math.min(
      pages - 1,
      Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0
    )
  );
  const normalStart = Math.min(
    page * normalCapacity,
    Math.max(0, normal.length - normalCapacity)
  );
  const visible = [
    ...pinned,
    ...normal.slice(normalStart, normalStart + normalCapacity),
  ];
  const columns = Math.max(1, Math.ceil(visible.length / height));
  const cells: (T | null)[] = [];
  let offset = 0;
  if (visible.length) {
    for (let row = 0; row < height; row++) {
      const count =
        Math.floor(visible.length / height) +
        (row < visible.length % height ? 1 : 0);
      cells.push(
        ...visible.slice(offset, offset + count),
        ...Array<null>(columns - count).fill(null)
      );
      offset += count;
    }
  }
  return {
    visible,
    cells,
    favoriteIds,
    page,
    pages,
    normalStart,
    capacity,
    columns,
    slots: visible.length ? columns * height : 0,
  };
}
