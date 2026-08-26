import type { DungeonShellProfile } from './dungeonShellManifest';
import type { DungeonShellCatalogSnapshot } from './dungeonShellProvider';

export type ShellFallbackReason =
  | 'no-regions'
  | 'mixed-archetypes'
  | 'unknown-archetype'
  | 'manifest-unavailable'
  | 'invalid-profile';

export type DungeonShellSelection =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'profile';
      readonly key: 'crypt';
      readonly profile: DungeonShellProfile;
    }
  | { readonly kind: 'legacy'; readonly reason: ShellFallbackReason };

export function resolveDungeonShellProfile(
  archetypes: readonly string[],
  snapshot: DungeonShellCatalogSnapshot
): DungeonShellSelection {
  if (snapshot.status !== 'ready') {
    if (snapshot.status === 'failed') {
      return { kind: 'legacy', reason: snapshot.failureKind };
    }
    return { kind: 'loading' };
  }

  const trimmedArchetypes = archetypes.map((archetype) => archetype.trim());
  if (trimmedArchetypes.some((archetype) => archetype.length === 0)) {
    return { kind: 'legacy', reason: 'unknown-archetype' };
  }

  const uniqueArchetypes = [...new Set(trimmedArchetypes)].sort();
  if (uniqueArchetypes.length === 0) {
    return { kind: 'legacy', reason: 'no-regions' };
  }
  if (uniqueArchetypes.length > 1) {
    return { kind: 'legacy', reason: 'mixed-archetypes' };
  }
  if (uniqueArchetypes[0] !== 'crypt') {
    return { kind: 'legacy', reason: 'unknown-archetype' };
  }
  return {
    kind: 'profile',
    key: 'crypt',
    profile: snapshot.catalog.profiles.crypt,
  };
}
