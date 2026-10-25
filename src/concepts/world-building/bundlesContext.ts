/**
 * The site's bundles, for every row editor below the document
 * (rpg-project#670): a `use:` row shows its bundle's rows, so it has to see
 * the bundles wherever it is drawn — a root table, a faction, a creature.
 * Provided once at the document's root (`WorldBuildingConcept`).
 */
import { createContext } from 'react';
import type { SiteBundles } from './siteScope';

export const SiteBundlesContext = createContext<SiteBundles | undefined>(
  undefined
);
