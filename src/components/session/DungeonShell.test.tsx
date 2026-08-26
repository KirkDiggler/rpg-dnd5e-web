import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useGLTF } from '@react-three/drei';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { StrictMode } from 'react';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoredWallRun } from '../../hooks/authoredWallRuns';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import type { DungeonShellProfile } from '../../rendering/dungeonShellManifest';
import type { DungeonShellCatalogSnapshot } from '../../rendering/dungeonShellProvider';
import type { Scene3D } from './atlasToScene3D';

const PROFILE_URLS = [
  '/models/synty/textures/floor.png',
  '/models/synty/env/body.glb',
  '/models/synty/env/base.glb',
  '/models/synty/env/cap.glb',
  '/models/synty/env/surround.glb',
  '/models/synty/env/SM_Env_Door_01.glb',
] as const;
const LEGACY_TEXTURE_URL =
  '/models/synty/textures/Dungeons_Texture_FloorTiles_01.png';
const LEGACY_WALL_URL = '/models/synty/env/SM_Env_Wall_Half_01.glb';
const LEGACY_FRAME_URL = '/models/synty/env/SM_Env_Door_Frame_01.glb';
const LEAF_URL = '/models/synty/env/SM_Env_Door_01.glb';

type ResourceState<T> =
  | { status: 'pending'; promise: Promise<never> }
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; error: Error };

const shellState = vi.hoisted(() => ({
  snapshot: { status: 'idle' } as DungeonShellCatalogSnapshot,
  hookCalls: [] as string[],
  loaderCalls: [] as string[],
  assets: new Map<string, ResourceState<{ scene: THREE.Group }>>(),
  textures: new Map<string, ResourceState<THREE.Texture>>(),
  clearCalls: [] as string[],
}));

function assetScene(url: string) {
  const scene = new THREE.Group();
  scene.name = url;
  const mesh = new THREE.Mesh(
    url.includes('/surround.glb')
      ? new THREE.BoxGeometry(0.4, 2, 0.4)
      : new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  mesh.name = url;
  if (url.includes('/surround.glb')) {
    mesh.position.x = -0.3;
    const right = mesh.clone();
    right.position.x = 0.3;
    const lintel = mesh.clone();
    lintel.position.set(0, 2, 0);
    lintel.scale.set(2, 0.2, 1);
    scene.add(mesh, right, lintel);
  } else {
    scene.add(mesh);
  }
  return { scene };
}

function fulfilledAsset(url: string) {
  return { status: 'fulfilled' as const, value: assetScene(url) };
}

function readResource<T>(
  url: string,
  cache: Map<string, ResourceState<T>>,
  value: () => T
): T {
  let state = cache.get(url);
  if (!state) {
    shellState.loaderCalls.push(url);
    state = { status: 'fulfilled', value: value() };
    cache.set(url, state);
  }
  if (state.status === 'pending') throw state.promise;
  if (state.status === 'rejected') throw state.error;
  return state.value;
}

function readAsset(url: string) {
  shellState.hookCalls.push(url);
  return readResource(url, shellState.assets, () => assetScene(url));
}

function readTexture(url: string) {
  shellState.hookCalls.push(url);
  return readResource(url, shellState.textures, () => new THREE.Texture());
}

function rejectGltf(url: string, message = `failed to load ${url}`) {
  shellState.loaderCalls.push(url);
  shellState.assets.set(url, {
    status: 'rejected',
    error: new Error(message),
  });
}

function rejectTexture(url: string, message = `failed to load ${url}`) {
  shellState.loaderCalls.push(url);
  shellState.textures.set(url, {
    status: 'rejected',
    error: new Error(message),
  });
}

function pendingGltf(url: string) {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<never>((resolvePromise, rejectPromise) => {
    resolve = () => resolvePromise(undefined as never);
    reject = rejectPromise;
  });
  shellState.assets.set(url, { status: 'pending', promise });
  return {
    fulfill() {
      shellState.assets.set(url, fulfilledAsset(url));
      resolve();
    },
    reject(error = new Error(`failed to load ${url}`)) {
      shellState.assets.set(url, { status: 'rejected', error });
      reject(error);
    },
  };
}

vi.mock('./useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => shellState.snapshot,
}));

