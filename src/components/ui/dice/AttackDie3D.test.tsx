import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
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
import type { DiceRuntimePreset } from './diceRuntimeManifest';
import { validDiceRuntimeManifest } from './diceRuntimeTestFixtures';
import {
  ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE,
  runtimeDiceNormalization,
} from './materialFreeCarvedMesh';
import type { HeldRollGroupState } from './rollGroupGestureController';
import { createVisualThrowProfile } from './visualThrowProfile';
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
  solverInputs: [] as unknown[],
  solverOutputs: [] as unknown[],
  settlementInputs: [] as unknown[],
  poseCopy: vi.fn(),
  positionSet: vi.fn(),
  shadowPositionSet: vi.fn(),
  shadowScaleSet: vi.fn(),
  shadowOpacityValues: [] as number[],
  groupQuaternions: new WeakMap<
    object,
    { x: number; y: number; z: number; w: number }
  >(),
  worldQuaternionReads: [] as object[],
  worldQuaternionOverride: undefined as
    | readonly [number, number, number, number]
    | undefined,
  canvasProps: null as Record<string, unknown> | null,
  createdScene: { environment: 'unexpected' } as { environment: unknown },
  canvasCreates: 0,
  runtimePreload: vi.fn().mockResolvedValue(undefined),
  runtimeSnapshot: { status: 'idle' } as Record<string, unknown>,
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
vi.mock('./choreographedDiceMotion', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./choreographedDiceMotion')>();
  return {
    ...actual,
    ChoreographedSolverV1: {
      ...actual.ChoreographedSolverV1,
      solve: (
        input: Parameters<typeof actual.ChoreographedSolverV1.solve>[0]
      ) => {
        mocks.solverInputs.push(input);
        const output = mocks.motionFailure
          ? {
              quaternion: [0.31, -0.47, 0.19, 0.805] as const,
              translation: [0, 0.16, 0] as const,
              shadow: {
                translation: [0, 0, 0] as const,
                scale: 1,
                opacity: 0.2,
              },
              observeNow: false,
              exactTargetHeld: false,
              failed: true,
            }
          : actual.ChoreographedSolverV1.solve(input);
        mocks.solverOutputs.push(output);
        return output;
      },
    },
  };
});
vi.mock('./diceSettlementResolver', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./diceSettlementResolver')>();
  return {
    ...actual,
    resolveRuntimeDiceSettlement: (
      input: Parameters<typeof actual.resolveRuntimeDiceSettlement>[0]
    ) => {
      mocks.settlementInputs.push(input);
      return actual.resolveRuntimeDiceSettlement(input);
    },
  };
});
vi.mock('./diceRuntimeProvider', () => ({
  preloadDiceRuntimePreset: (presetId: string) =>
    mocks.runtimePreload(presetId),
  getDiceRuntimePresetSnapshot: () => mocks.runtimeSnapshot,
}));
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
const ORIGINAL_PRESET_ID = 'dice.original.carved.d20';
const originalProvider = {
  kind: 'dice-runtime-preset' as const,
  presetId: ORIGINAL_PRESET_ID,
};

function runtimePreset(): DiceRuntimePreset {
  const fixture = validDiceRuntimeManifest();
  const preset = fixture.presets[0];
  preset.model.bounds = {
    bboxMin: [-4, -2, 1],
    bboxMax: [6, 8, 11],
    dimensions: [10, 10, 10],
  };
  preset.model.meshFacts.triangles = 4;
  preset.model.geometry.totalTriangles = 4;
  preset.model.geometry.bodyTriangleIndices = [2, 0];
  preset.model.geometry.numeralTriangleIndices = [3, 1];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const result of preset.faceSettlementMap.supportedResults) {
    const index = result - 1;
    const y = 1 - (2 * (index + 0.5)) / 20;
    const radius = Math.sqrt(1 - y * y);
    const angle = index * goldenAngle;
    const direction = [
      radius * Math.cos(angle),
      y,
      radius * Math.sin(angle),
    ] as const;
    const unnormalized = [
      -direction[2],
      0,
      direction[0],
      1 + direction[1],
    ] as const;
    const magnitude = Math.hypot(...unnormalized);
    preset.faceSettlementMap.entries[String(result)].quaternion =
      unnormalized.map((value) => value / magnitude) as [
        number,
        number,
        number,
        number,
      ];
    preset.faceSettlementMap.entries[String(result)].witness.readDirection = [
      ...direction,
    ];
  }
  return preset as unknown as DiceRuntimePreset;
}

