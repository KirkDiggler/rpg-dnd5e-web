import {
  INITIAL_AZIMUTH,
  INITIAL_DISTANCE,
  POLAR_ANGLE,
  sphericalCameraPosition,
} from '@/author/preview3d/playCameraRig';
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from '@/components/hex-grid/mainHandPresentation';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  WeaponAttachmentPreview,
  WeaponAttachmentScene,
} from './WeaponAttachmentPreview';
import { resolveProvisionalMainHand } from './weaponAttachmentExperiment';

const mockAttachmentStatusState: {
  current?: MainHandAttachmentStatus;
} = {};

const statusForPresentation = (presentation?: {
  ref: string;
}): MainHandAttachmentStatus => ({
  code: presentation ? 'attached' : 'unarmed',
  ref: presentation?.ref,
});

const clonePresentation = (
  presentation: MainHandPresentation
): MainHandPresentation => ({
  ...presentation,
  socket: presentation.socket,
});

type MockCameraProps = {
  name?: string;
  makeDefault?: boolean;
  position?: readonly [number, number, number];
  fov?: number;
  zoom?: number;
  near?: number;
  far?: number;
  target?: readonly [number, number, number];
  quaternion?: readonly [number, number, number, number];
};

const weaponAttachmentPreviewMocks = vi.hoisted(() => ({
  canvasProps: null as Record<string, unknown> | null,
  invalidate: vi.fn(),
  perspectiveCameraProps: null as MockCameraProps | null,
  orbitControlsProps: null as MockCameraProps | null,
  orthographicCameraProps: null as MockCameraProps | null,
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: (props: Record<string, unknown>) => {
    weaponAttachmentPreviewMocks.canvasProps = props;
    return <div data-testid="weapon-attachment-canvas" />;
  },
  useThree: (selector: (state: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: weaponAttachmentPreviewMocks.invalidate }),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: (props: MockCameraProps) => {
    weaponAttachmentPreviewMocks.orbitControlsProps = props;
    return null;
  },
  OrthographicCamera: (props: MockCameraProps) => {
    weaponAttachmentPreviewMocks.orthographicCameraProps = props;
    return null;
  },
  PerspectiveCamera: (props: MockCameraProps) => {
    weaponAttachmentPreviewMocks.perspectiveCameraProps = props;
    return null;
  },
}));

vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: (props: {
    isMoving: boolean;
    facingRotation: number;
    mainHandPresentation?: { ref: string };
    onMainHandStatus?: (status: MainHandAttachmentStatus) => void;
  }) => {
    useEffect(() => {
      props.onMainHandStatus?.(
        mockAttachmentStatusState.current ??
          statusForPresentation(props.mainHandPresentation)
      );
    }, [props]);

    return (
      <group
        name="mock-real-class-character-model"
        userData={{
          isMoving: props.isMoving,
          facingRotation: props.facingRotation,
          ref: props.mainHandPresentation?.ref ?? 'unarmed',
        }}
      />
    );
  },
}));

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mockAttachmentStatusState.current = undefined;
  weaponAttachmentPreviewMocks.canvasProps = null;
  weaponAttachmentPreviewMocks.perspectiveCameraProps = null;
  weaponAttachmentPreviewMocks.orbitControlsProps = null;
  weaponAttachmentPreviewMocks.orthographicCameraProps = null;
  vi.clearAllMocks();
});

function lookAtQuaternion(
  position: readonly [number, number, number],
  target: readonly [number, number, number]
): readonly [number, number, number, number] {
  return new Quaternion()
    .setFromRotationMatrix(
      new Matrix4().lookAt(
        new Vector3(...position),
        new Vector3(...target),
        new Vector3(0, 1, 0)
      )
    )
    .toArray() as readonly [number, number, number, number];
}

