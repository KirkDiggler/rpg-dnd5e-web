/**
 * ONE CUSTOM ITEM, SET WHOLE (rpg-project#1201). `customItems` is a root key
 * the studio carries unread; this writes one item of it and keeps every
 * other item, the order and every other root key as written.
 */
import type { SiteScope } from '../world-building/siteScope';

/** The scope with one authored item replaced. Throws for an id the file
 * does not author. */
export function setCustomItem(
  scope: Readonly<SiteScope>,
  id: string,
  item: Record<string, unknown>
): SiteScope {
  const items = scope.unread?.customItems;
  if (
    items === null ||
    typeof items !== 'object' ||
    Array.isArray(items) ||
    !Object.hasOwn(items, id)
  )
    throw new Error(`customItems.${id}: this site authors no such item`);
  return {
    ...scope,
    unread: {
      ...scope.unread,
      customItems: { ...(items as Record<string, unknown>), [id]: item },
    },
  };
}

/** An id for a new item made from the text typed: lower-case letters and
 * digits, runs of anything else become one `-`, then `-2`, `-3`, ... until
 * it is not in `taken`. The engine says what an id may be; this only makes
 * one that fits. */
export function itemIdFrom(text: string, taken: readonly string[]): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const isSet = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The scope with one new item last, creating `customItems` when the file has
 * none. Throws for a taken id. */
export function addCustomItem(
  scope: Readonly<SiteScope>,
  id: string,
  item: Record<string, unknown>
): SiteScope {
  const items = scope.unread?.customItems;
  if (items !== undefined && !isSet(items))
    throw new Error('customItems: is not written as a set of items');
  if (items && Object.hasOwn(items, id))
    throw new Error(
      `customItems.${id}: this site already has an item with that id`
    );
  return {
    ...scope,
    unread: { ...scope.unread, customItems: { ...items, [id]: item } },
  };
}

/** The scope without one authored item; when it was the last, without the
 * `customItems` key. Throws for an id the file does not author. */
export function removeCustomItem(
  scope: Readonly<SiteScope>,
  id: string
): SiteScope {
  const items = scope.unread?.customItems;
  if (!isSet(items) || !Object.hasOwn(items, id))
    throw new Error(`customItems.${id}: this site authors no such item`);
  const rest = { ...items };
  delete rest[id];
  const others = { ...scope.unread };
  delete others.customItems;
  return {
    ...scope,
    unread:
      Object.keys(rest).length === 0
        ? others
        : { ...scope.unread, customItems: rest },
  };
}
