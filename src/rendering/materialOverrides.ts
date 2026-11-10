import type { MaterialOverride } from './worldMaterialTypes';

/** Copy only captured appearance identities, never proto bookkeeping or source
 * metadata. Validation checks transport shape, not catalogs or gameplay. */
export function copyMaterialOverrides(
  value: unknown,
  path = 'materialOverrides'
): MaterialOverride[] {
  if (!Array.isArray(value)) throw Error(`${path}: must be a list.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const at = `${path}[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw Error(`${at}: must be an object.`);
    const row = entry as Record<string, unknown>;
    if (typeof row.surfaceId !== 'string' || !row.surfaceId.trim())
      throw Error(`${at}.surfaceId: must be a nonblank string.`);
    if (typeof row.materialRef !== 'string' || !row.materialRef.trim())
      throw Error(`${at}.materialRef: must be a nonblank string.`);
    if (seen.has(row.surfaceId))
      throw Error(`${at}.surfaceId: duplicate material override target.`);
    seen.add(row.surfaceId);
    return { surfaceId: row.surfaceId, materialRef: row.materialRef };
  });
}
