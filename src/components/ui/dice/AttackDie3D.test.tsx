import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
const mocks = vi.hoisted(() => ({
  frames: [] as Array<(state: { clock: { elapsedTime: number } }) => void>,
  release: vi.fn(),
  preload: vi.fn().mockResolvedValue(undefined),
  status: 'idle' as 'idle' | 'ready',
  listeners: new Map<string, EventListener>(),
  remove: vi.fn(),
  disposals: [] as Array<ReturnType<typeof vi.fn>>,
  canvasFailure: false,
  renderFailure: false,
  selectorMismatch: false,
  shaderDiagnostic: false,
  compileFailure: false,
  gl: {
    debug: {
      checkShaderErrors: false,
      onShaderError: null as null | (() => void),
    },
    compile: vi.fn(),
    domElement: null as HTMLCanvasElement | null,
  },
}));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    onCreated,
    ...props
  }: React.PropsWithChildren<{
    onCreated?: (x: {
      gl: typeof mocks.gl;
      scene: object;
      camera: object;
    }) => void;
  }>) => {
    if (mocks.canvasFailure) throw Error('WebGL creation failed');
    const canvas = document.createElement('canvas');
    canvas.addEventListener = (type: string, listener: EventListener) =>
      mocks.listeners.set(type, listener);
    canvas.removeEventListener = (type: string) => {
      mocks.remove(type);
      mocks.listeners.delete(type);
    };
    mocks.gl.domElement = canvas;
    onCreated?.({ gl: mocks.gl, scene: {}, camera: {} });
    if (mocks.renderFailure) throw Error('child render failed');
    return (
      <div data-testid="canvas" {...props}>
        {children}
      </div>
    );
  },
  useFrame: (callback: (state: { clock: { elapsedTime: number } }) => void) =>
    mocks.frames.push(callback),
  useThree: () => ({ gl: mocks.gl, scene: {}, camera: {} }),
}));
vi.mock('./attackDieRuntime', () => ({
  preloadAttackDieRuntime: () => mocks.preload(),
  releaseAttackDieRenderer: (token: number) => mocks.release(token),
  getAttackDieRuntimeScene: () => {
    const root = new Group();
    root.name = 'D20_Lightning_preview_4pct';
    const materials = [new MeshStandardMaterial(), new MeshStandardMaterial()];
    materials[0].name = 'D20_Lightning_Material.010';
    materials[1].name = 'Paint_Material.010';
    for (const material of materials) {
      const originalClone = material.clone.bind(material);
      material.clone = () => {
        const clone = originalClone();
        const dispose = vi.fn();
        clone.dispose = dispose;
        mocks.disposals.push(dispose);
        return clone;
      };
    }
    const mesh = new Mesh(new BufferGeometry(), materials);
    mesh.name = mocks.selectorMismatch
      ? 'Wrong_Mesh'
      : 'D20_Lightning_preview_4pct_Mesh';
    root.add(mesh);
    return root;
  },
  lockAttackDieRenderer: (_token: number, result: number) => {
    const ready = mocks.status === 'ready' && result <= 20;
    const sidecar = ready
      ? {
          selectors: {
            node: 'D20_Lightning_preview_4pct',
            mesh: 'D20_Lightning_preview_4pct_Mesh',
            bodyMaterial: 'D20_Lightning_Material',
            numeralMaterial: 'Paint_Material',
            materialSlots: 2,
          },
          faces: Array.from({ length: 20 }, (_, index) => ({
            result: index + 1,
            quaternion: [0, 0, 0, 1],
          })),
        }
      : undefined;
    let renderer = ready ? '3d' : 'svg';
    return {
      get renderer() {
        return renderer;
      },
      sidecar,
      fail: () => {
        renderer = 'svg';
      },
    };
  },
}));
const props = (token: number, result = 20) => ({
  result,
  presentationToken: token,
  phase: 'rolling' as const,
  materialMode: 'raw' as const,
  reducedMotion: false,
  fallback: (
    <output>
      <span>20 authoritative</span>
      <svg data-testid="fallback-svg" />
    </output>
  ),
});
const fallbackCovered = () =>
  screen
    .getByTestId('fallback-svg')
    .closest('.attack-die-3d__fallback')
    ?.classList.contains('attack-die-3d__fallback--covered');
