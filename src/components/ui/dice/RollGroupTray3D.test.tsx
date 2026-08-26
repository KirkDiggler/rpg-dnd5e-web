import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { Group, PerspectiveCamera, Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceMotionPose } from './diceMotionSolver';
import type { DiceRollGroupDie, DiceRollGroupInput } from './diceRollGroup';
import { layoutHeldRollGroup } from './rollGroupLayout';
import { ROLL_GROUP_FEEL_PROFILES } from './rollGroupMotionSolver';
import { RollGroupTray3D, type RollGroupTray3DProps } from './RollGroupTray3D';
import type { TrayPlaneProjection } from './trayPlaneProjection';

const mocks = vi.hoisted(() => ({
  canvases: 0,
  meshes: [] as Array<Record<string, unknown>>,
  bridgeProps: [] as Array<Record<string, unknown>>,
  camera: undefined as unknown as PerspectiveCamera,
  domElement: undefined as unknown as HTMLCanvasElement,
  projection: undefined as unknown as TrayPlaneProjection,
  nextCloneId: 1,
  productionScene: undefined as unknown as Group,
  conceptScene: undefined as unknown as Group,
  productionPreset: undefined as unknown as Record<string, unknown>,
  conceptPreset: undefined as unknown as Record<string, unknown>,
  binding: undefined as unknown as Record<string, unknown>,
  canvasCamera: undefined as unknown as PerspectiveCamera,
  canvasFailure: false,
  renderer: undefined as unknown as Record<string, unknown>,
  surfaceCaptures: [] as Array<readonly [number, number]>,
  projectedSurface: [141, 37] as readonly [number, number],
}));

