import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import type { NpcActivityProfile } from './activityTypes';

/** Empty retains provider/legacy default semantics; explicit unsupported values do not. */
export function unsupportedNpcDefault(input: {
  profile?: NpcActivityProfile;
  defaultActivityRef?: string;
}): boolean {
  const ref = input.defaultActivityRef;
  if (!ref) return false;
  const activity =
    input.profile && Object.hasOwn(input.profile.activities, ref)
      ? input.profile.activities[ref]
      : undefined;
  return !activity || activity.moving;
}

/** Exact published support, not a guess from appearance names or bone count. */
export function npcActivityProfile(input: {
  readonly appearanceRef?: string;
}): NpcActivityProfile | undefined {
  return NPC_ACTIVITY_PROFILES.find((profile) =>
    profile.appearances.some((body) => body.assetRef === input.appearanceRef)
  );
}
