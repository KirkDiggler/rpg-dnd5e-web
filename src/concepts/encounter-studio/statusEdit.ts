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

/** An id for a new status made from the text typed: lower-case letters and
 * digits, runs of anything else become one `-`, then `-2`, `-3`, ... until
 * it is not in `taken`. The engine says what an id may be; this only makes
 * one that fits. */
export function statusIdFrom(text: string, taken: readonly string[]): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'status';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The scope with one new status last, creating `statuses` when the file has
 * none. Throws for a taken id, or when `statuses` is not a set of statuses. */
export function addStatus(
  scope: Readonly<SiteScope>,
  id: string,
  status: Record<string, unknown>
): SiteScope {
  const statuses = scope.unread?.statuses;
  if (statuses !== undefined && !isSet(statuses))
    throw new Error('statuses: is not written as a set of statuses');
  if (statuses && Object.hasOwn(statuses, id))
    throw new Error(
      `statuses.${id}: this site already has a status with that id`
    );
  return {
    ...scope,
    unread: { ...scope.unread, statuses: { ...statuses, [id]: status } },
  };
}

/** The scope without one authored status; when it was the last, without the
 * `statuses` key. Throws for an id the file does not author. */
export function removeStatus(
  scope: Readonly<SiteScope>,
  id: string
): SiteScope {
  const statuses = scope.unread?.statuses;
  if (!isSet(statuses))
    throw new Error('statuses: is not written as a set of statuses');
  if (!Object.hasOwn(statuses, id))
    throw new Error(`statuses.${id}: this site authors no such status`);
  const rest = { ...statuses };
  delete rest[id];
  const others = { ...scope.unread };
  delete others.statuses;
  return {
    ...scope,
    unread:
      Object.keys(rest).length === 0
        ? others
        : { ...scope.unread, statuses: rest },
  };
}
