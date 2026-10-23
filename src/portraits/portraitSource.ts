import { resolveHairPresentation } from '@/character/customization/hairCustomization';
import {
  resolveOutfitPresentation,
  type OutfitPresentation,
} from '@/character/customization/outfitCustomization';
import { resolvePlayerCharacterModel } from '@/components/hex-grid/classCharacterModels';
import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import type { SkinnedAccessoryPresentation } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import { CHARACTER_CUSTOMIZATION_PROVIDER } from '@/generated/characterCustomizationCatalog';
import { resolveNpcAppearance } from '@/generated/npcAppearanceCatalog';
import { resolveNpcAppearanceModel } from '@/npc-appearances/npcAppearanceModel';
import {
  MemberKind,
  type PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** Bump when capture lighting, framing or pose changes. Images are mount-local. */
export const PORTRAIT_RECIPE = 'standing-portrait-v1';

export interface PortraitSource {
  readonly status: 'model';
  readonly key: string;
  readonly url: string;
  readonly facingRotation: number;
  readonly accessories: readonly SkinnedAccessoryPresentation[];
  readonly outfit?: OutfitPresentation;
}

export type PortraitResolution =
  | PortraitSource
  | {
      readonly status: 'unavailable';
      readonly message: string;
    };

function unavailable(message: string): PortraitResolution {
  return { status: 'unavailable', message };
}

function model(
  url: string,
  contentIdentity: unknown,
  facingRotation = 0,
  accessories: readonly SkinnedAccessoryPresentation[] = [],
  outfit?: OutfitPresentation
): PortraitSource {
  return {
    status: 'model',
    url,
    facingRotation,
    accessories,
    outfit,
    key: JSON.stringify([
      PORTRAIT_RECIPE,
      contentIdentity,
      url,
      facingRotation,
      accessories,
      outfit,
    ]),
  };
}

/** Resolves only supplied public appearance. Never fetches a private sheet or
 * turns an unknown explicit appearance into a rules-derived substitute. */
export function resolvePortraitSource(
  member: PublicMemberInfo
): PortraitResolution {
  if (
    ![MemberKind.PLAYER, MemberKind.MONSTER, MemberKind.WORLD].includes(
      member.kind
    )
  ) {
    return unavailable('No supported member appearance was supplied.');
  }
  const customized = Boolean(
    member.customization?.hair || member.customization?.outfit
  );
  if (member.appearanceRef) {
    const appearance = resolveNpcAppearance(member.appearanceRef);
    const resolved = resolveNpcAppearanceModel({
      appearanceRef: member.appearanceRef,
    });
    if (!appearance || resolved.kind !== 'resolved') {
      return unavailable(`Appearance unavailable: ${member.appearanceRef}`);
    }
    if (customized) {
      return unavailable(
        'This exact appearance has no compatible customization profile.'
      );
    }
    return model(
      resolved.url,
      [appearance.assetRef, appearance.standingSha256],
      resolved.forwardOffset
    );
  }
  if (member.kind === MemberKind.PLAYER) {
    const body = resolvePlayerCharacterModel(
      member.raceRef,
      member.classRef,
      false
    );
    if (!body)
      return unavailable('No model is mapped for this character appearance.');
    if (!body.customizationProfileRef) {
      return customized
        ? unavailable(
            'This character model has no compatible customization profile.'
          )
        : model(body.url, 'legacy-mount-local');
    }
    const hair = resolveHairPresentation({
      raceRefId: member.raceRef,
      classRefId: member.classRef,
      customization: member.customization,
    });
    if (hair.diagnostics.length) {
      return unavailable(
        `Character hair unavailable: ${hair.diagnostics.map((d) => d.code).join(', ')}`
      );
    }
    const outfit = resolveOutfitPresentation({
      classRefId: member.classRef,
      customization: member.customization,
    });
    if ('presentation' in outfit) {
      return unavailable(
        `Character outfit unavailable: ${outfit.diagnostic.code}`
      );
    }
    return model(
      body.url,
      CHARACTER_CUSTOMIZATION_PROVIDER,
      0,
      hair.accessories,
      outfit
    );
  }
  if (customized)
    return unavailable('No compatible customization profile was supplied.');
  const url = resolveMonsterModelUrl(
    member.monsterRef,
    undefined,
    false,
    member.id
  );
  return url
    ? model(url, 'legacy-mount-local')
    : unavailable('No model is mapped for this creature appearance.');
}
