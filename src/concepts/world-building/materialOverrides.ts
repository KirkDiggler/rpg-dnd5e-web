import { copyMaterialOverrides } from '@/rendering/materialOverrides';
import type { MaterialOverride } from '@/rendering/worldMaterialTypes';
import { carryUnknownKeys, objectShape } from './strictShape';

/** Native validation uses the shared identity shape, then retains future
 * authored metadata under the ordinary source round-trip contract. */
export function validateMaterialOverrides(
  value: unknown,
  path: string
): MaterialOverride[] {
  const known = copyMaterialOverrides(value, path);
  const rows = value as Record<string, unknown>[];
  return known.map((entry, index) =>
    carryUnknownKeys(
      objectShape(rows[index], `${path}[${index}]`),
      ['surfaceId', 'materialRef'],
      entry
    )
  );
}
