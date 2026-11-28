import type { ChannelAdjustment } from '@/rendering/materialChannelTypes';
import { validateMaterialChannels } from '../../world-building/materialChannels';
import { carryUnknownKeys } from '../../world-building/strictShape';
import type { ArrangeDraft } from '../StudioArrangeFields';
import { appearanceChannelValues } from './appearanceChannelFields';
import { buildAppearanceSheet } from './appearanceSheet';
import {
  appearanceSelectionKey,
  type AppearanceEdit,
  type AppearanceSheet,
  type AppearanceSheetInput,
} from './appearanceTypes';

export interface AppearanceEditInput extends AppearanceSheetInput {
  readonly sheet: AppearanceSheet;
  readonly edit: AppearanceEdit;
}

function channelPatch(
  input: AppearanceEditInput,
  sheet: AppearanceSheet
): ArrangeDraft {
  const edit = input.edit;
  if (edit.kind !== 'channel-adjustment') throw Error('Expected channel edit.');
  const field = sheet.fields.find(
    (field) =>
      field.kind === 'channel-adjustment' &&
      field.targetId === edit.targetId &&
      field.channel === edit.channel
  );
  if (!field || field.kind !== 'channel-adjustment')
    throw Error('Channel target is unavailable for this owner.');
  const rows = validateMaterialChannels(
    appearanceChannelValues(input),
    'materialChannels'
  );
  const existing = rows.find((row) => row.targetId === edit.targetId);
  if (edit.mode === 'default') {
    if (!existing?.[edit.channel]) return {};
    delete existing[edit.channel];
    return {
      materialChannels: rows.filter((row) => row.normal || row.emissive),
    };
  }
  if (field.unavailable) throw Error(field.unavailable);
  if (field.capability?.kind !== 'adjustable')
    throw Error('This source channel is fixed or not adjustable.');
  const capability = field.capability;
  if (
    edit.mode === 'scale' &&
    (!Number.isFinite(edit.multiplier) ||
      edit.multiplier <= 0 ||
      edit.multiplier < capability.minMultiplier ||
      edit.multiplier > capability.maxMultiplier)
  )
    throw Error(
      'Channel strength must be finite, positive and within the supported range.'
    );
  const adjustment: ChannelAdjustment =
    edit.mode === 'off'
      ? { mode: 'off' }
      : { mode: 'scale', multiplier: edit.multiplier };
  const prior = existing?.[edit.channel];
  if (prior)
    carryUnknownKeys(
      prior as unknown as Record<string, unknown>,
      ['mode', 'multiplier'],
      adjustment
    );
  const row = existing ?? { targetId: edit.targetId };
  row[edit.channel] = adjustment;
  if (!existing) rows.push(row);
  const patch = { materialChannels: rows };
  const after = buildAppearanceSheet({
    ...input,
    draft: { ...input.draft, ...patch },
  });
  const changed = after.fields.find(
    (field) =>
      field.kind === 'channel-adjustment' &&
      field.targetId === edit.targetId &&
      field.channel === edit.channel
  );
  if (
    changed?.kind === 'channel-adjustment' &&
    (changed.unavailable || changed.invalid)
  )
    throw Error(changed.unavailable ?? changed.invalid);
  return patch;
}

/** Complete-look changes cannot silently orphan retained channel intent. */
function checkedLookPatch(
  input: AppearanceEditInput,
  patch: ArrangeDraft
): ArrangeDraft {
  const after = buildAppearanceSheet({
    ...input,
    draft: { ...input.draft, ...patch },
  });
  for (const field of after.fields)
    if (
      field.kind === 'channel-adjustment' &&
      field.value &&
      (field.unavailable || field.invalid)
    )
      throw Error(field.unavailable ?? field.invalid);
  return patch;
}

/** Validate against current provider/owner data, then return only an owner patch.
 * The supplied sheet binds selection identity, not permission to use stale choices. */
export function appearanceEditPatch(input: AppearanceEditInput): ArrangeDraft {
  const { selection, draft, edit } = input;
  if (input.sheet.selectionKey !== appearanceSelectionKey(selection))
    throw Error('Appearance selection is stale. Select the owner again.');
  const fresh = buildAppearanceSheet(input);
  if (edit.kind === 'channel-adjustment') return channelPatch(input, fresh);
  const field = fresh.fields.find((row) => {
    if (row.kind !== edit.kind) return false;
    if (edit.kind === 'atlas-pack')
      return row.kind === 'atlas-pack' && row.surfaceId === edit.surfaceId;
    if (edit.kind === 'wall-finish')
      return row.kind === 'wall-finish' && row.side === edit.side;
    return true;
  });
  if (
    !field ||
    field.kind === 'channel' ||
    field.kind === 'channel-adjustment' ||
    !field.choices.some((row) => row.value === edit.value)
  )
    throw Error('Appearance choice is unavailable for this field and target.');

  switch (edit.kind) {
    case 'npc-family':
    case 'npc-style':
    case 'npc-skin':
      if (selection.kind !== 'actor')
        throw Error('NPC appearance requires a creature selection.');
      return checkedLookPatch(input, { appearanceRef: edit.value });
    case 'asset':
      if (selection.kind !== 'wall')
        throw Error('Asset replacement requires its wall owner.');
      return checkedLookPatch(input, { assetRef: edit.value });
    case 'wall-finish':
      if (selection.kind !== 'wall')
        throw Error('Wall finish requires a wall selection.');
      return checkedLookPatch(
        input,
        edit.side === 'both'
          ? { finishA: edit.value, finishB: edit.value }
          : edit.side === 'positive-z'
            ? { finishA: edit.value }
            : { finishB: edit.value }
      );
    case 'atlas-pack': {
      const owner =
        selection.kind === 'wall'
          ? selection.appearance
          : selection.kind === 'scene' && selection.rootCount === 1
            ? input.scene.items.find((row) => row.id === selection.rootIds[0])
            : undefined;
      if (!owner)
        throw Error('Texture pack requires one existing appearance owner.');
      const current = draft.materialOverrides ?? owner.materialOverrides ?? [];
      let found = false;
      const materialOverrides = current.flatMap((row) => {
        if (row.surfaceId !== edit.surfaceId) return [structuredClone(row)];
        found = true;
        return edit.value
          ? [{ ...structuredClone(row), materialRef: edit.value }]
          : [];
      });
      if (!found && edit.value)
        materialOverrides.push({
          surfaceId: edit.surfaceId,
          materialRef: edit.value,
        });
      return checkedLookPatch(input, { materialOverrides });
    }
  }
}
