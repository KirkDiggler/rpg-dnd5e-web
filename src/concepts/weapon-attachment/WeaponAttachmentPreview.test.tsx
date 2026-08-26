import type { MainHandAttachmentStatus } from '@/components/hex-grid/mainHandPresentation';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveProvisionalMainHand } from './weaponAttachmentExperiment';

vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: (props: {
    isMoving: boolean;
    facingRotation: number;
    mainHandPresentation?: { ref: string };
    onMainHandStatus?: (status: MainHandAttachmentStatus) => void;
  }) => {
    useEffect(() => {
      props.onMainHandStatus?.({
        code: props.mainHandPresentation ? 'attached' : 'unarmed',
        ref: props.mainHandPresentation?.ref,
      });
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

import { WeaponAttachmentScene } from './WeaponAttachmentPreview';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
    expect(
      renderer.scene.findAll(
        (node) => node.props.name === 'weapon-attachment-close-camera'
      )
    ).toHaveLength(1);
    expect(onRenderObserved).toHaveBeenCalledWith({
      equipmentState: 'longsword',
      motion: 'walk',
      view: 'close',
      facing: 3,
      attachmentCode: 'attached',
    });
  });

  it('does not acknowledge loading or failed mapped weapons', async () => {
    const onRenderObserved = vi.fn();

    await ReactThreeTestRenderer.create(
      <WeaponAttachmentScene
        equipmentState="longsword"
        motion="idle"
        view="orbit"
        facing={0}
        presentation={undefined}
        forcedStatus={{ code: 'asset-load-failed' }}
        onAttachmentStatus={() => {}}
        onRenderObserved={onRenderObserved}
      />
    );

    expect(onRenderObserved).not.toHaveBeenCalled();
  });
});
