import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import {
  buildScene3D,
  resolveSceneLayout,
} from '@/components/session/atlasToScene3D';
import { __resetDungeonShellProviderForTests } from '@/rendering/dungeonShellProvider';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { render, screen, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureAtlasOf } from '../fixtures/fixtureAtlas';
import { referenceTombDoc } from '../fixtures/referenceTomb';
import { DungeonPreview3D } from './DungeonPreview3D';

vi.mock('@/components/hex-grid/HexEntity', () => ({
  HexEntity: () => null,
}));
vi.mock('@/components/hex-grid/PathPreview', () => ({
  PathPreview: () => null,
}));
vi.mock('@/components/session/AtlasPropModel', () => ({
  AtlasPropModel: () => null,
}));
vi.mock('@react-three/drei', () => {
  const useGLTF = (url: string) => {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      )
    );
    scene.name = url;
    return { scene };
  };
  useGLTF.preload = () => undefined;
  return {
    OrbitControls: () => null,
    useGLTF,
    useTexture: () => new THREE.Texture(),
  };
});
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, ...props }: { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}));

const atlas = fixtureAtlasOf(referenceTombDoc());
const doc = referenceTombDoc();

beforeEach(() => {
  __resetDungeonShellProviderForTests();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DungeonPreview3D rendered shell parity', () => {
  it('renders the game-built scene through the actual shell and exactly one actual light pair', async () => {
    const { container } = render(
      <DungeonPreview3D
        atlas={atlas as GetAtlasResponse}
        doc={doc}
        status="ready"
      />
    );

    const gate = resolveSceneLayout(atlas);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const gameScene = buildScene3D(atlas, HEX_SIZE, gate.layout);
    expect(gameScene.floorTiles.size).toBeGreaterThan(0);
    expect(container.querySelectorAll('ambientLight')).toHaveLength(1);
    expect(container.querySelectorAll('directionalLight')).toHaveLength(1);
    expect(container.querySelectorAll('mesh').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('primitive').length).toBeGreaterThan(0);
  });

  it('shows the actual rendered legacy banner after the provider fallback callback', async () => {
    render(
      <DungeonPreview3D
        atlas={atlas as GetAtlasResponse}
        doc={doc}
        status="ready"
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('preview-shell-fallback').textContent).toBe(
        'Legacy shell: manifest-unavailable'
      )
    );
  });
});