function arrangeRuntimeReady(options: { missingResult?: number } = {}) {
  const preset = runtimePreset();
  if (options.missingResult !== undefined)
    delete (preset.faceSettlementMap.entries as Record<string, unknown>)[
      String(options.missingResult)
    ];
  const selectors = preset.model.selectors;
  if (selectors.kind !== 'single-mesh') throw Error('fixture mismatch');
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1],
      3
    )
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5, 0, 2, 3, 1, 3, 5]);
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  mesh.name = selectors.objectNode;
  const scene = new Group();
  scene.add(mesh);
  const binding = Object.freeze({
    objectNode: selectors.objectNode,
    meshDefinition: selectors.meshDefinition,
    meshDefinitionIndex: 0,
  });
  mocks.runtimeSnapshot = {
    status: 'ready',
    preset,
    scene,
    binding,
  };
  return { preset, scene, mesh, geometry, binding };
}

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
const throwProfile = (motionSeed: number) =>
  createVisualThrowProfile({
    releasePosition: [0.75, 0.25],
    releaseDirection: [0.6, -0.8],
    releaseSpeed: 0.7,
    shakeEnergy: 0.4,
    spinBias: -0.3,
    motionSeed,
  });
const heldRollGroup: HeldRollGroupState = Object.freeze({
  normalizedPosition: Object.freeze([0.75, 0.25] as const),
  normalizedTilt: Object.freeze([0.4, -0.2] as const),
  shakeEnergy: 0.35,
  wobblePhase: 0.25,
});
const fallbackCovered = () =>
  screen
    .getByTestId('fallback-svg')
    .closest('.attack-die-3d__fallback')
    ?.classList.contains('attack-die-3d__fallback--covered');
const frame = (index = -1, time = 0) =>
  act(() => mocks.frames.at(index)?.({ clock: { elapsedTime: time } }));
function multiplyQuaternions(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number]
): readonly [number, number, number, number] {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
beforeEach(() => {
  mocks.frames = [];
  mocks.canvasCreates = 0;
  mocks.runtimePreload.mockReset().mockResolvedValue(undefined);
  mocks.runtimeSnapshot = { status: 'idle' };
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
  mocks.solverInputs = [];
  mocks.solverOutputs = [];
  mocks.settlementInputs = [];
  mocks.poseCopy.mockReset();
  mocks.positionSet.mockReset();
  mocks.shadowPositionSet.mockReset();
  mocks.shadowScaleSet.mockReset();
  mocks.shadowOpacityValues = [];
  mocks.groupQuaternions = new WeakMap();
  mocks.worldQuaternionReads = [];
  mocks.worldQuaternionOverride = undefined;
  Object.defineProperty(HTMLElement.prototype, 'position', {
    configurable: true,
    get() {
      if (this.getAttribute('name') === 'attack-die-selected-group')
        return { set: mocks.positionSet };
      if (this.getAttribute('name') === 'attack-die-shadow')
        return { set: mocks.shadowPositionSet };
      return undefined;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scale', {
    configurable: true,
    get() {
      return this.getAttribute('name') === 'attack-die-shadow'
        ? { setScalar: mocks.shadowScaleSet }
        : undefined;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'opacity', {
    configurable: true,
    get() {
      return mocks.shadowOpacityValues.at(-1);
    },
    set(value: number) {
      if (this.getAttribute('name') === 'attack-die-shadow-material')
        mocks.shadowOpacityValues.push(value);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'quaternion', {
    configurable: true,
    get() {
      if (
        this.getAttribute('name') !== 'attack-die-selected-group' ||
        mocks.groupMissing
      )
        return undefined;
      return {
        set: (x: number, y: number, z: number, w: number) => {
          mocks.groupQuaternions.set(this, { x, y, z, w });
          mocks.poseCopy({ x, y, z, w });
        },
      };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getWorldQuaternion', {
    configurable: true,
    value(this: HTMLElement, target: Quaternion) {
      mocks.worldQuaternionReads.push(this);
      const override = mocks.worldQuaternionOverride;
      const value = override
        ? { x: override[0], y: override[1], z: override[2], w: override[3] }
        : (mocks.groupQuaternions.get(this) ?? { x: 0, y: 0, z: 0, w: 1 });
      return target.set(value.x, value.y, value.z, value.w);
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      getExtension: () => ({ loseContext: vi.fn() }),
    })),
  });
  mocks.gl.debug = { checkShaderErrors: false, onShaderError: null };
  mocks.gl.compile.mockReset().mockImplementation(() => {
    if (mocks.compileFailure) throw Error('compile threw');
    if (mocks.shaderDiagnostic) mocks.gl.debug.onShaderError?.();
  });
  mocks.gl.render = vi.fn();
  mocks.gl.dispose.mockClear();
  mocks.gl.forceContextLoss.mockClear();
});
afterEach(() => {
  delete (HTMLElement.prototype as { position?: unknown }).position;
  delete (HTMLElement.prototype as { quaternion?: unknown }).quaternion;
  delete (HTMLElement.prototype as { scale?: unknown }).scale;
  delete (HTMLElement.prototype as { opacity?: unknown }).opacity;
  delete (HTMLElement.prototype as { getWorldQuaternion?: unknown })
    .getWorldQuaternion;
  delete (HTMLCanvasElement.prototype as { getContext?: unknown }).getContext;
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
  it('detects real WebGL unavailability before mounting asynchronous R3F Canvas', () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => null),
    });
    mocks.status = 'ready';
    const telemetry = vi.fn();

    render(<AttackDie3D {...props(98)} onTelemetry={telemetry} />);

    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        renderer: 'svg',
        state: 'failed',
        failureCode: 'webgl-unavailable',
      })
    );
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
  it('ignores late old-generation motion callbacks after a token remount', () => {
    arrangeRuntimeReady();
    const telemetry = vi.fn();
    const view = render(
      <AttackDie3D
        {...props(290, 10)}
        provider={originalProvider}
        phase="rolling"
        throwProfile={throwProfile(290)}
        onTelemetry={telemetry}
      />
    );
    const staleFrame = mocks.frames.at(-1)!;

    view.rerender(
      <AttackDie3D
        {...props(291, 10)}
        provider={originalProvider}
        phase="ready"
        onTelemetry={telemetry}
      />
    );
    telemetry.mockClear();
    act(() => {
      staleFrame({ clock: { elapsedTime: 10 } });
      staleFrame({ clock: { elapsedTime: 12 } });
    });

    expect(telemetry).not.toHaveBeenCalledWith(
      expect.objectContaining({
        presentationToken: 290,
        state: 'observed',
      })
    );
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
    expect(mocks.solverInputs.at(-1)).toMatchObject({
      phase: 'ready',
      throwProfile: {
        schemaVersion: 1,
        releasePosition: [0.5, 0.5],
        releaseDirection: [0, 0],
        releaseSpeed: 0,
        shakeEnergy: 0,
        spinBias: 0,
        motionSeed: 301,
      },
    });
  });

  it('feeds profile facts and continuous elapsed time to the solver without previous-frame quaternion state', () => {
    mocks.status = 'ready';
    const profile = throwProfile(17);
    const view = render(
      <AttackDie3D {...props(302)} phase="ready" throwProfile={profile} />
    );
    frame(-1, 10);

    view.rerender(
      <AttackDie3D {...props(302)} phase="rolling" throwProfile={profile} />
    );
    frame(-1, 10.5);
    const atRelease = mocks.solverInputs.at(-1) as Record<string, unknown>;
    frame(-1, 11);
    const inFlight = mocks.solverInputs.at(-1) as Record<string, unknown>;

    view.rerender(
      <AttackDie3D {...props(302)} phase="rolling" throwProfile={profile} />
    );
    frame(-1, 11.1);
    const afterRerender = mocks.solverInputs.at(-1) as Record<string, unknown>;

    const frameInputs = [atRelease, inFlight, afterRerender];
    expect(frameInputs.map((input) => input.elapsedMs)).toEqual([0, 500, 600]);
    for (const input of frameInputs) {
      expect(input).toMatchObject({
        phase: 'rolling',
        reducedMotion: false,
        throwProfile: profile,
        member: { memberIndex: 0, memberCount: 1 },
      });
      expect(input).not.toHaveProperty('current');
    }
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

  it('keeps reduced motion neutral until release and fails closed without v2 witnesses', () => {
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
        throwProfile={throwProfile(304)}
        onTelemetry={telemetry}
      />
    );
    frame(-1, 12);
    frame(-1, 12.016);
    frame(-1, 12.032);

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationToken: 304,
        requestedResult: 1,
        renderer: 'svg',
        state: 'failed',
        failureCode: 'settlement-observation',
        exactTargetHeld: false,
      })
    );
    expect(telemetry).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: 'observed' })
    );
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