vi.mock('@react-three/fiber', () => ({
  useThree: <T,>(
    selector: (state: {
      camera: PerspectiveCamera;
      gl: { domElement: HTMLCanvasElement };
    }) => T
  ): T =>
    selector({
      camera: mocks.camera,
      gl: { domElement: mocks.domElement },
    }),
  Canvas: ({
    children,
    camera: cameraInput,
    onCreated,
  }: {
    children?: React.ReactNode;
    camera?: Readonly<{
      fov: number;
      near: number;
      far: number;
      position: readonly [number, number, number];
      up: readonly [number, number, number];
    }>;
    onCreated?: (input: {
      camera: PerspectiveCamera;
      gl: Record<string, unknown>;
      scene: Scene;
    }) => void;
  }) => {
    mocks.canvases += 1;
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    if (!cameraRef.current) {
      cameraRef.current = new PerspectiveCamera(
        cameraInput?.fov,
        2,
        cameraInput?.near,
        cameraInput?.far
      );
      if (cameraInput) {
        cameraRef.current.position.set(...cameraInput.position);
        cameraRef.current.up.set(...cameraInput.up);
      }
    }
    const camera = cameraRef.current;
    mocks.canvasCamera = camera;
    mocks.camera = camera;
    useLayoutEffect(() => {
      onCreated?.({ camera, gl: mocks.renderer, scene: new Scene() });
    }, [camera, onCreated]);
    if (mocks.canvasFailure) throw Error('WebGL creation failed');
    return (
      <div data-testid="shared-roll-group-canvas">
        {Children.toArray(children).filter(
          (child) =>
            !isValidElement(child) ||
            (child.type !== 'ambientLight' && child.type !== 'directionalLight')
        )}
      </div>
    );
  },
}));
vi.mock('./TrayPlaneProjectionBridge', () => ({
  TrayPlaneProjectionBridge: (props: Record<string, unknown>) => {
    mocks.bridgeProps.push(props);
    const projectionRef = props.projectionRef as React.MutableRefObject<
      TrayPlaneProjection | undefined
    >;
    const onProjection = props.onProjection as
      | ((value: TrayPlaneProjection) => void)
      | undefined;
    projectionRef.current = mocks.projection;
    useEffect(() => {
      onProjection?.(mocks.projection);
    }, [onProjection]);
    return null;
  },
}));
vi.mock('./RuntimeDiceMesh', () => ({
  RuntimeDiceMesh: (props: Record<string, unknown>) => {
    mocks.meshes.push(props);
    const onReady = props.onReady as
      | ((value: { runtimeSourceId: number; runtimeCloneId: number }) => void)
      | undefined;
    const source = props.source as
      | { preset?: { presetId?: string } }
      | undefined;
    const surfaceHandleRef = props.surfaceHandleRef as
      | React.MutableRefObject<
          | {
              captureSurface: (input: {
                clientX: number;
                clientY: number;
              }) => unknown;
              projectSurface: () => readonly [number, number];
            }
          | undefined
        >
      | undefined;
    useLayoutEffect(() => {
      if (!surfaceHandleRef) return undefined;
      const handle = {
        captureSurface: (input: { clientX: number; clientY: number }) => {
          mocks.surfaceCaptures.push([input.clientX, input.clientY]);
          return Object.freeze({
            object: new Group(),
            localPoint: Object.freeze([0.1, 0.2, 0.3] as const),
            runtimeCloneId: mocks.nextCloneId,
          });
        },
        projectSurface: () => mocks.projectedSurface,
      };
      surfaceHandleRef.current = handle;
      return () => {
        if (surfaceHandleRef.current === handle)
          surfaceHandleRef.current = undefined;
      };
    }, [surfaceHandleRef]);
    useEffect(() => {
      onReady?.({
        runtimeSourceId: source?.preset?.presetId?.endsWith('d20') ? 20 : 6,
        runtimeCloneId: mocks.nextCloneId++,
      });
    }, [onReady, source]);
    return <div data-testid="shared-runtime-die" />;
  },
}));
vi.mock('./diceRuntimeProvider', () => ({
  getDiceRuntimePresetSnapshot: () => ({
    status: 'ready',
    preset: mocks.productionPreset,
    scene: mocks.productionScene,
    binding: mocks.binding,
  }),
  preloadDiceRuntimePreset: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./conceptDiceRuntimeProvider', () => ({
  getConceptDiceRuntimePresetSnapshot: (presetId: string) => ({
    status: 'ready',
    assurance: 'provisional-concept',
    preset:
      presetId === 'dice.original.carved.d6'
        ? mocks.conceptPreset
        : { ...mocks.conceptPreset, presetId },
    scene: mocks.conceptScene,
    binding: mocks.binding,
  }),
  preloadConceptDiceRuntimePreset: vi.fn().mockResolvedValue(undefined),
}));

const POSE: DiceMotionPose = Object.freeze({
  quaternion: Object.freeze([0, 0, 0, 1] as const),
  translation: Object.freeze([0.5, 0, 0] as const),
  shadow: Object.freeze({
    translation: Object.freeze([0.5, 0, 0] as const),
    scale: 1,
    opacity: 0.3,
  }),
  observeNow: false,
  exactTargetHeld: false,
  failed: false,
});
const OBSERVED_POSE: DiceMotionPose = Object.freeze({
  ...POSE,
  observeNow: true,
  exactTargetHeld: true,
});

function die(
  id: string,
  kind: DiceRollGroupDie['kind'],
  presetId = `dice.original.carved.${kind}`
): DiceRollGroupDie {
  return {
    id,
    kind,
    presetId,
    setId: 'set:1',
    originalFace: 2,
    finalFace: 4,
    rerolls: [],
    disposition: 'counted',
    sourceRef: 'source:1',
    sourceLabel: 'Base roll',
    contributorMemberId: 'member:1',
    purpose: 'base',
  };
}

const group: DiceRollGroupInput = Object.freeze({
  key: 'damage',
  dice: Object.freeze([die('die:one', 'd20'), die('die:two', 'd6')]),
  modifiers: Object.freeze([]),
  suppliedFinalTotal: 8,
});

