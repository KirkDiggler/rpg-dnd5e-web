import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  MemberKind,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectCurrentDiceEvents,
  selectCurrentPresentation,
  selectLiveAnnouncement,
  selectVisibleResult,
  selectVisibleStory,
  type AttackResponseFact,
  type CombatPresentationState,
} from './presentation';
import type {
  CombatExperienceAttackOutcome,
  CombatExperiencePhase,
  CombatExperienceStoryExchange,
} from './types';

export interface UseCombatPresentationArgs {
  readonly viewerMember: string;
  readonly participants?: readonly Participant[];
}

export interface UseCombatPresentationResult {
  readonly state: CombatPresentationState;
  readonly story: readonly CombatExperienceStoryExchange[];
  readonly result?: CombatExperienceAttackOutcome;
  readonly liveAnnouncement: string | null;
  readonly debug: readonly string[];
  readonly diceEvents: readonly DicePresentationEvent[];
  readonly semanticFallback: boolean;
  readonly diceWitnessRole: 'roller' | 'spectator';
  readonly diceRollerName: string;
  readonly phase: CombatExperiencePhase;
  readonly acceptAttackResponse: (fact: AttackResponseFact) => void;
  readonly acceptStreamEvent: (
    event: Event,
    metadata: SessionEventDeliveryMetadata
  ) => void;
  readonly onDiceReleaseRequest: (event: DicePresentationReleasedEvent) => void;
  readonly onSemanticReleaseRequest: () => void;
}

function presentationConfig(args: UseCombatPresentationArgs) {
  const memberNames: Record<string, string> = {};
  const rollerRoles: Record<string, 'player' | 'monster'> = {};
  for (const participant of args.participants ?? []) {
    memberNames[participant.member] = participant.name;
    if (participant.kind === MemberKind.PLAYER) {
      rollerRoles[participant.member] = 'player';
    } else if (participant.kind === MemberKind.MONSTER) {
      rollerRoles[participant.member] = 'monster';
    }
  }
  return {
    viewerMember: args.viewerMember,
    memberNames,
    rollerRoles,
  };
}

/**
 * Controller seam for Task 14. Dispatch records response/event truth
 * synchronously; only Story/result selectors are release-gated.
 */
export function useCombatPresentation(
  args: UseCombatPresentationArgs
): UseCombatPresentationResult {
  const { viewerMember, participants } = args;
  const config = useMemo(
    () => presentationConfig({ viewerMember, participants }),
    [participants, viewerMember]
  );
  const [state, dispatch] = useReducer(
    reduceCombatPresentation,
    config,
    emptyPresentation
  );
  useEffect(() => {
    dispatch({ type: 'configure', ...config });
  }, [config]);

  const acceptAttackResponse = useCallback((fact: AttackResponseFact) => {
    dispatch(fact);
  }, []);
  const acceptStreamEvent = useCallback(
    (event: Event, metadata: SessionEventDeliveryMetadata) => {
      dispatch({ type: 'stream-event', event, metadata });
    },
    []
  );
  const onDiceReleaseRequest = useCallback(
    (event: DicePresentationReleasedEvent) => {
      dispatch({ type: 'local-release', event });
    },
    []
  );
  const onSemanticReleaseRequest = useCallback(() => {
    const current = selectCurrentPresentation(state);
    if (!current) return;
    dispatch({
      type: 'semantic-release',
      presentationKey: current.key,
    });
  }, [state]);

  const story = useMemo(() => selectVisibleStory(state), [state]);
  const result = useMemo(() => selectVisibleResult(state), [state]);
  const liveAnnouncement = useMemo(
    () => selectLiveAnnouncement(state),
    [state]
  );
  const diceEvents = useMemo(() => selectCurrentDiceEvents(state), [state]);
  const current = selectCurrentPresentation(state);
  const phase: CombatExperiencePhase = !current
    ? 'fresh'
    : current.settlement === 'armed' ||
        (current.semanticFallback && !current.eventAccepted)
      ? 'awaiting-roll'
      : 'settled';

  return {
    state,
    story,
    result,
    liveAnnouncement,
    debug: state.debug,
    diceEvents,
    semanticFallback: current?.semanticFallback ?? false,
    diceWitnessRole:
      current?.authority.attacker === state.viewerMember
        ? 'roller'
        : 'spectator',
    diceRollerName: current
      ? (state.memberNames[current.authority.attacker] ??
        current.authority.attacker)
      : 'Your character',
    phase,
    acceptAttackResponse,
    acceptStreamEvent,
    onDiceReleaseRequest,
    onSemanticReleaseRequest,
  };
}

/** Convenience adapter for an RPC callback that already has request context. */
export function attackResponseFact(input: {
  session: string;
  attacker: string;
  target: string;
  response: AttackResponse;
}): AttackResponseFact {
  return Object.freeze({ type: 'attack-response', ...input });
}
