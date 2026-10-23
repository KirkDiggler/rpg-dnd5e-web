import type { ClassCharacterModelProps } from '@/components/hex-grid/ClassCharacterModel';
import type { ThumbnailRendererProps } from '@/compositions/CompositionThumbnailRenderer';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortraitCapture } from './PortraitCapture';
import { resolvePortraitSource, type PortraitSource } from './portraitSource';
const calls = vi.hoisted(() => ({ model: vi.fn(), renderer: vi.fn() }));
vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: (p: ClassCharacterModelProps) => {
    calls.model(p);
    return null;
  },
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: (p: ThumbnailRendererProps & { children: ReactNode }) => {
    calls.renderer(p);
    return <>{p.children}</>;
  },
}));

function source(color = 0x123456): PortraitSource {
  const result = resolvePortraitSource(
    create(PublicMemberInfoSchema, {
      id: 'hero',
      kind: MemberKind.PLAYER,
      raceRef: 'human',
      classRef: 'fighter',
      customization: { hair: { colorSrgb: color } },
    })
  );
  if (result.status !== 'model') throw Error('missing source');
  return result;
}
const model = (): ClassCharacterModelProps => calls.model.mock.calls.at(-1)![0];
const ready = () => calls.renderer.mock.calls.at(-1)![0].ready;
beforeEach(() => {
  calls.model.mockClear();
  calls.renderer.mockClear();
});
afterEach(cleanup);

describe('portrait capture readiness', () => {
  it.each([
    [0, Math.PI / 2],
    [Math.PI, (3 * Math.PI) / 2],
  ])(
    'faces right while preserving the asset forward correction %s',
    (forwardCorrection, expectedFacing) => {
      const current = { ...source(), facingRotation: forwardCorrection };
      render(
        <PortraitCapture
          source={current}
          onComplete={vi.fn()}
          onError={vi.fn()}
          onRootError={vi.fn()}
        />
      );
      expect(model().facingRotation).toBe(expectedFacing);
      expect(current.facingRotation).toBe(forwardCorrection);
    }
  );

  it('waits for every requested accessory and outfit before capture', () => {
    const current = source();
    render(
      <PortraitCapture
        source={current}
        onComplete={vi.fn()}
        onError={vi.fn()}
        onRootError={vi.fn()}
      />
    );
    expect(model().accessories).toEqual(current.accessories);
    expect(model().outfit).toEqual(current.outfit);
    expect(ready()).toBe(false);
    act(() =>
      model().onOutfitStatus!({
        code: 'attached',
        profileKey: current.outfit!.profileKey,
      })
    );
    expect(ready()).toBe(false);
    for (const accessory of current.accessories) {
      act(() =>
        model().onAccessoryStatus!({
          code: 'attached',
          slot: accessory.slot,
          styleRef: accessory.styleRef,
          url: accessory.url,
          meshUuid: 'mesh',
          bodyRootBoneUuid: 'root',
          mappedBoneNames: [],
          mappedBoneUuids: [],
          instanceMaterials: [],
        })
      );
    }
    expect(ready()).toBe(true);
  });

  it('fails an attachment rather than publishing an incomplete character', () => {
    const current = source();
    const onError = vi.fn();
    render(
      <PortraitCapture
        source={current}
        onComplete={vi.fn()}
        onError={onError}
        onRootError={vi.fn()}
      />
    );
    const accessory = current.accessories[0];
    act(() =>
      model().onAccessoryStatus!({
        code: 'rejected',
        slot: accessory.slot,
        styleRef: accessory.styleRef,
        url: accessory.url,
        message: 'Wrong skeleton',
      })
    );
    expect(onError).toHaveBeenCalledWith(current.key, 'Wrong skeleton');
    expect(ready()).toBe(false);
  });

  it('fails a rejected outfit and does not declare it ready', () => {
    const current = source();
    const onError = vi.fn();
    render(
      <PortraitCapture
        source={current}
        onComplete={vi.fn()}
        onError={onError}
        onRootError={vi.fn()}
      />
    );
    act(() =>
      model().onOutfitStatus!({
        code: 'rejected',
        profileKey: current.outfit!.profileKey,
        message: 'Mask unavailable',
      })
    );
    expect(onError).toHaveBeenCalledWith(current.key, 'Mask unavailable');
    expect(ready()).toBe(false);
  });
});
