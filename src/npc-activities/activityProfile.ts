import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import type { NpcActivityProfile } from './activityTypes';

/** Exact published support, not a guess from appearance names or bone count. */
export function npcActivityProfile(input: {
  readonly appearanceRef?: string;
}): NpcActivityProfile | undefined {
  return NPC_ACTIVITY_PROFILES.find((profile) =>
    profile.appearances.some((body) => body.assetRef === input.appearanceRef)
  );
}
