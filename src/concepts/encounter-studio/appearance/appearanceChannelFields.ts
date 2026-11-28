import { projectMasonryMaterialChannels } from '@/rendering/materialChannelProjection';
import type {
  ChannelAdjustment,
  MaterialChannelAdjustment,
  MaterialChannelBinding,
  MaterialChannelTarget,
} from '@/rendering/materialChannelTypes';
import { wallFinishFor } from '../../world-building/wallFinishEdits';
import type {
  AppearanceChannelAdjustmentField,
  AppearanceSheetInput,
} from './appearanceTypes';

function worldChannelOwner(input: AppearanceSheetInput) {
  const selection = input.selection;
  return selection.kind === 'wall'
    ? selection.appearance
    : selection.kind === 'scene' && selection.rootCount === 1
      ? input.scene.items.find((item) => item.id === selection.rootIds[0])
      : undefined;
}

/** Read the existing staged/native owner; no additional document or registry. */
export function appearanceChannelValues(
  input: AppearanceSheetInput
): readonly MaterialChannelAdjustment[] {
  if (input.draft.materialChannels !== undefined)
    return input.draft.materialChannels;
  if (input.selection.kind === 'actor')
    return input.selection.monster.materialChannels ?? [];
  return worldChannelOwner(input)?.materialChannels ?? [];
}

function identity(input: AppearanceSheetInput):
  | {
      assetRef: string;
      representations: readonly {
        representation: MaterialChannelBinding['representation'];
        hash: string;
      }[];
    }
  | undefined {
  if (input.selection.kind === 'actor') {
    const assetRef =
      input.draft.appearanceRef ?? input.selection.monster.appearanceRef ?? '';
    const look = input.npcFamilies
      .flatMap((family) => family.looks)
      .find((look) => look.assetRef === assetRef);
    return {
      assetRef,
      representations: look
        ? [
            { representation: 'standing', hash: look.standingSha256 },
            { representation: 'downed', hash: look.downedSha256 },
          ]
        : [],
    };
  }
  const owner = worldChannelOwner(input);
  if (!owner) return undefined;
  const assetRef =
    input.selection.kind === 'wall'
      ? (input.draft.assetRef ?? owner.assetRef)
      : owner.assetRef;
  const asset = Object.hasOwn(input.assets, assetRef)
    ? input.assets[assetRef]
    : undefined;
  return {
    assetRef,
    representations: asset
      ? [{ representation: 'model', hash: asset.glbSha256 }]
      : [],
  };
}

/** Different material names cannot share a primitive; same-name hierarchy
 * ambiguity is treated conservatively as affected, never guessed disjoint. */
function effectiveLookRefusal(
  input: AppearanceSheetInput,
  assetRef: string,
  target: MaterialChannelTarget,
  channel: 'normal' | 'emissive'
): string | undefined {
  const owner = worldChannelOwner(input);
  const overrides =
    input.draft.materialOverrides ?? owner?.materialOverrides ?? [];
  const atlas = input.catalog?.atlas;
  const binding = atlas?.bindings.find((entry) => entry.assetRef === assetRef);
  for (const override of overrides) {
    const surface = binding?.surfaces.find(
      (surface) => surface.id === override.surfaceId
    );
    if (!surface)
      return 'Selected complete-look scope is unavailable; reset or repair its channel intent.';
    if (
      !target.selectors.some(
        (selector) => selector.material === surface.material
      )
    )
      continue;
    const material = atlas?.materials.find(
      (material) => material.ref === override.materialRef
    );
    if (
      !material ||
      (channel === 'normal' ? !material.normal : !material.emissive)
    )
      return `Selected complete look has no supported ${channel} map for this target; reset the adjustment first.`;
  }
  if (input.selection.kind !== 'wall') return undefined;
  const saved = wallFinishFor(input.scene, input.selection.wall.id);
  const surfaces = input.catalog?.surfaces.find(
    (entry) => entry.assetRef === assetRef
  );
  for (const side of ['positive-z', 'negative-z'] as const) {
    const ref =
      (side === 'positive-z' ? input.draft.finishA : input.draft.finishB) ??
      saved?.[side];
    if (!ref) continue;
    const affected = surfaces?.bindings.filter(
      (surface) => surface.side === side
    );
    if (!affected?.length)
      return 'Selected wall finish scope is unavailable for channel validation.';
    if (
      !affected.some((surface) =>
        target.selectors.some(
          (selector) => selector.material === surface.material
        )
      )
    )
      continue;
    const material = input.catalog?.materials.find(
      (material) => material.ref === ref
    );
    if (
      !material ||
      channel === 'emissive' ||
      !material.normal ||
      !material.normalScale.some((value) => value !== 0)
    )
      return `Selected wall finish has no supported ${channel} map for this target; reset the adjustment first.`;
  }
  return undefined;
}