const frame = (index = -1, time = 0) =>
  act(() => mocks.frames.at(index)?.({ clock: { elapsedTime: time } }));
beforeEach(() => {
  mocks.frames = [];
  mocks.release.mockClear();
  mocks.preload.mockClear();
  mocks.listeners.clear();
  mocks.remove.mockClear();
  mocks.disposals = [];
  mocks.status = 'idle';
  mocks.canvasFailure = false;
  mocks.renderFailure = false;
  mocks.selectorMismatch = false;
  mocks.shaderDiagnostic = false;
  mocks.compileFailure = false;
  mocks.gl.debug = { checkShaderErrors: false, onShaderError: null };
  mocks.gl.compile.mockReset().mockImplementation(() => {
    if (mocks.compileFailure) throw Error('compile threw');
    if (mocks.shaderDiagnostic) mocks.gl.debug.onShaderError?.();
  });
});
describe('AttackDie3D', () => {
  it('keeps current SVG token locked while successful late readiness enables only next token', () => {
    const view = render(<AttackDie3D {...props(1)} />);
    mocks.status = 'ready';
    view.rerender(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    view.rerender(<AttackDie3D {...props(2)} />);
    expect(screen.queryByTestId('canvas')).not.toBeNull();
    expect(fallbackCovered()).toBe(false);
    frame(-1, 0);
    expect(fallbackCovered()).toBe(false);
    frame(-1, 0.016);
    expect(fallbackCovered()).toBe(true);
  });
  it('rejects stale ready callbacks after token change', () => {
    mocks.status = 'ready';
    const view = render(<AttackDie3D {...props(1)} />);
    const stale = mocks.frames.at(-1)!;
    mocks.status = 'idle';
    view.rerender(<AttackDie3D {...props(2)} />);
    act(() => {
      stale({ clock: { elapsedTime: 0 } });
      stale({ clock: { elapsedTime: 0.016 } });
    });
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
  });
  it('fails closed on selector mismatch through render boundary', () => {
    mocks.status = 'ready';
    mocks.selectorMismatch = true;
    render(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
  });
  it('fails closed on Canvas/WebGL creation failure', () => {
    mocks.status = 'ready';
    mocks.canvasFailure = true;
    render(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
  });
  it('fails closed when render boundary catches a child render failure', () => {
    mocks.status = 'ready';
    mocks.renderFailure = true;
    render(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
  });
  it('does not reveal when compile returns but shader diagnostic reports link failure', () => {
    mocks.status = 'ready';
    mocks.shaderDiagnostic = true;
    render(<AttackDie3D {...props(1)} />);
    frame(-1, 0);
    frame(-1, 0.016);
    expect(fallbackCovered()).toBe(false);
    expect(mocks.gl.debug.onShaderError).not.toBeNull();
  });
  it('fails closed on thrown compile diagnostics', () => {
    mocks.status = 'ready';
    mocks.compileFailure = true;
    render(<AttackDie3D {...props(1)} />);
    frame(-1, 0);
    expect(fallbackCovered()).toBe(false);
  });
  it('context loss after ready irreversibly reveals fallback', () => {
    mocks.status = 'ready';
    render(<AttackDie3D {...props(1)} />);
    frame(-1, 0);
    frame(-1, 0.016);
    expect(fallbackCovered()).toBe(true);
    act(() =>
      mocks.listeners.get('webglcontextlost')?.(new Event('webglcontextlost'))
    );
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
    frame(-1, 0.032);
    expect(fallbackCovered()).toBe(false);
  });
  it('restores shader hook, removes listener, releases lock, and disposes owned materials under StrictMode', () => {
    const original = vi.fn();
    mocks.gl.debug.onShaderError = original;
    mocks.status = 'ready';
    const view = render(
      <StrictMode>
        <AttackDie3D {...props(1)} />
      </StrictMode>
    );
    view.unmount();
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
    expect(mocks.disposals.length).toBeGreaterThan(0);
    expect(
      mocks.disposals.every((dispose) => dispose.mock.calls.length === 1)
    ).toBe(true);
    expect(mocks.gl.debug.onShaderError).toBe(original);
  });
  it('has no completion or result-release API', () => {
    type Forbidden = Extract<
      keyof AttackDie3DProps,
      'onComplete' | 'onResultRelease' | 'onPresentationComplete'
    >;
    expectTypeOf<Forbidden>().toEqualTypeOf<never>();
  });
});
