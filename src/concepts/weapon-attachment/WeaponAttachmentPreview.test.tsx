import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from '@/components/hex-grid/mainHandPresentation';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { useEffect } from 'react';
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
};

type MockCameraHandle = {
  lookAt: (...args: number[]) => void;
  updateProjectionMatrix: () => void;
};

const weaponAttachmentPreviewMocks = vi.hoisted(() => ({
  canvasProps: null as Record<string, unknown> | null,
  perspectiveCameraProps: null as MockCameraProps | null,
  perspectiveCameraLookAt: vi.fn(),
  perspectiveCameraUpdateProjectionMatrix: vi.fn(),
  orbitControlsProps: null as MockCameraProps | null,
  orthographicCameraProps: null as MockCameraProps | null,
  orthographicCameraLookAt: vi.fn(),
  orthographicCameraUpdateProjectionMatrix: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: (props: Record<string, unknown>) => {
    weaponAttachmentPreviewMocks.canvasProps = props;
    return <div data-testid="weapon-attachment-canvas" />;
  },
}));

vi.mock('@react-three/drei', async () => {
  const React = await import('react');
  return {
    OrbitControls: (props: MockCameraProps) => {
      weaponAttachmentPreviewMocks.orbitControlsProps = props;
      return React.createElement('group', {
        ...props,
        name: 'weapon-attachment-orbit-controls',
      });
    },
    OrthographicCamera: React.forwardRef<MockCameraHandle, MockCameraProps>(
      (props, ref) => {
        weaponAttachmentPreviewMocks.orthographicCameraProps = props;
        React.useImperativeHandle(ref, () => ({
          lookAt: weaponAttachmentPreviewMocks.orthographicCameraLookAt,
          updateProjectionMatrix:
            weaponAttachmentPreviewMocks.orthographicCameraUpdateProjectionMatrix,
        }));
        return React.createElement('group', props);
      }
    ),
    PerspectiveCamera: React.forwardRef<MockCameraHandle, MockCameraProps>(
      (props, ref) => {
        weaponAttachmentPreviewMocks.perspectiveCameraProps = props;
        React.useImperativeHandle(ref, () => ({
          lookAt: weaponAttachmentPreviewMocks.perspectiveCameraLookAt,
          updateProjectionMatrix:
            weaponAttachmentPreviewMocks.perspectiveCameraUpdateProjectionMatrix,
        }));
        return React.createElement('group', props);
      }
    ),
  };
});

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
  weaponAttachmentPreviewMocks.perspectiveCameraLookAt.mockClear();
  weaponAttachmentPreviewMocks.perspectiveCameraUpdateProjectionMatrix.mockClear();
  weaponAttachmentPreviewMocks.orthographicCameraLookAt.mockClear();
  weaponAttachmentPreviewMocks.orthographicCameraUpdateProjectionMatrix.mockClear();
  vi.clearAllMocks();
});

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
    const closeCamera = renderer.scene.findAll(
      (node) => node.props.name === 'weapon-attachment-close-camera'
    )[0]!;
    expect(closeCamera.props.position).toEqual([-1.2, 1.22, 0.85]);
    expect(
      weaponAttachmentPreviewMocks.perspectiveCameraLookAt
    ).toHaveBeenCalledWith(-0.6, 1.02, -0.025);
    expect(
      weaponAttachmentPreviewMocks.perspectiveCameraUpdateProjectionMatrix
    ).toHaveBeenCalledTimes(1);
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

    const orbitCamera = renderer.scene.findAll(
      (node) => node.props.name === 'weapon-attachment-orbit-camera'
    )[0]!;
    expect(orbitCamera.props.position).toEqual([2.4, 1.8, 3.1]);
    const orbitControls = renderer.scene.findAll(
      (node) => node.props.name === 'weapon-attachment-orbit-controls'
    )[0]!;
    expect(orbitControls.props.target).toEqual([0, 0.7, 0]);
    expect(onRenderObserved).toHaveBeenCalledWith({
      equipmentState: 'unarmed',
      motion: 'idle',
      view: 'orbit',
      facing: 0,
      attachmentCode: 'unarmed',
    });
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

    expect(
      renderer.scene.findAll(
        (node) => node.props.name === 'weapon-attachment-tactical-camera'
      )
    ).toHaveLength(1);
    expect(onRenderObserved).toHaveBeenCalledWith({
      equipmentState: 'unarmed',
      motion: 'idle',
      view: 'play',
      facing: 2,
      attachmentCode: 'unarmed',
    });
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
    expect(preview.style.height).toBe('100%');
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
