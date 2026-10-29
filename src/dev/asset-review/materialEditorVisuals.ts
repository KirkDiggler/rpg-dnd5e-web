import {
  batchDefinitionForSlot,
  findQueueEntry,
  type BatchDocument,
} from './materialBatch';
import type { SlotVisualState } from './MaterialEditorScene';
import {
  channelsOfDefinition,
  inventoryUrl,
  resolvedSlotChannels,
  slotKey,
  type EditingProfile,
  type MaterialEditorManifest,
} from './materialRecipe';

/** One channel/URL resolution path for the simple viewer and advanced workbench. */
export function sceneSlots(
  manifest: MaterialEditorManifest,
  profile: EditingProfile,
  batchDoc: BatchDocument | undefined,
  sourceIndex: number
): Record<string, SlotVisualState> {
  const source = manifest.editor.sources[sourceIndex],
    result: Record<string, SlotVisualState> = {};
  if (!source) return result;
  const queued = batchDoc
    ? findQueueEntry(batchDoc, source.sourcePath)
    : undefined;
  for (const target of source.targets) {
    if (!target.rendered) continue;
    const channels =
      batchDoc && queued
        ? channelsOfDefinition(
            batchDefinitionForSlot(
              batchDoc,
              source.sourcePath,
              target.objectName,
              target.slot
            )
          )
        : resolvedSlotChannels(
            profile,
            manifest,
            source.sourcePath,
            target.objectName,
            target.slot
          ).channels;
    result[slotKey(source.sourcePath, target.objectName, target.slot)] = {
      channels,
      urls: {
        baseColor: channels.baseColor
          ? inventoryUrl(manifest, channels.baseColor.path)
          : null,
        normal: channels.normal
          ? inventoryUrl(manifest, channels.normal.path)
          : null,
        emissive: channels.emissive?.image
          ? inventoryUrl(manifest, channels.emissive.image.path)
          : null,
      },
    };
  }
  return result;
}
