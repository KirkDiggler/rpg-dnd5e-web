/**
 * inlineVerbs — the round-5 "verbs inline by default" layout helpers,
 * promoted from the /concepts ComfortBar in #525 slice 2 (one seam, no
 * drift — same move as organizeVerbs in slice 1).
 *
 * Kirk (round 5): the real viewport floor is 1024×768 and typical play is
 * larger — ALL core verbs plus class features render inline (features as
 * labeled groups; the pool-shape cost badges carry the cost story). The
 * drop-down survives ONLY as automatic overflow when the estimated inline
 * width would wrap beyond two lines at the measured row width — width-
 * based, never a fixed count.
 */

import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { OrganizedVerbs, VerbGroup } from './organizeVerbs';

export interface InlineVerbLayout {
  /** Flat core verbs plus organizeVerbs' "__core" overflow, reunited. */
  inlineCore: AvailableAction[];
  /** Provenance groups (features/spells/items) as labeled inline segments. */
  featureGroups: VerbGroup[];
}

/** Reunite organizeVerbs' core overflow with the flat core and expose the
 * provenance groups for inline rendering. */
export function splitInlineVerbs(organized: OrganizedVerbs): InlineVerbLayout {
  const coreOverflow = organized.groups.find((g) => g.id === '__core');
  const inlineCore = coreOverflow
    ? [...organized.core, ...coreOverflow.actions]
    : [...organized.core];
  const featureGroups = organized.groups.filter((g) => g.id !== '__core');
  return { inlineCore, featureGroups };
}

/**
 * Honest-enough width estimate for the verb row: per-button chrome plus
 * per-character label width at the active scale. Used ONLY to decide when
 * the inline layout would wrap beyond two lines — the actual layout is
 * plain flex-wrap, so a few px of estimation error just moves the wrap
 * point, never clips content. Always ≥ the End Turn reserve (150), so the
 * collapse ratio is division-safe for any menu.
 */
export function estimateVerbRowWidth(
  inline: AvailableAction[],
  featureGroups: VerbGroup[],
  big: boolean
): number {
  const chrome = big ? 92 : 82; // padding + icon + badge + border + gap
  const perChar = big ? 8.6 : 7.8;
  const verb = (a: AvailableAction) => chrome + a.displayName.length * perChar;
  const inlineW = inline.reduce((w, a) => w + verb(a), 0);
  const groupsW = featureGroups.reduce(
    (w, g) =>
      w + 28 + g.label.length * 7 + g.actions.reduce((x, a) => x + verb(a), 0),
    0
  );
  const endTurnW = 150;
  return inlineW + groupsW + endTurnW;
}

/** The shared collapse rule: fold to the drop-down only when the estimated
 * inline width would wrap beyond two lines at the measured row width. A
 * null width (row not yet measured, or no ResizeObserver in the test env)
 * stays inline — content is never hidden by a missing measurement. */
export function shouldCollapse(
  estimated: number,
  rowWidth: number | null
): boolean {
  return rowWidth !== null && rowWidth > 0 && estimated / rowWidth > 2;
}
