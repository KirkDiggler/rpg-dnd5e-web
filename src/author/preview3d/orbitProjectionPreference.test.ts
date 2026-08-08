import { describe, expect, it } from 'vitest';
import {
  ORBIT_ORTHO_STORAGE_KEY,
  readOrbitOrthographicPreference,
  writeOrbitOrthographicPreference,
} from './orbitProjectionPreference';

/** Minimal in-memory stand-in for the one `Storage` surface each function
 * actually touches — no need to fake a real `localStorage`. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    dump: () => Object.fromEntries(map),
  };
}

describe('readOrbitOrthographicPreference', () => {
  it('defaults to false (perspective) when storage is undefined — SSR/no-Storage-environment safety', () => {
    expect(readOrbitOrthographicPreference(undefined)).toBe(false);
  });

  it('defaults to false when nothing is stored yet — every session before this toggle existed', () => {
    expect(readOrbitOrthographicPreference(fakeStorage())).toBe(false);
  });

  it('reads true only from the exact stored value "1"', () => {
    const storage = fakeStorage({ [ORBIT_ORTHO_STORAGE_KEY]: '1' });
    expect(readOrbitOrthographicPreference(storage)).toBe(true);
  });

  it('treats any other stored value as false, not a crash — an unrecognized future format falls back safely', () => {
    const storage = fakeStorage({ [ORBIT_ORTHO_STORAGE_KEY]: 'true' });
    expect(readOrbitOrthographicPreference(storage)).toBe(false);
  });
});

describe('writeOrbitOrthographicPreference', () => {
  it('writes "1" for true', () => {
    const storage = fakeStorage();
    writeOrbitOrthographicPreference(storage, true);
    expect(storage.dump()[ORBIT_ORTHO_STORAGE_KEY]).toBe('1');
  });

  it('writes "0" for false', () => {
    const storage = fakeStorage({ [ORBIT_ORTHO_STORAGE_KEY]: '1' });
    writeOrbitOrthographicPreference(storage, false);
    expect(storage.dump()[ORBIT_ORTHO_STORAGE_KEY]).toBe('0');
  });

  it('is a no-op, not a throw, when storage is undefined', () => {
    expect(() =>
      writeOrbitOrthographicPreference(undefined, true)
    ).not.toThrow();
  });

  it('round-trips through read: write(true) then read() is true, write(false) then read() is false', () => {
    const storage = fakeStorage();
    writeOrbitOrthographicPreference(storage, true);
    expect(readOrbitOrthographicPreference(storage)).toBe(true);
    writeOrbitOrthographicPreference(storage, false);
    expect(readOrbitOrthographicPreference(storage)).toBe(false);
  });
});
