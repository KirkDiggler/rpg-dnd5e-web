import { resolveNpcAppearance } from '@/generated/npcAppearanceCatalog';
import { copyMaterialChannelAdjustments } from '@/rendering/materialChannelAdjustments';
import type { MaterialChannelTreatment } from '@/rendering/materialChannelMaterials';
import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';

export type NpcAppearanceModelResolution =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'unavailable'; readonly appearanceRef: string }
  | {
      readonly kind: 'resolved';
      readonly appearanceRef: string;
      readonly url: string;
      readonly forwardOffset: number;
    };

/** Resolve through the existing NPC owner, not rules-derived models or URL guesses.
 * All consumed representations must retain the provider's verified identity. */
export function resolveNpcMaterialChannelTreatment(input: {
  appearanceRef?: string;
  url: string;
  downed?: boolean;
  catalog: WorldMaterialCatalog | null;
  adjustments: readonly MaterialChannelAdjustment[];
}): MaterialChannelTreatment | undefined {
  const adjustments = copyMaterialChannelAdjustments(input.adjustments);
  if (!adjustments.length) return undefined;
  const appearance = input.appearanceRef
    ? resolveNpcAppearance(input.appearanceRef)
    : undefined;
  if (!appearance)
    throw Error(
      'Material channels: explicit verified NPC appearance identity is required.'
    );
  const url = input.downed ? appearance.downedUrl : appearance.standingUrl;
  if (url !== input.url)
    throw Error(
      'Material channels: body URL differs from its appearance identity.'
    );
  const bindings =
    input.catalog?.channelBindings?.filter(
      (binding) => binding.assetRef === appearance.assetRef
    ) ?? [];
  for (const [representation, hash] of [
    ['standing', appearance.standingSha256],
    ['downed', appearance.downedSha256],
  ] as const) {
    const matches = bindings.filter(
      (binding) => binding.representation === representation
    );
    if (matches.length !== 1)
      throw Error(
        `Material channels: missing or ambiguous ${representation} binding.`
      );
    if (matches[0].glbSha256 !== hash)
      throw Error(`Material channels: stale ${representation} hash.`);
  }
  const representation = input.downed ? 'downed' : 'standing';
  return {
    assetRef: appearance.assetRef,
    representation,
    glbSha256: input.downed
      ? appearance.downedSha256
      : appearance.standingSha256,
    binding: bindings.find(
      (binding) => binding.representation === representation
    ),
    adjustments,
  };
}

/** An explicit unknown appearance never falls through to a rules-derived model. */
export function resolveNpcAppearanceModel(input: {
  readonly appearanceRef?: string;
  readonly downed?: boolean;
}): NpcAppearanceModelResolution {
  if (input.appearanceRef === undefined || input.appearanceRef === '') {
    return { kind: 'legacy' };
  }
  const appearance = resolveNpcAppearance(input.appearanceRef);
  const offsets: Readonly<Record<string, number>> = {
    '+Z': 0,
    '-Z': Math.PI,
    '+X': -Math.PI / 2,
    '-X': Math.PI / 2,
  };
  const forwardOffset =
    appearance && Object.hasOwn(offsets, appearance.forwardAxis)
      ? offsets[appearance.forwardAxis]
      : undefined;
  return appearance && forwardOffset !== undefined
    ? {
        kind: 'resolved',
        appearanceRef: input.appearanceRef,
        url: input.downed ? appearance.downedUrl : appearance.standingUrl,
        forwardOffset,
      }
    : { kind: 'unavailable', appearanceRef: input.appearanceRef };
}
