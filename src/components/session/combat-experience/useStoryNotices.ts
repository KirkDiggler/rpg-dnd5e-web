import { useEffect, useRef, useState } from 'react';
import { toastDurationMs } from './toastPolicy';
import type {
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';

export const STORY_NOTICE_LIMIT = 3;

/** A story entry on screen as a toast, with how it leaves. */
export type StoryNotice = CombatExperienceStoryExchange & {
  readonly notice: {
    /** Its time on screen once it runs a timer (`toastDurationMs`). */
    readonly durationMs: number;
    /** Held: fired in a fight, it waits for the viewer's next act. */
    readonly held: boolean;
  };
};

interface ActiveNotice {
  id: string;
  scope: string;
  durationMs: number;
  /** null while held: no timer runs until it is released. */
  expiresAt: number | null;
}
interface Baseline {
  scope: string;
  live: boolean;
  seen: Set<string>;
}

/**
 * A temporary view of released story entries, never a second event
 * interpreter. Which rows toast is the toast policy's (`toastPolicy.ts`): a
 * row toasts only when it carries a `toastRule`. Its time on screen scales
 * with its line; a toast fired while a fight is formed holds until the
 * viewer's next act arrives (and runs its timer if the fight ends first). At
 * most `STORY_NOTICE_LIMIT` show; the oldest yields.
 */
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
}): readonly StoryNotice[] {
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
    const now = Date.now();
    setActive((current) => {
      let next = current.filter(
        (entry) =>
          entry.scope === scope &&
          currentIds.has(entry.id) &&
          (entry.expiresAt === null || entry.expiresAt > now)
      );
      // In arrival order: the viewer's own act releases what was held before
      // it, a fight ending starts the held toasts' timers, then the entry
      // itself toasts if the policy names a case for it.
      for (const entry of fresh) {
        if (entry.byViewer) {
          next = next.filter((notice) => notice.expiresAt !== null);
        }
        if (entry.fightEdge === 'dissolved') {
          next = next.map((notice) =>
            notice.expiresAt === null
              ? { ...notice, expiresAt: now + notice.durationMs }
              : notice
          );
        }
        if (!entry.toastRule) continue;
        const durationMs = toastDurationMs(entry.toastText ?? entry.headline);
        next.push({
          id: entry.id,
          scope,
          durationMs,
          expiresAt: entry.toastRule.hold ? null : now + durationMs,
        });
      }
      return next.slice(-STORY_NOTICE_LIMIT);
    });
  }, [story, scope, live]);

  // Store deadlines, not timer-per-arrival cleanup: new activity must not
  // extend an older card. StrictMode cleanup can safely reschedule this timer.
  // A held card has no deadline and schedules nothing.
  useEffect(() => {
    const deadlines = active
      .map((entry) => entry.expiresAt)
      .filter((at): at is number => at !== null);
    if (!deadlines.length) return;
    const nextExpiry = Math.min(...deadlines);
    const timer = setTimeout(
      () => {
        setActive((current) =>
          current.filter(
            (entry) => entry.expiresAt === null || entry.expiresAt > Date.now()
          )
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
    .flatMap((notice) => {
      const entry = currentStory.get(notice.id);
      return entry
        ? [
            {
              ...entry,
              notice: {
                durationMs: notice.durationMs,
                held: notice.expiresAt === null,
              },
            },
          ]
        : [];
    });
}
