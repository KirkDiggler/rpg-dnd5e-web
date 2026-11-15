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

/** At most half the workspace, so the map keeps the larger half. */
export function inspectorMaxWidth(workspaceWidth: number): number {
  return Math.max(INSPECTOR_MIN_WIDTH, Math.floor(workspaceWidth / 2));
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
