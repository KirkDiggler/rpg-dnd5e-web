import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { RegionLightingProjection } from './regionLighting';
import { createEmptyScene } from './sceneState';
import { WorldBuildingViewport } from './WorldBuildingViewport';

const gpu = vi.hoisted(() => ({ maxTextureSize: 4096 }));
let canvas: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;
let latest: ReactNode;
let gl: THREE.WebGLRenderer;
const texture = new THREE.Texture();
vi.mock('@react-three/fiber', async (original) => {
  const actual = await original<typeof import('@react-three/fiber')>();
  // Only replace the DOM/WebGL host. The viewport, scene, provider and real
  // material owner run together in the R3F renderer, without a browser.
  return {
    ...actual,
    Canvas: ({ children }: { children: ReactNode }) => {
      latest = children;
      return null;
    },
  };
});
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Html: () => null,
  useTexture: () => texture,
}));
vi.mock('@/components/session/useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => ({
    status: 'ready',
    catalog: {
      profiles: {
        crypt: {
          floor: {
            diffuse: 'floor.png',
            sha256: 'test',
            worldUnitsPerRepeat: 6,
          },
        },
      },
    },
  }),
}));

import { useThree } from '@react-three/fiber';
function GPUFixture(): null {
  gl = useThree().gl;
  gl.capabilities.maxTextureSize = gpu.maxTextureSize;
  gl.initTexture = () => {};
  gl.getContext().getError = () => 0;
  gl.getContext().isContextLost = () => false;
  return null;
}
const projection = (background: number): RegionLightingProjection => ({
  areas: [
    {
      regionId: 'room',
      background,
      area: {
        kind: 'polygon',
        ring: [
          { x: -2, z: -2 },
          { x: 2, z: -2 },
          { x: 2, z: 2 },
          { x: -2, z: 2 },
        ],
      },
    },
  ],
});
const base = {
  scene: createEmptyScene('status-test'),
  previewScene: null,
  selectedIds: [],
  tool: 'select' as const,
  activeDrag: null,
  onSelect: vi.fn(),
  onDrop: vi.fn(),
  onDragFinished: vi.fn(),
  onTransformPreview: vi.fn(),
  onTransformCommit: vi.fn(),
  onTransformReject: vi.fn(),
  onAssetState: vi.fn(),
};
async function mount(initial: RegionLightingProjection) {
  const draw = (regionLighting: RegionLightingProjection) => (
    <WorldBuildingViewport
      {...base}
      roomAuthoring={{
        tool: 'select',
        workspace: { hexRadius: 6, horizontalLimit: 12 },
        walkableHexes: [],
        propDeclarations: {},
        onWalkableGesture: vi.fn(),
        regionLighting,
      }}
    />
  );
  const view = render(draw(initial));
  await act(async () => {
    canvas = await ReactThreeTestRenderer.create(
      <>
        <GPUFixture />
        {latest}
      </>
    );
  });
  return async (next: RegionLightingProjection) => {
    view.rerender(draw(next));
    await act(async () => {
      await canvas.update(
        <>
          <GPUFixture />
          {latest}
        </>
      );
    });
  };
}
const floor = (): THREE.Material =>
  (
    canvas.scene.findByProps({ name: 'workspace-floor-underlay' })
      .instance as THREE.Mesh
  ).material as THREE.Material;
const treated = (): boolean =>
  floor().customProgramCacheKey().includes('STUDIO_REGION_LIGHTING');
afterEach(async () => {
  if (canvas)
    await act(async () => {
      await canvas.unmount();
    });
  cleanup();
  gpu.maxTextureSize = 4096;
});

it.each(['capacity', 'build'] as const)(
  'current lighting status recovers and reports the same %s failure again',
  async (kind) => {
    const update = await mount(projection(0.2));
    expect(treated()).toBe(true);
    const material = floor();
    const programKey = material.customProgramCacheKey();
    await update(projection(0.25));
    expect(floor()).toBe(material);
    expect(floor().customProgramCacheKey()).toBe(programKey);
    expect(
      screen.queryByRole('status', { name: 'Region lighting diagnostics' })
    ).toBeNull();
    const fail = async () => {
      gpu.maxTextureSize = kind === 'capacity' ? 1 : 4096;
      await update(projection(kind === 'build' ? NaN : 0.3));
      expect(treated()).toBe(false);
      expect(
        screen.getByRole('status', { name: 'Region lighting diagnostics' })
          .textContent
      ).toContain('not applied');
    };
    await fail();
    gpu.maxTextureSize = 4096;
    await update(projection(0.2));
    expect(treated()).toBe(true);
    expect(
      screen.queryByRole('status', { name: 'Region lighting diagnostics' })
    ).toBeNull();
    await fail();
  }
);

