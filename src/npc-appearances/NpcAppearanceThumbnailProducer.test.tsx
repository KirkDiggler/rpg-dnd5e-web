import type { GeneratedNpcAppearance } from '@/generated/npcAppearanceCatalog';
import { render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  modelProps: [] as unknown[],
  rendererProps: [] as Array<Record<string, unknown>>,
  cleanups: vi.fn(),
}));

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: ({
    children,
    ...props
  }: {
    children: ReactNode;
    requestKey: string;
  }) => {
    captured.rendererProps.push(props);
    useEffect(
      () => () => captured.cleanups(props.requestKey),
      [props.requestKey]
    );
    return <>{children}</>;
  },
}));

vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: (props: unknown) => {
    captured.modelProps.push(props);
    return null;
  },
}));

import { NpcAppearanceThumbnailProducer } from './NpcAppearanceThumbnailProducer';
import { npcAppearanceThumbnailKey } from './npcAppearanceThumbnailKey';

type ProducerProps = ComponentProps<typeof NpcAppearanceThumbnailProducer>;
type FitBoundsIsNotPublic = 'fitBounds' extends keyof ProducerProps
  ? never
  : true;
const FIT_BOUNDS_IS_NOT_PUBLIC: FitBoundsIsNotPublic = true;

const appearance: GeneratedNpcAppearance = {
  releaseId: 'goblin-war-camp-v1',
  manifestId: 'goblinWarriorMale01',
  assetRef: 'dnd5e:npcs:goblin:warrior-male-01',
  displayName: 'Warrior Male 01',
  rulesRef: null,
  sourceName: 'SM_Chr_Warrior_Male_01',
  sourcePack: 'polygon-goblin-war-camp-v2',
  standingUrl: '/models/synty/npcs/goblin-warrior-male-01.glb',
  downedUrl: '/models/synty/npcs/goblin-warrior-male-01-downed.glb',
  standingSha256:
    '2cb9c964d1b587b1a1a7115df65766ca32dbe86d00a80879dc8732a83f682c22',
  downedSha256:
    '617800a4c3b2d2aaa535b3c718154f953939accb74fdc07fa25b680d0ce1d843',
  animationClips: ['Idle_Relaxed', 'Walk_Forward'],
  jointCount: 50,
  pose: 'Compatible baked 50-bone donor Actions.',
  rootWrapper: 'Standing preserves the standard-rig Armature root.',
  forwardAxis: '+Z',
};

beforeEach(() => {
  captured.modelProps.length = 0;
  captured.rendererProps.length = 0;
  captured.cleanups.mockClear();
});

describe('NPC appearance thumbnail handoff', () => {
  it('does not expose the internally fixed framing choice as a caller prop', () => {
    expect(FIT_BOUNDS_IS_NOT_PUBLIC).toBe(true);
  });

  it('keys the standing content and dispatches the skeleton-safe character renderer through the shared capture surface', () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onRootError = vi.fn();
    render(
      <NpcAppearanceThumbnailProducer
        appearance={appearance}
        onComplete={onComplete}
        onError={onError}
        onRootError={onRootError}
      />
    );

    expect(npcAppearanceThumbnailKey(appearance)).toBe(
      JSON.stringify([appearance.assetRef, appearance.standingSha256])
    );
    expect(captured.rendererProps.at(-1)).toMatchObject({
      requestKey: npcAppearanceThumbnailKey(appearance),
      fitBounds: false,
      onComplete,
      onError,
      onRootError,
    });
    expect(captured.modelProps.at(-1)).toEqual({
      url: appearance.standingUrl,
      facingRotation: 0,
      isMoving: false,
      isDownedVariant: false,
    });
  });

  it('reuses an unchanged content request and releases it when content identity changes or unmounts', () => {
    const callbacks = {
      onComplete: vi.fn(),
      onError: vi.fn(),
      onRootError: vi.fn(),
    };
    const view = render(
      <NpcAppearanceThumbnailProducer appearance={appearance} {...callbacks} />
    );
    const originalKey = npcAppearanceThumbnailKey(appearance);

    view.rerender(
      <NpcAppearanceThumbnailProducer
        appearance={{ ...appearance }}
        {...callbacks}
      />
    );
    expect(captured.cleanups).not.toHaveBeenCalled();

    const changed = {
      ...appearance,
      standingSha256: 'a'.repeat(64),
    };
    view.rerender(
      <NpcAppearanceThumbnailProducer appearance={changed} {...callbacks} />
    );
    expect(captured.cleanups).toHaveBeenCalledWith(originalKey);
    expect(captured.rendererProps.at(-1)).toMatchObject({
      requestKey: npcAppearanceThumbnailKey(changed),
    });

    view.unmount();
    expect(captured.cleanups).toHaveBeenCalledWith(
      npcAppearanceThumbnailKey(changed)
    );
  });
});
