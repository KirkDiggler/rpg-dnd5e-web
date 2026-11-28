import { copyMaterialChannelAdjustments } from '@/rendering/materialChannelAdjustments';
import type {
  ChannelAdjustment,
  MaterialChannelAdjustment,
} from '@/rendering/materialChannelTypes';
import type {
  ChannelAdjustment as WireChannel,
  MaterialChannelAdjustment as WireTarget,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/material/v1alpha1/types_pb';

function channelFromProto(
  channel: WireChannel,
  path: string
): ChannelAdjustment {
  if (!channel || typeof channel !== 'object' || !channel.value)
    throw Error(`${path}: present channel requires a value.`);
  const value = channel.value;
  if (value.case === 'multiplier')
    return { mode: 'scale', multiplier: value.value };
  if (
    value.case === 'off' &&
    value.value &&
    typeof value.value === 'object' &&
    !Array.isArray(value.value)
  )
    return { mode: 'off' };
  throw Error(`${path}: present channel must select Off or a multiplier.`);
}

/** Shared wire leaf for static and observed owners. Absence alone is default;
 * present empty/invalid oneofs refuse, and no source or parent lookup occurs. */
export function materialChannelsFromProto(
  values: readonly WireTarget[] | undefined,
  path = 'materialChannels'
): MaterialChannelAdjustment[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw Error(`${path}: expected a list.`);
  return copyMaterialChannelAdjustments(
    Array.from(values, (row, index) => {
      const at = `${path}[${index}]`;
      if (!row || typeof row !== 'object')
        throw Error(`${at}: expected a target record.`);
      return {
        targetId: row.targetId,
        ...(row.normal === undefined
          ? {}
          : { normal: channelFromProto(row.normal, `${at}.normal`) }),
        ...(row.emissive === undefined
          ? {}
          : { emissive: channelFromProto(row.emissive, `${at}.emissive`) }),
      };
    }),
    path
  );
}