vi.mock('@react-three/drei', () => {
  const useGLTF = (url: string) => readAsset(url);
  useGLTF.preload = () => undefined;
  useGLTF.clear = (url: string) => {
    shellState.clearCalls.push(url);
    shellState.assets.delete(url);
  };
  const useTexture = (url: string) => readTexture(url);
  useTexture.preload = () => undefined;
  return { useGLTF, useTexture };
});

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

const wallRuns: AuthoredWallRun[] = [
  {
    key: 'wall',
    start: { x: -0.5, z: 0 },
    end: { x: 0.5, z: 0 },
    facing: { x: 0, z: 1 },
    height: 0,
  },
];
const doorGaps = [
  {
    key: 'door-key',
    connection: 'door-id',
    position: { x: 1, z: 0 },
    leafPosition: { x: 0.5, z: 0 },
    rotationY: 0,
  },
];
const doors = new Map([['door-id', { state: DoorState.LOCKED } as DoorInfo]]);

function scene(archetypes: string[] = ['crypt']): Scene3D {
  const floorTiles = new Map<string, AbsoluteFloorTile>([
    ['0,0,0', { x: 0, y: 0, z: 0, roomId: '' }],
  ]);
  return {
    floorTiles,
    props: [],
    archetypes,
    wallRuns,
    doorGaps,
  };
}

function ready(nextProfile = profile): DungeonShellCatalogSnapshot {
  return {
    status: 'ready',
    catalog: { schemaVersion: 1, profiles: { crypt: nextProfile } },
  };
}

type RenderedScene = {
  scene: {
    findAll: (predicate: (node: unknown) => boolean) => unknown[];
  };
};

function primitives(renderer: RenderedScene) {
  return renderer.scene.findAll((node) => {
    const fiber = (node as { fiber: { type: unknown } }).fiber;
    return fiber.type === 'primitive';
  }) as Array<{ instance: THREE.Object3D }>;
}

function primitiveAssetNames(renderer: RenderedScene) {
  return primitives(renderer).flatMap(({ instance }) => {
    const names: string[] = [];
    instance.traverse((node) => {
      if (node instanceof THREE.Mesh) names.push(node.name);
    });
    return names;
  });
}

function floorMeshes(renderer: RenderedScene) {
  return renderer.scene.findAll((node) => {
    const rendered = node as { type: string; instance: unknown };
    return (
      rendered.type === 'Mesh' &&
      (rendered.instance as THREE.Mesh).position.y === 0.2
    );
  });
}

beforeEach(() => {
  shellState.snapshot = { status: 'idle' };
  shellState.hookCalls.length = 0;
  shellState.loaderCalls.length = 0;
  shellState.clearCalls.length = 0;
  shellState.assets.clear();
  shellState.textures.clear();
});

