import { useEffect, useRef, useState } from 'react';
import type {
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';

export const STORY_NOTICE_TTL_MS = 6000;
export const STORY_NOTICE_LIMIT = 3;
interface ActiveNotice {
  id: string;
  scope: string;
  expiresAt: number;
}
interface Baseline {
  scope: string;
  live: boolean;
  seen: Set<string>;
}

/** A temporary view of released story entries, never a second event interpreter. */
export function useStoryNotices({
  story,
  scope,
  enabled,
  streamState,
}: {
  story: readonly CombatExperienceStoryExchange[];
  scope: string;
  enabled: boolean;
  streamState: CombatExperienceStreamState;
}): readonly CombatExperienceStoryExchange[] {
  const baseline = useRef<Baseline | null>(null);
  const [active, setActive] = useState<readonly ActiveNotice[]>([]);
  const live = enabled && streamState === 'live';
  useEffect(() => {
    const previous = baseline.current;
    // Mount, scope changes and resume are snapshots, not announcements.
    if (!previous || previous.scope !== scope || !live || !previous.live) {
      baseline.current = {
        scope,
        live,
        seen: new Set(story.map((entry) => entry.id)),
      };
      setActive((current) => (current.length ? [] : current));
      return;
    }
    const fresh: CombatExperienceStoryExchange[] = [];
    for (const entry of story) {
      if (!previous.seen.has(entry.id) && entry.deliverySource === 'live')
        fresh.push(entry);
      previous.seen.add(entry.id);
    }
    const currentIds = new Set(story.map((entry) => entry.id));
    if (!fresh.length) {
      setActive((current) =>
        current.every((entry) => currentIds.has(entry.id))
          ? current
          : current.filter((entry) => currentIds.has(entry.id))
      );
      return;
    }
    const expiresAt = Date.now() + STORY_NOTICE_TTL_MS;
    setActive((current) =>
      [
        ...current.filter(
          (entry) =>
            entry.scope === scope &&
            currentIds.has(entry.id) &&
            entry.expiresAt > Date.now()
        ),
        ...fresh.map((entry) => ({ id: entry.id, scope, expiresAt })),
      ].slice(-STORY_NOTICE_LIMIT)
    );
  }, [story, scope, live]);

  // Store deadlines, not timer-per-arrival cleanup: new activity must not
  // extend an older card. StrictMode cleanup can safely reschedule this timer.
  useEffect(() => {
    if (!active.length) return;
    const nextExpiry = Math.min(...active.map((entry) => entry.expiresAt));
    const timer = setTimeout(
      () => {
        setActive((current) =>
          current.filter((entry) => entry.expiresAt > Date.now())
        );
      },
      Math.max(0, nextExpiry - Date.now())
    );
    return () => clearTimeout(timer);
  }, [active]);

  if (!live) return [];
  const currentStory = new Map(story.map((entry) => [entry.id, entry]));
  return active
    .filter((entry) => entry.scope === scope)
    .map((entry) => currentStory.get(entry.id))
    .filter(
      (entry): entry is CombatExperienceStoryExchange => entry !== undefined
    );
}
