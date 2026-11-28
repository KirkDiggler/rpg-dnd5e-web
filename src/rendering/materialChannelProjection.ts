import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import { copyMaterialChannelAdjustments } from './materialChannelAdjustments';
import type {
  ChannelAdjustment,
  ChannelCapability,
  MaterialChannelAdjustment,
  MaterialChannelBinding,
  MaterialChannelTarget,
} from './materialChannelTypes';
import type { WorldMaterialCatalog } from './worldMaterialCatalog';

type Asset = Pick<
  GeneratedWorldAsset,
  'ref' | 'glbSha256' | 'surfaces' | 'roles'
>;
function bindingFor(
  asset: Asset,
  catalog: WorldMaterialCatalog | null
): MaterialChannelBinding | undefined {
  const rows =
    catalog?.channelBindings?.filter(
      (binding) =>
        binding.assetRef === asset.ref && binding.representation === 'model'
    ) ?? [];
  if (rows.length > 1)
    throw Error(`Material channels: ambiguous binding for ${asset.ref}.`);
  const binding = rows[0];
  if (binding && binding.glbSha256 !== asset.glbSha256)
    throw Error(`Material channels: stale geometry/hash for ${asset.ref}.`);
  return binding;
}
function families(
  asset: Asset,
  target: MaterialChannelTarget,
  available: ReadonlySet<string>
): Set<string> {
  const result = new Set<string>();
  for (const selector of target.selectors) {
    if (
      asset.roles?.some(
        (role) => role.role === 'leaf' && role.node === selector.node
      )
    )
      return new Set();
    const matches =
      asset.surfaces?.filter(
        (surface) =>
          surface.node === selector.node &&
          surface.material === selector.material &&
          available.has(surface.family)
      ) ?? [];
    if (!matches.length) return new Set();
    matches.forEach((surface) => result.add(surface.family));
  }
  return result;
}
function supports(
  capability: ChannelCapability,
  adjustment: ChannelAdjustment
): boolean {
  if (capability.kind !== 'adjustable') return false;
  const { minMultiplier: min, maxMultiplier: max } = capability;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    min > 1 ||
    max < 1
  )
    throw Error('Material channels: invalid projected capability range.');
  if (
    adjustment.mode === 'scale' &&
    (adjustment.multiplier < min || adjustment.multiplier > max)
  )
    throw Error(
      'Material channels: a compatible fixed target cannot retain this strength range.'
    );
  return true;
}

/** Follow the existing declared paired-masonry projection, not shared images or
 * guessed names. A recipient needs the same logical target id and compatible
 * fixed surface families; other inserted scopes remain untouched. */
export function projectMasonryMaterialChannels(input: {
  source: Asset;
  destination: Asset;
  values: readonly MaterialChannelAdjustment[] | undefined;
  catalog: WorldMaterialCatalog | null;
}): MaterialChannelAdjustment[] {
  const values = copyMaterialChannelAdjustments(input.values ?? []);
  if (!values.length) return [];
  const source = bindingFor(input.source, input.catalog);
  if (!source)
    throw Error(
      'Material channels: no verified source binding for masonry projection.'
    );
  const destination = bindingFor(input.destination, input.catalog);
  if (!destination) return [];
  const available = new Set(
    input.catalog?.materials.map((material) => material.family)
  );
  const projected: MaterialChannelAdjustment[] = [];
  for (const value of values) {
    const sourceTarget = source.targets.find(
      (target) => target.id === value.targetId
    );
    if (!sourceTarget)
      throw Error(
        `Material channels: unknown source target ${value.targetId}.`
      );
    const destinationTarget = destination.targets.find(
      (target) => target.id === value.targetId
    );
    if (!destinationTarget) continue;
    const sourceFamilies = families(input.source, sourceTarget, available);
    const destinationFamilies = families(
      input.destination,
      destinationTarget,
      sourceFamilies
    );
    if (!sourceFamilies.size || !destinationFamilies.size) continue;
    const row: MaterialChannelAdjustment = { targetId: destinationTarget.id };
    for (const channel of ['normal', 'emissive'] as const) {
      const adjustment = value[channel];
      if (!adjustment) continue;
      if (!supports(sourceTarget[channel], adjustment))
        throw Error(
          `Material channels: source ${channel} target is not adjustable.`
        );
      if (supports(destinationTarget[channel], adjustment))
        row[channel] = adjustment;
    }
    if (row.normal || row.emissive) projected.push(row);
  }
  return copyMaterialChannelAdjustments(projected);
}
