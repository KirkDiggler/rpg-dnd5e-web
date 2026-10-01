import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import type { MainHandPresentation } from '@/components/hex-grid/mainHandPresentation';
import { resolveNpcMainHandPresentation } from '@/components/hex-grid/npcMainHandPresentation';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({
  Html: ({ style }: { style?: { pointerEvents?: string } }) => (
    <group
      name="actor-html-label"
      userData={{ pointerEvents: style?.pointerEvents }}
    />
  ),
  useGLTF: () => ({ scene: new THREE.Group() }),
}));
vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: ({
    url,
    mainHandPresentation,
  }: {
    url: string;
    mainHandPresentation?: MainHandPresentation;
  }) => (
    <group
      name="shared-room-monster-model"
      userData={{ url, mainHandPresentation }}
    />
  ),
}));

import { RoomActorMarkers, RoomActorPreview } from './RoomActorMarkers';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

it('makes every display-only label wrapper transparent to canvas clicks', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <RoomActorMarkers
        monsters={[
          {
            id: 'unknown',
            ref: 'dnd5e:monsters:missing',
            startingCell: { location: { q: 0, r: 0 } },
          },
        ]}
        partyStart={{ q: 1, r: 0 }}
        selectedActorId={null}
        onSelectActor={vi.fn()}
      />
      <RoomActorPreview
        hoverCell={{ q: 2, r: 0 }}
        label="Preview"
        color="#ffffff"
      />
    </>
  );
  const labels = renderer.scene.findAllByProps({ name: 'actor-html-label' });
  expect(labels).toHaveLength(4); // unavailable chip, monster label, start, preview
  for (const label of labels)
    expect(label.instance.userData.pointerEvents).toBe('none');
  await renderer.unmount();
});

it('reads authored order from existing bindings and uses the shared exact-body fit, without a default or later-weapon fallback', async () => {
  const monsters = [
    {
      id: 'skeleton-1',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 0, r: 0 } },
    },
  ];
  const draw = (actions?: string[]) => (
    <RoomActorMarkers
      monsters={monsters}
      monsterBindings={actions ? { 'skeleton-1': { actions } } : undefined}
      partyStart={null}
      selectedActorId={null}
      onSelectActor={vi.fn()}
    />
  );
  const renderer = await ReactThreeTestRenderer.create(
    draw(['dnd5e:weapons:shortbow', 'dnd5e:weapons:shortsword'])
  );
  const presentation = () =>
    renderer.scene.findByProps({ name: 'shared-room-monster-model' }).instance
      .userData.mainHandPresentation;
  expect(presentation()).toEqual(
    resolveNpcMainHandPresentation({
      bodyUrl: '/models/synty/npcs/skeleton-soldier-01.glb',
      mainHandRef: 'dnd5e:weapons:shortbow',
    }).presentation
  );
  await renderer.update(
    draw(['dnd5e:weapons:shortsword', 'dnd5e:weapons:shortbow'])
  );
  expect(presentation().ref).toBe('dnd5e:item:shortsword');
  await renderer.update(
    draw(['dnd5e:weapons:longsword', 'dnd5e:weapons:shortbow'])
  );
  expect(presentation()).toBeUndefined();
  await renderer.update(draw());
  expect(presentation()).toBeUndefined();
  await renderer.unmount();
});

it('uses the shared skeleton-safe model renderer inside each snapped actor transform', async () => {
  const monsters = [
    {
      id: 'a',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: -1, r: 2 } },
    },
    {
      id: 'b',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 2, r: -1 } },
    },
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
          x: monster.startingCell.location.q,
          y: -monster.startingCell.location.q - monster.startingCell.location.r,
          z: monster.startingCell.location.r,
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
