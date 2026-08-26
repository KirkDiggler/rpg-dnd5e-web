import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { needsPacing, nextBeatStep } from '../monsterBeatQueue';
import { participantNameMap } from '../participantNames';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

export const COMBAT_STORY_PACE_MS = 300;

function storyId(event: Event): string {
  const session = event.session ?? '';
  return `${session.length}:${session}:${event.seq}`;
}

export interface UseCombatStoryPacingArgs {
  member: string;
  participants: readonly Participant[];
  memberNames?: ReadonlyMap<string, string>;
  story: readonly CombatExperienceStoryExchange[];
  result?: CombatExperienceAttackOutcome;
}

export interface UseCombatStoryPacingResult {
  story: readonly CombatExperienceStoryExchange[];
  result?: CombatExperienceAttackOutcome;
  notice: string | null;
  acceptEvent: (event: Event, metadata: SessionEventDeliveryMetadata) => void;
}

interface PacingScopeToken {
  readonly member: string;
}

interface ScopedPacingState {
  readonly token: PacingScopeToken;
  readonly hiddenIds: ReadonlySet<string>;
  readonly notice: string | null;
}

function emptyScopedPacing(token: PacingScopeToken): ScopedPacingState {
  return { token, hiddenIds: new Set(), notice: null };
}

/**
 * A presentation-only cursor for another member's live turn.
 *
 * Events have already entered the authoritative reducer and query invalidation
 * funnel before this hook sees them. Only their Story projection is briefly
 * hidden, then revealed with the existing monsterBeatQueue order. Catch-up
 * history is never replayed slowly.
 */
export function useCombatStoryPacing({
  member,
  participants,
  memberNames,
  story,
  result,
}: UseCombatStoryPacingArgs): UseCombatStoryPacingResult {
  const token = useMemo<PacingScopeToken>(
    () => Object.freeze({ member }),
    [member]
  );
  const activeTokenRef = useRef(token);
  activeTokenRef.current = token;
  const [scopedPacing, setScopedPacing] = useState<ScopedPacingState>(() =>
    emptyScopedPacing(token)
  );
  const queueRef = useRef<Event[]>([]);
  const drainingRef = useRef(false);
  const announcedActorRef = useRef<string | null>(null);
  const sawBeatRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantsRef = useRef(participants);
  const memberNamesRef = useRef(memberNames);
  participantsRef.current = participants;
  memberNamesRef.current = memberNames;

  const namesNow = useCallback(() => {
    const names = new Map(memberNamesRef.current ?? []);
    for (const [id, name] of participantNameMap(participantsRef.current)) {
      if (!names.has(id)) names.set(id, name);
    }
    return names;
  }, []);

  const resetQueue = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    queueRef.current = [];
    drainingRef.current = false;
    announcedActorRef.current = null;
    sawBeatRef.current = false;
  }, []);

  const setNoticeForScope = useCallback(
    (notice: string | null) => {
      if (activeTokenRef.current !== token) return;
      setScopedPacing((current) => {
        if (activeTokenRef.current !== token) return current;
        const hiddenIds =
          current.token === token ? current.hiddenIds : new Set<string>();
        if (current.token === token && current.notice === notice)
          return current;
        return { token, hiddenIds, notice };
      });
    },
    [token]
  );

  const updateHiddenIdsForScope = useCallback(
    (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
      if (activeTokenRef.current !== token) return;
      setScopedPacing((current) => {
        if (activeTokenRef.current !== token) return current;
        const hiddenIds = update(
          current.token === token ? current.hiddenIds : new Set<string>()
        );
        return {
          token,
          hiddenIds,
          notice: current.token === token ? current.notice : null,
        };
      });
    },
    [token]
  );

  const scheduleForScope = useCallback(
    (callback: () => void) => {
      if (activeTokenRef.current !== token) return;
      timerRef.current = setTimeout(() => {
        if (activeTokenRef.current !== token) return;
        timerRef.current = null;
        callback();
      }, COMBAT_STORY_PACE_MS);
    },
    [token]
  );

  const drain = useCallback(
    function drainQueue() {
      if (activeTokenRef.current !== token) return;
      const step = nextBeatStep(queueRef.current, announcedActorRef.current);
      if (step.type === 'idle') {
        drainingRef.current = false;
        setNoticeForScope(null);
        return;
      }

      if (step.type === 'announce') {
        announcedActorRef.current = step.actor;
        sawBeatRef.current = false;
        const name = namesNow().get(step.actor);
        setNoticeForScope(`${name ?? step.actor}'s turn.`);
        scheduleForScope(drainQueue);
        return;
      }

      queueRef.current.shift();
      const { event, actor } = step;
      updateHiddenIdsForScope((current) => {
        const next = new Set(current);
        next.delete(storyId(event));
        return next;
      });

      if (event.body.case === 'moved') {
        sawBeatRef.current = true;
      } else if (event.body.case === 'struck' || event.body.case === 'missed') {
        sawBeatRef.current = true;
        setNoticeForScope(null);
      } else if (event.body.case === 'turnEnded') {
        if (!sawBeatRef.current) {
          const name = namesNow().get(actor);
          setNoticeForScope(`${name ?? actor} does nothing.`);
        }
        announcedActorRef.current = null;
        sawBeatRef.current = false;
        scheduleForScope(() => {
          setNoticeForScope(null);
          if (queueRef.current.length > 0) drainQueue();
          else drainingRef.current = false;
        });
        return;
      }

      if (queueRef.current.length > 0) {
        scheduleForScope(drainQueue);
      } else {
        drainingRef.current = false;
      }
    },
    [
      namesNow,
      scheduleForScope,
      setNoticeForScope,
      token,
      updateHiddenIdsForScope,
    ]
  );

  const acceptEvent = useCallback(
    (event: Event, metadata: SessionEventDeliveryMetadata) => {
      if (
        activeTokenRef.current !== token ||
        metadata.source !== 'live' ||
        !needsPacing(event, member)
      ) {
        return;
      }
      queueRef.current.push(event);
      updateHiddenIdsForScope((current) => {
        const next = new Set(current);
        next.add(storyId(event));
        return next;
      });
      if (!drainingRef.current) {
        drainingRef.current = true;
        drain();
      }
    },
    [drain, member, token, updateHiddenIdsForScope]
  );

  useLayoutEffect(() => {
    resetQueue();
    setScopedPacing((current) => {
      if (
        current.token === token &&
        current.hiddenIds.size === 0 &&
        current.notice === null
      ) {
        return current;
      }
      return emptyScopedPacing(token);
    });
    return resetQueue;
  }, [resetQueue, token]);

  // A member change gets an empty projection during render; the layout reset
  // then clears mutable work before paint. Prior-scope Story/notice therefore
  // cannot flash while React commits the new member.
  const currentPacing = scopedPacing.token === token ? scopedPacing : null;
  const visibleStory = useMemo(
    () =>
      currentPacing
        ? story.filter((entry) => !currentPacing.hiddenIds.has(entry.id))
        : story,
    [currentPacing, story]
  );
  const visibleResult =
    result && !currentPacing?.hiddenIds.has(result.attackId)
      ? result
      : undefined;

  return {
    story: visibleStory,
    result: visibleResult,
    notice: currentPacing?.notice ?? null,
    acceptEvent,
  };
}
