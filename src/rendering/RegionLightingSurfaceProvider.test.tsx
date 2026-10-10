import type { RegionLightingProjection } from '@/concepts/world-building/regionLighting';
import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegionLightingMaterialBinding } from './regionLightingMaterials';
import { RegionLightingSurfaceProvider } from './RegionLightingSurfaceProvider';
const state = vi.hoisted(() => ({
  gl: {
    capabilities: { maxTextureSize: 4096 },
    debug: {
      onShaderError: undefined as ((...args: unknown[]) => void) | undefined,
    },
    getContext: () => ({
      getError: () => 0,
      isContextLost: () => false,
      NO_ERROR: 0,
    }),
    initTexture: vi.fn(),
  },
  invalidate: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({ useThree: () => state }));
const projection = (level: number): RegionLightingProjection => ({
  areas: [
    {
      regionId: 'room',
      background: level,
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
afterEach(() => {
  cleanup();
  state.gl.capabilities.maxTextureSize = 4096;
  state.gl.debug.onShaderError = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe('Canvas-local region surface provider', () => {
  it('clears resolved → empty → repaired extents and keeps active binding/uniform identities across values/camera/point changes', () => {
    let observed: RegionLightingMaterialBinding | undefined;
    const diagnostics = vi.fn(),
      p = projection(0.15),
      points = [
        {
          key: 'actual-selection',
          position: [1, 2, 3] as const,
          color: '#ffa050',
          intensity: 4,
          distance: 6,
        },
      ];
    const child = (
      binding: RegionLightingMaterialBinding | undefined
    ): React.ReactNode => {
      observed = binding;
      return <span>{binding ? 'field' : 'baseline'}</span>;
    };
    const view = render(
      <RegionLightingSurfaceProvider
        projection={p}
        pointLights={points}
        onDiagnostic={diagnostics}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    const initial = observed!,
      holders = initial.uniforms,
      texture = holders.rlTriangles.value,
      dispose = vi.spyOn(texture, 'dispose');
    expect(holders.rlPointPositions.value[0]!.toArray()).toEqual([1, 2, 3, 6]);
    expect(holders.rlPointCount.value).toBe(1);
    const uploads = state.gl.initTexture.mock.calls.length;
    view.rerender(
      <RegionLightingSurfaceProvider
        projection={p}
        pointLights={points}
        onDiagnostic={diagnostics}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBe(initial);
    expect(state.gl.initTexture.mock.calls.length).toBe(uploads);
    view.rerender(
      <RegionLightingSurfaceProvider
        projection={projection(0.5)}
        pointLights={[]}
        onDiagnostic={diagnostics}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBe(initial);
    expect(observed!.uniforms).toBe(holders);
    expect(dispose).toHaveBeenCalledOnce();
    expect(holders.rlPointCount.value).toBe(0);
    view.rerender(
      <RegionLightingSurfaceProvider
        projection={{ areas: [] }}
        pointLights={[]}
        onDiagnostic={diagnostics}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBeUndefined();
    view.rerender(
      <RegionLightingSurfaceProvider
        projection={p}
        pointLights={points}
        onDiagnostic={diagnostics}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBe(initial);
    expect(diagnostics).not.toHaveBeenCalled();
  });
  it('capacity and field failures clear stale binding and report deduplicated visible diagnostics', () => {
    let observed: RegionLightingMaterialBinding | undefined;
    const diagnostic = vi.fn();
    const child = (b: RegionLightingMaterialBinding | undefined): null => {
      observed = b;
      return null;
    };
    const view = render(
      <RegionLightingSurfaceProvider
        projection={projection(0.2)}
        pointLights={[]}
        onDiagnostic={diagnostic}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBeDefined();
    state.gl.capabilities.maxTextureSize = 1;
    view.rerender(
      <RegionLightingSurfaceProvider
        projection={projection(0.3)}
        pointLights={[]}
        onDiagnostic={diagnostic}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBeUndefined();
    expect(diagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'gpu-capacity' })
    );
    view.rerender(
      <RegionLightingSurfaceProvider
        projection={projection(NaN)}
        pointLights={[]}
        onDiagnostic={diagnostic}
      >
        {child}
      </RegionLightingSurfaceProvider>
    );
    expect(observed).toBeUndefined();
    expect(diagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'field-build' })
    );
  });
  it('chains shader errors, disables only marked compile failures and restores exact prior callback under StrictMode', () => {
    const previous = vi.fn();
    state.gl.debug.onShaderError = previous;
    let observed: RegionLightingMaterialBinding | undefined;
    const diagnostic = vi.fn();
    const p = projection(0.2);
    const child = (b: RegionLightingMaterialBinding | undefined): null => {
      observed = b;
      return null;
    };
    const view = render(
      <StrictMode>
        <RegionLightingSurfaceProvider
          projection={p}
          pointLights={[]}
          onDiagnostic={diagnostic}
        >
          {child}
        </RegionLightingSurfaceProvider>
      </StrictMode>
    );
    const textureDispose = vi.spyOn(
      observed!.uniforms.rlTriangles.value,
      'dispose'
    );
    const handler = state.gl.debug.onShaderError!;
    const context = {
      getShaderSource: () => 'unrelated',
      getProgramInfoLog: () => 'bad link',
      getShaderInfoLog: () => 'bad shader',
    };
    act(() => handler(context, {}, {}, {}));
    expect(observed).toBeDefined();
    expect(diagnostic).not.toHaveBeenCalled();
    context.getShaderSource = () => 'STUDIO_REGION_LIGHTING_V1';
    act(() => {
      handler(context, {}, {}, {});
      handler(context, {}, {}, {});
    });
    expect(observed).toBeUndefined();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'shader-compile' })
    );
    expect(previous).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(state.gl.debug.onShaderError).toBe(previous);
    expect(textureDispose).toHaveBeenCalledOnce();
  });
});
