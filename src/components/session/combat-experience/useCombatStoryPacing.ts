import {
  MemberKind,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ClockMark,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ActDeliveryMetadata } from '../actFeed';
import {
  beatActor,
  isTurnEnd,
  needsPacing,
  nextBeatStep,
  type QueuedBeat,
} from '../monsterBeatQueue';
import { participantNameMap } from '../participantNames';
import type { TurnBeat } from '../useTurnOrderFollow';
import type { PresentWalk } from '../walkPresentation';
import { actStoryId } from './actStory';
import { fightIncludes } from './toastPolicy';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

/** A gap between completed items, never a guess at a walk's duration. */
export const COMBAT_STORY_PACE_MS = 300;

export interface UseCombatStoryPacingArgs {
  session: string;
  member: string;
  /** Pauses advancement between beats, not authority or an in-flight walk. */
  paused?: boolean;
  participants: readonly Participant[];
  memberNames?: ReadonlyMap<string, string>;
  story: readonly CombatExperienceStoryExchange[];
  result?: CombatExperienceAttackOutcome;
  onTurnBeat?: (beat: TurnBeat) => void;
  /** Absence means no render surface: walks settle without waiting for paint. */
  onPresentWalk?: PresentWalk;
  /** Absent means no live render surface. Visibility loss retires queued motion. */
  presentableMembers?: ReadonlySet<string>;
}

export interface UseCombatStoryPacingResult {
  story: readonly CombatExperienceStoryExchange[];
  result?: CombatExperienceAttackOutcome;
  notice: string | null;
  monsterTurnIds: ReadonlySet<string>;
  /** Already displayed bodies must not snap to newer snapshots ahead of a walk. */
  heldMovementMembers: ReadonlySet<string>;
  acceptActs: (run: readonly Act[], metadata: ActDeliveryMetadata) => void;
}

interface PacingScopeToken {
  readonly session: string;
  readonly member: string;
}

interface ScopedPacingState {
  readonly token: PacingScopeToken;
  readonly hiddenIds: ReadonlySet<string>;
  readonly monsterTurnIds: ReadonlySet<string>;
  readonly heldMovementMembers: ReadonlySet<string>;
  readonly notice: string | null;
}

interface PendingWalk {
  readonly member: string;
  unsubscribe?: () => void;
}

