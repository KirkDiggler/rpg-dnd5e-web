import { useDialValues } from '@/feel/dialStore';
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
    /** Activity never requires acknowledgement; all notices expire. */
    readonly held: boolean;
    readonly dismiss?: () => void;
    readonly dismissAll?: () => void;
    readonly setPaused?: (reason: 'pointer' | 'focus', paused: boolean) => void;
  };
};

interface ActiveNotice {
  id: string;
  scope: string;
  durationMs: number;
  expiresAt: number | null;
  remainingMs: number;
  pointer: boolean;
  focus: boolean;
}
function reconcilePause(
  notices: readonly ActiveNotice[],
  now = Date.now()
): readonly ActiveNotice[] {
  const paused = notices.some((notice) => notice.pointer || notice.focus);
  return notices.map((notice) => {
    if (paused && notice.expiresAt !== null)
      return {
        ...notice,
        remainingMs: Math.max(0, notice.expiresAt - now),
        expiresAt: null,
      };
    if (!paused && notice.expiresAt === null)
      return { ...notice, expiresAt: now + notice.remainingMs };
    return notice;
  });
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
 * with its line. Combat activity expires too; history retains the event. At
 * most `STORY_NOTICE_LIMIT` show; the oldest yields.
 */
export function useStoryNotices({
  story,
  scope,
  enabled,
  streamState,
  onInteractionChange,
  monsterTurnIds,
}: {
  story: readonly CombatExperienceStoryExchange[];
  scope: string;
  enabled: boolean;
  streamState: CombatExperienceStreamState;
  onInteractionChange?: (interacting: boolean) => void;
  /** Rows owned by the monster-turn presentation cursor, not inferred from prose. */
  monsterTurnIds?: ReadonlySet<string>;
}): readonly StoryNotice[] {
  const dials = useDialValues();
  const durationScale = Number(dials.notificationDuration);
  const followMonsters = dials.followMonsterTurns === 'on';
  const baseline = useRef<Baseline | null>(null);
  const [active, setActive] = useState<readonly ActiveNotice[]>([]);
  const live = enabled && streamState === 'live';
  const interacting =
    live &&
    active.some(
      (notice) => notice.scope === scope && (notice.pointer || notice.focus)
    );
  useEffect(() => {
    onInteractionChange?.(interacting);
  }, [interacting, onInteractionChange]);
  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);
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
    const currentIds = new Set(
      story
        .filter((entry) => followMonsters || !monsterTurnIds?.has(entry.id))
        .map((entry) => entry.id)
    );
    if (!fresh.length) {
      setActive((current) =>
        current.every((entry) => currentIds.has(entry.id))
          ? current
          : reconcilePause(current.filter((entry) => currentIds.has(entry.id)))
      );
      return;
    }
    const now = Date.now();
    setActive((current) => {
      const next = current.filter(
        (entry) =>
          entry.scope === scope &&
          currentIds.has(entry.id) &&
          (entry.expiresAt === null || entry.expiresAt > now)
      );
      for (const entry of fresh) {
        if (!entry.toastRule || !currentIds.has(entry.id)) continue;
        const durationMs =
          toastDurationMs(entry.toastText ?? entry.headline) * durationScale;
        next.push({
          id: entry.id,
          scope,
          durationMs,
          expiresAt: now + durationMs,
          remainingMs: durationMs,
          pointer: false,
          focus: false,
        });
      }
      // While reading, preserve the visible stack; extra events remain in history.
      return reconcilePause(
        next.some((notice) => notice.pointer || notice.focus)
          ? next.slice(0, STORY_NOTICE_LIMIT)
          : next.slice(-STORY_NOTICE_LIMIT),
        now
      );
    });
  }, [story, scope, live, durationScale, followMonsters, monsterTurnIds]);

  // Store deadlines, not timer-per-arrival cleanup: new activity must not
  // extend an older card. StrictMode cleanup can safely reschedule this timer.
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
                setPaused: (reason: 'pointer' | 'focus', paused: boolean) => {
                  const now = Date.now();
                  setActive((current) =>
                    reconcilePause(
                      current.map((item) => {
                        if (
                          item.id !== notice.id ||
                          item.scope !== notice.scope ||
                          item[reason] === paused
                        )
                          return item;
                        return { ...item, [reason]: paused };
                      }),
                      now
                    )
                  );
                },
                dismissAll: () => setActive([]),
                dismiss: () =>
                  setActive((current) =>
                    reconcilePause(
                      current.filter(
                        (item) =>
                          item.id !== notice.id || item.scope !== notice.scope
                      )
                    )
                  ),
              },
            },
          ]
        : [];
    });
}