it.each(['empty', 'zero-triangles'] as const)(
  'retires the current failure on %s field',
  async (kind) => {
    gpu.maxTextureSize = 1;
    const update = await mount(projection(0.2));
    expect(
      screen.getByRole('status', { name: 'Region lighting diagnostics' })
    ).toBeTruthy();
    await update(
      kind === 'empty'
        ? { areas: [] }
        : {
            areas: [
              {
                regionId: 'room',
                background: 0.2,
                area: { kind: 'hex-union', cells: [] },
              },
            ],
          }
    );
    expect(treated()).toBe(false);
    expect(
      screen.queryByRole('status', { name: 'Region lighting diagnostics' })
    ).toBeNull();
  }
);

it.each(['hook', 'material'] as const)(
  'keeps a genuinely unsupported %s visible across field success, failure and recovery, then retires it with no field',
  async (kind) => {
    const update = await mount({ areas: [] });
    const source = floor();
    const originalHook = source.onBeforeCompile;
    const basic = source as THREE.MeshBasicMaterial;
    if (kind === 'hook') source.onBeforeCompile = () => {};
    else
      Object.defineProperty(basic, 'isMeshBasicMaterial', {
        value: false,
        configurable: true,
      });
    const message =
      kind === 'hook'
        ? 'unknown material shader hook'
        : 'does not support MeshBasicMaterial';
    await update(projection(0.2));
    expect(floor()).toBe(source);
    expect(
      screen.getByRole('status', { name: 'Region lighting diagnostics' })
        .textContent
    ).toContain(message);
    await update(projection(0.4));
    expect(floor()).toBe(source);
    expect(
      screen.getByRole('status', { name: 'Region lighting diagnostics' })
        .textContent
    ).toContain(message);
    gpu.maxTextureSize = 1;
    await update(projection(0.5));
    expect(
      screen.getByRole('status', { name: 'Region lighting diagnostics' })
        .textContent
    ).toContain('capacity');
    gpu.maxTextureSize = 4096;
    await update(projection(0.4));
    const status = screen.getByRole('status', {
      name: 'Region lighting diagnostics',
    });
    expect(status.textContent).toContain(message);
    expect(status.textContent).not.toContain('capacity');
    await update({ areas: [] });
    expect(
      screen.queryByRole('status', { name: 'Region lighting diagnostics' })
    ).toBeNull();
    source.onBeforeCompile = originalHook;
    Object.defineProperty(basic, 'isMeshBasicMaterial', {
      value: true,
      configurable: true,
    });
    await update(projection(0.4));
    expect(treated()).toBe(true);
    expect(
      screen.queryByRole('status', { name: 'Region lighting diagnostics' })
    ).toBeNull();
  }
);

it('does not resurrect a marked shader failure on a healthy field upload; retirement permits a new treatment and same failure', async () => {
  const update = await mount(projection(0.2));
  const source = (
    canvas.scene.findByProps({ name: 'workspace-floor-underlay' })
      .instance as THREE.Mesh
  ).material;
  const context = {
    getShaderSource: () => 'STUDIO_REGION_LIGHTING_V1',
    getProgramInfoLog: () => 'bad link',
    getShaderInfoLog: () => 'bad shader',
  } as unknown as WebGLRenderingContext;
  const fail = async () => {
    await act(async () => {
      gl.debug.onShaderError!(
        context,
        {} as Parameters<
          NonNullable<THREE.WebGLRenderer['debug']['onShaderError']>
        >[1],
        {} as WebGLShader,
        {} as WebGLShader
      );
    });
    expect(treated()).toBe(false);
    expect(
      screen.getByRole('status', { name: 'Region lighting diagnostics' })
        .textContent
    ).toContain('shader failed');
  };
  await fail();
  await update(projection(0.4));
  expect(treated()).toBe(false);
  expect(
    screen.getByRole('status', { name: 'Region lighting diagnostics' })
      .textContent
  ).toContain('shader failed');
  await update({ areas: [] });
  expect(
    screen.queryByRole('status', { name: 'Region lighting diagnostics' })
  ).toBeNull();
  await update(projection(0.4));
  expect(treated()).toBe(true);
  expect(floor()).not.toBe(source);
  await fail();
});
