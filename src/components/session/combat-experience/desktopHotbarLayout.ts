import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { OrganizedActionSection } from './organizedActionPresentation';

export type DesktopHotbarSection = 'quick' | OrganizedActionSection;
export type HotbarRows = 1 | 2 | 3 | 4;
export interface DesktopHotbarLayout {
  rows: HotbarRows;
  /** Preview-session selectors only, not durable production action identity. */
  orderBySection: Partial<Record<DesktopHotbarSection, readonly string[]>>;
}
export interface DesktopHotbarCustomization {
  layout: DesktopHotbarLayout;
  onChange: (layout: DesktopHotbarLayout) => void;
}
export const DEFAULT_HOTBAR_LAYOUT: DesktopHotbarLayout = {
  rows: 1,
  orderBySection: {},
};
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
      (Math.max(0, width) + HOTBAR_ICON_GAP) /
        (HOTBAR_ICON_SIZE + HOTBAR_ICON_GAP)
    )
  );
}
/** Membership and availability are untouched. Unknown/duplicate hints cannot mint slots. */
export function orderHotbarOffers(
  offers: readonly Declaration[],
  order: readonly string[] = []
): Declaration[] {
  const remaining = new Map(offers.map((offer) => [offer.id, offer]));
  const result: Declaration[] = [];
  for (const id of order) {
    const offer = remaining.get(id);
    if (offer) {
      result.push(offer);
      remaining.delete(id);
    }
  }
  return [...result, ...remaining.values()];
}
/** Both source and destination must belong to this current section. */
export function moveHotbarOffer(
  ids: readonly string[],
  source: string,
  target: string
): string[] {
  const from = ids.indexOf(source);
  const to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const result = [...ids];
  result.splice(from, 1);
  result.splice(to, 0, source);
  return result;
}
export function hotbarPage(
  total: number,
  columns: number,
  rows: HotbarRows,
  requested: number
): { page: number; pages: number; capacity: number; start: number } {
  const capacity = Math.max(1, columns) * hotbarRows(rows);
  const pages = Math.max(1, Math.ceil(total / capacity));
  const page = Math.max(
    0,
    Math.min(pages - 1, Number.isFinite(requested) ? Math.floor(requested) : 0)
  );
  return { page, pages, capacity, start: page * capacity };
}
