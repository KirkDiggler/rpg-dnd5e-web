import {
  parseDungeonShellManifest,
  type DungeonShellCatalog,
} from './dungeonShellManifest';

export type DungeonShellCatalogSnapshot =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'ready'; readonly catalog: DungeonShellCatalog }
  | {
      readonly status: 'failed';
      readonly failureKind: 'manifest-unavailable' | 'invalid-profile';
      readonly failureReason: string;
    };

const MANIFEST_URL = '/models/synty/env/shell-profiles.json';
const IDLE_SNAPSHOT: DungeonShellCatalogSnapshot = Object.freeze({
  status: 'idle',
});

let snapshot: DungeonShellCatalogSnapshot = IDLE_SNAPSHOT;
let owner: Promise<void> | undefined;
let generation = 0;

function errorReason(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.length > 0) return error;
  if (
    (typeof error === 'object' && error !== null) ||
    typeof error === 'function'
  ) {
    try {
      const message = Reflect.get(error, 'message');
      if (typeof message === 'string' && message.length > 0) return message;
    } catch {
      // Rejected values are untrusted and must not escape normalization.
    }
  }
  return fallback;
}

function publish(
  next: DungeonShellCatalogSnapshot,
  ownerGeneration: number
): void {
  if (ownerGeneration === generation) snapshot = Object.freeze(next);
}

function fail(
  failureKind: 'manifest-unavailable' | 'invalid-profile',
  failureReason: string,
  ownerGeneration: number
): Error {
  publish(
    {
      status: 'failed',
      failureKind,
      failureReason,
    },
    ownerGeneration
  );
  return Error(failureReason);
}

async function loadCatalog(ownerGeneration: number): Promise<void> {
  let response: Response;
  let bytes: ArrayBuffer;
  try {
    response = await fetch(MANIFEST_URL);
    if (!response.ok) {
      throw Error(
        `manifest HTTP failure${response.status ? ` (${response.status})` : ''}`
      );
    }
    bytes = await response.arrayBuffer();
  } catch (error) {
    throw fail(
      'manifest-unavailable',
      errorReason(error, 'manifest fetch failed'),
      ownerGeneration
    );
  }

  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw fail(
      'invalid-profile',
      errorReason(error, 'manifest encoding or JSON failed'),
      ownerGeneration
    );
  }

  const parsed = parseDungeonShellManifest(value);
  if (!parsed.ok) {
    throw fail(
      'invalid-profile',
      `manifest validation failed: ${parsed.reason}`,
      ownerGeneration
    );
  }

  publish({ status: 'ready', catalog: parsed.catalog }, ownerGeneration);
}

export function preloadDungeonShellCatalog(): Promise<void> {
  if (owner) return owner;

  const ownerGeneration = generation;
  snapshot = Object.freeze({ status: 'loading' });
  owner = loadCatalog(ownerGeneration);
  return owner;
}

export function getDungeonShellCatalogSnapshot(): DungeonShellCatalogSnapshot {
  return snapshot;
}

export function __resetDungeonShellProviderForTests(): void {
  generation += 1;
  owner = undefined;
  snapshot = IDLE_SNAPSHOT;
}
