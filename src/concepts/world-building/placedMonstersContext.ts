/**
 * The monsters placed in the document, by id to the name the studio shows
 * them by, for every row editor below it (rpg-project#732): a `fell` row's
 * `who` names one of them (rpg-project#716), so the row editor offers them
 * wherever it is drawn — a root table, a faction, a creature, a bundle.
 * Provided once at the document's root (`WorldBuildingConcept`), beside the
 * bundles.
 *
 * WHICH PLACEMENTS COUNT IS THE ENGINE'S: only a monster can fall, and a
 * `who` naming anything else is refused at Save & Play (`grammar.whenWho`).
 * The editor offers the monsters and keeps a hand-written id it does not
 * know, so the author's bytes are never rewritten.
 */
import { createContext } from 'react';

export const PlacedMonstersContext = createContext<ReadonlyMap<string, string>>(
  new Map()
);