describe('Original carved runtime renderer', () => {
  it('normalizes exactly from validated dimensions and recenters the bounds midpoint', () => {
    const preset = runtimePreset();

    expect(runtimeDiceNormalization(preset)).toEqual({
      scale: 0.55 / 10,
      position: [-1, -3, -6],
    });
    expect(runtimeDiceNormalization(preset).scale).toBe(0.05500000000000001);
  });

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'takes authoritative result %i target only from the validated settlement map',
    (result) => {
      const { preset } = arrangeRuntimeReady();
      render(
        <AttackDie3D
          {...props(500 + result, result)}
          provider={originalProvider}
          phase="settled"
          calibrationPose={[0, 1, 0, 0]}
          throwProfile={throwProfile(996 - result)}
        />
      );

      frame(-1, 0);
      const expected =
        preset.faceSettlementMap.entries[String(result)].quaternion;
      expect(mocks.settlementInputs.at(-1)).toMatchObject({
        preset,
        expectedPresetId: ORIGINAL_PRESET_ID,
        authoritativeResult: result,
      });
      expect(mocks.poseCopy.mock.calls.at(-1)?.[0]).toMatchObject({
        x: expected[0],
        y: expected[1],
        z: expected[2],
        w: expected[3],
      });
    }
  );

  it('applies solver die and independently owned shadow poses only to sibling Three.js objects', () => {
    arrangeRuntimeReady();
    render(
      <AttackDie3D
        {...props(549, 12)}
        provider={originalProvider}
        phase="ready"
        throwProfile={throwProfile(549)}
        heldRollGroup={heldRollGroup}
      />
    );

    const canvas = screen.getByTestId('canvas');
    const selectedGroup = canvas.querySelector(
      'group[name="attack-die-selected-group"]'
    );
    const shadow = canvas.querySelector('mesh[name="attack-die-shadow"]');
    expect(selectedGroup).toBeTruthy();
    expect(shadow).toBeTruthy();
    expect(selectedGroup?.parentElement).toBe(shadow?.parentElement);
    expect(selectedGroup?.contains(shadow)).toBe(false);

    frame(-1, 0);
    const pose = mocks.solverOutputs.at(-1) as {
      quaternion: readonly [number, number, number, number];
      translation: readonly [number, number, number];
      shadow: {
        translation: readonly [number, number, number];
        scale: number;
        opacity: number;
      };
    };
    expect(mocks.solverInputs.at(-1)).toMatchObject({
      phase: 'ready',
      held: heldRollGroup,
      member: { memberIndex: 0, memberCount: 1 },
    });
    expect(mocks.poseCopy).toHaveBeenLastCalledWith({
      x: pose.quaternion[0],
      y: pose.quaternion[1],
      z: pose.quaternion[2],
      w: pose.quaternion[3],
    });
    expect(mocks.positionSet).toHaveBeenLastCalledWith(...pose.translation);
    expect(mocks.shadowPositionSet).toHaveBeenLastCalledWith(
      ...pose.shadow.translation
    );
    expect(mocks.shadowScaleSet).toHaveBeenLastCalledWith(pose.shadow.scale);
    expect(mocks.shadowOpacityValues.at(-1)).toBe(pose.shadow.opacity);
    expect(mocks.canvasProps?.style).toEqual({ visibility: 'hidden' });
    expect(JSON.stringify(mocks.canvasProps)).not.toMatch(
      /transform|translate|rotate/
    );
  });

  it('applies the exact model normalization as a Three.js group without Canvas transforms', () => {
    arrangeRuntimeReady();
    render(
      <AttackDie3D
        {...props(550, 12)}
        provider={originalProvider}
        phase="settled"
      />
    );

    frame(-1, 0);
    const normalization = screen
      .getByTestId('canvas')
      .querySelector('group[name="attack-die-runtime-normalization"]');
    const recenter = normalization?.querySelector(
      ':scope > group[name="attack-die-runtime-recenter"]'
    );
    expect(normalization?.getAttribute('scale')).toBe(String(0.55 / 10));
    expect(normalization?.getAttribute('position')).toBeNull();
    expect(recenter?.getAttribute('position')).toBe('-1,-3,-6');
    expect(mocks.canvasProps?.style).toEqual({ visibility: 'hidden' });
    expect(JSON.stringify(mocks.canvasProps)).not.toMatch(
      /transform|translate|rotate/
    );
  });

  it('transforms fixture bounds through the production matrix, centers their midpoint, and preserves responsive clearance', () => {
    const preset = runtimePreset();
    const normalized = runtimeDiceNormalization(preset);
    const height = 220;
    const requiredCanvasMargin = 12 + 8;
    const normalizationMatrix = new Matrix4()
      .makeScale(normalized.scale, normalized.scale, normalized.scale)
      .multiply(new Matrix4().makeTranslation(...normalized.position));
    const { bboxMin, bboxMax } = preset.model.bounds;
    const sourceMidpoint = new Vector3(
      (bboxMin[0] + bboxMax[0]) / 2,
      (bboxMin[1] + bboxMax[1]) / 2,
      (bboxMin[2] + bboxMax[2]) / 2
    );
    expect(sourceMidpoint.applyMatrix4(normalizationMatrix).length()).toBe(0);
    const normalizedCorners: Vector3[] = [];
    for (const x of [bboxMin[0], bboxMax[0]])
      for (const y of [bboxMin[1], bboxMax[1]])
        for (const z of [bboxMin[2], bboxMax[2]])
          normalizedCorners.push(
            new Vector3(x, y, z).applyMatrix4(normalizationMatrix)
          );

    for (const width of [240, 356, 440]) {
      expect(runtimeDiceNormalization(preset)).toEqual(normalized);
      for (const result of preset.faceSettlementMap.supportedResults) {
        const camera = new PerspectiveCamera(35, width / height, 0.1, 100);
        camera.position.set(
          0.7 * ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE,
          1.7146 * ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE,
          0.7 * ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE
        );
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const target =
          preset.faceSettlementMap.entries[String(result)].quaternion;
        const projectedCorners = normalizedCorners.map((corner) =>
          corner
            .clone()
            .applyQuaternion(new Quaternion(...target))
            .add(new Vector3(-0.23, 0, 0))
            .project(camera)
        );
        const xs = projectedCorners.map(
          (corner) => ((corner.x + 1) * width) / 2
        );
        const ys = projectedCorners.map(
          (corner) => ((1 - corner.y) * height) / 2
        );
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(requiredCanvasMargin);
        expect(width - Math.max(...xs)).toBeGreaterThanOrEqual(
          requiredCanvasMargin
        );
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(requiredCanvasMargin);
        expect(height - Math.max(...ys)).toBeGreaterThanOrEqual(
          requiredCanvasMargin
        );
      }
    }
  });

  it('replays one parsed profile identically at fixed samples while paired runtime ownership stays distinct', () => {
    arrangeRuntimeReady();
    const profile = throwProfile(755);
    const rollerTelemetry = vi.fn();
    const spectatorTelemetry = vi.fn();
    const rollerRenderer = vi.fn();
    const spectatorRenderer = vi.fn();
    render(
      <>
        <AttackDie3D
          {...props(555, 10)}
          provider={originalProvider}
          phase="rolling"
          throwProfile={profile}
          onTelemetry={rollerTelemetry}
          onRendererInfo={rollerRenderer}
        />
        <AttackDie3D
          {...props(556, 10)}
          provider={originalProvider}
          phase="rolling"
          throwProfile={structuredClone(profile)}
          onTelemetry={spectatorTelemetry}
          onRendererInfo={spectatorRenderer}
        />
      </>
    );

    for (const elapsedSeconds of [10, 10.333, 11.2, 11.9]) {
      frame(-2, elapsedSeconds);
      frame(-1, elapsedSeconds);
      const [rollerPose, spectatorPose] = mocks.solverOutputs.slice(-2);
      expect(rollerPose).toEqual(spectatorPose);
    }

    const rollerCreated = rollerRenderer.mock.calls
      .map(([event]) => event)
      .find((event) => event.lifecycle === 'created');
    const spectatorCreated = spectatorRenderer.mock.calls
      .map(([event]) => event)
      .find((event) => event.lifecycle === 'created');
    expect(rollerCreated).toMatchObject({ presentationToken: 555 });
    expect(spectatorCreated).toMatchObject({ presentationToken: 556 });
    expect(rollerCreated.contextId).not.toBe(spectatorCreated.contextId);

    const rollerObserved = rollerTelemetry.mock.calls
      .map(([event]) => event)
      .find((event) => event.state === 'observed');
    const spectatorObserved = spectatorTelemetry.mock.calls
      .map(([event]) => event)
      .find((event) => event.state === 'observed');
    expect(rollerObserved.throwProfile).toEqual(spectatorObserved.throwProfile);
    expect(rollerObserved.runtimeSourceId).toBe(
      spectatorObserved.runtimeSourceId
    );
    expect(rollerObserved.runtimeCloneId).not.toBe(
      spectatorObserved.runtimeCloneId
    );
  });

  it('shares one provider source while witnesses own separate clones, Canvas, telemetry, and disposal', () => {
    const { scene, geometry } = arrangeRuntimeReady();
    const sceneClone = vi.spyOn(scene, 'clone');
    const geometryClone = vi.spyOn(geometry, 'clone');
    const rollerTelemetry = vi.fn();
    const spectatorTelemetry = vi.fn();
    const view = render(
      <>
        <AttackDie3D
          {...props(560, 10)}
          provider={originalProvider}
          phase="settled"
          onTelemetry={rollerTelemetry}
        />
        <AttackDie3D
          {...props(561, 10)}
          provider={originalProvider}
          phase="settled"
          onTelemetry={spectatorTelemetry}
        />
      </>
    );

    expect(mocks.runtimeSnapshot.scene).toBe(scene);
    expect(mocks.canvasCreates).toBe(2);
    expect(sceneClone).toHaveBeenCalledTimes(2);
    expect(geometryClone).toHaveBeenCalledTimes(2);
    frame(-2, 0);
    frame(-1, 0);
    expect(rollerTelemetry).not.toBe(spectatorTelemetry);
    expect(rollerTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ presentationToken: 560, renderer: '3d' })
    );
    expect(spectatorTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ presentationToken: 561, renderer: '3d' })
    );
    const rollerObserved = rollerTelemetry.mock.calls
      .map(([event]) => event)
      .find((event) => event.state === 'observed');
    const spectatorObserved = spectatorTelemetry.mock.calls
      .map(([event]) => event)
      .find((event) => event.state === 'observed');
    expect(rollerObserved).toMatchObject({
      observedUpwardResult: 10,
      observedUpDot: expect.any(Number),
      observedUpMargin: expect.any(Number),
      runtimeSourceId: expect.any(Number),
      runtimeCloneId: expect.any(Number),
    });
    expect(spectatorObserved).toMatchObject({
      observedUpwardResult: 10,
      observedUpDot: expect.any(Number),
      observedUpMargin: expect.any(Number),
      runtimeSourceId: rollerObserved.runtimeSourceId,
      runtimeCloneId: expect.any(Number),
    });
    expect(rollerObserved.observedUpDot).toBeGreaterThan(0.999999);
    expect(spectatorObserved.observedUpDot).toBeGreaterThan(0.999999);
    expect(rollerObserved.observedUpMargin).toBeGreaterThan(0.2);
    expect(spectatorObserved.observedUpMargin).toBeGreaterThan(0.2);
    expect(mocks.worldQuaternionReads).toHaveLength(2);
    expect(mocks.worldQuaternionReads[0]).not.toBe(
      mocks.worldQuaternionReads[1]
    );
    expect(spectatorObserved.runtimeCloneId).not.toBe(
      rollerObserved.runtimeCloneId
    );

    view.unmount();
    const disposed = [
      ...rollerTelemetry.mock.calls,
      ...spectatorTelemetry.mock.calls,
    ]
      .map(([event]) => event)
      .filter((event) => event.state === 'disposed');
    expect(disposed).toHaveLength(2);
  });

  it.each(['geometry', 'motion'] as const)(
    'releases the owned renderer immediately and exactly once on %s failure',
    (failure) => {
      const { geometry } = arrangeRuntimeReady();
      if (failure === 'geometry') geometry.setIndex(null);
      else mocks.motionFailure = true;
      const rendererInfo = vi.fn();
      const telemetry = vi.fn();
      const view = render(
        <AttackDie3D
          {...props(565, 10)}
          provider={originalProvider}
          phase={failure === 'motion' ? 'rolling' : 'ready'}
          onRendererInfo={rendererInfo}
          onTelemetry={telemetry}
        />
      );
      if (failure === 'motion') frame(-1, 0);

      expect(screen.queryByTestId('canvas')).toBeNull();
      expect(telemetry).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'failed',
          failureCode: 'provider-load',
        })
      );
      expect(mocks.gl.dispose).toHaveBeenCalledTimes(1);
      expect(mocks.gl.forceContextLoss).toHaveBeenCalledTimes(1);
      expect(
        rendererInfo.mock.calls.map(([event]) => event.lifecycle)
      ).toContain('release-requested');

      act(() =>
        mocks.listeners.get('webglcontextlost')?.(
          new Event('webglcontextlost', { cancelable: true })
        )
      );
      expect(
        rendererInfo.mock.calls.map(([event]) => event.lifecycle)
      ).toContain('release-observed');
      expect(
        rendererInfo.mock.calls.map(([event]) => event.lifecycle)
      ).not.toContain('unexpected-loss');

      view.unmount();
      expect(mocks.gl.dispose).toHaveBeenCalledTimes(1);
      expect(mocks.gl.forceContextLoss).toHaveBeenCalledTimes(1);
    }
  );

  it('classifies an unrequested WebGL context loss before releasing terminal ownership', () => {
    arrangeRuntimeReady();
    const rendererInfo = vi.fn();
    const telemetry = vi.fn();
    render(
      <AttackDie3D
        {...props(566, 10)}
        provider={originalProvider}
        phase="ready"
        onRendererInfo={rendererInfo}
        onTelemetry={telemetry}
      />
    );

    act(() =>
      mocks.listeners.get('webglcontextlost')?.(
        new Event('webglcontextlost', { cancelable: true })
      )
    );

    expect(rendererInfo).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: 'unexpected-loss' })
    );
    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'failed',
        failureCode: 'context-loss',
      })
    );
  });

  it('keeps reduced motion neutral until explicit release and then observes the exact mapped target', () => {
    const { preset } = arrangeRuntimeReady();
    const telemetry = vi.fn();
    const view = render(
      <AttackDie3D
        {...props(570, 7)}
        provider={originalProvider}
        phase="ready"
        reducedMotion
        heldRollGroup={heldRollGroup}
        onTelemetry={telemetry}
      />
    );
    frame(-1, 20);
    const firstHeldCue = mocks.solverOutputs.at(-1);
    frame(-1, 20.5);
    expect(mocks.solverOutputs.at(-1)).toEqual(firstHeldCue);
    expect(mocks.solverInputs.at(-1)).toMatchObject({
      phase: 'ready',
      reducedMotion: true,
      held: heldRollGroup,
    });
    expect(telemetry).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: 'observed' })
    );

    view.rerender(
      <AttackDie3D
        {...props(570, 7)}
        provider={originalProvider}
        phase="rolling"
        reducedMotion
        throwProfile={throwProfile(91)}
        onTelemetry={telemetry}
      />
    );
    frame(-1, 21);
    frame(-1, 21.016);

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationToken: 570,
        requestedResult: 7,
        mappedTarget: preset.faceSettlementMap.entries['7'].quaternion,
        observedQuaternion: preset.faceSettlementMap.entries['7'].quaternion,
        observedUpwardResult: 7,
        observedUpDot: expect.any(Number),
        observedUpMargin: expect.any(Number),
        angularErrorDegrees: expect.any(Number),
        exactTargetHeld: true,
        motionRevision: 'choreographed-v1',
        throwProfile: throwProfile(91),
      })
    );
    const observation = telemetry.mock.calls
      .map(([event]) => event)
      .find((event) => event.state === 'observed');
    expect(observation.observedUpDot).toBeGreaterThan(0.999999);
    expect(observation.observedUpMargin).toBeGreaterThan(0.2);
    expect(Object.isFrozen(observation.throwProfile)).toBe(true);
    expect(Object.isFrozen(observation.throwProfile.releasePosition)).toBe(
      true
    );
    expect(Object.isFrozen(observation.throwProfile.releaseDirection)).toBe(
      true
    );
    expect(mocks.worldQuaternionReads).toHaveLength(1);
  });

  it('fails closed when a synthetically permuted target physically presents another result', () => {
    const { preset } = arrangeRuntimeReady();
    const mutableEntries = preset.faceSettlementMap
      .entries as unknown as Record<
      string,
      { quaternion: [number, number, number, number] }
    >;
    mutableEntries['3'].quaternion = [
      ...preset.faceSettlementMap.entries['5'].quaternion,
    ];
    const telemetry = vi.fn();

    render(
      <AttackDie3D
        {...props(571, 3)}
        provider={originalProvider}
        phase="settled"
        onTelemetry={telemetry}
      />
    );
    frame(-1, 0);

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationToken: 571,
        requestedResult: 3,
        renderer: 'svg',
        state: 'failed',
        failureCode: 'settlement-observation',
        exactTargetHeld: false,
      })
    );
    expect(telemetry).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: 'observed' })
    );
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
  });

  it('observes a final rendered world pose inside every success threshold', () => {
    const { preset } = arrangeRuntimeReady();
    const target = preset.faceSettlementMap.entries['8'].quaternion;
    const allowedWorldOffset = [
      0,
      Math.sin((0.2 * Math.PI) / 360),
      0,
      Math.cos((0.2 * Math.PI) / 360),
    ] as const;
    mocks.worldQuaternionOverride = multiplyQuaternions(
      allowedWorldOffset,
      target
    );
    const telemetry = vi.fn();

    render(
      <AttackDie3D
        {...props(572, 8)}
        provider={originalProvider}
        phase="settled"
        onTelemetry={telemetry}
      />
    );
    frame(-1, 0);

    const observed = telemetry.mock.calls
      .map(([event]) => event)
      .find((event) => event.state === 'observed');
    expect(observed).toMatchObject({
      requestedResult: 8,
      observedUpwardResult: 8,
      observedUpDot: expect.any(Number),
      observedUpMargin: expect.any(Number),
      angularErrorDegrees: expect.any(Number),
      exactTargetHeld: true,
    });
    expect(observed.angularErrorDegrees).toBeGreaterThan(0.19);
    expect(observed.angularErrorDegrees).toBeLessThanOrEqual(0.25);
    expect(observed.observedUpDot).toBeGreaterThan(0.999999);
    expect(observed.observedUpMargin).toBeGreaterThan(0.2);
  });

  it.each([
    [
      'angular error',
      [
        0,
        Math.sin((0.3 * Math.PI) / 360),
        0,
        Math.cos((0.3 * Math.PI) / 360),
      ] as const,
    ],
    [
      'upward alignment',
      [
        Math.sin((0.1 * Math.PI) / 360),
        0,
        0,
        Math.cos((0.1 * Math.PI) / 360),
      ] as const,
    ],
  ])(
    'requires the final rendered world pose to satisfy %s threshold',
    (_name, worldOffset) => {
      const { preset } = arrangeRuntimeReady();
      const target = preset.faceSettlementMap.entries['8'].quaternion;
      mocks.worldQuaternionOverride = multiplyQuaternions(worldOffset, target);
      const telemetry = vi.fn();

      render(
        <AttackDie3D
          {...props(572, 8)}
          provider={originalProvider}
          phase="settled"
          onTelemetry={telemetry}
        />
      );
      frame(-1, 0);

      expect(telemetry).toHaveBeenCalledWith(
        expect.objectContaining({
          renderer: 'svg',
          state: 'failed',
          failureCode: 'settlement-observation',
          exactTargetHeld: false,
        })
      );
      expect(telemetry).not.toHaveBeenCalledWith(
        expect.objectContaining({ state: 'observed' })
      );
      expect(mocks.worldQuaternionReads).toHaveLength(1);
    }
  );

  it('fails a still-pending provider to concealed SVG only after release', () => {
    mocks.runtimeSnapshot = { status: 'loading' };
    const telemetry = vi.fn();
    const view = render(
      <AttackDie3D
        {...props(580, 10)}
        provider={originalProvider}
        phase="ready"
        onTelemetry={telemetry}
      />
    );
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(fallbackCovered()).toBe(false);
    expect(telemetry).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: 'failed' })
    );

    view.rerender(
      <AttackDie3D
        {...props(580, 10)}
        provider={originalProvider}
        phase="rolling"
        onTelemetry={telemetry}
      />
    );
    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        renderer: 'svg',
        state: 'failed',
        failureCode: 'provider-load',
      })
    );
    expect(fallbackCovered()).toBe(false);
  });

  it('retains lower-level synthetic unmapped-result failure coverage', () => {
    arrangeRuntimeReady({ missingResult: 11 });
    const telemetry = vi.fn();
    render(
      <AttackDie3D
        {...props(590, 11)}
        provider={originalProvider}
        phase="rolling"
        onTelemetry={telemetry}
      />
    );

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'failed',
        failureCode: 'unmapped-result',
      })
    );
  });
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

