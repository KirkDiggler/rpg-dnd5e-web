import type { VisualAssetCatalog, VisualVariantSelection } from './types';

/**
 * Pure stable-default selector. Catalog array order is never an input to the
 * decision. V1 does not persist explicit variant identity, so an explicit id
 * is rejected until that separately approved contract exists.
 */
export function selectVisualVariant(
  catalog: VisualAssetCatalog,
  semanticRef: string,
  explicitVariantId?: string
): VisualVariantSelection {
  const family = catalog.families.find(
    (candidate) => candidate.semanticRef === semanticRef
  );
  if (!family) return { selected: false, reason: 'family-not-enrolled' };

  if (explicitVariantId !== undefined) {
    const explicit = catalog.entries.find(
      (candidate) => candidate.id === explicitVariantId
    );
    if (!explicit) {
      return { selected: false, reason: 'unknown-explicit-variant' };
    }
    if (explicit.semanticRef !== semanticRef) {
      return { selected: false, reason: 'foreign-explicit-variant' };
    }
    return { selected: false, reason: 'explicit-variant-unsupported' };
  }

  const selected = catalog.entries.find(
    (candidate) => candidate.id === family.defaultVariantId
  );
  if (!selected) return { selected: false, reason: 'missing-default' };
  if (selected.semanticRef !== semanticRef) {
    return { selected: false, reason: 'foreign-default' };
  }
  return { selected: true, entry: selected };
}