const baseProps: RollGroupTray3DProps = {
  label: 'Damage dice',
  presentationId: 'damage:1',
  rendererGeneration: -101,
  motionSeed: 17,
  rollerRole: 'player',
  witnessRole: 'roller',
  phase: 'rolling-originals',
  group,
  feel: ROLL_GROUP_FEEL_PROFILES.weighty,
  appearances: group.dice.map((item) => ({
    dieId: item.id,
    treatment: {
      bodyColor: '#15233b',
      numeralColor: '#f5eddc',
      roughness: 0.72,
      metalness: 0.08,
    },
  })),
};

let capturedPointers: WeakMap<HTMLElement, Set<number>>;
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext'
);

function latestMesh(dieId: string) {
  return [...mocks.meshes]
    .reverse()
    .find((mesh) => mesh.selectedGroupName === `roll-group-die-${dieId}`)!;
}

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
    })),
  });
  mocks.canvases = 0;
  mocks.meshes = [];
  mocks.bridgeProps = [];
  mocks.nextCloneId = 1;
  mocks.productionScene = new Group();
  mocks.conceptScene = new Group();
  mocks.binding = Object.freeze({
    objectNode: 'die',
    meshDefinition: 'mesh',
    meshDefinitionIndex: 0,
  });
  mocks.canvasFailure = false;
  mocks.surfaceCaptures = [];
  mocks.projectedSurface = [141, 37];
  mocks.renderer = {
    domElement: mocks.domElement,
    render: vi.fn(),
    compile: vi.fn(),
    debug: { checkShaderErrors: false, onShaderError: null },
  };
  mocks.productionPreset = Object.freeze({
    presetId: 'dice.original.carved.d20',
    dieKind: 'd20',
    faceSettlementMap: {
      supportedResults: Array.from({ length: 20 }, (_, index) => index + 1),
      entries: Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [
          String(index + 1),
          {
            quaternion: [0, 0, 0, 1],
            witness: {
              kind: 'runtime-direction',
              readKind: 'face',
              readIndex: index,
              readDirection: [0, 0, 1],
            },
          },
        ])
      ),
    },
  });
  mocks.conceptPreset = Object.freeze({
    presetId: 'dice.original.carved.d6',
    dieKind: 'd6',
    faceSettlementMap: {
      supportedResults: [1, 2, 3, 4, 5, 6],
      entries: Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((value) => [
          String(value),
          {
            quaternion: [0, 0, 0, 1],
            witness: {
              kind: 'runtime-direction',
              readKind: 'face',
              readIndex: value - 1,
              readDirection: [0, 0, 1],
            },
          },
        ])
      ),
    },
  });
  mocks.camera = new PerspectiveCamera(90, 2, 0.1, 100);
  mocks.camera.position.set(0, 3, 0);
  mocks.camera.up.set(0, 0, -1);
  mocks.camera.lookAt(0, 0, 0);
  mocks.camera.updateProjectionMatrix();
  mocks.camera.updateMatrixWorld(true);
  mocks.domElement = document.createElement('canvas');
  mocks.renderer.domElement = mocks.domElement;
  mocks.projection = Object.freeze({
    screenToPlane: (x: number, y: number) =>
      [((x - 100) / 200) * 0.72, ((50 - y) / 100) * 0.52] as const,
    planeToScreen: (point: readonly [number, number]) =>
      [100 + (point[0] / 0.72) * 200, 50 - (point[1] / 0.52) * 100] as const,
    planeToNormalized: (point: readonly [number, number]) =>
      [0.5 + point[0] / 0.72, 0.5 + point[1] / 0.52] as const,
  });
  capturedPointers = new WeakMap();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        const captured = capturedPointers.get(this) ?? new Set<number>();
        captured.add(pointerId);
        capturedPointers.set(this, captured);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        return capturedPointers.get(this)?.has(pointerId) ?? false;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        capturedPointers.get(this)?.delete(pointerId);
      },
    },
    getBoundingClientRect: {
      configurable: true,
      value(this: HTMLElement) {
        const id = this.getAttribute('data-roll-group-die-id');
        const bounds = id
          ? {
              left: id === 'die:two' ? 60 : 0,
              top: 0,
              width: 50,
              height: 50,
            }
          : { left: 0, top: 0, width: 200, height: 100 };
        return {
          ...bounds,
          right: bounds.left + bounds.width,
          bottom: bounds.top + bounds.height,
          x: bounds.left,
          y: bounds.top,
          toJSON: () => bounds,
        };
      },
    },
  });
});

