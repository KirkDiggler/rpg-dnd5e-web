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

/** The bundle whose rows are being edited, and the parameters it declares
 * (rpg-project#670): inside it, every scalar a row carries may instead be a
 * `$name` naming one of them. Absent outside a bundle, where no row may. */
export interface BundleParams {
  readonly bundle: string;
  readonly params: readonly string[];
}

export const BundleParamsContext = createContext<BundleParams | undefined>(
  undefined
);
