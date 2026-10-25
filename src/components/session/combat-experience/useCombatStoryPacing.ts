import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ClockMark,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ActDeliveryMetadata } from '../actFeed';
import {
  isTurnEnd,
  needsPacing,
  nextBeatStep,
  type QueuedBeat,
} from '../monsterBeatQueue';
import { participantNameMap } from '../participantNames';
import type { TurnBeat } from '../useTurnOrderFollow';
import { actStoryId } from './actStory';
import { fightIncludes } from './toastPolicy';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

export const COMBAT_STORY_PACE_MS = 300;

export interface UseCombatStoryPacingArgs {
  member: string;
  participants: readonly Participant[];
  memberNames?: ReadonlyMap<string, string>;
  story: readonly CombatExperienceStoryExchange[];
  result?: CombatExperienceAttackOutcome;
  /** Told whose driven turn the story is playing, each turn it passes on,
   * and when it rests: the turn order follows it (rpg-project#685). */
  onTurnBeat?: (beat: TurnBeat) => void;
}

export interface UseCombatStoryPacingResult {
  story: readonly CombatExperienceStoryExchange[];
  result?: CombatExperienceAttackOutcome;
  notice: string | null;
  /** One same-id run of acts, whole and in order. */
  acceptActs: (run: readonly Act[], metadata: ActDeliveryMetadata) => void;
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

/** Records who a live clock act names as in the viewer's fight. */
function learnFight(act: Act, member: string, named: Set<string>): void {
  if (act.body.case !== 'clock') return;
  const clock = act.body.value;
  switch (clock.mark) {
    case ClockMark.FIGHT_FORMED:
      if (fightIncludes(act, member)) {
        for (const p of clock.fight?.order ?? []) named.add(p.id);
      }
      return;
    case ClockMark.FIGHT_DISSOLVED:
      if (fightIncludes(act, member)) named.clear();
      return;
    case ClockMark.JOINED:
      if (clock.member?.id) named.add(clock.member.id);
      return;
    case ClockMark.TURN_ENDED:
      if (clock.turn?.member?.id) named.add(clock.turn.member.id);
      if (clock.turn?.next?.id) named.add(clock.turn.next.id);
      return;
    default:
      return;
  }
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
  onTurnBeat,
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
  const queueRef = useRef<QueuedBeat[]>([]);
  const drainingRef = useRef(false);
  const announcedActorRef = useRef<string | null>(null);
  const sawBeatRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantsRef = useRef(participants);
  const memberNamesRef = useRef(memberNames);
  participantsRef.current = participants;
  memberNamesRef.current = memberNames;
  const onTurnBeatRef = useRef(onTurnBeat);
  onTurnBeatRef.current = onTurnBeat;
  /** Fight members the live clock acts named since the last snapshot could
   * (a fight forming, a join, a turn passing); a dissolve forgets them. */
  const namedInFightRef = useRef(new Set<string>());

  const tell = useCallback(
    (beat: TurnBeat) => {
      if (activeTokenRef.current !== token) return;
      onTurnBeatRef.current?.(beat);
    },
    [token]
  );
  const rest = useCallback(() => {
    drainingRef.current = false;
    tell({ type: 'idle' });
  }, [tell]);

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
    namedInFightRef.current = new Set();
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
        setNoticeForScope(null);
        rest();
        return;
      }

      if (step.type === 'announce') {
        announcedActorRef.current = step.actor;
        tell({ type: 'playing', actor: step.actor });
        sawBeatRef.current = false;
        const name = namesNow().get(step.actor);
        setNoticeForScope(`${name ?? step.actor}'s turn.`);
        scheduleForScope(drainQueue);
        return;
      }

      queueRef.current.shift();
      const { beat, actor } = step;
      updateHiddenIdsForScope((current) => {
        const next = new Set(current);
        next.delete(actStoryId(beat.act, beat.index));
        return next;
      });

      if (beat.act.body.case === 'walk') {
        sawBeatRef.current = true;
      } else if (beat.act.body.case === 'attack') {
        sawBeatRef.current = true;
        setNoticeForScope(null);
      } else if (isTurnEnd(beat.act)) {
        if (!sawBeatRef.current) {
          const name = namesNow().get(actor);
          setNoticeForScope(`${name ?? actor} does nothing.`);
        }
        announcedActorRef.current = null;
        sawBeatRef.current = false;
        tell({ type: 'passed', act: beat.act });
        scheduleForScope(() => {
          setNoticeForScope(null);
          if (queueRef.current.length > 0) drainQueue();
          else rest();
        });
        return;
      }

      if (queueRef.current.length > 0) {
        scheduleForScope(drainQueue);
      } else {
        rest();
      }
    },
    [
      namesNow,
      rest,
      tell,
      scheduleForScope,
      setNoticeForScope,
      token,
      updateHiddenIdsForScope,
    ]
  );

  const acceptActs = useCallback(
    (run: readonly Act[], metadata: ActDeliveryMetadata) => {
      if (activeTokenRef.current !== token || metadata.source !== 'live') {
        return;
      }
      const named = namedInFightRef.current;
      const paced = run.flatMap((act, index) => {
        learnFight(act, member, named);
        const fight = new Set(named);
        for (const p of participantsRef.current) fight.add(p.member);
        return needsPacing(act, member, fight) ? [{ act, index }] : [];
      });
      if (paced.length === 0) return;
      queueRef.current.push(...paced);
      updateHiddenIdsForScope((current) => {
        const next = new Set(current);
        for (const beat of paced) next.add(actStoryId(beat.act, beat.index));
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
    acceptActs,
  };
}