function emptyScopedPacing(token: PacingScopeToken): ScopedPacingState {
  return {
    token,
    hiddenIds: new Set(),
    monsterTurnIds: new Set(),
    heldMovementMembers: new Set(),
    notice: null,
  };
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
 * One presentation-only cursor. Authority/knowledge process delivery immediately;
 * this cursor releases visible walks and waits for their exact completion before
 * revealing the next paced row/turn. Catch-up never animates. World walks share
 * this owner without borrowing a combat turn announcement.
 */
export function useCombatStoryPacing({
  session,
  member,
  participants,
  memberNames,
  story,
  result,
  onTurnBeat,
  onPresentWalk,
  presentableMembers = EMPTY_MEMBERS,
  paused = false,
}: UseCombatStoryPacingArgs): UseCombatStoryPacingResult {
  const token = useMemo<PacingScopeToken>(
    () => Object.freeze({ session, member }),
    [session, member]
  );
  const activeTokenRef = useRef(token);
  activeTokenRef.current = token;
  const mountedRef = useRef(true);
  const [scopedPacing, setScopedPacing] = useState<ScopedPacingState>(() =>
    emptyScopedPacing(token)
  );
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const deferredRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<QueuedBeat[]>([]);
  const waitingRef = useRef<PendingWalk | null>(null);
  const drainingRef = useRef(false);
  const turnPresentationActiveRef = useRef(false);
  const announcedActorRef = useRef<string | null>(null);
  const sawBeatRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantsRef = useRef(participants);
  const memberNamesRef = useRef(memberNames);
  participantsRef.current = participants;
  memberNamesRef.current = memberNames;
  const onTurnBeatRef = useRef(onTurnBeat);
  onTurnBeatRef.current = onTurnBeat;
  const onPresentWalkRef = useRef(onPresentWalk);
  onPresentWalkRef.current = onPresentWalk;
  const presentableMembersRef = useRef(presentableMembers);
  presentableMembersRef.current = presentableMembers;
  const namedInFightRef = useRef(new Set<string>());
  const inScope = useCallback(
    () => mountedRef.current && activeTokenRef.current === token,
    [token]
  );

  const tell = useCallback(
    (beat: TurnBeat) => {
      if (inScope()) onTurnBeatRef.current?.(beat);
    },
    [inScope]
  );
  const rest = useCallback(() => {
    drainingRef.current = false;
    if (turnPresentationActiveRef.current) {
      turnPresentationActiveRef.current = false;
      tell({ type: 'idle' });
    }
  }, [tell]);
  const namesNow = useCallback(() => {
    const names = new Map(memberNamesRef.current ?? []);
    for (const [id, name] of participantNameMap(participantsRef.current)) {
      if (!names.has(id)) names.set(id, name);
    }
    return names;
  }, []);

  const resetQueue = useCallback(() => {
    deferredRef.current = null;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    const waiting = waitingRef.current;
    waitingRef.current = null;
    waiting?.unsubscribe?.();
    queueRef.current = [];
    drainingRef.current = false;
    turnPresentationActiveRef.current = false;
    announcedActorRef.current = null;
    sawBeatRef.current = false;
    namedInFightRef.current = new Set();
  }, []);

  const setNoticeForScope = useCallback(
    (notice: string | null) => {
      if (!inScope()) return;
      setScopedPacing((current) => {
        if (!inScope()) return current;
        const base =
          current.token === token ? current : emptyScopedPacing(token);
        return base.notice === notice ? base : { ...base, notice };
      });
    },
    [inScope, token]
  );

  const updateHiddenIdsForScope = useCallback(
    (
      update: (ids: ReadonlySet<string>) => ReadonlySet<string>,
      monsterIds: readonly string[] = []
    ) => {
      if (!inScope()) return;
      setScopedPacing((current) => {
        if (!inScope()) return current;
        const base =
          current.token === token ? current : emptyScopedPacing(token);
        return {
          ...base,
          hiddenIds: update(base.hiddenIds),
          monsterTurnIds: monsterIds.length
            ? new Set([...base.monsterTurnIds, ...monsterIds])
            : base.monsterTurnIds,
        };
      });
    },
    [inScope, token]
  );

  const publishHeldMembers = useCallback(() => {
    if (!inScope()) return;
    const held = new Set<string>();
    if (waitingRef.current) held.add(waitingRef.current.member);
    for (const beat of queueRef.current) {
      if (beat.walkPresentation === 'eligible') {
        const actor = beatActor(beat.act);
        if (actor) held.add(actor);
      }
    }
    setScopedPacing((current) => {
      if (!inScope()) return current;
      const base = current.token === token ? current : emptyScopedPacing(token);
      if (
        base.heldMovementMembers.size === held.size &&
        [...held].every((id) => base.heldMovementMembers.has(id))
      )
        return base;
      return { ...base, heldMovementMembers: held };
    });
  }, [inScope, token]);

  const scheduleForScope = useCallback(
    (callback: () => void) => {
      if (!inScope()) return;
      timerRef.current = setTimeout(() => {
        if (!inScope()) return;
        timerRef.current = null;
        if (pausedRef.current) deferredRef.current = callback;
        else callback();
      }, COMBAT_STORY_PACE_MS);
    },
    [inScope]
  );

  const drain = useCallback(
    function drainQueue() {
      if (!inScope() || waitingRef.current) return;
      if (pausedRef.current) {
        deferredRef.current = drainQueue;
        return;
      }
      const step = nextBeatStep(queueRef.current, announcedActorRef.current);
      if (step.type === 'idle') {
        setNoticeForScope(null);
        publishHeldMembers();
        rest();
        return;
      }
      if (step.type === 'announce') {
        announcedActorRef.current = step.actor;
        turnPresentationActiveRef.current = true;
        tell({ type: 'playing', actor: step.actor });
        sawBeatRef.current = false;
        setNoticeForScope(
          `${namesNow().get(step.actor) ?? step.actor}'s turn.`
        );
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
        if (beat.scope === 'turn') sawBeatRef.current = true;
        if (beat.walkPresentation === 'discarded') {
          // Retain the delivered story at its proper place in the cursor, but
          // never replay motion whose render lifecycle has already ended.
          publishHeldMembers();
          if (queueRef.current.length > 0) scheduleForScope(drainQueue);
          else {
            setNoticeForScope(null);
            rest();
          }
          return;
        }
        const pending: PendingWalk = { member: actor };
        waitingRef.current = pending;
        publishHeldMembers();
        const complete = (): void => {
          if (!inScope() || waitingRef.current !== pending) return;
          waitingRef.current = null;
          pending.unsubscribe?.();
          publishHeldMembers();
          if (queueRef.current.length > 0) scheduleForScope(drainQueue);
          else {
            setNoticeForScope(null);
            rest();
          }
        };
        // Install the identity BEFORE asking the renderer. Missing/unavailable
        // presentation may complete synchronously; never install a stale waiter.
        const unsubscribe = onPresentWalkRef.current?.({
          act: beat.act,
          complete,
        });
        if (unsubscribe) {
          if (waitingRef.current === pending) pending.unsubscribe = unsubscribe;
          else unsubscribe();
        } else if (!onPresentWalkRef.current) complete();
        return;
      }
      publishHeldMembers();
      if (beat.act.body.case === 'attack') {
        sawBeatRef.current = true;
        setNoticeForScope(null);
      } else if (isTurnEnd(beat.act)) {
        if (!sawBeatRef.current)
          setNoticeForScope(`${namesNow().get(actor) ?? actor} does nothing.`);
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
      if (queueRef.current.length > 0) scheduleForScope(drainQueue);
      else rest();
    },
    [
      inScope,
      namesNow,
      publishHeldMembers,
      rest,
      scheduleForScope,
      setNoticeForScope,
      tell,
      updateHiddenIdsForScope,
    ]
  );

  const acceptActs = useCallback(
    (run: readonly Act[], metadata: ActDeliveryMetadata) => {
      if (!inScope() || metadata.source !== 'live') return;
      const named = namedInFightRef.current;
      const paced = run.flatMap<QueuedBeat>((act, index) => {
        learnFight(act, member, named);
        const fight = new Set(named);
        for (const participant of participantsRef.current)
          fight.add(participant.member);
        const actor = beatActor(act);
        const walkPresentation: QueuedBeat['walkPresentation'] =
          act.body.case !== 'walk'
            ? 'none'
            : actor &&
                onPresentWalkRef.current &&
                presentableMembersRef.current.has(actor)
              ? 'eligible'
              : 'discarded';
        if (needsPacing(act, member, fight))
          return [{ act, index, scope: 'turn', walkPresentation }];
        if (act.body.case === 'walk' && actor && actor !== member)
          return [{ act, index, scope: 'world', walkPresentation }];
        return [];
      });
      if (paced.length === 0) return;
      queueRef.current.push(...paced);
      updateHiddenIdsForScope(
        (current) => {
          const next = new Set(current);
          for (const beat of paced) next.add(actStoryId(beat.act, beat.index));
          return next;
        },
        paced
          .filter(
            (beat) =>
              beat.scope === 'turn' &&
              participantsRef.current.some(
                (participant) =>
                  participant.member === beatActor(beat.act) &&
                  participant.kind === MemberKind.MONSTER
              )
          )
          .map((beat) => actStoryId(beat.act, beat.index))
      );
      publishHeldMembers();
      if (!drainingRef.current) {
        drainingRef.current = true;
        drain();
      }
    },
    [drain, inScope, member, publishHeldMembers, updateHiddenIdsForScope]
  );

  useLayoutEffect(() => {
    mountedRef.current = true;
    resetQueue();
    setScopedPacing((current) =>
      current.token === token &&
      current.hiddenIds.size === 0 &&
      current.heldMovementMembers.size === 0 &&
      current.notice === null
        ? current
        : emptyScopedPacing(token)
    );
    return () => {
      mountedRef.current = false;
      resetQueue();
    };
  }, [resetQueue, token]);

  useLayoutEffect(() => {
    if (paused || !inScope()) return;
    const resume = deferredRef.current;
    deferredRef.current = null;
    resume?.();
  }, [paused, inScope]);

  useLayoutEffect(() => {
    if (!inScope()) return;
    let changed = false;
    queueRef.current = queueRef.current.map<QueuedBeat>((beat) => {
      const actor = beatActor(beat.act);
      if (
        beat.walkPresentation === 'eligible' &&
        (!actor || !presentableMembers.has(actor))
      ) {
        changed = true;
        return { ...beat, walkPresentation: 'discarded' };
      }
      return beat;
    });
    if (changed) publishHeldMembers();
  }, [inScope, presentableMembers, publishHeldMembers]);

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
    monsterTurnIds: currentPacing?.monsterTurnIds ?? EMPTY_MEMBERS,
    heldMovementMembers: currentPacing?.heldMovementMembers ?? EMPTY_MEMBERS,
    acceptActs,
  };
}

const EMPTY_MEMBERS: ReadonlySet<string> = new Set();
