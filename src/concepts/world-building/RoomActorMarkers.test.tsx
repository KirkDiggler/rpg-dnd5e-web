import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({
  Html: () => null,
  useGLTF: () => ({ scene: new THREE.Group() }),
}));
vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: ({ url }: { url: string }) => (
    <group name="shared-room-monster-model" userData={{ url }} />
  ),
}));

import { RoomActorMarkers } from './RoomActorMarkers';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

it('uses the shared skeleton-safe model renderer inside each snapped actor transform', async () => {
  const monsters = [
    { id: 'a', ref: 'dnd5e:monsters:skeleton', cell: { q: -1, r: 2 } },
    { id: 'b', ref: 'dnd5e:monsters:skeleton', cell: { q: 2, r: -1 } },
  ];
  const renderer = await ReactThreeTestRenderer.create(
    <RoomActorMarkers
      monsters={monsters}
      partyStart={null}
      selectedActorId={null}
      onSelectActor={vi.fn()}
    />
  );
  try {
    for (const monster of monsters) {
      const marker = renderer.scene.findByProps({
        name: `room-monster-${monster.id}`,
      });
      const model = marker.findByProps({ name: 'shared-room-monster-model' });
      expect(model.instance.userData.url).toBe(
        '/models/synty/npcs/skeleton-soldier-01.glb'
      );
      const center = cubeToWorld(
        {
          x: monster.cell.q,
          y: -monster.cell.q - monster.cell.r,
          z: monster.cell.r,
        },
        HEX_SIZE
      );
      expect(marker.instance.position.toArray()).toEqual([
        center.x,
        DUNGEON_SURFACE_Y,
        center.z,
      ]);
    }
  } finally {
    await renderer.unmount();
  }
});
