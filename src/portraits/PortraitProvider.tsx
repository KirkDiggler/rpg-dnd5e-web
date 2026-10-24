import { useSerialThumbnailQueue } from '@/author/useSerialThumbnailQueue';
import type { PublicMemberInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo, type ReactNode } from 'react';
import { PortraitCapture } from './PortraitCapture';
import {
  resolvePortraitSource,
  type PortraitResolution,
  type PortraitSource,
} from './portraitSource';

import {
  PortraitContext,
  missingPortrait,
  type PortraitResult,
} from './usePortrait';

export interface PortraitProviderProps {
  /** Authenticated owner/observer and session identity. Changing it drops all images. */
  scopeKey: string;
  /** Only the roster already disclosed to this viewer; no fetching occurs here. */
  members: readonly PublicMemberInfo[];
  children: ReactNode;
}

/** Mount once above all portrait consumers, not once per card. Images live only
 * for this mounted scope and the appearance keys still present in its roster. */
export function PortraitProvider(props: PortraitProviderProps) {
  return <ScopedPortraitProvider key={props.scopeKey} {...props} />;
}

function ScopedPortraitProvider({
  scopeKey,
  members,
  children,
}: PortraitProviderProps) {
  const resolutions = useMemo(() => {
    const resolved = new Map<string, PortraitResolution>();
    const counts = new Map<string, number>();
    for (const member of members)
      counts.set(member.id, (counts.get(member.id) ?? 0) + 1);
    for (const member of members) {
      if (!member.id || counts.get(member.id) !== 1 || !scopeKey) {
        resolved.set(member.id, missingPortrait);
      } else {
        resolved.set(member.id, resolvePortraitSource(member));
      }
    }
    return resolved;
  }, [members, scopeKey]);
  const entries = useMemo(() => {
    const unique = new Map<string, PortraitSource>();
    for (const source of resolutions.values())
      if (source.status === 'model') unique.set(source.key, source);
    return [...unique.values()];
  }, [resolutions]);
  const queue = useSerialThumbnailQueue(entries);
  const portraits = new Map<string, PortraitResult>();
  for (const [id, source] of resolutions) {
    if (source.status === 'unavailable') {
      portraits.set(id, source);
      continue;
    }
    const result = queue.results[source.key];
    portraits.set(
      id,
      !result
        ? { status: 'loading', key: source.key }
        : result.status === 'ready' && result.image
          ? { status: 'ready', key: source.key, image: result.image }
          : {
              status: 'error',
              key: source.key,
              message:
                result.message ?? 'Portrait capture did not supply an image.',
            }
    );
  }
  return (
    <PortraitContext.Provider value={portraits}>
      {children}
      {queue.active && (
        <PortraitCapture
          source={queue.active}
          onComplete={queue.recordComplete}
          onError={queue.recordError}
          onRootError={queue.recordRootError}
        />
      )}
    </PortraitContext.Provider>
  );
}