interface CssRuleSnapshot {
  selectors: readonly string[];
  declarations: readonly { property: string; value: string }[];
}

function splitTopLevelSelectorList(value: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '(') parenthesisDepth += 1;
    else if (character === ')') parenthesisDepth -= 1;
    else if (
      character === ',' &&
      bracketDepth === 0 &&
      parenthesisDepth === 0
    ) {
      selectors.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(value.slice(start).trim());
  return selectors.filter(Boolean);
}

function cssRuleSnapshots(source: string): CssRuleSnapshot[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: splitTopLevelSelectorList(match[1]),
    declarations: match[2]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        return {
          property: declaration.slice(0, separator).trim().toLowerCase(),
          value: declaration
            .slice(separator + 1)
            .trim()
            .toLowerCase(),
        };
      }),
  }));
}

function rightmostCompoundSelector(selector: string): string {
  let start = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let quote: string | undefined;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) {
      if (character === quote && selector[index - 1] !== '\\')
        quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === '(') parenthesisDepth += 1;
    else if (character === ')') parenthesisDepth -= 1;
    else if (
      bracketDepth === 0 &&
      parenthesisDepth === 0 &&
      (character === '>' ||
        character === '+' ||
        character === '~' ||
        /\s/.test(character))
    ) {
      start = index + 1;
    }
  }
  return selector.slice(start).trim();
}

