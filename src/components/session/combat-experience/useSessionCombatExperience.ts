import { useSessionActivate } from '@/api/useSessionActivate';
import { useSessionAttack } from '@/api/useSessionAttack';
import { useSessionDeathSave } from '@/api/useSessionDeathSave';
import { useSessionEndTurn } from '@/api/useSessionEndTurn';
import { useSessionReact } from '@/api/useSessionReact';
import type { SessionRefreshKey } from '@/components/session/useCoalescedSessionRefreshes';
import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import type { Event } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { DeathSaveResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  ClockKind,
  DeathSaveContinuation,
  ReactChoice,
  TargetKind,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import { isDeathSaveExecutableShape } from './deathSaveDeclaration';
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
  CombatExperienceRollWindow,
  CombatExperienceStoryExchange,
} from './types';
import {
  attackResponseFact,
  deathSaveResponseFact,
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
  /** The roll an open post-roll window is asking about, and the offer it was
   * recorded against. Null when no such beat is outstanding. */
  rollWindow: CombatExperienceRollWindow | null;
  /** Accepted provider result retained for the release/continuation layer. */
  pendingDeathSaveResponse?: DeathSaveResponse;
  /** Explicit presentation authority for current-state Death Save concealment. */
  concealsDeathSaveTruth: boolean;
  concealedDeathSavePresentationKey?: string;
  /** Targets whose attack roll has not been revealed on screen yet. The map
   * holds their downed reveal until it has — see `downedReveal.ts`. */
  unresolvedAttackTargets: ReadonlySet<string>;
  diceEvents: readonly DicePresentationEvent[];
  diceSemanticFallback: boolean;
  diceWitnessRole: 'roller' | 'spectator';
  diceRollerName: string;
  pacingNotice: string | null;
  endTurnBlocked: boolean;
  /** `choice` is supplied only for a VERB_REACT declaration: the answer to
   * an open reaction window. */
  onSelectDeclaration: (declaration: Declaration, choice?: ReactChoice) => void;
  onTargetClick: (target: string) => void;
  onEndTurn: (declaration: Declaration) => void;
  onLogModeChange: (mode: CombatExperienceLogMode) => void;
  onDiceReleaseRequest: (event: DicePresentationReleasedEvent) => void;
  onDiceSemanticReleaseRequest: () => void;
  onWitnessDiceSettlement: (presentationId: string) => void;
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
  /**
   * The d20 the open post-roll window is asking about (rpg-project#398).
   *
   * KEPT HERE AND NOT READ OFF AFFORD, because Afford does not carry it: the
   * declaration says what may be spent, and only `RollWindowOpened` says what
   * was rolled — the struck beat that would otherwise carry the numbers is not
   * written until after the answer.
   *
   * IT IS NOT CLEARED WHEN THE DECLARATION VANISHES, on purpose. The beat
   * arrives BEFORE the Afford refetch it schedules, so a rule that dropped the
   * numbers whenever no window was currently posed would wipe them in the gap
   * between the two. It is cleared when the answer is sent, which is the exact
   * moment the window closes, and it is matched to the offer it was recorded
   * for so a second window's panel can never borrow the first's numbers.
   */
  const [rollWindow, setRollWindow] =
    useState<CombatExperienceRollWindow | null>(null);
  const [showTurnNotice, setShowTurnNotice] = useState(false);
  const [pendingDeathSaveResponse, setPendingDeathSaveResponse] =
    useState<DeathSaveResponse>();
  const attackInFlightRef = useRef(false);
  const deathSaveInFlightRef = useRef(false);
  const attemptedDeathSaveDeclarationIdRef = useRef<string | null>(null);
  const endTurnInFlightRef = useRef(false);
  const automaticEndTurnRef = useRef(false);
  const manualEndTurnBlockedRef = useRef(false);
  const activateInFlightRef = useRef(false);
  const reactInFlightRef = useRef(false);
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
  manualEndTurnBlockedRef.current = presentation.blocksManualEndTurn;
  const pacing = useCombatStoryPacing({
    member,
    participants,
    memberNames,
    story: presentation.story,
    result: presentation.result,
  });
  const { attack } = useSessionAttack();
  const { deathSave } = useSessionDeathSave();
  const { activate } = useSessionActivate();
  const { endTurn } = useSessionEndTurn();
  const { react } = useSessionReact();

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

  // A selector is only fenced for the authoritative generation in which it
  // was attempted. Stale/loading snapshots retain the fence because their
  // last-good declarations cannot prove that generation advanced. A fresh
  // snapshot that no longer carries the executable offer provides that proof,
  // allowing a later generation to reuse even the same opaque selector.
  useEffect(() => {
    const attemptedId = attemptedDeathSaveDeclarationIdRef.current;
    if (
      !authorityFresh ||
      attemptedId === null ||
      declarations.some(
        (declaration) =>
          declaration.id === attemptedId &&
          isDeathSaveExecutableShape(declaration, 'execute')
      )
    ) {
      return;
    }
    attemptedDeathSaveDeclarationIdRef.current = null;
  }, [authorityFresh, declarations]);

  const { armedIsCurrent, presentationState } = useMemo(() => {
    const armedMatches =
      interaction.armedDeclarationId === null
        ? []
        : declarations.filter(
            (declaration) => declaration.id === interaction.armedDeclarationId
          );
    // EVERY VERB THAT PROMPTS FOR A MEMBER, not Attack alone. Arming is the
    // same for all of them — hold an offer, wait for a candidate the server
    // ruled — and `onTargetClick` already accepts both (`targetTakingVerb`).
    // Pinned to ATTACK here, arming Bardic Inspiration or Help was judged
    // incoherent one render later and torn down as "that option changed",
    // with no RPC sent and nothing for the player to review: the offer was
    // unchanged, and two reads of Afford return it byte for byte.
    const armedVerb = armedMatches[0]?.verb;
    const current =
      authorityFresh &&
      clock === ClockKind.TURN &&
      active === member &&
      armedMatches.length === 1 &&
      (armedVerb === Verb.ATTACK || armedVerb === Verb.ACTIVATE) &&
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
    (candidate: Declaration, choice?: ReactChoice) => {
      // THE ONE VERB THAT IS NOT DECLARED ON ITS OWNER'S TURN. Every other
      // offer here is gated on the initiative standing with this member,
      // which is exactly the state a reaction window is NOT in: the mover
      // holds the turn and the fight is frozen on this viewer's answer. The
      // freshness gate stays — an answer echoed from a stale Afford is still
      // a stale selector, and the server refuses it — and so does the TURN
      // clock, because no window is posed on the world clock.
      const answeringWindow = candidate.verb === Verb.REACT;
      if (
        !mountedRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        (!answeringWindow && authorityRef.current.active !== member)
      ) {
        return;
      }

      if (answeringWindow) {
        // UNSPECIFIED IS NOT A DEFAULT. The dock sends one of the two
        // answers or nothing at all; guessing here would swing a reaction
        // the player never chose.
        if (choice === undefined || choice === ReactChoice.UNSPECIFIED) return;
        // THE WINDOW'S OWN TARGET KIND, not a constant. A movement window is
        // posed with the mover as its single member candidate; a post-roll
        // window is about the viewer's own d20 and names nobody, so Afford
        // poses it with TARGET_KIND_NONE. Pinning MEMBER here would silently
        // drop every answer to the second kind.
        const current = uniqueCurrentDeclaration(
          declarationsRef.current,
          candidate,
          Verb.REACT,
          candidate.targetKind
        );
        if (!current || reactInFlightRef.current) return;
        reactInFlightRef.current = true;
        setInteraction(EMPTY_INTERACTION);
        setTargeting(false);
        void (async () => {
          try {
            await react({
              session,
              member,
              declarationId: current.id,
              choice,
            });
            if (!mountedRef.current) return;
            // The window is answered and its numbers are spent with it. The
            // next one brings its own beat; a leftover roll shown under a
            // later question would be a number from a die already resolved.
            setRollWindow(null);
            invalidateAuthority();
            scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
          } catch (error) {
            if (!mountedRef.current) return;
            if (isStaleDeclarationRefusal(error)) {
              recoverStaleDeclaration(current.id, Verb.REACT);
            } else {
              // Ambiguous either way: the answer may have committed and
              // resumed the turn before the response was lost. Fail closed,
              // keep the message, reconcile, and never retry — a replayed
              // answer would be a second swing.
              const notice = `Reaction failed: ${error instanceof Error ? error.message : 'unknown error'}`;
              invalidateAuthority();
              setInteraction({
                ...EMPTY_INTERACTION,
                changedOptionNotice: notice,
              });
              scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
            }
          } finally {
            reactInFlightRef.current = false;
          }
        })();
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

      if (candidate.verb === Verb.DEATH_SAVE) {
        if (!isDeathSaveExecutableShape(candidate, 'execute')) return;
        const current = uniqueCurrentDeclaration(
          declarationsRef.current,
          candidate,
          Verb.DEATH_SAVE,
          TargetKind.NONE
        );
        if (
          !current ||
          !isDeathSaveExecutableShape(current, 'execute') ||
          deathSaveInFlightRef.current ||
          attemptedDeathSaveDeclarationIdRef.current === current.id
        )
          return;
        setInteraction(EMPTY_INTERACTION);
        setTargeting(false);
        deathSaveInFlightRef.current = true;
        void (async () => {
          try {
            const response = await deathSave({
              session,
              member,
              declarationId: current.id,
            });
            if (!mountedRef.current) return;
            attemptedDeathSaveDeclarationIdRef.current = current.id;
            setPendingDeathSaveResponse(response);
            presentation.acceptDeathSaveResponse(
              deathSaveResponseFact({ session, member, response })
            );
            invalidateAuthority();
            scheduleRefresh(['characterData', 'turn', 'afford']);
          } catch (error) {
            if (!mountedRef.current) return;
            if (isStaleDeclarationRefusal(error)) {
              recoverStaleDeclaration(current.id, Verb.DEATH_SAVE);
            } else {
              attemptedDeathSaveDeclarationIdRef.current = current.id;
              const notice = `Death Save failed: ${error instanceof Error ? error.message : 'unknown error'}`;
              invalidateAuthority();
              setInteraction({
                ...EMPTY_INTERACTION,
                changedOptionNotice: notice,
              });
              scheduleRefresh(['characterData', 'turn', 'afford']);
            }
          } finally {
            deathSaveInFlightRef.current = false;
          }
        })();
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

      // AN ACTIVATION THAT PROMPTS FOR NOBODY FIRES ON THE CLICK. Five of the
      // six do: there is nothing to wait for, and a two-step interaction would
      // be ceremony.
      //
      // Help is the exception and arms exactly like Attack — same candidate
      // rows, same server-ruled availability, same selector echoed back. The
      // only thing that differs downstream is which RPC runs.
      if (candidate.verb === Verb.ACTIVATE) {
        if (candidate.targetKind === TargetKind.MEMBER) {
          const current = uniqueCurrentDeclaration(
            declarationsRef.current,
            candidate,
            Verb.ACTIVATE,
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
        runActivateRef.current(candidate);
      }
    },
    [
      deathSave,
      invalidateAuthority,
      member,
      presentation,
      react,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  const onTargetClick = useCallback(
    (target: string) => {
      if (
        !target ||
        !mountedRef.current ||
        attackInFlightRef.current ||
        activateInFlightRef.current ||
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
      // Two verbs prompt for a member now — Attack, and Help. Everything up
      // to the click is identical: arm an offer, pick a candidate the SERVER
      // ruled, echo the selector back. Only the RPC differs.
      const targetTakingVerb =
        selected?.declaration?.verb === Verb.ATTACK ||
        selected?.declaration?.verb === Verb.ACTIVATE;
      if (
        !selected?.declaration ||
        !targetTakingVerb ||
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

      if (declaration.verb === Verb.ACTIVATE) {
        activateInFlightRef.current = true;
        void (async () => {
          try {
            await activate({
              session,
              member,
              declarationId: declaration.id,
              target: exactTarget,
            });
            if (!mountedRef.current) return;
            invalidateAuthority();
            scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
          } catch (error) {
            if (!mountedRef.current) return;
            if (isStaleDeclarationRefusal(error)) {
              recoverStaleDeclaration(
                declaration.id,
                Verb.ACTIVATE,
                exactTarget
              );
            } else {
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
        return;
      }

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
      activate,
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
        (manualEndTurnBlockedRef.current && !automaticEndTurnRef.current) ||
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

  const continuedDeathSavesRef = useRef(new Set<string>());
  useEffect(() => {
    const settled = presentation.settledDeathSave;
    if (
      !settled ||
      continuedDeathSavesRef.current.has(settled.presentationId)
    ) {
      return;
    }

    if (settled.continuation === DeathSaveContinuation.END_TURN) {
      if (!authorityFresh) return;
      const candidates = declarations.filter(
        (declaration) => declaration.verb === Verb.END_TURN
      );
      const endTurnDeclaration =
        candidates.length === 1 ? candidates[0] : undefined;
      if (
        !endTurnDeclaration ||
        !endTurnDeclaration.available ||
        endTurnDeclaration.targetKind !== TargetKind.NONE
      ) {
        return;
      }
      continuedDeathSavesRef.current.add(settled.presentationId);
      automaticEndTurnRef.current = true;
      onEndTurn(endTurnDeclaration);
      automaticEndTurnRef.current = false;
      return;
    }

    continuedDeathSavesRef.current.add(settled.presentationId);
    if (settled.continuation === DeathSaveContinuation.KEEP_TURN) {
      scheduleRefresh(['characterData', 'turn', 'afford']);
      return;
    }
    if (settled.continuation === DeathSaveContinuation.ALREADY_ADVANCED) {
      scheduleRefresh(['characterData', 'turn', 'afford']);
    }
  }, [
    authorityFresh,
    declarations,
    onEndTurn,
    presentation.settledDeathSave,
    scheduleRefresh,
  ]);

  const acceptStreamEvent = useCallback(
    (event: Event, metadata: SessionEventDeliveryMetadata) => {
      if (!mountedRef.current) return;
      presentation.acceptStreamEvent(event, metadata);
      pacing.acceptEvent(event, metadata);
      // THE ONLY PLACE THE ROLL IS TOLD. Recorded for this viewer alone: the
      // window's audience is exactly one member, and a beat naming somebody
      // else is a fact about their decision, not this dock's panel.
      if (
        event.body.case === 'rollWindowOpened' &&
        event.body.value.audience === member
      ) {
        const opened = event.body.value;
        setRollWindow({
          offerRef: opened.offer?.ref ?? '',
          roll: opened.roll,
          total: opened.total,
        });
      }
    },
    [member, pacing, presentation]
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
      rollWindow,
      pendingDeathSaveResponse,
      concealsDeathSaveTruth: presentation.concealsDeathSaveTruth,
      concealedDeathSavePresentationKey:
        presentation.concealedDeathSavePresentationKey,
      unresolvedAttackTargets: presentation.unresolvedAttackTargets,
      diceEvents: presentation.diceEvents,
      diceSemanticFallback: presentation.semanticFallback,
      diceWitnessRole: presentation.diceWitnessRole,
      diceRollerName: presentation.diceRollerName,
      pacingNotice: pacing.notice,
      endTurnBlocked: presentation.blocksManualEndTurn,
      onSelectDeclaration,
      onTargetClick,
      onEndTurn,
      onLogModeChange: setLogMode,
      onDiceReleaseRequest: presentation.onDiceReleaseRequest,
      onDiceSemanticReleaseRequest: presentation.onSemanticReleaseRequest,
      onWitnessDiceSettlement: presentation.onWitnessDiceSettlement,
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
      pendingDeathSaveResponse,
      phase,
      presentation.blocksManualEndTurn,
      presentation.concealedDeathSavePresentationKey,
      presentation.concealsDeathSaveTruth,
      presentation.debug,
      presentation.diceEvents,
      presentation.diceRollerName,
      presentation.diceWitnessRole,
      presentation.onDiceReleaseRequest,
      presentation.onSemanticReleaseRequest,
      presentation.onWitnessDiceSettlement,
      presentation.semanticFallback,
      presentation.unresolvedAttackTargets,
      presentationState,
      recoverStaleDeclaration,
      rollWindow,
      showTurnNotice,
    ]
  );
}
