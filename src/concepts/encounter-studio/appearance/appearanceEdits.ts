import type { ArrangeDraft } from '../StudioArrangeFields';
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

/** Validate against current provider/owner data, then return only an owner patch.
 * The supplied sheet binds selection identity, not permission to use stale choices. */
export function appearanceEditPatch(input: AppearanceEditInput): ArrangeDraft {
  const { selection, draft, edit } = input;
  if (input.sheet.selectionKey !== appearanceSelectionKey(selection))
    throw Error('Appearance selection is stale. Select the owner again.');
  const fresh = buildAppearanceSheet(input);
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
    !field.choices.some((row) => row.value === edit.value)
  )
    throw Error('Appearance choice is unavailable for this field and target.');

  switch (edit.kind) {
    case 'npc-family':
    case 'npc-style':
    case 'npc-skin':
      if (selection.kind !== 'actor')
        throw Error('NPC appearance requires a creature selection.');
      return { appearanceRef: edit.value };
    case 'asset':
      if (selection.kind !== 'wall')
        throw Error('Asset replacement requires its wall owner.');
      return { assetRef: edit.value };
    case 'wall-finish':
      if (selection.kind !== 'wall')
        throw Error('Wall finish requires a wall selection.');
      return edit.side === 'both'
        ? { finishA: edit.value, finishB: edit.value }
        : edit.side === 'positive-z'
          ? { finishA: edit.value }
          : { finishB: edit.value };
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
      return { materialOverrides };
    }
  }
}
