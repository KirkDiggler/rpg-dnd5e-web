import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import {
  emptyPresentation,
  reduceCombatPresentation,
  selectBlocksManualEndTurn,
  selectConcealsDeathSaveTruth,
  selectCurrentDiceEvents,
  selectCurrentPresentation,
  selectLiveAnnouncement,
  selectSettledDeathSave,
  selectUnresolvedAttackTargets,
  selectVisibleResult,
  selectVisibleStory,
  type AttackResponseFact,
  type CombatPresentationConfigFact,
  type CombatPresentationFact,
  type CombatPresentationState,
  type DeathSaveResponseFact,
  type SettledDeathSave,
} from './presentation';
import type {
  CombatExperienceAttackOutcome,
  CombatExperiencePhase,
  CombatExperienceStoryExchange,
} from './types';

export interface UseCombatPresentationArgs {
  readonly session: string;
  readonly viewerMember: string;
  /** Stable public-roster identity; Turn participants are never consulted. */
  readonly memberNames?: Readonly<Record<string, string>>;
  readonly memberRoles?: Readonly<Record<string, 'player' | 'monster'>>;
}

export interface UseCombatPresentationResult {
  readonly state: CombatPresentationState;
  readonly story: readonly CombatExperienceStoryExchange[];
  readonly result?: CombatExperienceAttackOutcome;
  readonly settledDeathSave?: SettledDeathSave;
  /** A live Death Save's refreshed current-state result is not visible yet. */
  readonly concealsDeathSaveTruth: boolean;
  /** Exact identity scopes the last-visible snapshot to one presentation. */
  readonly concealedDeathSavePresentationKey?: string;
  readonly blocksManualEndTurn: boolean;
  readonly liveAnnouncement: string | null;
  /** Targets whose attack roll has not been revealed yet — the map holds
   * their downed reveal until it has (`downedReveal.ts`). */
  readonly unresolvedAttackTargets: ReadonlySet<string>;
  readonly debug: readonly string[];
  readonly diceEvents: readonly DicePresentationEvent[];
  readonly semanticFallback: boolean;
  readonly diceWitnessRole: 'roller' | 'spectator';
  readonly diceRollerName: string;
  readonly phase: CombatExperiencePhase;
  readonly acceptAttackResponse: (fact: AttackResponseFact) => void;
  readonly acceptDeathSaveResponse: (fact: DeathSaveResponseFact) => void;
  readonly acceptStreamEvent: (
    event: Event,
    metadata: SessionEventDeliveryMetadata
  ) => void;
  readonly onDiceReleaseRequest: (event: DicePresentationReleasedEvent) => void;
  readonly onSemanticReleaseRequest: () => void;
  readonly onWitnessDiceSettlement: (presentationId: string) => void;
}

function presentationConfig(
  args: UseCombatPresentationArgs
): Omit<CombatPresentationConfigFact, 'type'> {
  return {
    session: args.session,
    viewerMember: args.viewerMember,
    memberNames: { ...(args.memberNames ?? {}) },
    rollerRoles: { ...(args.memberRoles ?? {}) },
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
  const { session, viewerMember, memberNames, memberRoles } = args;
  const config = useMemo(
    () =>
      presentationConfig({
        session,
        viewerMember,
        memberNames,
        memberRoles,
      }),
    [memberNames, memberRoles, session, viewerMember]
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
  const acceptDeathSaveResponse = useCallback(
    (fact: DeathSaveResponseFact) => dispatch(fact),
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
  const onWitnessDiceSettlement = useCallback(
    (presentationId: string) => {
      dispatch({ type: 'witness-settlement', presentationId });
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
  const settledDeathSave = useMemo(
    () => selectSettledDeathSave(state),
    [state]
  );
  const blocksManualEndTurn = useMemo(
    () => selectBlocksManualEndTurn(state),
    [state]
  );
  const concealsDeathSaveTruth = useMemo(
    () => selectConcealsDeathSaveTruth(state),
    [state]
  );
  const unresolvedAttackTargets = useMemo(
    () => selectUnresolvedAttackTargets(state),
    [state]
  );
  const liveAnnouncement = useMemo(
    () => selectLiveAnnouncement(state),
    [state]
  );
  const diceEvents = useMemo(() => selectCurrentDiceEvents(state), [state]);
  const current = selectCurrentPresentation(state);
  const authoritativeRoller =
    current !== undefined &&
    !current.conflicted &&
    current.authority.roller === state.viewerMember &&
    current.localPlayerOwned &&
    current.settlement !== 'auto';
  const phase: CombatExperiencePhase =
    !current || current.conflicted
      ? 'fresh'
      : current.settlement === 'unresolved'
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
    settledDeathSave,
    concealsDeathSaveTruth,
    concealedDeathSavePresentationKey: concealsDeathSaveTruth
      ? current?.key
      : undefined,
    blocksManualEndTurn,
    liveAnnouncement,
    unresolvedAttackTargets,
    debug: state.debug,
    diceEvents,
    semanticFallback: current?.semanticFallback ?? false,
    diceWitnessRole: authoritativeRoller ? 'roller' : 'spectator',
    diceRollerName: current
      ? (state.memberNames[current.authority.roller] ??
        current.authority.roller)
      : 'Your character',
    phase,
    acceptAttackResponse,
    acceptDeathSaveResponse,
    acceptStreamEvent,
    onDiceReleaseRequest,
    onSemanticReleaseRequest,
    onWitnessDiceSettlement,
  };
}

/** Convenience adapter for an RPC callback that already has request context. */
export { deathSaveResponseFact } from './presentation';

export function attackResponseFact(input: {
  session: string;
  attacker: string;
  target: string;
  response: AttackResponse;
}): AttackResponseFact {
  return Object.freeze({ type: 'attack-response', ...input });
}
