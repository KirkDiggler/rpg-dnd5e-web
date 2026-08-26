import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [notice, setNotice] = useState<string | null>(null);
  const queueRef = useRef<Event[]>([]);
  const drainingRef = useRef(false);
  const announcedActorRef = useRef<string | null>(null);
  const sawBeatRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantsRef = useRef(participants);
  const memberNamesRef = useRef(memberNames);
  participantsRef.current = participants;
  memberNamesRef.current = memberNames;

  const namesNow = () => {
    const names = new Map(memberNamesRef.current ?? []);
    for (const [id, name] of participantNameMap(participantsRef.current)) {
      if (!names.has(id)) names.set(id, name);
    }
    return names;
  };

  const drain = useCallback(function drainQueue() {
    const step = nextBeatStep(queueRef.current, announcedActorRef.current);
    if (step.type === 'idle') {
      drainingRef.current = false;
      setNotice(null);
      return;
    }

    if (step.type === 'announce') {
      announcedActorRef.current = step.actor;
      sawBeatRef.current = false;
      const name = namesNow().get(step.actor);
      setNotice(`${name ?? step.actor}'s turn.`);
      timerRef.current = setTimeout(drainQueue, COMBAT_STORY_PACE_MS);
      return;
    }

    queueRef.current.shift();
    const { event, actor } = step;
    setHiddenIds((current) => {
      const next = new Set(current);
      next.delete(storyId(event));
      return next;
    });

    if (event.body.case === 'moved') {
      sawBeatRef.current = true;
    } else if (event.body.case === 'struck' || event.body.case === 'missed') {
      sawBeatRef.current = true;
      setNotice(null);
    } else if (event.body.case === 'turnEnded') {
      if (!sawBeatRef.current) {
        const name = namesNow().get(actor);
        setNotice(`${name ?? actor} does nothing.`);
      }
      announcedActorRef.current = null;
      sawBeatRef.current = false;
      timerRef.current = setTimeout(() => {
        setNotice(null);
        if (queueRef.current.length > 0) drainQueue();
        else drainingRef.current = false;
      }, COMBAT_STORY_PACE_MS);
      return;
    }

    if (queueRef.current.length > 0) {
      timerRef.current = setTimeout(drainQueue, COMBAT_STORY_PACE_MS);
    } else {
      drainingRef.current = false;
    }
  }, []);

  const acceptEvent = useCallback(
    (event: Event, metadata: SessionEventDeliveryMetadata) => {
      if (metadata.source !== 'live' || !needsPacing(event, member)) return;
      queueRef.current.push(event);
      setHiddenIds((current) => {
        const next = new Set(current);
        next.add(storyId(event));
        return next;
      });
      if (!drainingRef.current) {
        drainingRef.current = true;
        drain();
      }
    },
    [drain, member]
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      queueRef.current = [];
      drainingRef.current = false;
      announcedActorRef.current = null;
      sawBeatRef.current = false;
      setHiddenIds(new Set());
      setNotice(null);
    },
    []
  );

  const visibleStory = useMemo(
    () => story.filter((entry) => !hiddenIds.has(entry.id)),
    [hiddenIds, story]
  );
  const visibleResult =
    result && !hiddenIds.has(result.attackId) ? result : undefined;

  return {
    story: visibleStory,
    result: visibleResult,
    notice,
    acceptEvent,
  };
}