afterEach(() => {
  if (originalGetContext)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'getContext',
      originalGetContext
    );
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
});

describe('RollGroupTray3D', () => {
  it('aims the production camera at the horizontal tray plane', () => {
    render(<RollGroupTray3D {...baseProps} />);

    const direction = mocks.canvasCamera.getWorldDirection(
      mocks.canvasCamera.position.clone()
    );
    expect(direction.x).toBeCloseTo(0, 8);
    expect(direction.y).toBeCloseTo(-1, 8);
    expect(direction.z).toBeCloseTo(0, 8);
  });

  it('positions member hit targets as projected overlays over their dice', () => {
    render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        onReleaseRequest={vi.fn()}
      />
    );

    const overlay = document.querySelector(
      '.roll-group-tray-3d__targets'
    ) as HTMLElement;
    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.inset).toBe('0');
    const layouts = layoutHeldRollGroup(group.dice);
    for (const layout of layouts) {
      const target = document.querySelector(
        `[data-roll-group-die-id="${layout.dieId}"]`
      ) as HTMLElement;
      const projectedCenter = mocks.projection.planeToScreen(layout.center)!;
      expect(target.style.position).toBe('absolute');
      expect(Number.parseFloat(target.style.left)).toBeCloseTo(
        projectedCenter[0],
        6
      );
      expect(Number.parseFloat(target.style.top)).toBeCloseTo(
        projectedCenter[1],
        6
      );
      expect(Number.parseFloat(target.style.width)).toBeGreaterThan(0);
      expect(Number.parseFloat(target.style.height)).toBeGreaterThan(0);
    }
  });

  it('reports a thrown Canvas/WebGL creation error through the group failure boundary', () => {
    mocks.canvasFailure = true;
    const onFailure = vi.fn();

    expect(() =>
      render(<RollGroupTray3D {...baseProps} onFailure={onFailure} />)
    ).not.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][1]).toMatch(/WebGL creation failed/i);
  });

  it('owns every member in one Canvas and exposes only stable member data selectors', () => {
    render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        onReleaseRequest={vi.fn()}
      />
    );

    expect(screen.getAllByTestId('shared-roll-group-canvas')).toHaveLength(1);
    expect(screen.getAllByTestId('shared-runtime-die')).toHaveLength(2);
    const targets = group.dice.map(
      (item) => document.querySelector(`[data-roll-group-die-id="${item.id}"]`)!
    );
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(Object.keys((target as HTMLElement).dataset).sort()).toEqual([
        'rendererGeneration',
        'rollGroupDieId',
        'witnessRole',
      ]);
      expect(target.getAttribute('data-renderer-generation')).toBe('-101');
      expect(target.getAttribute('data-witness-role')).toBe('roller');
    }
    expect(screen.getAllByRole('button', { name: 'Roll dice' })).toHaveLength(
      1
    );
  });

  it.each([
    ['die:one', 10],
    ['die:two', 70],
  ])('grabbing %s picks up and releases the whole group', (dieId, clientX) => {
    const onReleaseRequest = vi.fn();
    render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        onReleaseRequest={onReleaseRequest}
      />
    );
    const target = document.querySelector(
      `[data-roll-group-die-id="${dieId}"]`
    )!;

    fireEvent.pointerDown(target, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX,
      clientY: 10,
      timeStamp: 0,
    });
    const heldPoses = group.dice.map((item) =>
      (latestMesh(item.id).getPose as (elapsed: number) => DiceMotionPose)(16)
    );
    expect(heldPoses.every((pose) => pose.translation[1] > 0)).toBe(true);
    expect(heldPoses[0].translation).not.toEqual(heldPoses[1].translation);

    fireEvent.pointerMove(target, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: clientX + 15,
      clientY: 20,
      timeStamp: 16,
    });
    const movedPoses = group.dice.map((item) =>
      (latestMesh(item.id).getPose as (elapsed: number) => DiceMotionPose)(32)
    );
    expect(
      movedPoses[0].translation[0] - heldPoses[0].translation[0]
    ).toBeCloseTo(
      movedPoses[1].translation[0] - heldPoses[1].translation[0],
      8
    );

    fireEvent.pointerUp(target, {
      pointerId: 4,
      pointerType: 'mouse',
      clientX: clientX + 25,
      clientY: 20,
      timeStamp: 32,
    });
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        releasePosition: expect.any(Array),
        releaseDirection: expect.any(Array),
      })
    );
  });

  it('uses the neutral group profile for explicit Roll and exposes no spectator controls', () => {
    const onReleaseRequest = vi.fn();
    const roller = render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        onReleaseRequest={onReleaseRequest}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
    expect(onReleaseRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseDirection: [0, 0],
        releaseSpeed: 0,
        shakeEnergy: 0,
      })
    );

    roller.unmount();
    render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        witnessRole="spectator"
        onReleaseRequest={vi.fn()}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelectorAll('[data-roll-group-die-id]')).toHaveLength(
      2
    );
  });

  it('starts original and reroll motion from phase-local frame time instead of the Canvas clock origin', () => {
    const view = render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        onReleaseRequest={vi.fn()}
      />
    );
    (latestMesh('die:one').getPose as (elapsed: number) => DiceMotionPose)(
      9_000
    );

    view.rerender(<RollGroupTray3D {...baseProps} phase="rolling-originals" />);
    const originalStart = (
      latestMesh('die:one').getPose as (elapsed: number) => DiceMotionPose
    )(12_000);
    expect(originalStart.observeNow).toBe(false);
    const originalEnd = (
      latestMesh('die:one').getPose as (elapsed: number) => DiceMotionPose
    )(12_000 + baseProps.feel.durationMs);
    expect(originalEnd.observeNow).toBe(true);

    view.rerender(
      <RollGroupTray3D
        {...baseProps}
        phase="rerolling"
        rerollDieIds={['die:one']}
      />
    );
    const rerollStart = (
      latestMesh('die:one').getPose as (elapsed: number) => DiceMotionPose
    )(40_000);
    expect(rerollStart.observeNow).toBe(false);
    const rerollEnd = (
      latestMesh('die:one').getPose as (elapsed: number) => DiceMotionPose
    )(40_000 + baseProps.feel.rerollDurationMs);
    expect(rerollEnd.observeNow).toBe(true);
  });

  it('uses solver-exact held extents for the tray projection bridge', () => {
    render(<RollGroupTray3D {...baseProps} />);

    expect(mocks.bridgeProps.at(-1)).toMatchObject({
      width: 0.72,
      height: 0.52,
    });
  });

  it('routes every feel candidate through every member solver', () => {
    const signatures = new Map<string, string[]>();
    for (const [feelId, feel] of Object.entries(ROLL_GROUP_FEEL_PROFILES)) {
      const view = render(<RollGroupTray3D {...baseProps} feel={feel} />);
      for (const item of group.dice) {
        const pose = (
          latestMesh(item.id).getPose as (elapsed: number) => DiceMotionPose
        )(500);
        expect(pose.failed).toBe(false);
        signatures.set(item.id, [
          ...(signatures.get(item.id) ?? []),
          `${feelId}:${JSON.stringify(pose)}`,
        ]);
      }
      view.unmount();
    }

    for (const memberSignatures of signatures.values()) {
      expect(memberSignatures).toHaveLength(3);
      expect(
        new Set(
          memberSignatures.map((value) => value.split(':').slice(1).join(':'))
        ).size
      ).toBe(3);
    }
  });

  it('suppresses travel and tumble for every member under reduced motion', () => {
    render(
      <RollGroupTray3D
        {...baseProps}
        feel={ROLL_GROUP_FEEL_PROFILES.energetic}
        reducedMotion
      />
    );

    for (const item of group.dice) {
      const pose = (
        latestMesh(item.id).getPose as (elapsed: number) => DiceMotionPose
      )(1);
      expect(pose.observeNow).toBe(true);
      expect(pose.exactTargetHeld).toBe(true);
      expect(pose.translation[1]).toBe(0);
      expect(pose.quaternion).toEqual([0, 0, 0, 1]);
    }
  });

  it('waits for every original member to settle before reporting group settlement', () => {
    const onOriginalsSettled = vi.fn();
    render(
      <RollGroupTray3D {...baseProps} onOriginalsSettled={onOriginalsSettled} />
    );

    act(() => {
      (latestMesh('die:one').onFrame as (frame: DiceMotionPose) => void)(
        OBSERVED_POSE
      );
    });
    expect(onOriginalsSettled).not.toHaveBeenCalled();

    act(() => {
      (latestMesh('die:two').onFrame as (frame: DiceMotionPose) => void)(
        OBSERVED_POSE
      );
    });
    expect(onOriginalsSettled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rerolling', 'onRerollSettled'],
    ['complete', 'onFinalFrameRendered'],
  ] as const)(
    'waits for every member actual target frame before reporting %s settlement',
    (phase, callbackName) => {
      const settled = vi.fn();
      const propsWithFrameWitness = {
        ...baseProps,
        phase,
        rerollDieIds: phase === 'rerolling' ? ['die:one'] : [],
        [callbackName]: settled,
      } as RollGroupTray3DProps;
      render(<RollGroupTray3D {...propsWithFrameWitness} />);

      act(() => {
        (latestMesh('die:one').onFrame as (frame: DiceMotionPose) => void)(
          OBSERVED_POSE
        );
      });
      expect(settled).not.toHaveBeenCalled();

      act(() => {
        (latestMesh('die:two').onFrame as (frame: DiceMotionPose) => void)(
          OBSERVED_POSE
        );
      });
      expect(settled).toHaveBeenCalledTimes(1);
    }
  );

  it('requires a fresh rendered witness when a later reroll targets the same face', () => {
    const onRerollSettled = vi.fn();
    const renderReroll = (phase: RollGroupTray3DProps['phase']) => (
      <RollGroupTray3D
        {...baseProps}
        phase={phase}
        rerollDieIds={['die:one']}
        onRerollSettled={onRerollSettled}
      />
    );
    const view = render(renderReroll('rerolling'));
    act(() => {
      for (const item of group.dice)
        (latestMesh(item.id).onFrame as (frame: DiceMotionPose) => void)(
          OBSERVED_POSE
        );
    });
    expect(onRerollSettled).toHaveBeenCalledTimes(1);

    view.rerender(renderReroll('reroll-flash'));
    view.rerender(renderReroll('rerolling'));
    act(() => {
      for (const item of group.dice)
        (latestMesh(item.id).onFrame as (frame: DiceMotionPose) => void)(
          OBSERVED_POSE
        );
    });
    expect(onRerollSettled).toHaveBeenCalledTimes(2);
  });

  it('retains partial final-frame witnesses across unrelated tray rerenders', () => {
    const onFinalFrameRendered = vi.fn();
    const view = render(
      <RollGroupTray3D
        {...baseProps}
        phase="complete"
        onFinalFrameRendered={onFinalFrameRendered}
      />
    );

    act(() => {
      (latestMesh('die:one').onFrame as (frame: DiceMotionPose) => void)(
        OBSERVED_POSE
      );
    });
    view.rerender(
      <RollGroupTray3D
        {...baseProps}
        phase="complete"
        onFinalFrameRendered={onFinalFrameRendered}
      />
    );
    act(() => {
      (latestMesh('die:two').onFrame as (frame: DiceMotionPose) => void)(
        OBSERVED_POSE
      );
    });

    expect(onFinalFrameRendered).toHaveBeenCalledTimes(1);
  });

  it('reports one member failure so the presentation can activate one group fallback', () => {
    const onFailure = vi.fn();
    render(
      <RollGroupTray3D
        {...baseProps}
        forceFailure="solver"
        onFailure={onFailure}
      />
    );

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toBe('die:one');
    expect(onFailure.mock.calls[0][1]).toMatch(/solver/i);
  });

  it('keeps provider sources shared but gives roller and spectator distinct runtime clones', async () => {
    const rollerReady = vi.fn();
    const spectatorReady = vi.fn();
    render(
      <>
        <RollGroupTray3D
          {...baseProps}
          presentationId="damage:roller"
          rendererGeneration={-201}
          onReady={rollerReady}
        />
        <RollGroupTray3D
          {...baseProps}
          presentationId="damage:spectator"
          rendererGeneration={-202}
          witnessRole="spectator"
          onReady={spectatorReady}
        />
      </>
    );

    await waitFor(() => {
      expect(rollerReady).toHaveBeenCalledTimes(2);
      expect(spectatorReady).toHaveBeenCalledTimes(2);
    });
    for (const item of group.dice) {
      const roller = rollerReady.mock.calls.find(
        ([ready]) => ready.dieId === item.id
      )?.[0];
      const spectator = spectatorReady.mock.calls.find(
        ([ready]) => ready.dieId === item.id
      )?.[0];
      expect(roller.runtimeSourceId).toBe(spectator.runtimeSourceId);
      expect(roller.runtimeCloneId).not.toBe(spectator.runtimeCloneId);
    }
  });

  it('projects the retained grabbed surface point after the rendered member transform and emits no pointer sample', () => {
    const onAttachmentDiagnostic = vi.fn();
    render(
      <RollGroupTray3D
        {...baseProps}
        phase="armed"
        onReleaseRequest={vi.fn()}
        onAttachmentDiagnostic={onAttachmentDiagnostic}
      />
    );
    const target = document.querySelector(
      '[data-roll-group-die-id="die:two"]'
    )!;
    fireEvent.pointerDown(target, {
      pointerId: 9,
      pointerType: 'mouse',
      clientX: 70,
      clientY: 10,
      timeStamp: 0,
    });

    act(() => {
      (
        latestMesh('die:two').onPoseApplied as (
          frame: DiceMotionPose,
          elapsedMs: number
        ) => void
      )(POSE, 16);
    });

    expect(onAttachmentDiagnostic).toHaveBeenCalledTimes(1);
    const diagnostic = onAttachmentDiagnostic.mock.calls[0][0];
    expect(diagnostic).toMatchObject({
      presentationId: 'damage:1',
      rendererGeneration: -101,
      dieId: 'die:two',
      heldPoseApplied: true,
      frameSequence: 1,
    });
    expect(mocks.surfaceCaptures).toEqual([[70, 10]]);
    expect(diagnostic.projectedAnchor).toEqual([141, 37]);
    expect(Reflect.ownKeys(diagnostic).sort()).toEqual(
      [
        'dieId',
        'frameSequence',
        'heldPoseApplied',
        'presentationId',
        'projectedAnchor',
        'rendererGeneration',
      ].sort()
    );
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /pointer|clientX|clientY|timeMs|samples/i
    );
  });
});
