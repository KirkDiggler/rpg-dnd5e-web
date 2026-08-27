import { useSessionActivate } from '@/api/useSessionActivate';
import { useSessionAttack } from '@/api/useSessionAttack';
import { useSessionEndTurn } from '@/api/useSessionEndTurn';
import type { SessionRefreshKey } from '@/components/session/useCoalescedSessionRefreshes';
import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ClockKind,
  TargetKind,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import {
  isStaleDeclarationRefusal,
  selectCombatExperience,
  staleDeclarationMessage,
} from './selection';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceLogMode,
  CombatExperiencePhase,
  CombatExperiencePresentationState,
  CombatExperienceStoryExchange,
} from './types';
import {
  attackResponseFact,
  useCombatPresentation,
} from './useCombatPresentation';
import { useCombatStoryPacing } from './useCombatStoryPacing';

const EMPTY_INTERACTION: CombatExperiencePresentationState = Object.freeze({
  armedDeclarationId: null,
  selectedCandidateMember: null,
  changedOptionNotice: null,
});

export const TURN_NOTICE_MS = 1800;

interface StaleRecovery {
  readonly declarationId: string;
  readonly verb: Verb;
  readonly target?: string;
}

export interface UseSessionCombatExperienceArgs {
  session: string;
  member: string;
  clock: ClockKind;
  active: string;
  authorityFresh: boolean;
  memberNames?: ReadonlyMap<string, string>;
  memberRoles?: ReadonlyMap<string, 'player' | 'monster'>;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
  invalidateAuthoritySnapshots: () => void;
  scheduleRefresh: (keys: readonly SessionRefreshKey[]) => void;
}

export interface UseSessionCombatExperienceResult {
  presentationState: CombatExperiencePresentationState;
  phase: CombatExperiencePhase;
  showTurnNotice: boolean;
  logMode: CombatExperienceLogMode;
  story: readonly CombatExperienceStoryExchange[];
  debug: readonly string[];
  result?: CombatExperienceAttackOutcome;
  diceEvents: readonly DicePresentationEvent[];
  diceSemanticFallback: boolean;
  diceWitnessRole: 'roller' | 'spectator';
  diceRollerName: string;
  pacingNotice: string | null;
  onSelectDeclaration: (declaration: Declaration) => void;
  onTargetClick: (target: string) => void;
  onEndTurn: (declaration: Declaration) => void;
  onLogModeChange: (mode: CombatExperienceLogMode) => void;
  onDiceReleaseRequest: (event: DicePresentationReleasedEvent) => void;
  onDiceSemanticReleaseRequest: () => void;
  /** Synchronous event-sequence authority revocation. */
  invalidateAuthority: () => void;
  /** Unified FAILED_PRECONDITION selector recovery used by Move too. */
  recoverStaleDeclaration: (
    declarationId: string,
    verb: Verb,
    target?: string
  ) => void;
  acceptStreamEvent: (
    event: Event,
    metadata: SessionEventDeliveryMetadata
  ) => void;
}

function uniqueCurrentDeclaration(
  declarations: readonly Declaration[],
  candidate: Declaration,
  verb: Verb,
  targetKind: TargetKind
): Declaration | undefined {
  const matches = declarations.filter(
    (declaration) => declaration.id === candidate.id
  );
  if (matches.length !== 1 || matches[0] !== candidate) return undefined;
  const current = matches[0];
  if (
    !current ||
    current.id.length === 0 ||
    current.verb !== verb ||
    current.targetKind !== targetKind ||
    !current.available
  ) {
    return undefined;
  }
  return current;
}

function refreshedWhy(
  declarations: readonly Declaration[],
  recovery: StaleRecovery
) {
  const matches = declarations.filter(
    (declaration) =>
      declaration.id === recovery.declarationId &&
      declaration.verb === recovery.verb
  );
  if (matches.length !== 1) return undefined;
  const declaration = matches[0]!;
  if (declaration.why?.text) return declaration.why;
  if (recovery.target) {
    const candidates = declaration.candidates.filter(
      (candidate) => candidate.member === recovery.target
    );
    if (candidates.length === 1 && candidates[0]?.why?.text) {
      return candidates[0].why;
    }
  }
  return undefined;
}

