import { thumbForRef } from '@/author/paletteData';
import {
  PROP_KEYS,
  resolvePropVariant,
  type PropRole,
  type PropVariant,
} from '@/components/hex-grid/propManifest';
import {
  GENERATED_WORLD_ASSETS,
  type GeneratedWorldAsset,
} from '@/generated/worldAssetCatalog';
import { refLabel } from '@/utils/refs';

interface WorldBuildingCatalogEntryBase {
  ref: string;
  label: string;
  thumbnail?: string;
  supportsDecoration: boolean;
}

export interface LegacyWorldBuildingCatalogEntry extends WorldBuildingCatalogEntryBase {
  source: 'legacy';
  role: PropRole;
  variant: PropVariant;
}

export interface GeneratedWorldBuildingCatalogEntry extends WorldBuildingCatalogEntryBase {
  source: 'generated';
  category: GeneratedWorldAsset['category'];
  asset: GeneratedWorldAsset;
}

export type WorldBuildingCatalogEntry =
  | LegacyWorldBuildingCatalogEntry
  | GeneratedWorldBuildingCatalogEntry;

const SUPPORT_REFS = new Set([
  'dnd5e:props:torture-table',
  'dnd5e:props:skeleton-table',
  'dnd5e:props:altar',
  'dnd5e:props:tomb',
  'dnd5e:props:tomb-open',
  'dnd5e:props:crate',
  'dnd5e:props:barrel',
  'dnd5e:props:chest',
]);

const FIRST_CASE_REFS = [
  'dnd5e:props:torture-table',
  'dnd5e:props:candles',
  'dnd5e:props:books',
  'dnd5e:props:vase',
  'dnd5e:props:rug',
];

/** Title Case over the shared reading rule — `refLabel` decides where the
 * words are, this only capitalizes them. */
const labelOf = (ref: string) =>
  refLabel(ref)
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const legacyEntries: LegacyWorldBuildingCatalogEntry[] = Object.keys(PROP_KEYS)
  .flatMap((ref) => {
    const variant = resolvePropVariant(ref);
    return variant
      ? [
          {
            source: 'legacy' as const,
            ref,
            label: labelOf(ref),
            role: variant.role,
            variant,
            thumbnail: thumbForRef(ref),
            supportsDecoration: SUPPORT_REFS.has(ref),
          },
        ]
      : [];
  })
  .sort((left, right) => {
    const leftPriority = FIRST_CASE_REFS.indexOf(left.ref);
    const rightPriority = FIRST_CASE_REFS.indexOf(right.ref);
    if (leftPriority >= 0 || rightPriority >= 0) {
      if (leftPriority < 0) return 1;
      if (rightPriority < 0) return -1;
      return leftPriority - rightPriority;
    }
    return left.label.localeCompare(right.label);
  });

const legacyRefs = new Set(legacyEntries.map((entry) => entry.ref));
const generatedEntries: GeneratedWorldBuildingCatalogEntry[] = Object.values(
  GENERATED_WORLD_ASSETS
)
  .filter((asset) => !legacyRefs.has(asset.ref))
  .map((asset) => ({
    source: 'generated',
    ref: asset.ref,
    label: asset.displayName,
    category: asset.category,
    asset,
    // This is provider-authored data. Do not infer support behavior from a
    // category, label, tag, or measured dimensions.
    supportsDecoration: asset.supportsDecoration,
  }));

/** Legacy ordering stays byte-for-byte stable; generated exact assets append
 * once in the deterministic order emitted by the generator. */
export const WORLD_BUILDING_CATALOG: WorldBuildingCatalogEntry[] = [
  ...legacyEntries,
  ...generatedEntries,
];

export const WORLD_BUILDING_CATALOG_BY_REF = new Map(
  WORLD_BUILDING_CATALOG.map((entry) => [entry.ref, entry])
);
