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
