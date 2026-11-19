/**
 * THE WATCH PANEL'S ROOM (rpg-project#1006, the operator's look: "that
 * sidebar is pretty cramped"). Its width is a per-viewer convenience kept
 * in the browser under its own key, as the inspector's is; never a document
 * field. A missing, unreadable or malformed record is the default.
 */
import type { KeyValueStorage } from '../world-building/types';

export const WATCH_WIDTH_STORAGE_KEY =
  'rpg.concepts.encounter-studio.watch-width.v1';

/** The default: 560 px, never past 40% of the window. */
export const WATCH_DEFAULT_WIDTH = 560;
export const WATCH_DEFAULT_SHARE = 0.4;
/** Narrower and the step controls wrap. */
export const WATCH_MIN_WIDTH = 360;
/** At most this share of the window: the map keeps the rest. */
export const WATCH_MAX_SHARE = 0.7;
/** One arrow press. */
export const WATCH_WIDTH_STEP = 16;

export function watchDefaultWidth(windowWidth: number): number {
  return Math.max(
    WATCH_MIN_WIDTH,
    Math.min(WATCH_DEFAULT_WIDTH, Math.floor(windowWidth * WATCH_DEFAULT_SHARE))
  );
}

export function watchMaxWidth(windowWidth: number): number {
  return Math.max(WATCH_MIN_WIDTH, Math.floor(windowWidth * WATCH_MAX_SHARE));
}

export function clampWatchWidth(width: number, windowWidth: number): number {
  return Math.round(
    Math.min(watchMaxWidth(windowWidth), Math.max(WATCH_MIN_WIDTH, width))
  );
}

export function readWatchWidth(storage: KeyValueStorage | null): number | null {
  try {
    const text = storage?.getItem(WATCH_WIDTH_STORAGE_KEY);
    if (!text || !/^\d+$/.test(text)) return null;
    return Number(text);
  } catch {
    return null;
  }
}

/** False when the store refused the write; the width still holds for this
 * visit. */
export function writeWatchWidth(
  storage: KeyValueStorage | null,
  width: number
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(WATCH_WIDTH_STORAGE_KEY, String(width));
    return true;
  } catch {
    return false;
  }
}

/** The browser's store, or null where reading it throws. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Below this scale a machine drawing is too small to read: it keeps its
 * size and scrolls instead. */
export const MACHINE_MIN_SCALE = 0.7;

/** How a machine drawing `drawing` px wide sits in `room` px: at its own
 * size, scaled down to fit, or at its own size with a scroll. An unknown
 * room (0) scrolls. */
export function machineFit(
  drawing: number,
  room: number
): 'natural' | 'fit' | 'scroll' {
  if (room <= 0) return 'scroll';
  if (drawing <= room) return 'natural';
  return room / drawing >= MACHINE_MIN_SCALE ? 'fit' : 'scroll';
}