const MOTION_PROPERTIES = new Set([
  'filter',
  'rotate',
  'scale',
  'transform',
  'translate',
]);

function isMotionProperty(property: string): boolean {
  return MOTION_PROPERTIES.has(property) || property.startsWith('animation-');
}
const PROTECTED_MOTION_TARGETS = [
  '.attack-die-3d__canvas',
  '.attack-die-3d',
  '.dice-tray-3d-renderer',
] as const;
const GRAB_TARGET_SELECTOR =
  '.dice-tray-3d-renderer > .dice-tray-3d-grab-target';

function compoundTargetsClass(compound: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?![A-Za-z0-9_-])`).test(compound);
}

function protectedMotionViolations(source: string): string[] {
  const violations: string[] = [];
  for (const rule of cssRuleSnapshots(source)) {
    for (const selector of rule.selectors) {
      const compound = rightmostCompoundSelector(selector);
      const protectedTarget = PROTECTED_MOTION_TARGETS.find((className) =>
        compoundTargetsClass(compound, className)
      );
      if (!protectedTarget) continue;
      for (const declaration of rule.declarations) {
        if (
          declaration.property === 'animation' ||
          isMotionProperty(declaration.property)
        )
          violations.push(`${selector} -> ${declaration.property}`);
      }
    }
  }
  return violations;
}

function invalidGrabTargetMotion(source: string): string[] {
  const violations: string[] = [];
  for (const rule of cssRuleSnapshots(source)) {
    for (const selector of rule.selectors) {
      if (
        !compoundTargetsClass(
          rightmostCompoundSelector(selector),
          '.dice-tray-3d-grab-target'
        )
      )
        continue;
      for (const declaration of rule.declarations) {
        if (
          declaration.property !== 'animation' &&
          !isMotionProperty(declaration.property)
        )
          continue;
        const allowed =
          selector === GRAB_TARGET_SELECTOR &&
          declaration.property === 'transform' &&
          declaration.value.replace(/\s+/g, '') === 'translate(-50%,-50%)';
        if (!allowed) violations.push(`${selector} -> ${declaration.property}`);
      }
    }
  }
  return violations;
}

it('guards protected CSS targets across contextual and comma selectors', () => {
  const css = readFileSync('public/themes/base.css', 'utf8');

  expect(protectedMotionViolations(css)).toEqual([]);
  expect(invalidGrabTargetMotion(css)).toEqual([]);

  const contextualMutation = `${css}\n.scope .attack-die-3d { transform: translateX(1px); }`;
  expect(protectedMotionViolations(contextualMutation)).toContain(
    '.scope .attack-die-3d -> transform'
  );

  const commaMutation = `${css}\n.safe, .scope > .attack-die-3d__canvas { animation: drift 1s; }`;
  expect(protectedMotionViolations(commaMutation)).toContain(
    '.scope > .attack-die-3d__canvas -> animation'
  );

  const rendererMutation = `${css}\n.layout + .dice-tray-3d-renderer:hover { filter: blur(1px); }`;
  expect(protectedMotionViolations(rendererMutation)).toContain(
    '.layout + .dice-tray-3d-renderer:hover -> filter'
  );

  expect(
    protectedMotionViolations(
      `${css}\n.attack-die-3d .unprotected-child { transform: none; }`
    )
  ).toEqual([]);

  expect(
    invalidGrabTargetMotion(
      `${css}\n${GRAB_TARGET_SELECTOR} { animation: pulse 1s; }`
    )
  ).toContain(`${GRAB_TARGET_SELECTOR} -> animation`);
  expect(
    invalidGrabTargetMotion(
      `${css}\n${GRAB_TARGET_SELECTOR} { transform: translate(-40%, -50%); }`
    )
  ).toContain(`${GRAB_TARGET_SELECTOR} -> transform`);
});
