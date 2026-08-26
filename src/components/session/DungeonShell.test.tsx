import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DungeonShellProfile } from '../../rendering/dungeonShellManifest';
import type { DungeonShellCatalogSnapshot } from '../../rendering/dungeonShellProvider';
import type { Scene3D } from './atlasToScene3D';

const shellState = vi.hoisted(() => ({
  snapshot: { status: 'idle' } as DungeonShellCatalogSnapshot,
  pending: false,
  failed: false,
  failedUrl: null as string | null,
  calls: [] as string[],
}));

vi.mock('./useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => shellState.snapshot,
}));

vi.mock('@react-three/drei', () => ({
  useTexture: (url: string) => {
    shellState.calls.push(url);
    if (shellState.pending) throw new Promise<never>(() => undefined);
    if (shellState.failed || shellState.failedUrl === url)
      throw new Error(`failed ${url}`);
    return {};
  },
  useGLTF: (url: string) => {
    shellState.calls.push(url);
    if (shellState.pending) throw new Promise<never>(() => undefined);
    if (shellState.failed || shellState.failedUrl === url)
      throw new Error(`failed ${url}`);
    return { scene: {} };
  },
}));

vi.mock('../hex-grid/SyntyHexFloor', () => ({
  SyntyHexFloor: (props: { profile?: unknown }) => (
    <div
      data-testid={props.profile ? 'profile-floor-leaf' : 'legacy-floor-leaf'}
    />
  ),
}));

vi.mock('./AtlasWalls', () => ({
  AtlasWalls: (props: { profile?: unknown }) => (
    <div
      data-testid={props.profile ? 'profile-wall-leaf' : 'legacy-wall-leaf'}
    />
  ),
}));

import { DungeonShell } from './DungeonShell';

const HASH = 'a'.repeat(64);
const profile: DungeonShellProfile = {
  floor: {
    diffuse: 'textures/floor.png',
    sha256: HASH,
    worldUnitsPerRepeat: 6.25,
  },
  wall: {
    body: {
      file: 'env/body.glb',
      sha256: HASH,
      localSpanAxis: '+X',
      localFaceAxis: 'Z',
      twoSided: true,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    },
    base: {
      file: 'env/base.glb',
      sha256: HASH,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    },
    cap: {
      file: 'env/cap.glb',
      sha256: HASH,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    },
    doorSurround: {
      file: 'env/surround.glb',
      sha256: HASH,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    },
  },
};

const scene = {
  floorTiles: new Map(),
  props: [],
  archetypes: ['crypt'],
  wallRuns: [],
  doorGaps: [],
} as Scene3D;

function ready(): DungeonShellCatalogSnapshot {
  return {
    status: 'ready',
    catalog: { schemaVersion: 1, profiles: { crypt: profile } },
  };
}

beforeEach(() => {
  shellState.snapshot = { status: 'idle' };
  shellState.pending = false;
  shellState.failed = false;
  shellState.failedUrl = null;
  shellState.calls = [];
});

describe('DungeonShell', () => {
  it('renders a complete legacy pair while catalog selection is loading without a warning', async () => {
    const onFallbackReason = vi.fn();
    render(<DungeonShell scene={scene} onFallbackReason={onFallbackReason} />);

    expect(screen.getByTestId('legacy-floor-leaf')).toBeTruthy();
    expect(screen.getByTestId('legacy-wall-leaf')).toBeTruthy();
    await waitFor(() => expect(onFallbackReason).toHaveBeenCalledWith(null));
  });

  it.each([
    ['no-regions', []],
    ['unknown-archetype', ['cave']],
    ['mixed-archetypes', ['crypt', 'cave']],
  ] as const)(
    'renders both legacy leaves and reports %s',
    async (reason, archetypes) => {
      shellState.snapshot = ready();
      const onFallbackReason = vi.fn();
      render(
        <DungeonShell
          scene={{ ...scene, archetypes }}
          onFallbackReason={onFallbackReason}
        />
      );

      expect(screen.getByTestId('legacy-floor-leaf')).toBeTruthy();
      expect(screen.getByTestId('legacy-wall-leaf')).toBeTruthy();
      await waitFor(() =>
        expect(onFallbackReason).toHaveBeenCalledWith(reason)
      );
    }
  );

  it('loads all six profile URLs before mounting either profile leaf', async () => {
    shellState.snapshot = ready();
    const onFallbackReason = vi.fn();
    render(<DungeonShell scene={scene} onFallbackReason={onFallbackReason} />);

    await waitFor(() =>
      expect(screen.queryByTestId('profile-floor-leaf')).toBeTruthy()
    );
    expect(screen.getByTestId('profile-wall-leaf')).toBeTruthy();
    expect(shellState.calls).toEqual([
      '/models/synty/textures/floor.png',
      '/models/synty/env/body.glb',
      '/models/synty/env/base.glb',
      '/models/synty/env/cap.glb',
      '/models/synty/env/surround.glb',
      '/models/synty/env/SM_Env_Door_01.glb',
    ]);
    expect(onFallbackReason).toHaveBeenCalledWith(null);
  });

  it('keeps the complete legacy pair during profile resource loading', () => {
    shellState.snapshot = ready();
    shellState.pending = true;
    const onFallbackReason = vi.fn();
    render(<DungeonShell scene={scene} onFallbackReason={onFallbackReason} />);

    expect(screen.getByTestId('legacy-floor-leaf')).toBeTruthy();
    expect(screen.getByTestId('legacy-wall-leaf')).toBeTruthy();
    expect(screen.queryByTestId('profile-floor-leaf')).toBeNull();
    expect(screen.queryByTestId('profile-wall-leaf')).toBeNull();
  });

  it.each([
    '/models/synty/textures/floor.png',
    '/models/synty/env/body.glb',
    '/models/synty/env/base.glb',
    '/models/synty/env/cap.glb',
    '/models/synty/env/surround.glb',
    '/models/synty/env/SM_Env_Door_01.glb',
  ])('falls back atomically for a rejection of %s', async (failedUrl) => {
    shellState.snapshot = ready();
    shellState.failedUrl = failedUrl;
    const onFallbackReason = vi.fn();
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    render(<DungeonShell scene={scene} onFallbackReason={onFallbackReason} />);

    expect(screen.getByTestId('legacy-floor-leaf')).toBeTruthy();
    expect(screen.getByTestId('legacy-wall-leaf')).toBeTruthy();
    expect(screen.queryByTestId('profile-floor-leaf')).toBeNull();
    expect(screen.queryByTestId('profile-wall-leaf')).toBeNull();
    await waitFor(() =>
      expect(onFallbackReason).toHaveBeenCalledWith('manifest-unavailable')
    );
    error.mockRestore();
  });

  it('resets a failed resource boundary when the selected profile changes', async () => {
    shellState.snapshot = ready();
    shellState.failed = true;
    const onFallbackReason = vi.fn();
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const view = render(
      <DungeonShell scene={scene} onFallbackReason={onFallbackReason} />
    );
    await waitFor(() =>
      expect(onFallbackReason).toHaveBeenCalledWith('manifest-unavailable')
    );

    const nextProfile = {
      ...profile,
      floor: { ...profile.floor, worldUnitsPerRepeat: 7 },
    };
    shellState.failed = false;
    shellState.snapshot = {
      status: 'ready',
      catalog: { schemaVersion: 1, profiles: { crypt: nextProfile } },
    };
    view.rerender(
      <DungeonShell scene={scene} onFallbackReason={onFallbackReason} />
    );

    await waitFor(() =>
      expect(screen.getByTestId('profile-floor-leaf')).toBeTruthy()
    );
    error.mockRestore();
  });
});
