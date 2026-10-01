import { NPC_WEAPON_SETS } from '@/generated/npcAppearanceCatalog';
import type { MainHandPresentation } from './mainHandPresentation';

export type NpcMainHandResolution =
  | {
      code:
        | 'unobserved'
        | 'empty'
        | 'unarmed'
        | 'unsupported-body'
        | 'unsupported-weapon';
      presentation?: undefined;
    }
  | { code: 'mapped'; presentation: MainHandPresentation };

/** Exact standing-body fits only. The input is either the API's observed item
 * ref or an existing authored weapon override ref; generated metadata binds
 * those namespaces explicitly. No combat/default policy or rig-family fallback
 * lives here. A downed model is a different body and has no approved fit yet. */
export function resolveNpcMainHandPresentation({
  bodyUrl,
  mainHandRef,
}: {
  bodyUrl: string | undefined;
  mainHandRef: string | undefined;
}): NpcMainHandResolution {
  if (mainHandRef === undefined) return { code: 'unobserved' };
  if (mainHandRef === '') return { code: 'empty' };
  if (
    mainHandRef === 'dnd5e:item:unarmed-strike' ||
    mainHandRef === 'dnd5e:weapons:unarmed-strike'
  ) {
    return { code: 'unarmed' };
  }
  const set = NPC_WEAPON_SETS.find((entry) => entry.bodyUrl === bodyUrl);
  if (!set) return { code: 'unsupported-body' };
  const weapon = set.weapons.find(
    (entry) => entry.itemRef === mainHandRef || entry.weaponRef === mainHandRef
  );
  if (!weapon) return { code: 'unsupported-weapon' };
  return {
    code: 'mapped',
    presentation: {
      ref: weapon.itemRef,
      weaponUrl: weapon.weaponUrl,
      socket: weapon.socket,
    },
  };
}
