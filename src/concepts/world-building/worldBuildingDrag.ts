export const WORLD_BUILDING_DRAG_MIME =
  'application/x-rpg-world-building-item+json';

export type WorldBuildingDragPayload =
  | { kind: 'prop'; id: string }
  | { kind: 'arrangement'; id: string };

interface DragTransferReader {
  getData(type: string): string;
}

interface DragTransferWriter extends DragTransferReader {
  effectAllowed: string;
  setData(type: string, value: string): void;
}

export function writeWorldBuildingDragPayload(
  transfer: DragTransferWriter,
  payload: WorldBuildingDragPayload
): void {
  transfer.effectAllowed = 'copy';
  transfer.setData(WORLD_BUILDING_DRAG_MIME, JSON.stringify(payload));
}

export function readWorldBuildingDragPayload(
  transfer: DragTransferReader | null
): WorldBuildingDragPayload | null {
  if (!transfer) return null;
  let value: unknown;
  try {
    const encoded = transfer.getData(WORLD_BUILDING_DRAG_MIME);
    if (!encoded) return null;
    value = JSON.parse(encoded);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2) return null;
  if (record.kind !== 'prop' && record.kind !== 'arrangement') return null;
  if (
    typeof record.id !== 'string' ||
    record.id.length < 1 ||
    record.id.length > 160
  ) {
    return null;
  }
  return { kind: record.kind, id: record.id };
}
