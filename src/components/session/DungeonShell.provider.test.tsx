import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoredWallRun } from '../../hooks/authoredWallRuns';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import {
  __resetDungeonShellProviderForTests,
  getDungeonShellCatalogSnapshot,
} from '../../rendering/dungeonShellProvider';
import { DungeonShell } from './DungeonShell';
import type { Scene3D } from './atlasToScene3D';

const HASH = 'a'.repeat(64);
const LEAF_URL = '/models/synty/env/SM_Env_Door_01.glb';
const loadedUrls: string[] = [];

vi.mock('@react-three/drei', () => {
  const useGLTF = (url: string) => {
    loadedUrls.push(url);
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    mesh.name = url;
    scene.add(mesh);
    return { scene };
  };
  useGLTF.preload = () => undefined;
  const useTexture = () => new THREE.Texture();
  useTexture.preload = () => undefined;
  return { useGLTF, useTexture };
});

function validManifest() {
  const artifact = (file: string) => ({
    file,
    sha256: HASH,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  });
  return {
    schemaVersion: 1,
    profiles: {
      crypt: {
        floor: {
          diffuse: 'textures/provider-floor.png',
          sha256: HASH,
          worldUnitsPerRepeat: 6.25,
        },
        wall: {
          body: {
            ...artifact('env/provider-body.glb'),
            localSpanAxis: '+X',
            localFaceAxis: 'Z',
            twoSided: true,
          },
          base: artifact('env/provider-base.glb'),
          cap: artifact('env/provider-cap.glb'),
          doorSurround: artifact('env/provider-surround.glb'),
        },
      },
    },
  };
}

function responseFor(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return {
    ok: true,
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

function scene(): Scene3D {
  const floorTiles = new Map<string, AbsoluteFloorTile>([
    ['0,0,0', { x: 0, y: 0, z: 0, roomId: '' }],
  ]);
  const wallRuns: AuthoredWallRun[] = [
    {
      key: 'wall',
      start: { x: -0.5, z: 0 },
      end: { x: 0.5, z: 0 },
      facing: { x: 0, z: 1 },
      height: 0,
    },
  ];
  return {
    floorTiles,
    props: [],
    archetypes: ['crypt'],
    wallRuns,
    doorGaps: [],
  };
}

type RenderedScene = {
  scene: {
    findAll: (predicate: (node: unknown) => boolean) => unknown[];
  };
};

function primitiveAssetNames(renderer: RenderedScene) {
  return renderer.scene
    .findAll((node) => {
      const rendered = node as {
        fiber?: { type?: unknown };
        instance?: THREE.Object3D;
      };
      return rendered.fiber?.type === 'primitive';
    })
    .flatMap((node) => {
      const instance = (node as { instance: THREE.Object3D }).instance;
      const names: string[] = [];
      instance.traverse((child) => {
        if (child instanceof THREE.Mesh) names.push(child.name);
      });
      return names;
    });
}

function floorMeshCount(renderer: RenderedScene) {
  return renderer.scene.findAll((node) => {
    const rendered = node as { type?: string };
    return rendered.type === 'Mesh';
  }).length;
}

beforeEach(() => {
  __resetDungeonShellProviderForTests();
  loadedUrls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DungeonShell with the real catalog hook and provider', () => {
  it.each([
    ['malformed', new Uint8Array([0xff])],
    [
      'schema-invalid',
      new TextEncoder().encode(
        JSON.stringify({ schemaVersion: 2, profiles: {} })
      ),
    ],
  ] as const)(
    '%s manifest selects actual legacy floor and walls',
    async (_label, bytes) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: async () => bytes.buffer,
        })
      );
      const reason = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <DungeonShell scene={scene()} onFallbackReason={reason} />
      );
      await renderer.update(
        <DungeonShell scene={scene()} onFallbackReason={reason} />
      );

      expect(getDungeonShellCatalogSnapshot()).toMatchObject({
        status: 'failed',
        failureKind: 'invalid-profile',
      });
      expect(reason).toHaveBeenLastCalledWith('invalid-profile');
      expect(floorMeshCount(renderer)).toBeGreaterThan(0);
      expect(primitiveAssetNames(renderer)).toContain(
        '/models/synty/env/SM_Env_Wall_Half_01.glb'
      );
    }
  );

  it.each([['network', 'network'] as const, ['HTTP', 'HTTP'] as const])(
    '%s manifest failure selects actual legacy floor and walls',
    async (_label, kind) => {
      vi.stubGlobal(
        'fetch',
        kind === 'network'
          ? vi.fn().mockRejectedValue(new Error('network down'))
          : vi.fn().mockResolvedValue({ ok: false, status: 503 })
      );
      const reason = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <DungeonShell scene={scene()} onFallbackReason={reason} />
      );
      await renderer.update(
        <DungeonShell scene={scene()} onFallbackReason={reason} />
      );

      expect(getDungeonShellCatalogSnapshot()).toMatchObject({
        status: 'failed',
        failureKind: 'manifest-unavailable',
      });
      expect(reason).toHaveBeenLastCalledWith('manifest-unavailable');
      expect(floorMeshCount(renderer)).toBeGreaterThan(0);
      expect(primitiveAssetNames(renderer)).toContain(
        '/models/synty/env/SM_Env_Wall_Half_01.glb'
      );
    }
  );

  it('loads the valid manifest and reaches the actual profile resource gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(responseFor(validManifest()))
    );
    const reason = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonShell scene={scene()} onFallbackReason={reason} />
    );
    await renderer.update(
      <DungeonShell scene={scene()} onFallbackReason={reason} />
    );

    expect(getDungeonShellCatalogSnapshot().status).toBe('ready');
    expect(reason).toHaveBeenLastCalledWith(null);
    expect(primitiveAssetNames(renderer)).toContain(
      '/models/synty/env/provider-body.glb'
    );
    expect(loadedUrls).toContain(LEAF_URL);
  });
});
