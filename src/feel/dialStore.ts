/**
 * The feel dials LIVE store (#906 batch 2) — a module singleton, not a
 * React context, so any non-component code (a one-off `getDialValues()`
 * read) can reach it too. React components subscribe via `useDialValues()`.
 *
 * # Precedence
 *
 * `registry defaults` <- `this browser's saved values (localStorage)` <-
 * `URL params on top` — an explicit link always wins, matching every other
 * dial in this codebase's own "the query string is the loudest voice"
 * convention. Loaded ONCE, at module init (first import), from
 * `window.location.search` as it stood then; a later in-page navigation
 * that changes the URL does not re-read it (there is no router event to
 * hang that off, and the drawer is the intended live-editing path once the
 * page has loaded).
 *
 * # Persistence
 *
 * Only NON-DEFAULT values are written to `localStorage` (key
 * `feel.dials.v1`), mirroring `toSearchParams`'s own "only non-default
 * values" rule below — so a dial nobody has ever touched keeps tracking
 * this module's own shipped default forever, even across a code update
 * that moves it, rather than freezing at whatever the default happened to
 * be the first time this ran.
 */
import { useSyncExternalStore } from 'react';
import {
  ALL_DIAL_SPECS,
  defaultDialValues,
  getDialSpec,
  validateDialValue,
  type DialSpec,
  type DialValues,
} from './dials';

const STORAGE_KEY = 'feel.dials.v1';

/** Sparse — only the keys actually present (and valid) in `search`, so a
 * caller can layer this over another source without clobbering keys the
 * URL says nothing about. */
export function valuesFromSearch(
  search: string,
  specs: readonly DialSpec[] = ALL_DIAL_SPECS
): Partial<DialValues> {
  const params = new URLSearchParams(search);
  const values: Partial<DialValues> = {};
  for (const spec of specs) {
    const raw = params.get(spec.key);
    if (raw === null || raw.trim() === '') continue;
    values[spec.key] = validateDialValue(spec, raw);
  }
  return values;
}

/** Sparse — only the keys present (and valid) in the persisted JSON blob.
 * Wrapped in try/catch: a private browsing tab, blocked storage, or
 * hand-edited localStorage must never crash the app; it just falls back to
 * "nothing was persisted". */
function loadPersistedValues(
  specs: readonly DialSpec[] = ALL_DIAL_SPECS
): Partial<DialValues> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const values: Partial<DialValues> = {};
    for (const spec of specs) {
      const entry = (parsed as Record<string, unknown>)[spec.key];
      if (entry === undefined) continue;
      values[spec.key] = validateDialValue(spec, entry);
    }
    return values;
  } catch {
    return {};
  }
}

function persist(values: DialValues): void {
  try {
    const nonDefault: Partial<DialValues> = {};
    for (const spec of ALL_DIAL_SPECS) {
      if (values[spec.key] !== spec.default)
        nonDefault[spec.key] = values[spec.key];
    }
    if (Object.keys(nonDefault).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nonDefault));
    }
  } catch {
    // Storage unavailable/blocked (e.g. the Discord iframe) — the in-memory
    // store still works for the rest of this session, it just won't survive
    // a reload. Silent by design: this is not an error the player can act on.
  }
}

function initializeValues(): DialValues {
  const base = defaultDialValues();
  const persisted = loadPersistedValues();
  const fromUrl =
    typeof window === 'undefined'
      ? {}
      : valuesFromSearch(window.location.search);
  // `base` alone already has every key (defaultDialValues() is total), so
  // spreading the two Partial<DialValues> overrides on top can only ever
  // narrow keys that are already present, never introduce `undefined`.
  return { ...base, ...persisted, ...fromUrl } as DialValues;
}

let currentValues: DialValues = initializeValues();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** One-time snapshot of the current store — for non-React callers, or a
 * React callback that doesn't need to re-render on every dial change. */
export function getDialValues(): DialValues {
  return currentValues;
}

/** Validates/clamps against the dial's own spec (see `validateDialValue`),
 * updates the store, and persists. A caller passing an unregistered `key`
 * is a no-op. */
export function setDial(key: string, rawValue: unknown): void {
  const spec = getDialSpec(key);
  if (!spec) return;
  currentValues = {
    ...currentValues,
    [key]: validateDialValue(spec, rawValue),
  };
  persist(currentValues);
  notify();
}

/** Back to this one dial's own registry default. */
export function resetDial(key: string): void {
  const spec = getDialSpec(key);
  if (!spec) return;
  currentValues = { ...currentValues, [key]: spec.default };
  persist(currentValues);
  notify();
}

/** Every dial back to its registry default, AND clears the persisted
 * storage entirely (not just to an all-defaults blob) — so a later code
 * update to a default takes effect immediately rather than being masked by
 * a stored "default at the time of the last reset all". */
export function resetAll(): void {
  currentValues = defaultDialValues();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See persist()'s own doc comment — storage being unavailable is fine.
  }
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The reactive, whole-store subscription every component-level dial
 * consumer is built on (see `useFeelDials.ts`'s `useCameraDials()`/
 * `useDiceDials()`) — re-renders on ANY dial change, camera or dice alike.
 * Fine-grained per-group subscriptions were not worth the complexity: a
 * dial only ever changes on a deliberate drawer action, never per-frame. */
export function useDialValues(): DialValues {
  return useSyncExternalStore(subscribe, getDialValues, getDialValues);
}

/** Only non-default values, as a query string (no leading `?`) — the
 * "Copy as URL" footer action's own data source. Symmetric with how the
 * store itself persists: a link built from this reproduces exactly the
 * dials someone actually changed, nothing else. */
export function toSearchParams(values: DialValues): string {
  const params = new URLSearchParams();
  for (const spec of ALL_DIAL_SPECS) {
    const value = values[spec.key];
    if (value !== spec.default) params.set(spec.key, String(value));
  }
  return params.toString();
}
