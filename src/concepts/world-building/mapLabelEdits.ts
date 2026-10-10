import type { RoomDraft } from './roomDraft';
import { validateMapLabels } from './serialization';
import type { MapLabel, WorldPoint } from './types';

function withLabels(draft: RoomDraft, labels: MapLabel[]): RoomDraft {
  const valid = validateMapLabels(labels, { workspace: draft.workspace });
  const scene = {
    ...draft.scene,
    version:
      draft.scene.version === 4
        ? (4 as const)
        : draft.scene.version === 3
          ? (3 as const)
          : (2 as const),
  };
  if (valid.length > 0) scene.mapLabels = valid;
  else delete scene.mapLabels;
  return { ...draft, scene };
}
/** Identity comes from the document owner, never from a model-side factory. */
export function createMapLabel(
  draft: RoomDraft,
  id: string,
  text: string,
  location: WorldPoint
): RoomDraft {
  return withLabels(draft, [
    ...(draft.scene.mapLabels ?? []),
    { id, text, location: { ...location } },
  ]);
}
export function moveMapLabel(
  draft: RoomDraft,
  id: string,
  location: WorldPoint
): RoomDraft {
  const label = draft.scene.mapLabels?.find((label) => label.id === id);
  if (
    !label ||
    (label.location.x === location.x && label.location.z === location.z)
  )
    return draft;
  return withLabels(
    draft,
    draft.scene.mapLabels!.map((label) =>
      label.id === id ? { ...label, location: { ...location } } : label
    )
  );
}
export function renameMapLabel(
  draft: RoomDraft,
  id: string,
  text: string
): RoomDraft {
  const label = draft.scene.mapLabels?.find((label) => label.id === id);
  if (!label) return draft;
  // Validate before testing normalized equality (oversized raw input must still refuse).
  const next = withLabels(
    draft,
    draft.scene.mapLabels!.map((label) =>
      label.id === id ? { ...label, text } : label
    )
  );
  return next.scene.mapLabels?.find((label) => label.id === id)?.text ===
    label.text
    ? draft
    : next;
}
export function deleteMapLabel(draft: RoomDraft, id: string): RoomDraft {
  if (!draft.scene.mapLabels?.some((label) => label.id === id)) return draft;
  if (draft.scene.authoringRegions?.some((region) => region.labelId === id))
    throw new Error(
      'Linked room labels require explicit region-and-label deletion.'
    );
  return withLabels(
    draft,
    draft.scene.mapLabels.filter((label) => label.id !== id)
  );
}
