/**
 * ONE STATUS, SET WHOLE (rpg-project#1220). `statuses` is a root key the
 * studio carries unread; this writes one status of it and keeps every other
 * status, the order and every other root key as written.
 */
import type { SiteScope } from '../world-building/siteScope';

const isSet = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The scope with one authored status replaced. Throws when `statuses` is not
 * a set of statuses, or the id is not authored, or its block is not a set of
 * words. */
export function setStatus(
  scope: Readonly<SiteScope>,
  id: string,
  status: Record<string, unknown>
): SiteScope {
  const statuses = scope.unread?.statuses;
  if (!isSet(statuses))
    throw new Error('statuses: is not written as a set of statuses');
  if (!Object.hasOwn(statuses, id))
    throw new Error(`statuses.${id}: this site authors no such status`);
  if (!isSet(statuses[id]))
    throw new Error(`statuses.${id}: is not written as a set of words`);
  return {
    ...scope,
    unread: {
      ...scope.unread,
      statuses: { ...statuses, [id]: status },
    },
  };
}
