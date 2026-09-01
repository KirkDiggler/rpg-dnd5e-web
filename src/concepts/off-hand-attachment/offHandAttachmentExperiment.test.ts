import { describe, expect, it } from 'vitest';
import {
  OFF_HAND_FIXTURES,
  resolveOffHandFixture,
} from './offHandAttachmentExperiment';

describe('off-hand attachment experiment', () => {
  it('defines exact production-backed fixture order', () => {
    expect(OFF_HAND_FIXTURES.map((row) => row.id)).toEqual([
      'empty',
      'shield-only',
      'longsword-shield',
      'shortsword-dagger',
      'glaive-main',
      'trident-main',
      'scimitar-main',
      'dual-scimitars',
    ]);
  });

  it('resolves exact main and off-hand production presentations', () => {
    expect(resolveOffHandFixture('empty')).toMatchObject({
      mainHand: { code: 'unarmed' },
      offHand: { code: 'empty-off-hand' },
    });
    expect(resolveOffHandFixture('longsword-shield')).toMatchObject({
      mainHand: { code: 'mapped', ref: 'dnd5e:item:longsword' },
      offHand: { code: 'mapped', ref: 'dnd5e:item:shield' },
    });
    expect(resolveOffHandFixture('shortsword-dagger')).toMatchObject({
      mainHand: { code: 'mapped', ref: 'dnd5e:item:shortsword' },
      offHand: { code: 'mapped', ref: 'dnd5e:item:dagger' },
    });
  });

  it('defines all four specialist fixtures with exact item refs', () => {
    expect(OFF_HAND_FIXTURES.slice(-4)).toEqual([
      {
        id: 'glaive-main',
        label: 'Glaive main',
        equipped: {
          main_hand: { module: 'dnd5e', type: 'item', id: 'glaive' },
        },
      },
      {
        id: 'trident-main',
        label: 'Trident main',
        equipped: {
          main_hand: { module: 'dnd5e', type: 'item', id: 'trident' },
        },
      },
      {
        id: 'scimitar-main',
        label: 'Scimitar main',
        equipped: {
          main_hand: { module: 'dnd5e', type: 'item', id: 'scimitar' },
        },
      },
      {
        id: 'dual-scimitars',
        label: 'Dual Scimitars',
        equipped: {
          main_hand: { module: 'dnd5e', type: 'item', id: 'scimitar' },
          off_hand: { module: 'dnd5e', type: 'item', id: 'scimitar' },
        },
      },
    ]);

    for (const [fixtureId, itemId] of [
      ['glaive-main', 'glaive'],
      ['trident-main', 'trident'],
      ['scimitar-main', 'scimitar'],
    ] as const) {
      expect(resolveOffHandFixture(fixtureId)).toMatchObject({
        mainHand: { code: 'mapped', ref: `dnd5e:item:${itemId}` },
        offHand: { code: 'empty-off-hand' },
      });
    }
  });

  it('resolves the same exact Scimitar ref into independent hand presentations', () => {
    const dual = resolveOffHandFixture('dual-scimitars');

    expect(dual).toMatchObject({
      mainHand: {
        code: 'mapped',
        ref: 'dnd5e:item:scimitar',
        presentation: {
          ref: 'dnd5e:item:scimitar',
          weaponUrl: '/models/synty/weapons/scimitar.glb',
          socket: { bone: 'Hand_R' },
        },
      },
      offHand: {
        code: 'mapped',
        ref: 'dnd5e:item:scimitar',
        presentation: {
          ref: 'dnd5e:item:scimitar',
          assetUrl: '/models/synty/off-hand/scimitar.glb',
          socket: { bone: 'Hand_L' },
        },
      },
    });
    expect(dual.mainHand.presentation).not.toBe(dual.offHand.presentation);
  });
});
