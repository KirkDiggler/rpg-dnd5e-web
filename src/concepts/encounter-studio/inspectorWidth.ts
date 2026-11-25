/**
 * THE INSPECTOR'S WIDTH (rpg-project#979): a per-viewer convenience kept in
 * the browser beside the local draft, under its own key. It is never a
 * document field: the downloaded file and the saved bytes do not change with
 * it, and it is not an edit. A missing, unreadable or malformed record is the
 * default.
 */
import type { KeyValueStorage } from '../world-building/types';

export const INSPECTOR_WIDTH_STORAGE_KEY =
  'rpg.concepts.encounter-studio.inspector-width.v1';

/** Today's width (24rem), the width before it could be set. */
export const INSPECTOR_DEFAULT_WIDTH = 384;
/** Near today's: narrower and the inspector's forms start to wrap. */
export const INSPECTOR_MIN_WIDTH = 320;
/** One arrow press. */
export const INSPECTOR_WIDTH_STEP = 16;

/** THE MAP'S FLOOR. The map beside a docked inspector keeps at least a
 * 320 px canvas plus the asides of the view showing, at their widest: Layout's
 * room list (220), 3D's palette (250) and scene tree (270). The Encounter
 * page, which has no map, keeps 320 beside the 320 canvas floor: 640 px. */
export const MAP_CANVAS_FLOOR = 320;
const VIEW_ASIDES = { layout: 220, '3d': 250 + 270, encounter: 320 } as const;
/** The map's right inset beyond the inspector: its margin and the gap. */
export const INSPECTOR_GUTTER = 24;

export type InspectorView = keyof typeof VIEW_ASIDES;

export function mapFloor(view: InspectorView): number {
  return VIEW_ASIDES[view] + MAP_CANVAS_FLOOR;
}

/** The inspector DOCKS (the map stops at its edge) only where the default
 * inspector and the map's floor fit side by side: Layout from 948 px, 3D
 * from 1248 px, the Encounter page from 1048 px. Narrower, it overlays the map as it always did. */
export function inspectorDocks(
  windowWidth: number,
  view: InspectorView
): boolean {
  return (
    windowWidth >= mapFloor(view) + INSPECTOR_DEFAULT_WIDTH + INSPECTOR_GUTTER
  );
}

/** At most half the window, so the map keeps the larger half; docked, also
 * never past the map's floor. */
export function inspectorMaxWidth(
  windowWidth: number,
  view: InspectorView
): number {
  const half = Math.floor(windowWidth / 2);
  const max = inspectorDocks(windowWidth, view)
    ? Math.min(half, windowWidth - mapFloor(view) - INSPECTOR_GUTTER)
    : half;
  return Math.max(INSPECTOR_MIN_WIDTH, max);
}

export function clampInspectorWidth(width: number, max: number): number {
  return Math.round(Math.min(max, Math.max(INSPECTOR_MIN_WIDTH, width)));
}

export function readInspectorWidth(storage: KeyValueStorage): number | null {
  try {
    const text = storage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
    if (!text || !/^\d+$/.test(text)) return null;
    return Number(text);
  } catch {
    return null;
  }
}

/** False when the store refused the write; the width still holds for this
 * visit. */
export function writeInspectorWidth(
  storage: KeyValueStorage,
  width: number
): boolean {
  try {
    storage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(width));
    return true;
  } catch {
    return false;
  }
}
