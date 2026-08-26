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
import { selectCombatExperience, staleDeclarationMessage } from './selection';
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

export interface UseSessionCombatExperienceArgs {
  session: string;
  member: string;
  clock: ClockKind;
  active: string;
  memberNames?: ReadonlyMap<string, string>;
  participants: readonly Participant[];
  declarations: readonly Declaration[];
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
  acceptStreamEvent: (
    event: Event,
    metadata: SessionEventDeliveryMetadata
  ) => void;
}

function uniqueCurrentDeclaration(
  declarations: readonly Declaration[],
  candidate: Declaration,
  verb: Verb
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
    !current.available
  ) {
    return undefined;
  }
  return current;
}

/** Production interaction/controller seam around the shared renderer. */
export function useSessionCombatExperience({
  session,
  member,
  clock,
  active,
  memberNames,
  participants,
  declarations,
  scheduleRefresh,
}: UseSessionCombatExperienceArgs): UseSessionCombatExperienceResult {
  const [interaction, setInteraction] =
    useState<CombatExperiencePresentationState>(EMPTY_INTERACTION);
  const [targeting, setTargeting] = useState(false);
  const [logMode, setLogMode] = useState<CombatExperienceLogMode>('story');
  const [showTurnNotice, setShowTurnNotice] = useState(false);
  const attackInFlightRef = useRef(false);
  const endTurnInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const declarationsRef = useRef(declarations);
  const authorityRef = useRef({ clock, active });
  declarationsRef.current = declarations;
  authorityRef.current = { clock, active };
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
  const presentation = useCombatPresentation({
    session,
    viewerMember: member,
    memberNames: presentationMemberNames,
    participants,
  });
  const pacing = useCombatStoryPacing({
    member,
    participants,
    memberNames,
    story: presentation.story,
    result: presentation.result,
  });
  const { attack } = useSessionAttack();
  const { endTurn } = useSessionEndTurn();

  const { armedIsCurrent, presentationState } = useMemo(() => {
    const armedMatches =
      interaction.armedDeclarationId === null
        ? []
        : declarations.filter(
            (declaration) => declaration.id === interaction.armedDeclarationId
          );
    const current =
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
  }, [active, clock, declarations, interaction, member]);

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
        // Let StrictMode's second setup recreate the bounded notice.
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
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const current = uniqueCurrentDeclaration(
        declarationsRef.current,
        candidate,
        candidate.verb
      );
      if (!current) return;

      if (
        current.verb === Verb.ATTACK &&
        current.targetKind === TargetKind.MEMBER
      ) {
        setInteraction({
          armedDeclarationId: current.id,
          selectedCandidateMember: null,
          changedOptionNotice: null,
        });
        setTargeting(true);
        return;
      }

      // Move is always dispatched by the map/walk seam using the coherent
      // Turn/Afford selector. Selecting its display row merely disarms Attack.
      if (current.verb === Verb.MOVE) {
        setInteraction(EMPTY_INTERACTION);
        setTargeting(false);
      }
    },
    [member]
  );

  const onTargetClick = useCallback(
    (target: string) => {
      if (
        !mountedRef.current ||
        attackInFlightRef.current ||
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
      if (!selected?.declaration || !selected.candidate) {
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
        } catch (error) {
          if (!mountedRef.current) return;
          setInteraction((current) => ({
            ...current,
            selectedCandidateMember: null,
            changedOptionNotice: `Attack failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          }));
          setTargeting(true);
        } finally {
          attackInFlightRef.current = false;
          if (mountedRef.current) {
            scheduleRefresh(['characterData', 'afford', 'turn', 'view']);
          }
        }
      })();
    },
    [attack, member, presentation, presentationState, scheduleRefresh, session]
  );

  const onEndTurn = useCallback(
    (candidate: Declaration) => {
      if (
        !mountedRef.current ||
        endTurnInFlightRef.current ||
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
        Verb.END_TURN
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
        } catch {
          // A stale server refusal is reconciled by the refresh below.
        } finally {
          endTurnInFlightRef.current = false;
          if (mountedRef.current) {
            scheduleRefresh(['characterData', 'afford', 'turn']);
          }
        }
      })();
    },
    [endTurn, member, scheduleRefresh, session]
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
      acceptStreamEvent,
    }),
    [
      acceptStreamEvent,
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
      showTurnNotice,
    ]
  );
}
