import {
  cameraDialsFrom,
  DEFAULT_ROTATE_SPEED_DEG_PER_SEC,
  parseCameraDials,
} from '@/components/hex-grid/cameraDials';
import {
  diceDialsFrom,
  parseDiceDials,
} from '@/components/session/local-world-die/diceDials';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_DIAL_SPECS,
  defaultDialValues,
  type DialValues,
  type NumberDialSpec,
} from './dials';

const STORAGE_KEY = 'feel.dials.v1';

function setLocationSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
    configurable: true,
  });
}

/** Fresh module instance per test — dialStore.ts computes its initial
 * precedence chain ONCE at import time, so exercising a different
 * localStorage/URL starting condition per test needs a genuinely new
 * module, not just a re-read of the same singleton. */
async function freshStore() {
  vi.resetModules();
  return import('./dialStore');
}

/** `defaultDialValues()` alone already has every key, so layering a
 * `valuesFromSearch` override on top can only narrow keys already present,
 * never introduce `undefined` — same reasoning as dialStore.ts's own
 * `initializeValues`. */
function resolvedFrom(overrides: Partial<DialValues>): DialValues {
  return { ...defaultDialValues(), ...overrides } as DialValues;
}

beforeEach(() => {
  localStorage.clear();
  setLocationSearch('');
});

afterEach(() => {
  setLocationSearch('');
});

describe('store precedence: registry defaults <- localStorage <- URL', () => {
  it('starts at every registered default with no storage and no URL', async () => {
    const store = await freshStore();
    expect(store.getDialValues()).toEqual(defaultDialValues());
  });

  it('a persisted value overrides its default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rotateSpeed: 120 }));
    const store = await freshStore();
    expect(store.getDialValues().rotateSpeed).toBe(120);
  });

  it('a URL param overrides a persisted value — an explicit link wins', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rotateSpeed: 120 }));
    setLocationSearch('?rotateSpeed=200');
    const store = await freshStore();
    expect(store.getDialValues().rotateSpeed).toBe(200);
  });

  it('an invalid persisted entry is dropped rather than poisoning the store', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ orbitPivot: 'sideways' })
    );
    const store = await freshStore();
    expect(store.getDialValues().orbitPivot).toBe('auto');
  });

  it('a corrupt localStorage blob does not throw — falls back to defaults', async () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const store = await freshStore();
    expect(() => store.getDialValues()).not.toThrow();
    expect(store.getDialValues()).toEqual(defaultDialValues());
  });

  it('an unregistered key in storage or the URL is ignored, not carried into the store', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bogus: 42 }));
    setLocationSearch('?alsoBogus=1');
    const store = await freshStore();
    expect(store.getDialValues()).toEqual(defaultDialValues());
  });
});

