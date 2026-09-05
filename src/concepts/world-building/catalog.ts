import { thumbForRef } from '@/author/paletteData';
import {
  PROP_KEYS,
  resolvePropVariant,
  type PropRole,
  type PropVariant,
} from '@/components/hex-grid/propManifest';

export interface WorldBuildingCatalogEntry {
  ref: string;
  label: string;
  role: PropRole;
  variant: PropVariant;
  thumbnail?: string;
  /** Provisional authoring hint: this real mesh is useful as a support when
   * the pointer ray hits an upward-facing surface. */
  supportsDecoration: boolean;
}

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

const labelOf = (ref: string) =>
  (ref.split(':').pop() ?? ref)
    .split('-')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

export const WORLD_BUILDING_CATALOG: WorldBuildingCatalogEntry[] = Object.keys(
  PROP_KEYS
)
  .flatMap((ref) => {
    const variant = resolvePropVariant(ref);
    return variant
      ? [
          {
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

export const WORLD_BUILDING_CATALOG_BY_REF = new Map(
  WORLD_BUILDING_CATALOG.map((entry) => [entry.ref, entry])
);
