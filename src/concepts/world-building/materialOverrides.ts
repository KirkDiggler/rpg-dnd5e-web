import type { MaterialOverride } from '@/rendering/worldMaterialTypes';
import { carryUnknownKeys, objectShape } from './strictShape';

/** Native owner-list validation and copy-out; resources/compatibility belong
 * to the material catalog and renderer, not this source codec. */
export function validateMaterialOverrides(
  value: unknown,
  path: string
): MaterialOverride[] {
  if (!Array.isArray(value)) throw Error(`${path}: must be a list.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const at = `${path}[${index}]`;
    const row = objectShape(entry, at);
    if (typeof row.surfaceId !== 'string' || !row.surfaceId.trim())
      throw Error(`${at}.surfaceId: must be a nonblank string.`);
    if (typeof row.materialRef !== 'string' || !row.materialRef.trim())
      throw Error(`${at}.materialRef: must be a nonblank string.`);
    if (seen.has(row.surfaceId))
      throw Error(`${at}.surfaceId: duplicate material override target.`);
    seen.add(row.surfaceId);
    return carryUnknownKeys(row, ['surfaceId', 'materialRef'], {
      surfaceId: row.surfaceId,
      materialRef: row.materialRef,
    });
  });
}
