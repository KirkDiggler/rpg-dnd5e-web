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
  dispose: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    onCreated,
    ...props
  }: React.PropsWithChildren<{
    onCreated?: (x: {
      gl: { domElement: HTMLCanvasElement; compile: () => void };
    }) => void;
  }>) => {
    const canvas = document.createElement('canvas');
    canvas.addEventListener = (type: string, listener: EventListener) => {
      mocks.listeners.set(type, listener);
    };
    canvas.removeEventListener = (type: string) => {
      mocks.remove(type);
      mocks.listeners.delete(type);
    };
    onCreated?.({ gl: { domElement: canvas, compile: () => undefined } });
    return (
      <div data-testid="canvas" {...props}>
        {children}
      </div>
    );
  },
  useFrame: (callback: (state: { clock: { elapsedTime: number } }) => void) => {
    mocks.frames.push(callback);
  },
  useThree: () => ({ gl: { compile: () => undefined }, scene: {}, camera: {} }),
}));
vi.mock('./attackDieRuntime', () => ({
  preloadAttackDieRuntime: () => mocks.preload(),
  releaseAttackDieRenderer: (t: number) => mocks.release(t),
  getAttackDieRuntimeScene: () => {
    const root = new Group();
    root.name = 'D20_Lightning_preview_4pct';
    const mesh = new Mesh(new BufferGeometry(), [
      new MeshStandardMaterial(),
      new MeshStandardMaterial(),
    ]);
    mesh.name = 'D20_Lightning_preview_4pct_Mesh';
    mesh.material[0].name = 'D20_Lightning_Material.010';
    mesh.material[1].name = 'Paint_Material.010';
    root.add(mesh);
    return root;
  },
  lockAttackDieRenderer: (_t: number, result: number) => {
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
          faces: Array.from({ length: 20 }, (_, i) => ({
            result: i + 1,
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
beforeEach(() => {
  mocks.frames = [];
  mocks.release.mockClear();
  mocks.remove.mockClear();
  mocks.listeners.clear();
  mocks.status = 'idle';
});
describe('AttackDie3D', () => {
  it('snapshots every token, releases fallback locks, and never reuses prior truthfulness', () => {
    const view = render(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    view.rerender(<AttackDie3D {...props(2)} />);
    expect(mocks.release).toHaveBeenCalledWith(1);
    mocks.status = 'ready';
    view.rerender(<AttackDie3D {...props(3, 21)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(mocks.release).toHaveBeenCalledWith(2);
  });
  it('late readiness affects only the next token and reveals Canvas only after first validated frame', () => {
    const view = render(<AttackDie3D {...props(1)} />);
    mocks.status = 'ready';
    view.rerender(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    view.rerender(<AttackDie3D {...props(2)} />);
    expect(screen.queryByTestId('canvas')).not.toBeNull();
    expect(
      screen
        .getByTestId('fallback-svg')
        .closest('.attack-die-3d__fallback')
        ?.classList.contains('attack-die-3d__fallback--covered')
    ).toBe(false);
    act(() => mocks.frames.at(-1)?.({ clock: { elapsedTime: 0 } }));
    expect(
      screen
        .getByTestId('fallback-svg')
        .closest('.attack-die-3d__fallback')
        ?.classList.contains('attack-die-3d__fallback--covered')
    ).toBe(true);
    expect(screen.getByText('20 authoritative')).toBeTruthy();
  });
  it('context loss irreversibly reveals fallback and removes listeners during StrictMode cleanup', () => {
    mocks.status = 'ready';
    const view = render(
      <StrictMode>
        <AttackDie3D {...props(1)} />
      </StrictMode>
    );
    act(() => mocks.frames.at(-1)?.({ clock: { elapsedTime: 0 } }));
    expect(screen.queryByTestId('canvas')).not.toBeNull();
    act(() =>
      mocks.listeners.get('webglcontextlost')?.(new Event('webglcontextlost'))
    );
    expect(screen.queryByTestId('canvas')).toBeNull();
    view.unmount();
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });
  it('has no completion or result-release API', () => {
    type Forbidden = Extract<
      keyof AttackDie3DProps,
      'onComplete' | 'onResultRelease' | 'onPresentationComplete'
    >;
    expectTypeOf<Forbidden>().toEqualTypeOf<never>();
  });
});
