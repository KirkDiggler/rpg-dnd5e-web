import { NPC_WEAPON_SETS } from '@/generated/npcAppearanceCatalog';
import { describe, expect, it } from 'vitest';
import { TOWNFOLK_MAIN_HAND_SOCKET } from './mainHandWeapons';
import { resolveNpcMainHandPresentation } from './npcMainHandPresentation';

const goblin = '/models/synty/npcs/goblin-warrior-male-01.glb';
const skeleton = '/models/synty/npcs/skeleton-soldier-01.glb';

describe('exact-body NPC main-hand presentation', () => {
  it('uses the approved body-specific asset and per-weapon socket for both observed and authored namespaces', () => {
    for (const set of NPC_WEAPON_SETS) {
      for (const weapon of set.weapons) {
        const observed = resolveNpcMainHandPresentation({
          bodyUrl: set.bodyUrl,
          mainHandRef: weapon.itemRef,
        });
        const authored = resolveNpcMainHandPresentation({
          bodyUrl: set.bodyUrl,
          mainHandRef: weapon.weaponRef,
        });
        expect(observed).toEqual(authored);
        expect(observed).toEqual({
          code: 'mapped',
          presentation: {
            ref: weapon.itemRef,
            weaponUrl: weapon.weaponUrl,
            socket: weapon.socket,
          },
        });
        expect(observed.presentation?.socket).not.toEqual(
          TOWNFOLK_MAIN_HAND_SOCKET
        );
      }
    }
  });

  it('does not share bow sockets across bodies or weapons', () => {
    const bow = resolveNpcMainHandPresentation({
      bodyUrl: goblin,
      mainHandRef: 'dnd5e:item:shortbow',
    });
    const otherBow = resolveNpcMainHandPresentation({
      bodyUrl: skeleton,
      mainHandRef: 'dnd5e:item:shortbow',
    });
    const sword = resolveNpcMainHandPresentation({
      bodyUrl: goblin,
      mainHandRef: 'dnd5e:item:scimitar',
    });
    expect(bow.presentation?.socket).not.toEqual(otherBow.presentation?.socket);
    expect(bow.presentation?.weaponUrl).not.toEqual(
      otherBow.presentation?.weaponUrl
    );
    expect(bow.presentation?.socket).not.toEqual(sword.presentation?.socket);
  });

  it.each([
    [goblin, undefined, 'unobserved'],
    [goblin, '', 'empty'],
    [goblin, 'dnd5e:item:unarmed-strike', 'unarmed'],
    [goblin, 'dnd5e:weapons:unarmed-strike', 'unarmed'],
    [goblin, 'dnd5e:item:shortsword', 'unsupported-weapon'],
    [goblin, 'dnd5e:item:longsword', 'unsupported-weapon'],
    [goblin, 'dnd5e:item:unknown', 'unsupported-weapon'],
    [goblin, 'shortbow', 'unsupported-weapon'],
    [goblin, 'dnd5e:monster_actions:multiattack', 'unsupported-weapon'],
    [
      '/models/synty/npcs/goblin-archer-male-01.glb',
      'dnd5e:item:shortbow',
      'unsupported-body',
    ],
    [
      '/models/synty/npcs/goblin-king-01.glb',
      'dnd5e:item:scimitar',
      'unsupported-body',
    ],
    [
      goblin.replace('.glb', '-downed.glb'),
      'dnd5e:item:scimitar',
      'unsupported-body',
    ],
    [
      skeleton.replace('.glb', '-downed.glb'),
      'dnd5e:item:shortsword',
      'unsupported-body',
    ],
    [undefined, 'dnd5e:item:scimitar', 'unsupported-body'],
  ] as const)(
    'keeps %s / %s explicit as %s, with no substitute visual',
    (bodyUrl, mainHandRef, code) => {
      expect(resolveNpcMainHandPresentation({ bodyUrl, mainHandRef })).toEqual({
        code,
      });
    }
  );
});