describe('WeaponAttachmentScene', () => {
  it('projects walk, facing, mapped weapon, and close camera into the shared renderer', async () => {
    const mapped = resolveProvisionalMainHand({
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    });
    if (mapped.code !== 'mapped') throw new Error('fixture must map');

    const onRenderObserved = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WeaponAttachmentScene
        equipmentState="longsword"
        motion="walk"
        view="close"
        facing={3}
        presentation={mapped.presentation}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    const model = renderer.scene.findAll(
      (node) => node.props.name === 'mock-real-class-character-model'
    )[0]!;
    expect(model.props.userData).toMatchObject({
      isMoving: true,
      ref: 'dnd5e:item:longsword',
    });
    expect(model.props.userData.facingRotation).toBeCloseTo(-Math.PI, 5);
    expect(weaponAttachmentPreviewMocks.perspectiveCameraProps).toMatchObject({
      name: 'weapon-attachment-close-camera',
      makeDefault: true,
      position: [-1.2, 1.22, 0.85],
      fov: 42,
    });
    const closeQuaternion =
      weaponAttachmentPreviewMocks.perspectiveCameraProps?.quaternion;
    expect(closeQuaternion).toEqual([
      -0.08885709508907506, -0.29474934704894257, -0.02753899945954927,
      0.9510356684033046,
    ]);
    expect(closeQuaternion).toEqual(
      lookAtQuaternion([-1.2, 1.22, 0.85], [-0.6, 1.02, -0.025])
    );
    expect(closeQuaternion).not.toBeInstanceOf(Quaternion);
    expect(weaponAttachmentPreviewMocks.invalidate).toHaveBeenCalledTimes(1);
    expect(onRenderObserved).toHaveBeenCalledWith({
      equipmentState: 'longsword',
      motion: 'walk',
      view: 'close',
      facing: 3,
      attachmentCode: 'attached',
    });
  });

  it('acknowledges valid unarmed observation in the orbit branch', async () => {
    const onRenderObserved = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WeaponAttachmentScene
        equipmentState="unarmed"
        motion="idle"
        view="orbit"
        facing={0}
        presentation={undefined}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    expect(weaponAttachmentPreviewMocks.perspectiveCameraProps).toMatchObject({
      name: 'weapon-attachment-orbit-camera',
      makeDefault: true,
      position: [2.4, 1.8, 3.1],
      fov: 42,
    });
    const orbitQuaternion =
      weaponAttachmentPreviewMocks.perspectiveCameraProps?.quaternion;
    expect(orbitQuaternion).toEqual([
      -0.12901630119426993, 0.3204572871794044, 0.04410525237043826,
      0.9373988733901412,
    ]);
    expect(orbitQuaternion).toEqual(
      lookAtQuaternion([2.4, 1.8, 3.1], [0, 0.7, 0])
    );
    expect(orbitQuaternion).not.toBeInstanceOf(Quaternion);
    expect(weaponAttachmentPreviewMocks.orbitControlsProps).toMatchObject({
      makeDefault: true,
      target: [0, 0.7, 0],
    });
    expect(weaponAttachmentPreviewMocks.invalidate).toHaveBeenCalledTimes(1);
    expect(onRenderObserved).toHaveBeenCalledWith({
      equipmentState: 'unarmed',
      motion: 'idle',
      view: 'orbit',
      facing: 0,
      attachmentCode: 'unarmed',
    });
    expect(renderer).toBeTruthy();
  });

  it('renders the named tactical camera branch', async () => {
    const onRenderObserved = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WeaponAttachmentScene
        equipmentState="unarmed"
        motion="idle"
        view="play"
        facing={2}
        presentation={undefined}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    const tacticalPosition = sphericalCameraPosition(
      { x: 0, y: 0, z: 0 },
      POLAR_ANGLE,
      INITIAL_AZIMUTH,
      INITIAL_DISTANCE
    );
    expect(weaponAttachmentPreviewMocks.orthographicCameraProps).toMatchObject({
      name: 'weapon-attachment-tactical-camera',
      makeDefault: true,
      position: [tacticalPosition.x, tacticalPosition.y, tacticalPosition.z],
      zoom: 80,
      near: 0.1,
      far: 1000,
    });
    const tacticalQuaternion =
      weaponAttachmentPreviewMocks.orthographicCameraProps?.quaternion;
    expect(tacticalQuaternion).toEqual([
      -0.29380714106850614, 0.36281673958654276, 0.12169890255264042,
      0.8759170933658189,
    ]);
    expect(tacticalQuaternion).toEqual(
      lookAtQuaternion(
        [tacticalPosition.x, tacticalPosition.y, tacticalPosition.z],
        [0, 0.65, 0]
      )
    );
    expect(tacticalQuaternion).not.toBeInstanceOf(Quaternion);
    expect(weaponAttachmentPreviewMocks.invalidate).toHaveBeenCalledTimes(1);
    expect(onRenderObserved).toHaveBeenCalledWith({
      equipmentState: 'unarmed',
      motion: 'idle',
      view: 'play',
      facing: 2,
      attachmentCode: 'unarmed',
    });
    expect(renderer).toBeTruthy();
  });

  it('re-observes the same stable tuple after an invalid status clears', async () => {
    const mapped = resolveProvisionalMainHand({
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    });
    if (mapped.code !== 'mapped') throw new Error('fixture must map');

    const onRenderObserved = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WeaponAttachmentScene
        equipmentState="longsword"
        motion="idle"
        view="close"
        facing={1}
        presentation={mapped.presentation}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    expect(onRenderObserved).toHaveBeenCalledTimes(1);
    expect(weaponAttachmentPreviewMocks.invalidate).toHaveBeenCalledTimes(1);

    mockAttachmentStatusState.current = { code: 'asset-load-failed' };
    await renderer.update(
      <WeaponAttachmentScene
        equipmentState="longsword"
        motion="idle"
        view="close"
        facing={1}
        presentation={clonePresentation(mapped.presentation)}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );
    expect(onRenderObserved).toHaveBeenCalledTimes(1);

    mockAttachmentStatusState.current = undefined;
    await renderer.update(
      <WeaponAttachmentScene
        equipmentState="longsword"
        motion="idle"
        view="close"
        facing={1}
        presentation={clonePresentation(mapped.presentation)}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    expect(onRenderObserved).toHaveBeenCalledTimes(2);
    expect(weaponAttachmentPreviewMocks.invalidate).toHaveBeenCalledTimes(1);
    expect(onRenderObserved).toHaveBeenLastCalledWith({
      equipmentState: 'longsword',
      motion: 'idle',
      view: 'close',
      facing: 1,
      attachmentCode: 'attached',
    });
  });

  it('does not acknowledge loading or failed mapped weapons', async () => {
    mockAttachmentStatusState.current = { code: 'asset-load-failed' };
    const onRenderObserved = vi.fn();

    await ReactThreeTestRenderer.create(
      <WeaponAttachmentScene
        equipmentState="longsword"
        motion="idle"
        view="orbit"
        facing={0}
        presentation={undefined}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    expect(onRenderObserved).not.toHaveBeenCalled();
  });
});

describe('WeaponAttachmentPreview props', () => {
  it('wraps the canvas in an explicit full-height shell', () => {
    render(
      <WeaponAttachmentPreview
        equipmentState="unarmed"
        motion="idle"
        view="play"
        facing={0}
        onRenderObserved={() => {}}
      />
    );

    const preview = screen.getByTestId('weapon-attachment-preview');
    expect(preview.style.width).toBe('100%');
    expect(preview.style.height).toBe('520px');
    expect(preview.style.minHeight).toBe('520px');
    expect(screen.getByTestId('weapon-attachment-canvas')).toBeTruthy();
  });

  it('keeps failure-status control out of the public preview API', () => {
    expectTypeOf<
      ComponentProps<typeof WeaponAttachmentPreview>
    >().toMatchTypeOf<{
      equipmentState: 'unarmed' | 'longsword' | 'shortbow';
      motion: 'idle' | 'walk';
      view: 'close' | 'orbit' | 'play';
      facing: 0 | 1 | 2 | 3 | 4 | 5;
      presentation?: MainHandPresentation;
      onAttachmentStatus?: (status: MainHandAttachmentStatus) => void;
      onRenderObserved: (observation: {
        equipmentState: 'unarmed' | 'longsword' | 'shortbow';
        motion: 'idle' | 'walk';
        view: 'close' | 'orbit' | 'play';
        facing: 0 | 1 | 2 | 3 | 4 | 5;
        attachmentCode: MainHandAttachmentStatus['code'];
      }) => void;
    }>();

    type PreviewProps = ComponentProps<typeof WeaponAttachmentPreview>;
    // @ts-expect-error forcedStatus is a test-only seam, not public API
    const forcedStatus: PreviewProps['forcedStatus'] = { code: 'unarmed' };
    expect(forcedStatus).toBeDefined();
  });
});