describe('DungeonShell actual shell integration', () => {
  it('keeps a closed legacy leaf on loading and named legacy paths', async () => {
    const loading = await ReactThreeTestRenderer.create(
      <DungeonShell scene={scene()} doors={doors} />
    );
    expect(primitiveAssetNames(loading)).toContain(LEAF_URL);

    shellState.snapshot = ready();
    const namedLegacy = await ReactThreeTestRenderer.create(
      <DungeonShell scene={scene(['cave'])} doors={doors} />
    );
    expect(primitiveAssetNames(namedLegacy)).toContain(LEAF_URL);
  });

  it('mounts the actual profile floor and wall pair only after all six cached resources are ready', async () => {
    shellState.snapshot = ready();
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonShell scene={scene()} doors={doors} />
    );

    expect(floorMeshes(renderer)).toHaveLength(1);
    expect(primitiveAssetNames(renderer)).toEqual(
      expect.arrayContaining([
        '/models/synty/env/body.glb',
        '/models/synty/env/base.glb',
        '/models/synty/env/cap.glb',
        '/models/synty/env/surround.glb',
        LEAF_URL,
      ])
    );
    expect(
      shellState.loaderCalls.filter((url) =>
        PROFILE_URLS.includes(url as never)
      )
    ).toEqual(PROFILE_URLS);
    expect(shellState.hookCalls.filter((url) => url === LEAF_URL)).toHaveLength(
      1
    );
  });

  it('keeps the actual legacy pair while ordinary GLTF resources are pending, then switches after they fulfill', async () => {
    shellState.snapshot = ready();
    const pending = PROFILE_URLS.filter((url) => url.endsWith('.glb')).map(
      (url) => pendingGltf(url)
    );
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonShell scene={scene()} doors={doors} />
    );
    await renderer.update(<DungeonShell scene={scene()} doors={doors} />);

    expect(shellState.loaderCalls).toEqual(
      expect.arrayContaining([
        LEGACY_TEXTURE_URL,
        LEGACY_WALL_URL,
        LEGACY_FRAME_URL,
      ])
    );
    expect(shellState.loaderCalls).not.toContain('/models/synty/env/body.glb');

    pending.forEach(({ fulfill }) => fulfill());
    await renderer.update(<DungeonShell scene={scene()} doors={doors} />);
    expect(primitiveAssetNames(renderer)).toEqual(
      expect.arrayContaining(['/models/synty/env/body.glb', LEAF_URL])
    );
  });

  it.each(PROFILE_URLS)(
    'falls back once to actual floor and walls without retrying failed leaf %s',
    async (failedUrl) => {
      shellState.snapshot = ready();
      (failedUrl.endsWith('.png') ? rejectTexture : rejectGltf)(failedUrl);
      const onFallbackReason = vi.fn();
      const onDoorClick = vi.fn();
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const renderer = await ReactThreeTestRenderer.create(
        <DungeonShell
          scene={scene()}
          doors={doors}
          onDoorClick={onDoorClick}
          onFallbackReason={onFallbackReason}
        />
      );

      expect(floorMeshes(renderer)).toHaveLength(1);
      expect(primitiveAssetNames(renderer)).toEqual(
        expect.arrayContaining([LEGACY_WALL_URL, LEGACY_FRAME_URL])
      );
      expect(primitiveAssetNames(renderer)).not.toContain(failedUrl);
      const clickable = renderer.scene.find(
        (node) =>
          node.fiber.type === 'group' &&
          typeof node.props.onClick === 'function'
      );
      await renderer.fireEvent(clickable, 'click');
      expect(onDoorClick).toHaveBeenCalledWith('door-id');
      if (failedUrl === LEAF_URL) {
        expect(
          shellState.loaderCalls.filter((url) => url === LEAF_URL)
        ).toHaveLength(1);
      }
      expect(onFallbackReason).toHaveBeenCalledWith('manifest-unavailable');
      consoleError.mockRestore();
    }
  );

  it.each([
    ['manifest-unavailable', 'manifest-unavailable'],
    ['invalid-profile', 'invalid-profile'],
  ] as const)(
    'reports provider %s without entering profile resources',
    async (failureKind, expected) => {
      shellState.snapshot = {
        status: 'failed',
        failureKind,
        failureReason: 'test failure',
      };
      const onFallbackReason = vi.fn();
      await ReactThreeTestRenderer.create(
        <DungeonShell
          scene={scene()}
          doors={doors}
          onFallbackReason={onFallbackReason}
        />
      );
      expect(onFallbackReason).toHaveBeenCalledWith(expected);
      expect(shellState.hookCalls).not.toEqual(
        expect.arrayContaining([...PROFILE_URLS])
      );
    }
  );

  it('routes an ordinary pending leaf rejection to the failed fallback without a leaf hook in that fallback', async () => {
    shellState.snapshot = ready();
    const pendingLeaf = pendingGltf(LEAF_URL);
    const onFallbackReason = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const view = await ReactThreeTestRenderer.create(
      <DungeonShell
        scene={scene()}
        doors={doors}
        onFallbackReason={onFallbackReason}
      />
    );
    expect(
      shellState.loaderCalls.filter((url) => url === LEAF_URL)
    ).toHaveLength(0);

    pendingLeaf.reject();
    await Promise.resolve();
    await view.update(
      <DungeonShell
        scene={scene()}
        doors={doors}
        onFallbackReason={onFallbackReason}
      />
    );
    expect(onFallbackReason).toHaveBeenLastCalledWith('manifest-unavailable');
    expect(
      shellState.loaderCalls.filter((url) => url === LEAF_URL)
    ).toHaveLength(0);
    expect(primitiveAssetNames(view)).not.toContain(LEAF_URL);
    consoleError.mockRestore();
  });

  it('keeps a cached rejected leaf in fallback until the cache is explicitly cleared', async () => {
    shellState.snapshot = ready();
    rejectGltf(LEAF_URL);
    const onFallbackReason = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const view = await ReactThreeTestRenderer.create(
      <StrictMode>
        <DungeonShell
          scene={scene()}
          doors={doors}
          onFallbackReason={onFallbackReason}
        />
      </StrictMode>
    );
    expect(onFallbackReason).toHaveBeenLastCalledWith('manifest-unavailable');
    expect(
      shellState.loaderCalls.filter((url) => url === LEAF_URL)
    ).toHaveLength(1);

    const sameResources: DungeonShellProfile = {
      ...profile,
      floor: { ...profile.floor, worldUnitsPerRepeat: 7 },
    };
    shellState.snapshot = ready(sameResources);
    await view.update(
      <StrictMode>
        <DungeonShell
          scene={scene()}
          doors={doors}
          onFallbackReason={onFallbackReason}
        />
      </StrictMode>
    );
    expect(primitiveAssetNames(view)).toEqual(
      expect.arrayContaining([LEGACY_WALL_URL, LEGACY_FRAME_URL])
    );
    expect(onFallbackReason).toHaveBeenLastCalledWith('manifest-unavailable');
    expect(
      shellState.loaderCalls.filter((url) => url === LEAF_URL)
    ).toHaveLength(1);

    // This is the explicit cache-clear operation that a real asset-loader
    // reset would perform; changing a profile key alone is not one.
    useGLTF.clear(LEAF_URL);
    expect(shellState.clearCalls).toEqual([LEAF_URL]);
    const recovered: DungeonShellProfile = {
      ...sameResources,
      floor: { ...sameResources.floor, diffuse: 'textures/recovered.png' },
      wall: {
        ...sameResources.wall,
        body: { ...sameResources.wall.body, file: 'env/recovered-body.glb' },
        base: { ...sameResources.wall.base, file: 'env/recovered-base.glb' },
        cap: { ...sameResources.wall.cap, file: 'env/recovered-cap.glb' },
      },
    };
    consoleError.mockRestore();
    shellState.snapshot = ready(recovered);
    await view.update(
      <StrictMode>
        <DungeonShell
          scene={scene()}
          doors={doors}
          onFallbackReason={onFallbackReason}
        />
      </StrictMode>
    );
    expect(primitiveAssetNames(view)).toEqual(
      expect.arrayContaining(['/models/synty/env/recovered-body.glb', LEAF_URL])
    );
    expect(onFallbackReason).toHaveBeenLastCalledWith(null);
    expect(
      shellState.loaderCalls.filter((url) => url === LEAF_URL)
    ).toHaveLength(2);
  });
});
