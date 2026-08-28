import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDungeonShellProviderForTests,
  getDungeonShellCatalogSnapshot,
} from '../../rendering/dungeonShellProvider';
import { useDungeonShellCatalog } from './useDungeonShellCatalog';

const HASH = 'a'.repeat(64);

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
            file: 'env/crypt-wall-body.glb',
            sha256: HASH,
            localSpanAxis: '+X',
            localFaceAxis: 'Z',
            twoSided: true,
            bounds: { min: [0, 0, 0], max: [2, 3, 4] },
          },
          base: {
            file: 'env/crypt-wall-base.glb',
            sha256: HASH,
            bounds: { min: [0, 0, 0], max: [2, 3, 4] },
          },
          cap: {
            file: 'env/crypt-wall-cap.glb',
            sha256: HASH,
            bounds: { min: [0, 0, 0], max: [2, 3, 4] },
          },
          doorSurround: {
            file: 'env/crypt-door-surround.glb',
            sha256: HASH,
            bounds: { min: [0, 0, 0], max: [2, 3, 4] },
          },
        },
      },
    },
  };
}

function responseFor(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return { ok: true, arrayBuffer: async () => bytes.buffer };
}

beforeEach(() => {
  __resetDungeonShellProviderForTests();
  vi.restoreAllMocks();
});

describe('useDungeonShellCatalog', () => {
  it('adopts the shared loading snapshot and then the ready snapshot', async () => {
    let resolveFetch!: (response: unknown) => void;
    const response = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response));

    const { result } = renderHook(() => useDungeonShellCatalog());
    expect(result.current.status).toBe('idle');
    expect(getDungeonShellCatalogSnapshot().status).toBe('loading');

    resolveFetch(responseFor(validManifest()));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toBe(getDungeonShellCatalogSnapshot());
  });

  it('reuses one provider owner across a StrictMode effect probe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor(validManifest()));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDungeonShellCatalog(), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adopts the final failed snapshot when the provider rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );

    const { result } = renderHook(() => useDungeonShellCatalog());
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current).toMatchObject({
      status: 'failed',
      failureKind: 'manifest-unavailable',
    });
  });

  it('does not update local state after unmount', async () => {
    let resolveFetch!: (response: unknown) => void;
    const response = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response));

    const { unmount } = renderHook(() => useDungeonShellCatalog());
    unmount();
    resolveFetch(responseFor(validManifest()));
    await waitFor(() =>
      expect(getDungeonShellCatalogSnapshot().status).toBe('ready')
    );
  });
});
