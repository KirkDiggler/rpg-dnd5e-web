import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
import type { AttackDieRuntimeSidecar } from './attackDieContract';
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
  groupMissing: false,
  motionFailure: false,
  poseCopy: vi.fn(),
  positionSet: vi.fn(),
  canvasProps: null as Record<string, unknown> | null,
  createdScene: { environment: 'unexpected' } as { environment: unknown },
  canvasCreates: 0,
  createdCamera: {
    isPerspectiveCamera: true,
    fov: 0,
    near: 0,
    far: 0,
    position: { set: vi.fn() },
    up: { set: vi.fn() },
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  },
  gl: {
    debug: {
      checkShaderErrors: false,
      onShaderError: null as null | (() => void),
    },
    compile: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    toneMappingExposure: 0,
    toneMapping: 0,
    outputColorSpace: '',
    info: {
      render: { calls: 1, triangles: 2 },
      memory: { geometries: 1, textures: 0 },
      programs: [{}],
    },
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
    mocks.canvasCreates += 1;
    mocks.gl.domElement = canvas;
    mocks.canvasProps = props;
    onCreated?.({
      gl: mocks.gl,
      scene: mocks.createdScene,
      camera: mocks.createdCamera,
    });
    if (mocks.renderFailure) throw Error('child render failed');
    return (
      <div data-testid="canvas" {...props}>
        {children}
      </div>
    );
  },
  useFrame: (callback: (state: { clock: { elapsedTime: number } }) => void) =>
    mocks.frames.push(callback),
  useThree: (
    selector?: (state: { camera: typeof mocks.createdCamera }) => unknown
  ) =>
    selector
      ? selector({ camera: mocks.createdCamera })
      : { gl: mocks.gl, scene: {}, camera: mocks.createdCamera },
}));
vi.mock('./attackDieMotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./attackDieMotion')>();
  const failedFrame = (current: readonly [number, number, number, number]) => ({
    quaternion: current,
    observeNow: false,
    exactTargetHeld: false,
    failed: true,
  });
  return {
    ...actual,
    stepAttackDieMotion: (
      input: Parameters<typeof actual.stepAttackDieMotion>[0]
    ) =>
      mocks.motionFailure
        ? failedFrame(input.current)
        : actual.stepAttackDieMotion(input),
    attackDiePoseForPhase: (
      input: Parameters<typeof actual.attackDiePoseForPhase>[0]
    ) =>
      mocks.motionFailure
        ? { ...failedFrame(input.current), translation: [0, 0, 0] }
        : actual.attackDiePoseForPhase(input),
  };
});
vi.mock('./attackDieRuntime', () => ({
  preloadAttackDieRuntime: () => mocks.preload(),
  releaseAttackDieRenderer: (token: number) => mocks.release(token),
  getAttackDieRuntimeScene: () => {
    const root = new Group();
    root.name = 'D20_Lightning_preview_4pct';
    root.userData.attackDieSourceName = root.name;
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
    const body = new Mesh(new BufferGeometry(), materials[0]);
    body.name = mocks.selectorMismatch
      ? 'Wrong_Mesh'
      : 'D20_Lightning_preview_4pct_Mesh_0';
    body.userData.attackDieSourceName = body.name;
    const numeral = new Mesh(new BufferGeometry(), materials[1]);
    numeral.name = 'D20_Lightning_preview_4pct_Mesh_1';
    numeral.userData.attackDieSourceName = numeral.name;
    root.add(body, numeral);
    const scene = new Group();
    scene.name = 'synthetic-scene-root';
    scene.add(root);
    return scene;
  },
  lockAttackDieRenderer: (_token: number, result: number) => {
    const ready = mocks.status === 'ready' && result <= 20;
    const sidecar = ready
      ? {
          selectors: {
            blenderSuffixPattern: '\\.\\d{3}$',
            node: 'D20_Lightning_preview_4pct',
            sourceMesh: 'D20_Lightning_preview_4pct_Mesh',
            bodyPrimitive: {
              mesh: 'D20_Lightning_preview_4pct_Mesh_0',
              material: 'D20_Lightning_Material',
            },
            numeralPrimitive: {
              mesh: 'D20_Lightning_preview_4pct_Mesh_1',
              material: 'Paint_Material',
            },
          },
          faces: Array.from({ length: 20 }, (_, index) => ({
            result: index + 1,
            quaternion: index === 0 ? [1, 0, 0, 0] : [0, 0, 0, 1],
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
  mocks.canvasCreates = 0;
  mocks.createdCamera.position.set.mockClear();
  mocks.createdCamera.up.set.mockClear();
  mocks.createdCamera.lookAt.mockClear();
  mocks.createdCamera.updateProjectionMatrix.mockClear();
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
  mocks.groupMissing = false;
  mocks.motionFailure = false;
  mocks.poseCopy.mockReset();
  mocks.positionSet.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'position', {
    configurable: true,
    get() {
      return this.tagName === 'GROUP' ? { set: mocks.positionSet } : undefined;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'quaternion', {
    configurable: true,
    get() {
      return this.tagName === 'GROUP' && !mocks.groupMissing
        ? { copy: mocks.poseCopy }
        : undefined;
    },
    set(value) {
      Object.defineProperty(this, 'quaternion', {
        configurable: true,
        writable: true,
        value:
          this.tagName === 'GROUP' && !mocks.groupMissing
            ? { copy: mocks.poseCopy }
            : value,
      });
    },
  });
  mocks.gl.debug = { checkShaderErrors: false, onShaderError: null };
  mocks.gl.compile.mockReset().mockImplementation(() => {
    if (mocks.compileFailure) throw Error('compile threw');
    if (mocks.shaderDiagnostic) mocks.gl.debug.onShaderError?.();
  });
  mocks.gl.render = vi.fn();
});
afterEach(() => {
  delete (HTMLElement.prototype as { position?: unknown }).position;
  delete (HTMLElement.prototype as { quaternion?: unknown }).quaternion;
});
describe('AttackDie3D', () => {
  it('renders a development authoring scene without invoking verified runtime preload', () => {
    const root = new Group();
    root.name = 'D20_Lightning_preview_4pct';
    const bodyMaterial = new MeshStandardMaterial();
    bodyMaterial.name = 'D20_Lightning_Material.010';
    const numeralMaterial = new MeshStandardMaterial();
    numeralMaterial.name = 'Paint_Material.010';
    const body = new Mesh(new BufferGeometry(), bodyMaterial);
    body.name = 'D20_Lightning_preview_4pct_Mesh001';
    const numeral = new Mesh(new BufferGeometry(), numeralMaterial);
    numeral.name = 'D20_Lightning_preview_4pct_Mesh001_1';
    root.add(body, numeral);
    const scene = new Group();
    scene.add(root);
    const sidecar = {
      selectors: {
        blenderSuffixPattern: '\\.\\d{3}$',
        node: root.name,
        sourceMesh: 'D20_Lightning_preview_4pct_Mesh001',
        bodyPrimitive: {
          mesh: body.name,
          material: 'D20_Lightning_Material',
        },
        numeralPrimitive: {
          mesh: numeral.name,
          material: 'Paint_Material',
        },
      },
      faces: [],
    } as unknown as AttackDieRuntimeSidecar;
    render(
      <AttackDie3D
        {...props(100)}
        calibrationPose={[0, 0, 0, 1]}
        sceneOverride={scene}
        sidecarOverride={sidecar}
      />
    );
    expect(mocks.preload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('canvas')).not.toBeNull();
  });

  it('keeps current SVG token locked while successful late readiness enables only next token', () => {
    const view = render(<AttackDie3D {...props(1)} />);
    mocks.status = 'ready';
    view.rerender(<AttackDie3D {...props(1)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    view.rerender(<AttackDie3D {...props(2)} />);
    expect(screen.queryByTestId('canvas')).not.toBeNull();
    expect(fallbackCovered()).toBe(false);
    frame(-1, 0);
    frame(-1, 0.016);
    expect(fallbackCovered()).toBe(false);
    act(() => mocks.gl.render({}, {}));
    expect(fallbackCovered()).toBe(true);
    act(() => mocks.gl.render({}, {}));
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
  it('does not reveal from compile or pre-render frames; only successful renderer.render after an applied pose readies once', () => {
    mocks.status = 'ready';
    render(<AttackDie3D {...props(1)} />);
    const wrappedRender = mocks.gl.render;
    expect(fallbackCovered()).toBe(false);
    act(() => wrappedRender({}, {}));
    expect(fallbackCovered()).toBe(false);
    frame(-1, 0);
    expect(mocks.poseCopy).toHaveBeenCalledTimes(1);
    expect(fallbackCovered()).toBe(false);
    act(() => wrappedRender({}, {}));
    expect(fallbackCovered()).toBe(true);
    act(() => wrappedRender({}, {}));
    expect(fallbackCovered()).toBe(true);
  });
  it('keeps fallback when the selected group is missing', () => {
    mocks.status = 'ready';
    mocks.groupMissing = true;
    render(<AttackDie3D {...props(1)} />);
    const wrappedRender = mocks.gl.render;
    frame(-1, 0);
    expect(mocks.poseCopy).not.toHaveBeenCalled();
    act(() => wrappedRender({}, {}));
    expect(fallbackCovered()).toBe(false);
  });
  it('does not apply or validate a failed motion frame', () => {
    mocks.status = 'ready';
    mocks.motionFailure = true;
    render(<AttackDie3D {...props(1)} />);
    const wrappedRender = mocks.gl.render;
    frame(-1, 0);
    expect(mocks.poseCopy).not.toHaveBeenCalled();
    act(() => wrappedRender({}, {}));
    expect(fallbackCovered()).toBe(false);
  });
  it('does not reveal when shader diagnostic fires during compile or inside the underlying actual render', () => {
    mocks.status = 'ready';
    mocks.shaderDiagnostic = true;
    const compileView = render(<AttackDie3D {...props(1)} />);
    expect(fallbackCovered()).toBe(false);
    compileView.unmount();
    mocks.shaderDiagnostic = false;
    const underlyingRender = vi.fn(() => mocks.gl.debug.onShaderError?.());
    mocks.gl.render = underlyingRender;
    const renderView = render(<AttackDie3D {...props(2)} />);
    frame(-1, 0);
    const wrappedRender = mocks.gl.render;
    act(() => wrappedRender({}, {}));
    expect(underlyingRender).toHaveBeenCalledTimes(1);
    expect(fallbackCovered()).toBe(false);
    renderView.unmount();
  });
  it('fails closed when the underlying actual renderer.render throws and ignores its stale wrapper', () => {
    mocks.status = 'ready';
    mocks.gl.render.mockImplementationOnce(() => {
      throw Error('WebGL render failed');
    });
    const view = render(<AttackDie3D {...props(1)} />);
    frame(-1, 0);
    const staleWrappedRender = mocks.gl.render;
    expect(() => act(() => staleWrappedRender({}, {}))).toThrow(
      'WebGL render failed'
    );
    expect(fallbackCovered()).toBe(false);
    mocks.status = 'idle';
    view.rerender(<AttackDie3D {...props(2)} />);
    expect(() => staleWrappedRender({}, {})).not.toThrow();
    expect(fallbackCovered()).toBe(false);
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
    act(() => mocks.gl.render({}, {}));
    expect(fallbackCovered()).toBe(true);
    act(() =>
      mocks.listeners.get('webglcontextlost')?.(new Event('webglcontextlost'))
    );
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
    frame(-1, 0.032);
    expect(fallbackCovered()).toBe(false);
  });
  it.each([
    'success',
    'compile-throw',
    'render-throw',
    'context-loss',
    'token-change',
    'strict-unmount',
  ] as const)('restores renderer/debug hooks for %s', (scenario) => {
    const originalShaderError = vi.fn();
    const originalRender = mocks.gl.render;
    mocks.gl.debug.onShaderError = originalShaderError;
    mocks.gl.debug.checkShaderErrors = false;
    if (scenario === 'compile-throw') mocks.compileFailure = true;
    if (scenario === 'render-throw')
      originalRender.mockImplementationOnce(() => {
        throw Error('render failed');
      });
    mocks.status = 'ready';
    const tree =
      scenario === 'strict-unmount' ? (
        <StrictMode>
          <AttackDie3D {...props(1)} />
        </StrictMode>
      ) : (
        <AttackDie3D {...props(1)} />
      );
    const view = render(tree);
    const wrapped = mocks.gl.render;
    if (scenario === 'success') {
      frame(-1, 0);
      act(() => wrapped({}, {}));
    }
    if (scenario === 'render-throw')
      expect(() => act(() => wrapped({}, {}))).toThrow('render failed');
    if (scenario === 'context-loss')
      act(() =>
        mocks.listeners.get('webglcontextlost')?.(new Event('webglcontextlost'))
      );
    if (scenario === 'token-change') {
      mocks.status = 'idle';
      view.rerender(<AttackDie3D {...props(2)} />);
    }
    view.unmount();
    if (!['compile-throw', 'render-throw', 'token-change'].includes(scenario))
      expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
    expect(mocks.disposals.length).toBeGreaterThan(0);
    expect(
      mocks.disposals.every((dispose) => dispose.mock.calls.length === 1)
    ).toBe(true);
    expect(mocks.gl.render).toBe(originalRender);
    expect(mocks.gl.debug.onShaderError).toBe(originalShaderError);
    expect(mocks.gl.debug.checkShaderErrors).toBe(false);
  });
  it('keeps ready neutral for different authoritative targets and emits no observation', () => {
    mocks.status = 'ready';
    const telemetry = vi.fn();
    const view = render(
      <AttackDie3D {...props(300, 1)} phase="ready" onTelemetry={telemetry} />
    );
    frame(-1, 0);
    frame(-1, 1.9);
    frame(-1, 1.916);
    const lowPose = mocks.poseCopy.mock.calls.at(-1)?.[0];
    view.unmount();

    telemetry.mockClear();
    mocks.poseCopy.mockClear();
    render(
      <AttackDie3D {...props(301, 20)} phase="ready" onTelemetry={telemetry} />
    );
    frame(-1, 0);
    frame(-1, 1.9);
    frame(-1, 1.916);
    const highPose = mocks.poseCopy.mock.calls.at(-1)?.[0];

    expect(lowPose).toMatchObject({
      x: highPose.x,
      y: highPose.y,
      z: highPose.z,
      w: highPose.w,
    });
    expect(
      telemetry.mock.calls.some(([event]) => event.state === 'observed')
    ).toBe(false);
  });

  it('resets roll elapsed once on ready-to-rolling without restarting on rolling rerender', () => {
    mocks.status = 'ready';
    const release = {
      variation: 17,
      vector: [0, 0] as const,
      shake: 0,
    };
    const view = render(
      <AttackDie3D {...props(302)} phase="ready" decorativeRelease={release} />
    );
    frame(-1, 10);

    view.rerender(
      <AttackDie3D
        {...props(302)}
        phase="rolling"
        decorativeRelease={release}
      />
    );
    mocks.positionSet.mockClear();
    frame(-1, 10.5);
    const atRelease = mocks.positionSet.mock.calls.at(-1);
    frame(-1, 11);
    const inFlight = mocks.positionSet.mock.calls.at(-1);

    view.rerender(
      <AttackDie3D
        {...props(302)}
        phase="rolling"
        decorativeRelease={release}
      />
    );
    frame(-1, 11.1);
    const afterRerender = mocks.positionSet.mock.calls.at(-1);

    expect(atRelease).toEqual([1.05, 0, -0]);
    expect(inFlight?.[0]).toBeLessThan(atRelease?.[0]);
    expect(afterRerender?.[0]).toBeLessThan(inFlight?.[0]);
  });

  it('applies the exact settled target and resting position immediately', () => {
    mocks.status = 'ready';
    render(<AttackDie3D {...props(303, 1)} phase="settled" />);
    frame(-1, 0);

    expect(mocks.poseCopy.mock.calls.at(-1)?.[0]).toMatchObject({
      x: 1,
      y: 0,
      z: 0,
      w: 0,
    });
    expect(mocks.positionSet).toHaveBeenLastCalledWith(-0.23, 0, 0);
  });

  it('keeps reduced motion neutral until release and observes matching target once', () => {
    mocks.status = 'ready';
    const telemetry = vi.fn();
    const view = render(
      <AttackDie3D
        {...props(304, 1)}
        phase="ready"
        reducedMotion
        onTelemetry={telemetry}
      />
    );
    frame(-1, 10);
    frame(-1, 11);
    expect(mocks.poseCopy.mock.calls.at(-1)?.[0]).not.toMatchObject({
      x: 1,
      y: 0,
      z: 0,
      w: 0,
    });
    expect(
      telemetry.mock.calls.some(([event]) => event.state === 'observed')
    ).toBe(false);

    view.rerender(
      <AttackDie3D
        {...props(304, 1)}
        phase="rolling"
        reducedMotion
        decorativeRelease={{ variation: 304, vector: [0, 0], shake: 0 }}
        onTelemetry={telemetry}
      />
    );
    frame(-1, 12);
    frame(-1, 12.016);
    frame(-1, 12.032);

    const observed = telemetry.mock.calls.filter(
      ([event]) => event.state === 'observed'
    );
    expect(observed).toHaveLength(1);
    expect(observed[0][0]).toMatchObject({
      presentationToken: 304,
      requestedResult: 1,
      observedQuaternion: [1, 0, 0, 0],
      exactTargetHeld: true,
    });
  });

  it('preserves the renderer lock across phase-only rerenders', () => {
    mocks.status = 'ready';
    const view = render(<AttackDie3D {...props(305)} phase="ready" />);
    view.rerender(<AttackDie3D {...props(305)} phase="rolling" />);
    view.rerender(<AttackDie3D {...props(305)} phase="settled" />);

    expect(mocks.release).not.toHaveBeenCalledWith(305);
  });

  it('has no completion or result-release API', () => {
    type Forbidden = Extract<
      keyof AttackDie3DProps,
      'onComplete' | 'onResultRelease' | 'onPresentationComplete'
    >;
    expectTypeOf<Forbidden>().toEqualTypeOf<never>();
  });
});

it('consumes the complete renderer-owned camera/DPR/environment authority', async () => {
  const { ATTACK_DIE_VISUAL_CONFIG: visual } =
    await import('./attackDieVisualConfig');
  mocks.status = 'ready';
  render(<AttackDie3D {...props(33)} cameraView="top" />);
  expect(mocks.canvasProps?.camera).toEqual({
    fov: visual.topCamera.fov,
    near: visual.topCamera.near,
    far: visual.topCamera.far,
    position: visual.topCamera.position,
    up: visual.topCamera.up,
  });
  expect(mocks.canvasProps?.dpr).toBe(visual.devicePixelRatio);
  expect(mocks.createdCamera.lookAt).toHaveBeenCalledWith(
    ...visual.topCamera.target
  );
  expect(mocks.createdScene.environment).toBeNull();
  expect(mocks.gl.toneMappingExposure).toBe(visual.exposure);
  expect(
    screen.getByTestId('canvas').querySelector('group')?.getAttribute('scale')
  ).toBe(String(visual.dieScale));
});

it('updates live camera without remounting Canvas or changing token', async () => {
  const { ATTACK_DIE_VISUAL_CONFIG: v } =
    await import('./attackDieVisualConfig');
  mocks.status = 'ready';
  const view = render(
    <AttackDie3D {...props(77)} cameraView="three-quarter" />
  );
  expect(mocks.createdCamera.position.set).toHaveBeenLastCalledWith(
    ...v.threeQuarterCamera.position
  );
  view.rerender(<AttackDie3D {...props(77)} cameraView="top" />);
  // The R3F mock function re-renders, while the stable token proves production Canvas identity is unchanged.
  expect(mocks.release).not.toHaveBeenCalledWith(77);
  expect(mocks.createdCamera.position.set).toHaveBeenLastCalledWith(
    ...v.topCamera.position
  );
  expect(mocks.createdCamera.up.set).toHaveBeenLastCalledWith(
    ...v.topCamera.up
  );
  expect(mocks.createdCamera.lookAt).toHaveBeenLastCalledWith(
    ...v.topCamera.target
  );
  expect(mocks.createdCamera.fov).toBe(v.topCamera.fov);
  expect(mocks.createdCamera.updateProjectionMatrix).toHaveBeenCalledTimes(2);
});
