import { copyMaterialChannelAdjustments } from '@/rendering/materialChannelAdjustments';
import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import { carryUnknownKeys, objectShape } from './strictShape';

/** Native validation retains future authored metadata at both row and channel
 * boundaries. Captured copies deliberately retain only the shared known facts. */
export function validateMaterialChannels(
  value: unknown,
  path: string
): MaterialChannelAdjustment[] {
  const known = copyMaterialChannelAdjustments(value, path);
  const rows = value as unknown[];
  return known.map((entry, index) => {
    const at = `${path}[${index}]`;
    const source = objectShape(rows[index], at);
    for (const channel of ['normal', 'emissive'] as const) {
      const adjustment = entry[channel];
      if (adjustment)
        carryUnknownKeys(
          objectShape(source[channel], `${at}.${channel}`),
          ['mode', 'multiplier'],
          adjustment
        );
    }
    return carryUnknownKeys(source, ['targetId', 'normal', 'emissive'], entry);
  });
}
