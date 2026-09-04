import { render, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ texture: undefined as unknown }));
vi.mock('@react-three/drei', async () => {
  const Three = await import('three');
  const texture = new Three.Texture();
  mocked.texture = texture;
  return { useTexture: () => texture };
});

import { OutfitTreatmentSlot } from './OutfitTreatmentSlot';

const presentation = {
  classRef: 'fighter' as const,
  profileKey: 'fighter:16',
  maskUrl:
    '/models/synty/characters/outfit-customization/v1/masks/fighter-16.png',
  maskSha256:
    '64573ee074597ffd53f34a7d4e1f81537793298ac6fe08cfa14169b2b86b589c',
  meshNames: ['Chr_Torso_Male_16'],
  primaryColor: undefined,
  secondaryColor: undefined,
  usePrimary: false,
  useSecondary: false,
};

afterEach(() => vi.restoreAllMocks());

it('loads a shared unflipped nearest/no-color-space mask without taking texture disposal ownership', async () => {
  const onMaskReady = vi.fn();
  const texture = mocked.texture as THREE.Texture;
  const dispose = vi.spyOn(texture, 'dispose');
  const { unmount } = render(
    <OutfitTreatmentSlot
      presentation={presentation}
      onMaskReady={onMaskReady}
    />
  );

  await waitFor(() => expect(onMaskReady).toHaveBeenCalledWith(texture));
  expect(texture.minFilter).toBe(THREE.NearestFilter);
  expect(texture.magFilter).toBe(THREE.NearestFilter);
  expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  expect(onMaskReady).toHaveBeenCalledWith(
    expect.objectContaining({ flipY: false })
  );
  expect(texture.flipY).toBe(false);

  unmount();
  expect(dispose).not.toHaveBeenCalled();
});
