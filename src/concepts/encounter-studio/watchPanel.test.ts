/**
 * THE WATCH PANEL'S ROOM (rpg-project#1006): its width kept in the browser,
 * clamped to the window, and how a machine drawing sits in it.
 */
import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../world-building/types';
import {
  clampWatchWidth,
  machineFit,
  readWatchWidth,
  WATCH_MIN_WIDTH,
  WATCH_WIDTH_STORAGE_KEY,
  watchDefaultWidth,
  writeWatchWidth,
} from './watchPanel';

const memory = (): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
};

describe('the watch panel’s width', () => {
  it('defaults to 560 px, never past 40% of the window', () => {
    expect(watchDefaultWidth(1910)).toBe(560);
    expect(watchDefaultWidth(1200)).toBe(480);
    expect(watchDefaultWidth(600)).toBe(WATCH_MIN_WIDTH);
  });

  it('is remembered, and read back', () => {
    const storage = memory();
    expect(writeWatchWidth(storage, 700)).toBe(true);
    expect(storage.data.get(WATCH_WIDTH_STORAGE_KEY)).toBe('700');
    expect(readWatchWidth(storage)).toBe(700);
  });

  it('a missing, malformed or unreadable record is the default', () => {
    const storage = memory();
    expect(readWatchWidth(storage)).toBeNull();
    storage.setItem(WATCH_WIDTH_STORAGE_KEY, 'wide');
    expect(readWatchWidth(storage)).toBeNull();
    storage.setItem(WATCH_WIDTH_STORAGE_KEY, '');
    expect(readWatchWidth(storage)).toBeNull();
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readWatchWidth(broken)).toBeNull();
    expect(writeWatchWidth(broken, 600)).toBe(false);
    expect(readWatchWidth(null)).toBeNull();
  });

  it('a resize stays between the floor and 70% of the window', () => {
    expect(clampWatchWidth(100, 1910)).toBe(WATCH_MIN_WIDTH);
    expect(clampWatchWidth(5000, 1910)).toBe(1337);
    expect(clampWatchWidth(700, 1910)).toBe(700);
  });
});

describe('a machine drawing in the panel', () => {
  it('keeps its size when it fits', () => {
    expect(machineFit(400, 500)).toBe('natural');
  });
  it('scales down to fit while it stays readable', () => {
    expect(machineFit(600, 500)).toBe('fit');
  });
  it('scrolls when fitting would make it too small to read', () => {
    expect(machineFit(1000, 500)).toBe('scroll');
    expect(machineFit(400, 0)).toBe('scroll');
  });
});
