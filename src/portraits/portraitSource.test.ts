// @vitest-environment node
import { CHARACTER_CUSTOMIZATION_PROVIDER } from '@/generated/characterCustomizationCatalog';
import { NPC_APPEARANCE_CATALOG } from '@/generated/npcAppearanceCatalog';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { resolvePortraitSource } from './portraitSource';

const hero = () =>
  create(PublicMemberInfoSchema, {
    id: 'hero',
    name: 'Hero',
    kind: MemberKind.PLAYER,
    raceRef: 'human',
    classRef: 'fighter',
    customization: {
      hair: { colorSrgb: 0x123456, roughness: 0.4 },
      outfit: { primaryColorSrgb: 0xabcdef, secondaryColorSrgb: 0x654321 },
    },
  });

describe('portrait source', () => {
  it('carries real customized hair and outfit, with published content identity', () => {
    const result = resolvePortraitSource(hero());
    expect(result.status).toBe('model');
    if (result.status !== 'model') throw Error('missing model');
    expect(result.accessories.length).toBeGreaterThan(0);
    expect(result.accessories[0].treatment).toMatchObject({
      baseColorSrgb: '#123456',
      roughness: 0.4,
    });
    expect(result.outfit).toMatchObject({
      primaryColor: '#ABCDEF',
      secondaryColor: '#654321',
      usePrimary: true,
      useSecondary: true,
    });
    expect(result.key).toContain(
      CHARACTER_CUSTOMIZATION_PROVIDER.aggregateManifestSha256
    );
  });

  it('shares identical appearance across identities but changes key with customization', () => {
    const a = hero();
    const b = hero();
    b.id = 'other';
    b.name = 'Other';
    const first = resolvePortraitSource(a);
    expect(resolvePortraitSource(b)).toEqual(first);
    b.customization!.hair!.colorSrgb = 0;
    expect(resolvePortraitSource(b)).not.toEqual(first);
    b.customization!.hair!.colorSrgb = 0x123456;
    b.customization!.outfit!.primaryColorSrgb = 0;
    expect(resolvePortraitSource(b)).not.toEqual(first);
  });

  it('uses exact NPC appearance even when rules identity names a different monster', () => {
    const appearance = NPC_APPEARANCE_CATALOG[0];
    const result = resolvePortraitSource(
      create(PublicMemberInfoSchema, {
        id: 'npc',
        kind: MemberKind.WORLD,
        monsterRef: 'dnd5e:monsters:skeleton',
        appearanceRef: appearance.assetRef,
      })
    );
    expect(result).toMatchObject({
      status: 'model',
      url: appearance.standingUrl,
      accessories: [],
    });
    if (result.status !== 'model') throw Error('missing model');
    expect(result.key).toContain(appearance.standingSha256);
  });

  it('does not substitute a skeleton for a missing explicit appearance', () => {
    expect(
      resolvePortraitSource(
        create(PublicMemberInfoSchema, {
          id: 'npc',
          kind: MemberKind.MONSTER,
          monsterRef: 'dnd5e:monsters:skeleton',
          appearanceRef: 'missing:appearance',
        })
      )
    ).toMatchObject({ status: 'unavailable' });
  });

  it('adapts the full roster monster ref when no explicit appearance exists', () => {
    expect(
      resolvePortraitSource(
        create(PublicMemberInfoSchema, {
          id: 'skeleton-1',
          kind: MemberKind.MONSTER,
          monsterRef: 'dnd5e:monsters:skeleton',
        })
      )
    ).toMatchObject({
      status: 'model',
      url: '/models/synty/npcs/skeleton-soldier-01.glb',
    });
  });

  it.each(['', 'skeleton', 'dnd5e:monsters:'])(
    'refuses a missing or malformed wire monster ref %j',
    (monsterRef) => {
      expect(
        resolvePortraitSource(
          create(PublicMemberInfoSchema, {
            id: 'skeleton-1',
            kind: MemberKind.MONSTER,
            monsterRef,
          })
        )
      ).toMatchObject({ status: 'unavailable' });
    }
  );

  it('refuses invalid hair rather than showing a successful default portrait', () => {
    const member = hero();
    member.customization!.hair!.colorSrgb = 0x1000000;
    expect(resolvePortraitSource(member)).toMatchObject({
      status: 'unavailable',
    });
  });

  it('refuses invalid outfit rather than dropping the requested dyes', () => {
    const member = hero();
    member.customization!.outfit!.primaryColorSrgb = 0x1000000;
    expect(resolvePortraitSource(member)).toMatchObject({
      status: 'unavailable',
    });
  });

  it('does not apply player customization to an unrelated explicit NPC body', () => {
    const member = hero();
    member.appearanceRef = NPC_APPEARANCE_CATALOG[0].assetRef;
    expect(resolvePortraitSource(member)).toMatchObject({
      status: 'unavailable',
    });
  });

  it('refuses unknown member kind or unmapped player appearance', () => {
    expect(
      resolvePortraitSource(create(PublicMemberInfoSchema, { id: 'unknown' }))
    ).toMatchObject({ status: 'unavailable' });
    const member = hero();
    member.classRef = 'no-such-class';
    expect(resolvePortraitSource(member)).toMatchObject({
      status: 'unavailable',
    });
  });
});
