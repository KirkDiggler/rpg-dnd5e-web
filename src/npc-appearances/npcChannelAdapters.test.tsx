import { HexEntity } from '@/components/hex-grid/HexEntity';
import { RoomActorMarkers } from '@/concepts/world-building/RoomActorMarkers';
import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeAll, expect, it, vi } from 'vitest';

// Actual native/runtime parents, observed at their shared activity-model port.
// The activity adapter and material writer have separate real Three assertions.
vi.mock('@/npc-activities/ActivityCharacterModel', () => ({
  ActivityCharacterModel: (props: {
    appearanceRef?: string;
    materialChannels?: readonly MaterialChannelAdjustment[];
    remembered?: boolean;
  }) => <group name="npc-channel-port" userData={props} />,
}));
vi.mock('@react-three/drei', () => ({
  Html: () => <group name="npc-unavailable-diagnostic" />,
}));
vi.mock('@/components/hex-grid/MediumHumanoid', () => ({
  MediumHumanoid: () => <group name="unadjusted-fallback" />,
}));
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
const appearanceRef = 'dnd5e:npcs:kingdom:merchant-01';
const materialChannels: MaterialChannelAdjustment[] = [
  { targetId: 'body', normal: { mode: 'scale', multiplier: 1 } },
];

it('passes the native creature owner values to the existing body adapter', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <RoomActorMarkers
      monsters={[
        {
          id: 'npc',
          ref: 'dnd5e:monsters:skeleton',
          appearanceRef,
          materialChannels,
          startingCell: { location: { q: 0, r: 0 } },
        },
      ]}
      partyStart={null}
      selectedActorId={null}
      onSelectActor={vi.fn()}
    />
  );
  expect(
    renderer.scene.findByProps({ name: 'npc-channel-port' }).props.userData
  ).toMatchObject({ appearanceRef, materialChannels });
  await renderer.unmount();
});
it.each([false, true])(
  'passes captured NPC channel values unchanged when remembered=%s',
  async (remembered) => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        entityId="npc"
        name="NPC"
        type="monster"
        position={{ x: 0, y: 0, z: 0 }}
        hexSize={1}
        monsterRefId="skeleton"
        appearanceRef={appearanceRef}
        materialChannels={materialChannels}
        knowledgeState={remembered ? 'remembered' : undefined}
      />
    );
    expect(
      renderer.scene.findByProps({ name: 'npc-channel-port' }).props.userData
    ).toMatchObject({ appearanceRef, materialChannels, remembered });
    await renderer.unmount();
  }
);
it('does not substitute a rules-derived body for channel intent with no explicit appearance identity', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <HexEntity
      entityId="npc"
      name="NPC"
      type="monster"
      position={{ x: 0, y: 0, z: 0 }}
      hexSize={1}
      monsterRefId="skeleton"
      materialChannels={materialChannels}
    />
  );
  expect(
    renderer.scene.findAllByProps({ name: 'npc-channel-port' })
  ).toHaveLength(0);
  expect(
    renderer.scene.findAllByProps({ name: 'unadjusted-fallback' })
  ).toHaveLength(0);
  expect(
    renderer.scene.findAllByProps({ name: 'npc-unavailable-diagnostic' }).length
  ).toBeGreaterThan(0);
  await renderer.unmount();
});
