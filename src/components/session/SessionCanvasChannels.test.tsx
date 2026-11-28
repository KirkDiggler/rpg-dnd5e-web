import type { HexEntityProps } from '@/components/hex-grid/HexEntity';
import { buildDungeonLightingFacts } from '@/rendering/dungeonLighting';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeAll, expect, it, vi } from 'vitest';
import { SessionScene } from './SessionCanvas';

vi.mock('../hex-grid/HexEntity', () => ({
  HexEntity: (props: HexEntityProps) => (
    <group name={`entity-port-${props.entityId}`} userData={props} />
  ),
}));
vi.mock('./DungeonEnvironment', () => ({ DungeonEnvironment: () => null }));
vi.mock('./local-world-die/LocalWorldDieLayer', () => ({
  LocalWorldDieWarmup: () => null,
}));
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
const scene = {
  exits: [],
  floorTiles: new Map(),
  props: [],
  archetypes: [],
  lighting: buildDungeonLightingFacts([], [], []),
  wallRuns: [],
  doorGaps: [],
};

it.each([false, true])(
  'passes only the supplied observed roster channels when remembered=%s',
  async (remembered) => {
    const info = create(PublicMemberInfoSchema, {
      id: 'npc',
      kind: MemberKind.MONSTER,
      monsterRef: 'dnd5e:monsters:skeleton',
      appearanceRef: 'dnd5e:npcs:kingdom:merchant-01',
      materialChannels: [
        {
          targetId: 'body',
          normal: { value: { case: 'multiplier', value: 1 } },
          emissive: { value: { case: 'off', value: {} } },
        },
      ],
    });
    const members = ['npc', 'legacy'].map((subject) => ({
      subject,
      name: subject,
      kind: MemberKind.MONSTER,
      position: { x: 1, y: -1, z: 0 },
      remembered,
      standing: Standing.UP,
      stance: '',
      equipment: undefined,
      monsterRefId: 'skeleton',
    }));
    const renderer = await ReactThreeTestRenderer.create(
      <SessionScene
        scene={scene}
        hexSize={1}
        characterId="player"
        characterName="Player"
        classRefId={undefined}
        myPosition={{ x: 0, y: 0, z: 0 }}
        otherMembers={members}
        roster={new Map([['npc', info]])}
      />
    );
    const props = renderer.scene.findByProps({ name: 'entity-port-npc' }).props
      .userData as HexEntityProps;
    expect(props.materialChannels).toEqual([
      {
        targetId: 'body',
        normal: { mode: 'scale', multiplier: 1 },
        emissive: { mode: 'off' },
      },
    ]);
    info.materialChannels[0].targetId = 'later-source';
    expect(props.materialChannels![0].targetId).toBe('body');
    const legacy = renderer.scene.findByProps({ name: 'entity-port-legacy' })
      .props.userData as HexEntityProps;
    expect(legacy.materialChannels ?? []).toEqual([]);
    expect(legacy.appearanceRef).toBeUndefined();
    const player = renderer.scene.findByProps({ name: 'entity-port-player' })
      .props.userData as HexEntityProps;
    expect(player.materialChannels).toBeUndefined();
    await renderer.unmount();
  }
);
