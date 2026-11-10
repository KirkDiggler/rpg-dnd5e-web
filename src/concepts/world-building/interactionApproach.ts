import type { SiteScope } from './siteScope';

/**
 * THE HAIL DISTANCE (rpg-project#923, Gate S3 of #769): an interaction's
 * `approach: { within: N }`, the one place a gate's hail distance is authored.
 * A carrier of the interaction who sees a character come within N cells
 * hails him; absent, the interaction never hails.
 *
 * The root `interactions:` map is carried, never interpreted (rpg-project#922
 * rides it on the scope's `unread`). This module reads and writes exactly one
 * key of it, `approach.within`, and leaves every other field of the
 * interaction — its recipe, any key a later build adds — as written. The
 * dungeonspec compiler stays the validator; the bound here is the authored
 * one the ruling sets, so the form refuses what the engine would.
 */

/** Speak reach in cells (`session.InteractionReach`): the hail is inside it,
 * so a hailed character can always answer from where he stopped. */
export const SPEAK_REACH_CELLS = 3;

const mapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The root interactions as written, or an empty map when the file has none. */
function interactionsOf(scope: Readonly<SiteScope>): Record<string, unknown> {
  const interactions = scope.unread?.interactions;
  return mapping(interactions) ? interactions : {};
}

/** The authored interaction ids, in the file's order. */
export function interactionIds(scope: Readonly<SiteScope>): string[] {
  return Object.keys(interactionsOf(scope));
}

/** The authored hail distance, or undefined when this interaction never
 * hails. A `within` that is not a number reads as written (the compiler
 * names it); the form only shows a number it can edit. */
export function interactionApproach(
  scope: Readonly<SiteScope>,
  id: string
): unknown {
  const interaction = interactionsOf(scope)[id];
  if (!mapping(interaction) || !mapping(interaction.approach)) return undefined;
  return interaction.approach.within;
}

/** The refusal for a distance the engine would not run, or null for one it
 * would. The sentence names the bound in cells. */
export function approachRefusal(within: number): string | null {
  if (!Number.isInteger(within) || within < 1 || within > SPEAK_REACH_CELLS)
    return `A hail distance is a whole number of cells from 1 to ${SPEAK_REACH_CELLS} (Speak reach).`;
  return null;
}

/**
 * The scope with one interaction's hail distance set, or removed when
 * `within` is null. Throws the refusal for a distance outside 1 to Speak
 * reach, and for an id the file does not author. Every other key of the
 * interaction, and of its `approach`, is kept as written.
 */
export function setInteractionApproach(
  scope: Readonly<SiteScope>,
  id: string,
  within: number | null
): SiteScope {
  const interactions = interactionsOf(scope);
  const interaction = interactions[id];
  if (!mapping(interaction))
    throw new Error(
      `interactions.${id}: this site authors no such interaction`
    );
  if (within !== null) {
    const refusal = approachRefusal(within);
    if (refusal)
      throw new Error(`interactions.${id}.approach.within: ${refusal}`);
  }
  const next: Record<string, unknown> = { ...interaction };
  const approach = mapping(interaction.approach)
    ? { ...interaction.approach }
    : {};
  if (within === null) {
    delete approach.within;
    if (Object.keys(approach).length === 0) delete next.approach;
    else next.approach = approach;
  } else {
    approach.within = within;
    next.approach = approach;
  }
  return {
    ...scope,
    unread: {
      ...scope.unread,
      interactions: { ...interactions, [id]: next },
    },
  };
}
