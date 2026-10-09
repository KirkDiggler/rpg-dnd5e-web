import {
  enclosureWitnessesEqual,
  validateAuthoringRegions,
  type AuthoringRegion,
} from './authoringRegions';
import { createMapLabel } from './mapLabelEdits';
import { findEnclosureAtPoint } from './regionBoundaryGeometry';
import type { RoomDraft, RoomHexCell } from './roomDraft';
import type { WorldPoint } from './types';

function requireRegion(draft: RoomDraft, id: string): AuthoringRegion {
  const region = draft.scene.authoringRegions?.find((r) => r.id === id);
  if (!region) throw new Error('Region target no longer exists.');
  return region;
}
function withRegions(draft: RoomDraft, regions: AuthoringRegion[]): RoomDraft {
  const scene = { ...draft.scene, version: 3 as const };
  // Whole-document cross-noun identities remain the owner validator's gate.
  const valid = validateAuthoringRegions(regions, scene.mapLabels ?? [], {
    workspace: draft.workspace,
    reservedIds: new Set([
      draft.id,
      scene.id,
      draft.room.implicitRegionId,
      ...scene.items.map((i) => i.id),
      ...scene.groups.map((g) => g.id),
      ...(draft.room.walls ?? []).flatMap((w) => [
        w.id,
        ...w.openings.flatMap((o) => [o.id, ...(o.door ? [o.door.id] : [])]),
      ]),
      ...draft.room.monsterDeclarations.map((m) => m.id),
    ]),
  });
  if (valid.length) scene.authoringRegions = valid;
  else delete scene.authoringRegions;
  return { ...draft, scene };
}
export function createRoomLabel(
  draft: RoomDraft,
  id: string,
  labelId: string,
  text: string,
  location: WorldPoint
): RoomDraft {
  const next = createMapLabel(draft, labelId, text, location);
  const candidate = findEnclosureAtPoint(next, location);
  return withRegions(next, [
    ...(next.scene.authoringRegions ?? []),
    {
      id,
      labelId,
      boundary: {
        kind: 'automatic',
        ...(candidate.status === 'resolved'
          ? { witness: candidate.witness }
          : {}),
      },
    },
  ]);
}
export function useEnclosingWalls(
  draft: RoomDraft,
  regionId: string
): RoomDraft {
  const region = requireRegion(draft, regionId);
  const label = draft.scene.mapLabels?.find((l) => l.id === region.labelId);
  if (!label) throw new Error('Linked room label no longer exists.');
  const candidate = findEnclosureAtPoint(draft, label.location);
  if (candidate.status !== 'resolved')
    throw new Error(`Cannot bind enclosure: ${candidate.reason}.`);
  if (
    region.boundary.kind === 'automatic' &&
    region.boundary.witness &&
    enclosureWitnessesEqual(region.boundary.witness, candidate.witness)
  )
    return draft;
  return withRegions(
    draft,
    draft.scene.authoringRegions!.map((r) =>
      r.id === regionId
        ? { ...r, boundary: { kind: 'automatic', witness: candidate.witness } }
        : r
    )
  );
}
export function setExplicitRegionArea(
  draft: RoomDraft,
  regionId: string,
  cells: readonly RoomHexCell[]
): RoomDraft {
  const region = requireRegion(draft, regionId);
  const keys = new Map<string, RoomHexCell>();
  for (const cell of cells) keys.set(`${cell.q},${cell.r}`, { ...cell });
  const ordered = [...keys.values()].sort((a, b) => a.q - b.q || a.r - b.r);
  // Validate before no-op comparison, including nonintegral/out-of-bounds input.
  const next = withRegions(
    draft,
    draft.scene.authoringRegions!.map((r) =>
      r.id === regionId
        ? { ...r, boundary: { kind: 'explicit', cells: ordered } }
        : r
    )
  );
  if (
    region.boundary.kind === 'explicit' &&
    JSON.stringify(
      [...region.boundary.cells].sort((a, b) => a.q - b.q || a.r - b.r)
    ) === JSON.stringify(ordered)
  )
    return draft;
  return next;
}
export function removeRegionAndLabel(
  draft: RoomDraft,
  regionId: string
): RoomDraft {
  const region = requireRegion(draft, regionId);
  const scene = { ...draft.scene };
  const labels = scene.mapLabels?.filter((l) => l.id !== region.labelId) ?? [];
  if (labels.length) scene.mapLabels = labels;
  else delete scene.mapLabels;
  return withRegions(
    { ...draft, scene },
    draft.scene.authoringRegions!.filter((r) => r.id !== regionId)
  );
}
