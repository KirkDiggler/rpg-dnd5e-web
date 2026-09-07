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
    expect(
      container.querySelector('ambientLight')?.getAttribute('intensity')
    ).toBe('0.2');
    expect(container.querySelectorAll('directionalLight')).toHaveLength(1);
    expect(
      container.querySelector('directionalLight')?.getAttribute('intensity')
    ).toBe('0.1');
    // One point light per lit prop in range. The tomb is the toolkit's
    // own file, so the count is whatever that file places rather than a
    // number this test chose — what is pinned is that each one carries
    // the crypt's measured colour and falloff.
    const pointLight = container.querySelector('pointLight');
    expect(container.querySelectorAll('pointLight').length).toBeGreaterThan(0);
    // WHICH prop is first, and how bright it ends up, are the fixture's
    // to decide: the tomb is the toolkit's own file now (fifteen props
    // where the builder's old stand-in had four), so a literal here
    // would pin upstream's content. What is pinned is that every light
    // the shell places is a real crypt light — warm, physically decaying
    // and actually reaching something.
    expect(pointLight?.getAttribute('color')).toBe('#ff9d52');
    for (const light of container.querySelectorAll('pointLight')) {
      expect(light.getAttribute('decay')).toBe('2');
      expect(Number(light.getAttribute('distance'))).toBeGreaterThan(0);
      expect(Number(light.getAttribute('intensity'))).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll('mesh').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('primitive').length).toBeGreaterThan(0);
  });

  it('shows a point-light budget diagnostic only in the builder', async () => {
    const budgetDoc = referenceTombDoc();
    const occupiedCells = new Set(
      budgetDoc.place
        .filter((prop) => prop.ref === 'dnd5e:props:brazier')
        .map((prop) => `${prop.at.q},${prop.at.r}`)
    );
    const additionalCells = budgetDoc.regions[0]!.cells.filter(
      (cell) => !occupiedCells.has(`${cell.q},${cell.r}`)
    );
    budgetDoc.place = [
      ...budgetDoc.place,
      ...Array.from({ length: 12 }, (_, index) => ({
        ref: 'dnd5e:props:brazier',
        at: additionalCells[index]!,
        blocksMovement: true,
        blocksLos: false,
      })),
    ];
    render(
      <DungeonPreview3D
        atlas={fixtureAtlasOf(budgetDoc) as GetAtlasResponse}
        doc={budgetDoc}
        status="ready"
      />
    );

    await waitFor(() =>
      expect(
        screen.getByTestId('preview-lighting-diagnostics').textContent
      ).toMatch(/^\d+ of \d+ placed light sources active near this view$/)
    );
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
