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
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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
  type CombatPresentationConfigFact,
  type CombatPresentationFact,
  type CombatPresentationState,
} from './presentation';
import type {
  CombatExperienceAttackOutcome,
  CombatExperiencePhase,
  CombatExperienceStoryExchange,
} from './types';

export interface UseCombatPresentationArgs {
  readonly session: string;
  readonly viewerMember: string;
  /** Public roster names may arrive before Turn participants. */
  readonly memberNames?: Readonly<Record<string, string>>;
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

function presentationConfig(
  args: UseCombatPresentationArgs
): Omit<CombatPresentationConfigFact, 'type'> {
  const memberNames: Record<string, string> = { ...(args.memberNames ?? {}) };
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
    session: args.session,
    viewerMember: args.viewerMember,
    memberNames,
    rollerRoles,
  };
}

interface ScopeToken {
  readonly session: string;
  readonly viewerMember: string;
}

interface ScopedPresentationState {
  readonly token: ScopeToken;
  readonly presentation: CombatPresentationState;
}

interface ScopedPresentationAction {
  readonly token: ScopeToken;
  readonly config: Omit<CombatPresentationConfigFact, 'type'>;
  readonly fact: CombatPresentationFact;
}

function scopedPresentationReducer(
  state: ScopedPresentationState,
  action: ScopedPresentationAction
): ScopedPresentationState {
  const sameScope = state.token === action.token;
  const presentation = sameScope
    ? state.presentation
    : emptyPresentation(action.config);
  const reduced = reduceCombatPresentation(presentation, action.fact);
  if (sameScope && reduced === state.presentation) return state;
  return Object.freeze({
    token: action.token,
    presentation: reduced,
  });
}

/**
 * Controller seam for Task 14. Dispatch records response/event truth
 * synchronously; only Story/result selectors are release-gated. Session and
 * viewer form an explicit scope, so a render never projects prior-scope state.
 */
export function useCombatPresentation(
  args: UseCombatPresentationArgs
): UseCombatPresentationResult {
  const { session, viewerMember, memberNames, participants } = args;
  const config = useMemo(
    () =>
      presentationConfig({
        session,
        viewerMember,
        memberNames,
        participants,
      }),
    [memberNames, participants, session, viewerMember]
  );
  const token = useMemo<ScopeToken>(
    () => Object.freeze({ session, viewerMember }),
    [session, viewerMember]
  );
  const activeToken = useRef(token);
  activeToken.current = token;

  const [scopedState, scopedDispatch] = useReducer(
    scopedPresentationReducer,
    undefined,
    (): ScopedPresentationState =>
      Object.freeze({
        token,
        presentation: emptyPresentation(config),
      })
  );
  const emptyScopedState = useMemo(() => emptyPresentation(config), [config]);
  const state =
    scopedState.token === token ? scopedState.presentation : emptyScopedState;

  const dispatch = useCallback(
    (fact: CombatPresentationFact) => {
      if (activeToken.current !== token) return;
      scopedDispatch({ token, config, fact });
    },
    [config, token]
  );

  useEffect(() => {
    dispatch({ type: 'configure', ...config });
  }, [config, dispatch]);

  const acceptAttackResponse = useCallback(
    (fact: AttackResponseFact) => dispatch(fact),
    [dispatch]
  );
  const acceptStreamEvent = useCallback(
    (event: Event, metadata: SessionEventDeliveryMetadata) => {
      dispatch({ type: 'stream-event', event, metadata });
    },
    [dispatch]
  );
  const onDiceReleaseRequest = useCallback(
    (event: DicePresentationReleasedEvent) => {
      dispatch({ type: 'local-release', event });
    },
    [dispatch]
  );
  const onSemanticReleaseRequest = useCallback(() => {
    const current = selectCurrentPresentation(state);
    if (
      !current ||
      current.conflicted ||
      !current.semanticFallback ||
      current.settlement !== 'armed'
    ) {
      return;
    }
    dispatch({
      type: 'semantic-release',
      presentationKey: current.key,
    });
  }, [dispatch, state]);

  const story = useMemo(() => selectVisibleStory(state), [state]);
  const result = useMemo(() => selectVisibleResult(state), [state]);
  const liveAnnouncement = useMemo(
    () => selectLiveAnnouncement(state),
    [state]
  );
  const diceEvents = useMemo(() => selectCurrentDiceEvents(state), [state]);
  const current = selectCurrentPresentation(state);
  const authoritativeRoller =
    current !== undefined &&
    !current.conflicted &&
    current.authority.attacker === state.viewerMember &&
    state.rollerRoles[current.authority.attacker] === 'player';
  const phase: CombatExperiencePhase =
    !current || current.conflicted
      ? 'fresh'
      : current.settlement === 'armed'
        ? 'awaiting-roll'
        : current.settlement === 'released' && !current.eventAccepted
          ? 'released-waiting-event'
          : 'settled';

  return {
    state,
    story,
    result,
    liveAnnouncement,
    debug: state.debug,
    diceEvents,
    semanticFallback: current?.semanticFallback ?? false,
    diceWitnessRole: authoritativeRoller ? 'roller' : 'spectator',
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
