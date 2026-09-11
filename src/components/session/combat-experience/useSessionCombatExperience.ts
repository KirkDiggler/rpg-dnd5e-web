import { useSessionActivate } from '@/api/useSessionActivate';
import { useSessionAttack } from '@/api/useSessionAttack';
import { useSessionCast } from '@/api/useSessionCast';
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
import type { DebugFeedEntry } from '../debugLogLine';
import type { SessionEventDeliveryMetadata } from '../useSessionEventStream';
import { caughtNotice } from './caughtNotice';
import { isDeathSaveExecutableShape } from './deathSaveDeclaration';
import {
  isStaleDeclarationRefusal,
  selectCombatExperience,
  staleDeclarationMessage,
} from './selection';
import { storyId } from './story';
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
  selectedCandidateMembers: Object.freeze([]),
  changedOptionNotice: null,
});

export const TURN_NOTICE_MS = 1800;

interface StaleRecovery {
  readonly declarationId: string;
  readonly verb: Verb;
  readonly target?: string;
}

interface ReceivedRollWindow {
  readonly presentationId?: string;
  readonly storyId: string;
  readonly offerRef: string;
  readonly roll: number;
  readonly total: number;
  readonly session: string;
  readonly seq: bigint;
  readonly source: SessionEventDeliveryMetadata['source'];
  readonly receivedDuringLocalAttack: boolean;
  readonly bypassDiceSettlement?: boolean;
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
  debug: readonly DebugFeedEntry[];
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
  onConfirmTargets: () => void;
  /** The cell an armed caster-edge cast is aimed toward, in the wire's own
   * axial coordinates. A reference the engine reads, never a computed shape:
   * which cells the spell covers is derived server-side. */
  onCellClick: (cell: { x: number; y: number }) => void;
  /** Whether a floor click belongs to an armed cast rather than to walking.
   * The one fact the map's single ground-click seam routes on. */
  cellCastArmed: boolean;
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
  // ONE OR MORE KINDS, because a verb can have more than one shape that means
  // "resolve now". A cast fires immediately whether it names nobody (True
  // Strike, on the caster) or names a shape and lets the server work out who
  // is standing in it (Thunderclap). A rest parameter widens this without
  // touching the single-kind callers.
  ...targetKinds: readonly TargetKind[]
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
    !targetKinds.includes(current.targetKind) ||
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
  const [receivedRollWindow, setReceivedRollWindow] =
    useState<ReceivedRollWindow | null>(null);
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
  const castInFlightRef = useRef(false);
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
  const rollWindow = useMemo<CombatExperienceRollWindow | null>(() => {
    const received = receivedRollWindow;
    if (!received || received.session !== session) return null;
    const matchingPresentation = presentation.state.presentations.find(
      (record) =>
        !record.conflicted &&
        (record.responseAccepted ||
          record.event?.body.case === 'rollWindowOpened') &&
        record.localPlayerOwned &&
        record.authority.kind === 'attack' &&
        record.session === received.session &&
        (received.presentationId
          ? record.presentationId === received.presentationId
          : record.seq === received.seq) &&
        record.authority.roller === member &&
        record.authority.roll === received.roll &&
        record.authority.total === received.total
    );
    const awaitsDiceSettlement =
      !received.bypassDiceSettlement &&
      received.source === 'live' &&
      (received.receivedDuringLocalAttack ||
        (matchingPresentation !== undefined &&
          matchingPresentation.settlement !== 'auto'));
    return {
      storyId: received.storyId,
      offerRef: received.offerRef,
      roll: received.roll,
      total: received.total,
      presentationId:
        received.presentationId ?? matchingPresentation?.presentationId,
      awaitsDiceSettlement,
    };
  }, [member, presentation.state.presentations, receivedRollWindow, session]);
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
  const { cast } = useSessionCast();
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
    const armedKind = armedMatches[0]?.targetKind;
    const promptsForMember =
      (armedVerb === Verb.ATTACK ||
        armedVerb === Verb.ACTIVATE ||
        armedVerb === Verb.CAST) &&
      armedKind === TargetKind.MEMBER;
    // A CELL CAST ARMS FOR THE SAME REASON AND IS JUDGED THE SAME WAY. What
    // it waits for is a place rather than a creature, which changes what the
    // next click means and nothing about whether holding the offer is
    // coherent. Left out of this check, Thunderwave armed and was torn down
    // one render later as "that option changed" — the exact failure the
    // comment above records for Bardic Inspiration.
    const promptsForCell =
      armedVerb === Verb.CAST && armedKind === TargetKind.CELL;
    const current =
      authorityFresh &&
      clock === ClockKind.TURN &&
      active === member &&
      armedMatches.length === 1 &&
      (promptsForMember || promptsForCell) &&
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
            setReceivedRollWindow(null);
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
        // A DECLARATION THAT FIRES ON THE CLICK STILL CLEARS WHAT WAS ARMED.
        // Every branch that arms sets an interaction, and every branch that
        // resolves immediately has to put it back — MOVE does at the PATH
        // branch above, DEATH_SAVE and REACT do at theirs. These two did not,
        // so arming a creature-target row and then clicking one that fires
        // straight away left the FIRST row armed and `targeting` true: the
        // spell went out on the wire while the panel still showed the other
        // one selected, and nothing the player could click looked wrong.
        setInteraction(EMPTY_INTERACTION);
        setTargeting(false);
        runActivateRef.current(candidate);
        return;
      }

      // A CAST ARMS OR FIRES BY ITS TARGET KIND, exactly as an activation
      // does. Vicious Mockery names a creature, so it arms and waits for a
      // candidate the server ruled; True Strike is cast on the caster, so
      // there is nothing to wait for and it fires on the click.
      //
      // AREA fires on the click too, for a different reason worth keeping
      // straight: not that the spell lands on the caster, but that nobody is
      // chosen at all. The server derives who is caught from the shape the
      // spell declares, so the declaration carries no candidates and there is
      // nothing here to prompt for.
      if (candidate.verb === Verb.CAST) {
        // A CELL CAST ARMS AND WAITS FOR THE GROUND. It carries no candidates,
        // like an area cast, and that resemblance is the trap: Thunderclap
        // fires on the row click because nobody and nothing is chosen, while
        // Thunderwave still needs the direction its cube points. Firing here
        // would send a cast the server refuses for a missing cell.
        if (candidate.targetKind === TargetKind.CELL) {
          const current = uniqueCurrentDeclaration(
            declarationsRef.current,
            candidate,
            Verb.CAST,
            TargetKind.CELL
          );
          if (!current) return;
          setInteraction({
            armedDeclarationId: current.id,
            selectedCandidateMember: null,
            selectedCandidateMembers: [],
            changedOptionNotice: null,
          });
          setTargeting(true);
          return;
        }
        if (candidate.targetKind === TargetKind.MEMBER) {
          const current = uniqueCurrentDeclaration(
            declarationsRef.current,
            candidate,
            Verb.CAST,
            TargetKind.MEMBER
          );
          if (!current) return;
          setInteraction({
            armedDeclarationId: current.id,
            selectedCandidateMember: null,
            selectedCandidateMembers: [],
            changedOptionNotice: null,
          });
          setTargeting(true);
          return;
        }
        // A DECLARATION THAT FIRES ON THE CLICK STILL CLEARS WHAT WAS ARMED.
        // Every branch that arms sets an interaction, and every branch that
        // resolves immediately has to put it back — MOVE does at the PATH
        // branch above, DEATH_SAVE and REACT do at theirs. These two did not,
        // so arming a creature-target row and then clicking one that fires
        // straight away left the FIRST row armed and `targeting` true: the
        // spell went out on the wire while the panel still showed the other
        // one selected, and nothing the player could click looked wrong.
        setInteraction(EMPTY_INTERACTION);
        setTargeting(false);
        runCastRef.current(candidate);
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
        castInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const armed = declarationsRef.current.filter(
        (declaration) => declaration.id === presentationState.armedDeclarationId
      );
      const castDeclaration = armed.length === 1 ? armed[0] : undefined;
      // A CREATURE IS NOT A CELL. Entity clicks take priority over the ground
      // in the canvas, so a player who clicks a skeleton while Thunderwave is
      // armed arrives here holding an offer that names no candidates at all.
      // Reading that as a member target would send a cast the server refuses;
      // falling through to the selection path below would tear the arm down
      // and tell them their option changed, which it did not. The click means
      // nothing, and nothing is what it does.
      if (
        castDeclaration?.verb === Verb.CAST &&
        castDeclaration.targetKind === TargetKind.CELL
      ) {
        return;
      }
      if (
        castDeclaration?.verb === Verb.CAST &&
        castDeclaration.targetKind === TargetKind.MEMBER
      ) {
        const matches = castDeclaration.candidates.filter(
          (candidate) => candidate.member === target
        );
        const selectedTarget = matches.length === 1 ? matches[0] : undefined;
        const currentTargets = presentationState.selectedCandidateMembers ?? [];
        if (
          !selectedTarget?.available ||
          currentTargets.includes(target) ||
          castDeclaration.maxTargets <= 0 ||
          currentTargets.length >= castDeclaration.maxTargets
        ) {
          return;
        }
        const targets = [...currentTargets, target];
        if (castDeclaration.maxTargets === 1) {
          runCastTargetsRef.current(castDeclaration, targets);
          return;
        }
        setInteraction({
          armedDeclarationId: castDeclaration.id,
          selectedCandidateMember: null,
          selectedCandidateMembers: targets,
          changedOptionNotice: null,
        });
        setTargeting(true);
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
            // A legacy window cannot identify its die without the response;
            // keep that already-open choice answerable after response loss.
            // A current window carries its own provider ID and can still roll.
            setReceivedRollWindow((current) =>
              current?.session === session &&
              current.receivedDuringLocalAttack &&
              !current.presentationId
                ? { ...current, bypassDiceSettlement: true }
                : current
            );
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

  const runCastTargetsRef = useRef<
    (candidate: Declaration, targets: readonly string[]) => void
  >(() => {});

  const onCastTargets = useCallback(
    (candidate: Declaration, targets: readonly string[]) => {
      if (
        !mountedRef.current ||
        castInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const current = uniqueCurrentDeclaration(
        declarationsRef.current,
        candidate,
        Verb.CAST,
        TargetKind.MEMBER
      );
      if (
        !current ||
        current.minTargets < 0 ||
        current.maxTargets < current.minTargets ||
        targets.length < current.minTargets ||
        targets.length > current.maxTargets ||
        new Set(targets).size !== targets.length
      ) {
        return;
      }
      const candidatesAreCurrent = targets.every((target) => {
        const matches = current.candidates.filter(
          (candidateTarget) => candidateTarget.member === target
        );
        return matches.length === 1 && matches[0]?.available;
      });
      if (!candidatesAreCurrent) return;

      castInFlightRef.current = true;
      setTargeting(false);
      void (async () => {
        try {
          await cast({
            session,
            member,
            declarationId: current.id,
            targets,
          });
          if (!mountedRef.current) return;
          invalidateAuthority();
          scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
        } catch (error) {
          if (!mountedRef.current) return;
          if (isStaleDeclarationRefusal(error)) {
            recoverStaleDeclaration(current.id, Verb.CAST, targets[0]);
          } else {
            const notice = `Cast failed: ${error instanceof Error ? error.message : 'unknown error'}`;
            invalidateAuthority();
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: notice,
            });
            scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
          }
        } finally {
          castInFlightRef.current = false;
        }
      })();
    },
    [
      cast,
      invalidateAuthority,
      member,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  runCastTargetsRef.current = onCastTargets;

  const onConfirmTargets = useCallback(() => {
    const matches = declarationsRef.current.filter(
      (declaration) => declaration.id === presentationState.armedDeclarationId
    );
    if (matches.length !== 1 || !matches[0]) return;
    runCastTargetsRef.current(
      matches[0],
      presentationState.selectedCandidateMembers ?? []
    );
  }, [presentationState]);

  /**
   * A CAST THE CASTER AIMS, answered by a click on the floor.
   *
   * Thunderwave's cube starts at the caster's own edge and points somewhere,
   * so the one thing left to say after arming is a direction — named as the
   * cell the shape is aimed toward, never as the cells it covers. Deriving
   * coverage is the engine's work and putting any of it here would be this
   * client calculating a rule.
   *
   * NO TARGETS GO WITH IT. A cell cast chooses nobody for the same reason an
   * area cast does: the server works out who is standing in the shape. The
   * empty list is sent, not omitted, exactly as the area path sends it.
   *
   * ARMED BY ID, and re-read from the CURRENT declarations at click time. The
   * offer may have gone stale between arming and the click; the same
   * availability fact that gates every other verb gates this one.
   */
  const onCellClick = useCallback(
    (cell: { x: number; y: number }) => {
      if (
        !mountedRef.current ||
        castInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const armed = declarationsRef.current.filter(
        (declaration) => declaration.id === presentationState.armedDeclarationId
      );
      const current = armed.length === 1 ? armed[0] : undefined;
      if (
        !current ||
        current.verb !== Verb.CAST ||
        current.targetKind !== TargetKind.CELL ||
        !current.available
      ) {
        return;
      }

      castInFlightRef.current = true;
      setInteraction(EMPTY_INTERACTION);
      setTargeting(false);
      void (async () => {
        try {
          const response = await cast({
            session,
            member,
            declarationId: current.id,
            targets: [],
            cell,
          });
          if (!mountedRef.current) return;
          invalidateAuthority();
          // A cell cast derives its recipients the way an area cast does, so
          // it reaches the same creatures with no sheet behind them and owes
          // the caster the same sentence about them.
          const caught = caughtNotice(response.caught);
          if (caught) {
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: caught,
            });
          }
          scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
        } catch (error) {
          if (!mountedRef.current) return;
          if (isStaleDeclarationRefusal(error)) {
            recoverStaleDeclaration(current.id, Verb.CAST);
          } else {
            const notice = `Cast failed: ${error instanceof Error ? error.message : 'unknown error'}`;
            invalidateAuthority();
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: notice,
            });
            scheduleRefresh(['characterData', 'turn', 'afford', 'view']);
          }
        } finally {
          castInFlightRef.current = false;
        }
      })();
    },
    [
      cast,
      invalidateAuthority,
      member,
      presentationState.armedDeclarationId,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  /**
   * Whether the ground click belongs to a cast rather than to walking.
   *
   * THE CALLER OWNS ONE SEAM, NOT TWO. `SessionEncounterView` has exactly one
   * floor-click handler, and this is the fact it routes on — asked here,
   * where the armed offer and the declarations already live, rather than
   * reconstructed by a caller that would have to learn what a target kind is.
   */
  const cellCastArmed = useMemo(() => {
    if (presentationState.armedDeclarationId === null) return false;
    const armed = declarations.filter(
      (declaration) => declaration.id === presentationState.armedDeclarationId
    );
    return (
      armed.length === 1 &&
      armed[0]!.verb === Verb.CAST &&
      armed[0]!.targetKind === TargetKind.CELL
    );
  }, [declarations, presentationState.armedDeclarationId]);

  // runCast is held in a ref for the same reason runActivate is: it and
  // onSelectDeclaration are mutually recursive through the dock's single
  // onSelect handler.
  const runCastRef = useRef<(candidate: Declaration) => void>(() => {});

  /**
   * A cast that names nobody — True Strike on the caster's own next swing.
   *
   * BY ID, NEVER BY VERB, the law Activate established the moment one verb
   * compiled more than one offer. A bard reads one Cast row per castable
   * cantrip, so "the current declaration for CAST" has no answer;
   * `uniqueCurrentDeclaration` matches the selector, which is the unique
   * thing.
   *
   * NO TARGET IS SENT. `CastRequest.target` on a TARGET_KIND_NONE declaration
   * is INVALID_ARGUMENT rather than a value quietly ignored, so a self cast
   * must leave it unset.
   */
  const onCast = useCallback(
    (candidate: Declaration) => {
      if (
        !mountedRef.current ||
        castInFlightRef.current ||
        !authorityRef.current.fresh ||
        authorityRef.current.clock !== ClockKind.TURN ||
        authorityRef.current.active !== member
      ) {
        return;
      }
      const current = uniqueCurrentDeclaration(
        declarationsRef.current,
        candidate,
        Verb.CAST,
        TargetKind.NONE,
        TargetKind.AREA
      );
      if (!current) return;

      castInFlightRef.current = true;
      void (async () => {
        try {
          const response = await cast({
            session,
            member,
            declarationId: current.id,
            targets: [],
          });
          if (!mountedRef.current) return;
          invalidateAuthority();
          // WHO THE SPELL REACHED AND COULD NOT TOUCH.
          //
          // An area cast derives its own recipients, and some of what it
          // catches has no sheet behind it — the shopkeeper standing in a
          // thunderclap. Saying nothing would make that identical to casting
          // into an empty room, which is the one thing this field exists to
          // prevent: a missing capability must not read as a spell that
          // missed.
          //
          // Shown to the CASTER only, because it arrives on the RPC response.
          // The multiplayer-correct home is the event stream — everyone in the
          // room watched the blast wash over the merchant — and that needs the
          // composition to record an unresolved member as a beat, which it
          // cannot yet.
          const caught = caughtNotice(response.caught);
          if (caught) {
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: caught,
            });
          }
          scheduleRefresh(['characterData', 'turn', 'afford']);
        } catch (error) {
          if (!mountedRef.current) return;
          if (isStaleDeclarationRefusal(error)) {
            recoverStaleDeclaration(current.id, Verb.CAST);
          } else {
            // Ambiguous about whether the cast committed — the ack is thin by
            // design. Fail closed, preserve the message, reconcile, never
            // retry.
            const notice = `Cast failed: ${error instanceof Error ? error.message : 'unknown error'}`;
            invalidateAuthority();
            setInteraction({
              ...EMPTY_INTERACTION,
              changedOptionNotice: notice,
            });
            scheduleRefresh(['characterData', 'turn', 'afford']);
          }
        } finally {
          castInFlightRef.current = false;
        }
      })();
    },
    [
      cast,
      invalidateAuthority,
      member,
      recoverStaleDeclaration,
      scheduleRefresh,
      session,
    ]
  );

  runCastRef.current = onCast;

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
        setReceivedRollWindow({
          presentationId: opened.presentationId || undefined,
          storyId: storyId(event),
          offerRef: opened.offer?.ref ?? '',
          roll: opened.roll,
          total: opened.total,
          session: event.session,
          seq: event.seq,
          source: metadata.source,
          receivedDuringLocalAttack: attackInFlightRef.current,
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
      onConfirmTargets,
      onCellClick,
      cellCastArmed,
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
      cellCastArmed,
      invalidateAuthority,
      logMode,
      onCellClick,
      onEndTurn,
      onSelectDeclaration,
      onTargetClick,
      onConfirmTargets,
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
