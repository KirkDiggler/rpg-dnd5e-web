import type {
  ChannelAdjustment,
  MaterialChannelAdjustment,
} from './materialChannelTypes';

function recordAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`${path}: must be an object.`);
  return value as Record<string, unknown>;
}

function copyChannel(value: unknown, path: string): ChannelAdjustment {
  const row = recordAt(value, path);
  if (!Object.hasOwn(row, 'mode')) throw Error(`${path}.mode: is required.`);
  if (row.mode === 'off') {
    if (Object.hasOwn(row, 'multiplier'))
      throw Error(`${path}.multiplier: Off cannot carry a multiplier.`);
    return { mode: 'off' };
  }
  if (row.mode !== 'scale')
    throw Error(`${path}.mode: must be off or scale; omit default channels.`);
  if (
    !Object.hasOwn(row, 'multiplier') ||
    typeof row.multiplier !== 'number' ||
    !Number.isFinite(row.multiplier) ||
    row.multiplier <= 0
  )
    throw Error(`${path}.multiplier: must be finite and positive.`);
  return { mode: 'scale', multiplier: row.multiplier };
}

/** Validate and detach captured channel facts. This checks transport shape,
 * not provider eligibility/ranges. Native source metadata is retained by its
 * owning codec, never copied into the captured presentation value here. */
export function copyMaterialChannelAdjustments(
  value: unknown,
  path = 'materialChannels'
): MaterialChannelAdjustment[] {
  if (!Array.isArray(value)) throw Error(`${path}: must be a list.`);
  const seen = new Set<string>();
  return Array.from(value, (value, index) => {
    const at = `${path}[${index}]`;
    const row = recordAt(value, at);
    if (
      !Object.hasOwn(row, 'targetId') ||
      typeof row.targetId !== 'string' ||
      !row.targetId.trim()
    )
      throw Error(`${at}.targetId: must be a nonblank string.`);
    if (seen.has(row.targetId))
      throw Error(`${at}.targetId: duplicate material channel target.`);
    seen.add(row.targetId);
    const result: MaterialChannelAdjustment = { targetId: row.targetId };
    const hasNormal = Object.hasOwn(row, 'normal');
    const hasEmissive = Object.hasOwn(row, 'emissive');
    if (!hasNormal && !hasEmissive)
      throw Error(
        `${at}: must contain a channel adjustment; omit default rows.`
      );
    if (hasNormal) result.normal = copyChannel(row.normal, `${at}.normal`);
    if (hasEmissive)
      result.emissive = copyChannel(row.emissive, `${at}.emissive`);
    return result;
  });
}