function projectionRefusal(
  input: AppearanceSheetInput,
  assetRef: string,
  targetId: string,
  channel: 'normal' | 'emissive',
  value: ChannelAdjustment
): string | undefined {
  if (input.selection.kind !== 'wall') return undefined;
  const source = input.assets[assetRef];
  if (!source) return undefined;
  const refs = [
    ...(input.selection.wall.appearance.sections ?? []).map(
      (section) => section.assetRef
    ),
    ...input.selection.wall.openings.flatMap((opening) =>
      opening.door ? [opening.door.assetRef] : []
    ),
  ];
  for (const ref of new Set(refs)) {
    const destination = input.assets[ref];
    if (!destination) continue;
    try {
      projectMasonryMaterialChannels({
        source,
        destination,
        catalog: input.catalog,
        values: [{ targetId, [channel]: value }],
      });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

export function appearanceChannelFields(
  input: AppearanceSheetInput
): AppearanceChannelAdjustmentField[] {
  const current = identity(input);
  if (!current) return [];
  const values = appearanceChannelValues(input);
  const declared =
    input.catalog?.channelBindings?.filter(
      (binding) => binding.assetRef === current.assetRef
    ) ?? [];
  const primary =
    declared.find(
      (binding) =>
        binding.representation === current.representations[0]?.representation
    ) ?? declared[0];
  let unavailable = !input.catalog
    ? 'Material channel catalog is unavailable.'
    : !current.representations.length
      ? 'Selected appearance has no verified channel representation.'
      : undefined;
  if (!unavailable)
    for (const expected of current.representations) {
      const matches = declared.filter(
        (binding) => binding.representation === expected.representation
      );
      if (matches.length !== 1) {
        unavailable = `Missing or ambiguous ${expected.representation} channel binding.`;
        break;
      }
      if (matches[0].glbSha256 !== expected.hash) {
        unavailable = 'Material channel geometry/hash is stale.';
        break;
      }
    }
  const targets = new Map(
    primary?.targets.map((target) => [target.id, target])
  );
  const ids = [
    ...new Set([...targets.keys(), ...values.map((value) => value.targetId)]),
  ];
  return ids.flatMap((targetId) =>
    (['normal', 'emissive'] as const).map((channel) => {
      const target = targets.get(targetId);
      const value = values.find((value) => value.targetId === targetId)?.[
        channel
      ];
      const capability = target?.[channel];
      let reason =
        unavailable ??
        (!target
          ? 'Saved channel target is unavailable.'
          : effectiveLookRefusal(input, current.assetRef, target, channel));
      if (!reason && value && capability?.kind !== 'adjustable')
        reason = `Saved ${channel} intent is not adjustable for this source; reset it explicitly.`;
      let invalid =
        !reason &&
        value?.mode === 'scale' &&
        capability?.kind === 'adjustable' &&
        (!Number.isFinite(value.multiplier) ||
          value.multiplier < capability.minMultiplier ||
          value.multiplier > capability.maxMultiplier)
          ? 'Saved channel strength is outside the supported range.'
          : undefined;
      if (!reason && !invalid && value)
        invalid = projectionRefusal(
          input,
          current.assetRef,
          targetId,
          channel,
          value
        );
      return {
        kind: 'channel-adjustment' as const,
        id: `channel:${targetId}:${channel}`,
        targetId,
        channel,
        label: `${target?.label ?? targetId} · ${channel === 'normal' ? 'Normal' : 'Emissive'}`,
        ...(capability ? { capability } : {}),
        ...(value ? { value } : {}),
        ...(reason ? { unavailable: reason } : {}),
        ...(invalid ? { invalid } : {}),
      };
    })
  );
}
