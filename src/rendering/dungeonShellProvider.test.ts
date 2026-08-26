import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDungeonShellProviderForTests,
  getDungeonShellCatalogSnapshot,
  preloadDungeonShellCatalog,
} from './dungeonShellProvider';

const HASH = 'a'.repeat(64);
const MANIFEST_URL = '/models/synty/env/shell-profiles.json';

function artifact(file: string) {
  return {
    file,
    sha256: HASH,
    bounds: { min: [0, 0, 0], max: [2, 3, 4] },
  };
}

function validManifest() {
  return {
    schemaVersion: 1,
    profiles: {
      crypt: {
        floor: {
          diffuse: 'textures/floor-09-01-u6.png',
          sha256: HASH,
          worldUnitsPerRepeat: 6.25,
        },
        wall: {
          body: {
            ...artifact('env/crypt-wall-body.glb'),
            localSpanAxis: '+X',
            localFaceAxis: 'Z',
            twoSided: true,
          },
          base: artifact('env/crypt-wall-base.glb'),
          cap: artifact('env/crypt-wall-cap.glb'),
          doorSurround: artifact('env/crypt-door-surround.glb'),
        },
      },
    },
  };
}

function responseFor(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    ok: true,
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  };
}

function arrangeFetch(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  __resetDungeonShellProviderForTests();
  vi.restoreAllMocks();
});

describe('dungeon shell provider', () => {
  it('starts idle and fetches the exact runtime manifest URL once', async () => {
    expect(getDungeonShellCatalogSnapshot()).toEqual({ status: 'idle' });
    const fetchMock = arrangeFetch(responseFor(validManifest()));

    const first = preloadDungeonShellCatalog();
    const second = preloadDungeonShellCatalog();
    expect(first).toBe(second);
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL);
    expect(getDungeonShellCatalogSnapshot().status).toBe('ready');
  });

  it('publishes one immutable ready snapshot and reuses its catalog', async () => {
    arrangeFetch(responseFor(validManifest()));
    await preloadDungeonShellCatalog();

    const first = getDungeonShellCatalogSnapshot();
    const second = getDungeonShellCatalogSnapshot();
    expect(first).toBe(second);
    expect(first).toMatchObject({ status: 'ready' });
    expect(Object.isFrozen(first)).toBe(true);
    if (first.status !== 'ready') throw new Error('expected ready snapshot');
    expect(Object.isFrozen(first.catalog)).toBe(true);
    expect(
      Object.isFrozen(first.catalog.profiles.crypt.wall.body.bounds.min)
    ).toBe(true);
  });

  it.each([
    ['HTTP failure', { ok: false, status: 503 }],
    ['fetch rejection', new Error('network down')],
  ])('classifies %s as manifest-unavailable', async (_label, failure) => {
    const fetchMock =
      failure instanceof Error
        ? vi.fn().mockRejectedValue(failure)
        : vi.fn().mockResolvedValue(failure);
    vi.stubGlobal('fetch', fetchMock);

    await expect(preloadDungeonShellCatalog()).rejects.toBeInstanceOf(Error);
    expect(getDungeonShellCatalogSnapshot()).toMatchObject({
      status: 'failed',
      failureKind: 'manifest-unavailable',
    });
  });

  it('classifies response-body fetch failures as manifest-unavailable', async () => {
    arrangeFetch({
      ok: true,
      arrayBuffer: vi.fn().mockRejectedValue(new Error('body unavailable')),
    });

    await expect(preloadDungeonShellCatalog()).rejects.toThrow(
      'body unavailable'
    );
    expect(getDungeonShellCatalogSnapshot()).toMatchObject({
      status: 'failed',
      failureKind: 'manifest-unavailable',
    });
  });

  it.each([
    ['invalid UTF-8', new Uint8Array([0xff])],
    ['invalid JSON', new TextEncoder().encode('{not json')],
  ])('classifies %s as invalid-profile', async (_label, bytes) => {
    arrangeFetch({ ok: true, arrayBuffer: vi.fn(async () => bytes.buffer) });

    await expect(preloadDungeonShellCatalog()).rejects.toBeInstanceOf(Error);
    expect(getDungeonShellCatalogSnapshot()).toMatchObject({
      status: 'failed',
      failureKind: 'invalid-profile',
    });
  });

  it('classifies schema validation rejection as invalid-profile', async () => {
    arrangeFetch(responseFor({ schemaVersion: 2, profiles: {} }));

    await expect(preloadDungeonShellCatalog()).rejects.toThrow(
      'manifest validation failed'
    );
    expect(getDungeonShellCatalogSnapshot()).toMatchObject({
      status: 'failed',
      failureKind: 'invalid-profile',
    });
  });

  it('publishes one immutable failed snapshot and does not retry it', async () => {
    const fetchMock = arrangeFetch({ ok: false, status: 500 });
    await expect(preloadDungeonShellCatalog()).rejects.toBeInstanceOf(Error);
    const first = getDungeonShellCatalogSnapshot();
    await expect(preloadDungeonShellCatalog()).rejects.toBeInstanceOf(Error);
    const second = getDungeonShellCatalogSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('isolates a reset test owner from a stale in-flight request', async () => {
    let resolveFirst!: (response: unknown) => void;
    const firstResponse = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(responseFor(validManifest()));
    vi.stubGlobal('fetch', fetchMock);

    const stale = preloadDungeonShellCatalog();
    __resetDungeonShellProviderForTests();
    const current = preloadDungeonShellCatalog();
    await current;
    expect(getDungeonShellCatalogSnapshot().status).toBe('ready');

    resolveFirst(responseFor({ schemaVersion: 2, profiles: {} }));
    await expect(stale).rejects.toBeInstanceOf(Error);
    expect(getDungeonShellCatalogSnapshot().status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