describe('setDial / resetDial / resetAll', () => {
  it('validates and clamps, persists, and notifies subscribers', async () => {
    const store = await freshStore();
    const spec = ALL_DIAL_SPECS.find(
      (s): s is NumberDialSpec => s.key === 'rotateSpeed'
    )!;
    const listener = vi.fn();
    store.subscribe(listener);

    store.setDial('rotateSpeed', spec.max + 1000);

    expect(store.getDialValues().rotateSpeed).toBe(spec.max);
    expect(listener).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.rotateSpeed).toBe(spec.max);
  });

  it('setDial on an unregistered key is a no-op', async () => {
    const store = await freshStore();
    const before = store.getDialValues();
    store.setDial('bogus', 5);
    expect(store.getDialValues()).toEqual(before);
  });

  it('resetDial restores just that one dial and un-persists it, leaving others alone', async () => {
    const store = await freshStore();
    store.setDial('rotateSpeed', 200);
    // 55 is deliberately NOT panSpeed's default (40, #906 round 4) — this
    // test proves an explicitly-set, non-default sibling survives a
    // reset, which a value that happened to equal the default couldn't.
    store.setDial('panSpeed', 55);

    store.resetDial('rotateSpeed');

    expect(store.getDialValues().rotateSpeed).toBe(
      DEFAULT_ROTATE_SPEED_DEG_PER_SEC
    );
    expect(store.getDialValues().panSpeed).toBe(55);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.rotateSpeed).toBeUndefined();
    expect(persisted.panSpeed).toBe(55);
  });

  it('resetAll clears every dial to default and removes storage entirely (not an all-defaults blob)', async () => {
    const store = await freshStore();
    store.setDial('rotateSpeed', 200);

    store.resetAll();

    expect(store.getDialValues()).toEqual(defaultDialValues());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('toSearchParams', () => {
  it('emits nothing for all-default values', async () => {
    const store = await freshStore();
    expect(store.toSearchParams(defaultDialValues())).toBe('');
  });

  it('round-trips a non-default value through valuesFromSearch', async () => {
    const store = await freshStore();
    const values = {
      ...defaultDialValues(),
      rotateSpeed: 150,
      orbitPivot: 'me',
    };

    const search = store.toSearchParams(values);
    expect(search).toContain('rotateSpeed=150');
    expect(search).toContain('orbitPivot=me');

    const roundTripped = store.valuesFromSearch(`?${search}`);
    expect(roundTripped.rotateSpeed).toBe(150);
    expect(roundTripped.orbitPivot).toBe('me');
  });
});

describe('cameraDialsFrom(valuesFromSearch(s)) matches the pre-drawer parseCameraDials(s)', () => {
  const strings = [
    '',
    '?rotateSpeed=100',
    '?orbitPivot=me&panSpeed=5',
    '?zoomMin=20&zoomMax=300&zoomStart=90',
    '?pitchFar=10&pitchNear=80',
    '?pitchFar=bogus',
    '?dragRotate=1.2', // stray — no longer a registered dial either way (round 3)
  ];

  it.each(strings)('%s', async (search) => {
    const store = await freshStore();
    const resolved = resolvedFrom(store.valuesFromSearch(search));
    expect(cameraDialsFrom(resolved)).toEqual(parseCameraDials(search));
  });

  it('documents a known divergence: pitchCurve uses a NEW on/off token, not the legacy 0/1 one', async () => {
    // parseCameraDials/readCameraDials (unchanged, URL-only) still speak the
    // ORIGINAL convention: only the literal string "0" turns the curve off,
    // and any other value (including "off") leaves it on. The registered
    // `pitchCurve` dial (for the drawer's own segmented control) uses
    // 'on'/'off' instead — a bookmarked `?pitchCurve=0` link is NOT
    // recognized by valuesFromSearch (not a listed enum option, so it falls
    // back to the dial's own default, 'on') and a new `?pitchCurve=off`
    // link is not recognized by parseCameraDials (not the literal "0", so
    // it also stays on there). The two conventions coexist deliberately —
    // parseCameraDials serves old bookmarks, the registry serves the drawer.
    const legacyOff = '?pitchCurve=0';
    const store = await freshStore();
    expect(parseCameraDials(legacyOff).curve).toBeNull();
    expect(
      cameraDialsFrom(resolvedFrom(store.valuesFromSearch(legacyOff))).curve
    ).not.toBeNull();

    const newOff = '?pitchCurve=off';
    expect(parseCameraDials(newOff).curve).not.toBeNull();
    expect(
      cameraDialsFrom(resolvedFrom(store.valuesFromSearch(newOff))).curve
    ).toBeNull();
  });
});

describe('diceDialsFrom(valuesFromSearch(s)) matches the pre-drawer parseDiceDials(s)', () => {
  const strings = ['', '?dieScale=3', '?rollFlash=both', '?dieScale=bogus'];

  it.each(strings)('%s', async (search) => {
    const store = await freshStore();
    const resolved = resolvedFrom(store.valuesFromSearch(search));
    expect(diceDialsFrom(resolved)).toEqual(parseDiceDials(search));
  });

  it('documents a known divergence: a negative dieScale clamps to the registry floor (0.25) rather than falling back to the default (2)', async () => {
    // parseDiceDials treats ANY non-positive value as invalid and falls
    // back to DEFAULT_DIE_SCALE — a rule specific to this one dial (see its
    // own doc comment: a zero/negative scale would collapse or invert the
    // physics hull). The registry's generic number-spec validation instead
    // clamps into [min, max] like a slider naturally would, and dieScale's
    // registered min (0.25) is not 0 — so a negative URL value lands at
    // 0.25 rather than at the default.
    const search = '?dieScale=-5';
    const store = await freshStore();
    const resolved = resolvedFrom(store.valuesFromSearch(search));
    expect(parseDiceDials(search).dieScale).toBe(2);
    expect(diceDialsFrom(resolved).dieScale).toBe(0.25);
  });
});