/** Production interaction/controller seam around the shared renderer. */
export function useSessionCombatExperience({
  session,
  member,
  clock,
  active,
  authorityFresh,
  memberNames,
  memberRoles,
  participants,
  declarations,
  invalidateAuthoritySnapshots,
  scheduleRefresh,
}: UseSessionCombatExperienceArgs): UseSessionCombatExperienceResult {
  const [interaction, setInteraction] =
    useState<CombatExperiencePresentationState>(EMPTY_INTERACTION);
  const [targeting, setTargeting] = useState(false);
  const [logMode, setLogMode] = useState<CombatExperienceLogMode>('story');
  const [showTurnNotice, setShowTurnNotice] = useState(false);
  const attackInFlightRef = useRef(false);
  const endTurnInFlightRef = useRef(false);
  const activateInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const declarationsRef = useRef(declarations);
  const staleRecoveryRef = useRef<StaleRecovery | null>(null);
  const authorityRef = useRef({ clock, active, fresh: authorityFresh });
  declarationsRef.current = declarations;
  authorityRef.current = { clock, active, fresh: authorityFresh };

  useEffect(() => {
    // StrictMode performs a setup → cleanup → setup probe on one mount.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const presentationMemberNames = useMemo(
    () => Object.fromEntries(memberNames ?? []),
    [memberNames]
  );
  const presentationMemberRoles = useMemo(
    () => Object.fromEntries(memberRoles ?? []),
    [memberRoles]
  );
  const presentation = useCombatPresentation({
    session,
    viewerMember: member,
    memberNames: presentationMemberNames,
    memberRoles: presentationMemberRoles,
  });
  const pacing = useCombatStoryPacing({
    member,
    participants,
    memberNames,
    story: presentation.story,
    result: presentation.result,
  });
  const { attack } = useSessionAttack();
  const { activate } = useSessionActivate();
  const { endTurn } = useSessionEndTurn();

  const invalidateAuthority = useCallback(() => {
    authorityRef.current = { ...authorityRef.current, fresh: false };
    invalidateAuthoritySnapshots();
    setInteraction((current) =>
      staleRecoveryRef.current
        ? {
            ...EMPTY_INTERACTION,
            changedOptionNotice:
              current.changedOptionNotice ?? staleDeclarationMessage(),
          }
        : EMPTY_INTERACTION
    );
    setTargeting(false);
  }, [invalidateAuthoritySnapshots]);

  const recoverStaleDeclaration = useCallback(
    (declarationId: string, verb: Verb, target?: string) => {
      if (!mountedRef.current) return;
      staleRecoveryRef.current = { declarationId, verb, target };
      authorityRef.current = { ...authorityRef.current, fresh: false };
      invalidateAuthoritySnapshots();
      setInteraction({
        ...EMPTY_INTERACTION,
        changedOptionNotice: staleDeclarationMessage(),
      });
      setTargeting(false);
      scheduleRefresh(['turn', 'afford']);
    },
    [invalidateAuthoritySnapshots, scheduleRefresh]
  );

  // Only a coherent, successful refreshed pair may add provider-authored
  // why.text to the generic stale-declaration copy.
  useEffect(() => {
    const recovery = staleRecoveryRef.current;
    if (!authorityFresh || !recovery) return;
    staleRecoveryRef.current = null;
    setInteraction({
      ...EMPTY_INTERACTION,
      changedOptionNotice: staleDeclarationMessage(
        refreshedWhy(declarations, recovery)
      ),
    });
  }, [authorityFresh, declarations]);

  const { armedIsCurrent, presentationState } = useMemo(() => {
    const armedMatches =
      interaction.armedDeclarationId === null
        ? []
        : declarations.filter(
            (declaration) => declaration.id === interaction.armedDeclarationId
          );
    const current =
      authorityFresh &&
      clock === ClockKind.TURN &&
      active === member &&
      armedMatches.length === 1 &&
      armedMatches[0]?.verb === Verb.ATTACK &&
      armedMatches[0]?.targetKind === TargetKind.MEMBER &&
      armedMatches[0]?.available;
    return {
      armedIsCurrent: current,
      presentationState: current
        ? interaction
        : interaction.armedDeclarationId === null
          ? interaction
          : {
              ...EMPTY_INTERACTION,
              changedOptionNotice: staleDeclarationMessage(
                armedMatches.length === 1 ? armedMatches[0]?.why : undefined
              ),
            },
    };
  }, [active, authorityFresh, clock, declarations, interaction, member]);

  useEffect(() => {
    if (interaction.armedDeclarationId !== null && !armedIsCurrent) {
      setInteraction(presentationState);
      setTargeting(false);
    }
  }, [armedIsCurrent, interaction.armedDeclarationId, presentationState]);

  const previousActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const current = clock === ClockKind.TURN ? active : null;
    if (current === member && previousActiveRef.current !== member) {
      setShowTurnNotice(true);
      const timeout = setTimeout(
        () => setShowTurnNotice(false),
        TURN_NOTICE_MS
      );
      previousActiveRef.current = current;
      return () => {
        clearTimeout(timeout);
        if (previousActiveRef.current === current) {
          previousActiveRef.current = null;
        }
      };
    }
    previousActiveRef.current = current;
  }, [active, clock, member]);

  const onSelectDeclaration = useCallback(
    (candidate: Declaration) => {
      if (
        !mountedRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }

      if (candidate.verb === Verb.ATTACK) {
        const current = uniqueCurrentDeclaration(
          declarationsRef.current,
          candidate,
          Verb.ATTACK,
          TargetKind.MEMBER
        );
        if (!current) return;
        setInteraction({
          armedDeclarationId: current.id,
          selectedCandidateMember: null,
          changedOptionNotice: null,
        });
        setTargeting(true);
        return;
      }

      if (candidate.verb === Verb.MOVE) {
        const current = uniqueCurrentDeclaration(
          declarationsRef.current,
          candidate,
          Verb.MOVE,
          TargetKind.PATH
        );
        if (!current) return;
        setInteraction(EMPTY_INTERACTION);
        setTargeting(false);
        return;
      }

      // AN ACTIVATION FIRES ON THE CLICK. Attack arms and waits for a target,
      // Move waits for a path; the six activations a level-1 character can
      // reach prompt for nobody, so there is nothing to wait for and a
      // two-step interaction would be ceremony. The dock only offers
      // TARGET_KIND_NONE activations for exactly this reason.
      if (candidate.verb === Verb.ACTIVATE) {
        runActivateRef.current(candidate);
      }
    },
    [member]
  );

  const onTargetClick = useCallback(
    (target: string) => {
      if (
        !target ||
        !mountedRef.current ||
        attackInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const currentState = {
        ...presentationState,
        selectedCandidateMember: target,
        changedOptionNotice: null,
      };
      const selected = selectCombatExperience(
        declarationsRef.current,
        currentState
      );
      if (
        !selected?.declaration ||
        selected.declaration.verb !== Verb.ATTACK ||
        selected.declaration.targetKind !== TargetKind.MEMBER ||
        !selected.candidate ||
        !selected.candidate.member
      ) {
        setInteraction({
          ...currentState,
          changedOptionNotice:
            selected?.whyText ?? staleDeclarationMessage(undefined),
        });
        return;
      }

      const declaration = selected.declaration;
      const exactTarget = selected.candidate.member;
      setInteraction(currentState);
      setTargeting(false);
      attackInFlightRef.current = true;
      void (async () => {
        try {
          const response = await attack({
            session,
            attacker: member,
            target: exactTarget,
            declarationId: declaration.id,
          });
          if (!mountedRef.current) return;
          presentation.acceptAttackResponse(
            attackResponseFact({
              session,
              attacker: member,
              target: exactTarget,
              response,
            })
          );
          invalidateAuthority();
          scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
        } catch (error) {
          if (!mountedRef.current) return;
          if (isStaleDeclarationRefusal(error)) {
            recoverStaleDeclaration(declaration.id, Verb.ATTACK, exactTarget);
          } else {
            // A transport/unknown failure is ambiguous: the provider may have
            // committed the command even though its response did not arrive.
            // Keep the honest error, but never leave pre-command authority
            // armed or executable and never replay the mutation.
            const notice = `Attack failed: ${error instanceof Error ? error.message : 'unknown error'}`;
            invalidateAuthority();
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: notice,
            });
            scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
          }
        } finally {
          attackInFlightRef.current = false;
        }
      })();
    },
    [
      attack,
      invalidateAuthority,
      member,
      presentation,
      presentationState,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  // runActivate is held in a ref so onSelectDeclaration can call it without
  // taking it as a dependency: the two are mutually recursive through the
  // dock's single onSelect handler, and threading the callback through would
  // rebuild both on every render for no gain.
  const runActivateRef = useRef<(candidate: Declaration) => void>(() => {});

  const onActivate = useCallback(
    (candidate: Declaration) => {
      if (
        !mountedRef.current ||
        activateInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      // BY ID, NEVER BY VERB. Activate is the first verb that compiles more
      // than one offer, so "the current declaration for this verb" stopped
      // being a question with an answer — uniqueCurrentDeclaration matches on
      // the selector, which was always the unique thing.
      const current = uniqueCurrentDeclaration(
        declarationsRef.current,
        candidate,
        Verb.ACTIVATE,
        TargetKind.NONE
      );
      if (!current) return;

      activateInFlightRef.current = true;
      void (async () => {
        try {
          await activate({
            session,
            member,
            declarationId: current.id,
          });
          if (!mountedRef.current) return;
          invalidateAuthority();
          scheduleRefresh(['characterData', 'turn', 'afford']);
        } catch (error) {
          if (!mountedRef.current) return;
          if (isStaleDeclarationRefusal(error)) {
            recoverStaleDeclaration(current.id, Verb.ACTIVATE);
          } else {
            // Every other failure is ambiguous about whether the activation
            // committed — the ack is thin by design, so a transport error
            // cannot be told from a refusal after the fact. Fail closed,
            // preserve the message, reconcile, and never retry.
            const notice = `Activate failed: ${error instanceof Error ? error.message : 'unknown error'}`;
            invalidateAuthority();
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: notice,
            });
            scheduleRefresh(['characterData', 'turn', 'afford']);
          }
        } finally {
          activateInFlightRef.current = false;
        }
      })();
    },
    [
      activate,
      invalidateAuthority,
      member,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  runActivateRef.current = onActivate;

  const onEndTurn = useCallback(
    (candidate: Declaration) => {
      if (
        !mountedRef.current ||
        endTurnInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const endTurns = declarationsRef.current.filter(
        (declaration) => declaration.verb === Verb.END_TURN
      );
      const current = uniqueCurrentDeclaration(
        declarationsRef.current,
        candidate,
        Verb.END_TURN,
        TargetKind.NONE
      );
      if (!current || endTurns.length !== 1) return;

      endTurnInFlightRef.current = true;
      void (async () => {
        try {
          await endTurn({
            session,
            member,
            declarationId: current.id,
          });
          if (!mountedRef.current) return;
          invalidateAuthority();
          scheduleRefresh(['characterData', 'turn', 'afford']);
        } catch (error) {
          if (!mountedRef.current) return;
          if (isStaleDeclarationRefusal(error)) {
            recoverStaleDeclaration(current.id, Verb.END_TURN);
          } else {
            // Non-selector failures are ambiguous and may describe a committed
            // EndTurn. Fail closed, preserve the transport error, and reconcile
            // snapshots without ever retrying the command.
            const notice = `End turn failed: ${error instanceof Error ? error.message : 'unknown error'}`;
            invalidateAuthority();
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: notice,
            });
            scheduleRefresh(['characterData', 'turn', 'afford']);
          }
        } finally {
          endTurnInFlightRef.current = false;
        }
      })();
    },
    [
      endTurn,
      invalidateAuthority,
      member,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  const acceptStreamEvent = useCallback(
    (event: Event, metadata: SessionEventDeliveryMetadata) => {
      if (!mountedRef.current) return;
      presentation.acceptStreamEvent(event, metadata);
      pacing.acceptEvent(event, metadata);
    },
    [pacing, presentation]
  );

  const phase = targeting ? 'targeting' : presentation.phase;

  return useMemo(
    () => ({
      presentationState,
      phase,
      showTurnNotice,
      logMode,
      story: pacing.story,
      debug: presentation.debug,
      result: pacing.result,
      diceEvents: presentation.diceEvents,
      diceSemanticFallback: presentation.semanticFallback,
      diceWitnessRole: presentation.diceWitnessRole,
      diceRollerName: presentation.diceRollerName,
      pacingNotice: pacing.notice,
      onSelectDeclaration,
      onTargetClick,
      onEndTurn,
      onLogModeChange: setLogMode,
      onDiceReleaseRequest: presentation.onDiceReleaseRequest,
      onDiceSemanticReleaseRequest: presentation.onSemanticReleaseRequest,
      invalidateAuthority,
      recoverStaleDeclaration,
      acceptStreamEvent,
    }),
    [
      acceptStreamEvent,
      invalidateAuthority,
      logMode,
      onEndTurn,
      onSelectDeclaration,
      onTargetClick,
      pacing.notice,
      pacing.result,
      pacing.story,
      phase,
      presentation.debug,
      presentation.diceEvents,
      presentation.diceRollerName,
      presentation.diceWitnessRole,
      presentation.onDiceReleaseRequest,
      presentation.onSemanticReleaseRequest,
      presentation.semanticFallback,
      presentationState,
      recoverStaleDeclaration,
      showTurnNotice,
    ]
  );
}
