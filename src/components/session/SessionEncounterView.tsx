/**
 * Production SessionService game route.
 *
 * SessionCanvas keeps atlas floors, walls, doors, sightings, movement paths,
 * and animation. CombatExperience is the same renderer reviewed by
 * `?concept=session-combat`: panel-first exact declarations, owner-private
 * CharacterData, release-gated Story/dice, and developer-only raw Debug.
 * Delivered events enter one immediate authority/query funnel; only the
 * other-member Story cursor is paced. No selector, reach, movement price,
 * damage, HP, equipment, or other game rule is constructed here.
 */
import { sessionClient } from '@/api/client';
import { useCharacterData } from '@/api/useCharacterData';
import { useEquipItem } from '@/api/useEquipItem';
import { useSessionAfford } from '@/api/useSessionAfford';
import { useSessionAtlas } from '@/api/useSessionAtlas';
import { useSessionDoors } from '@/api/useSessionDoors';
import { useSessionRoster } from '@/api/useSessionRoster';
import { useSessionTurn } from '@/api/useSessionTurn';
import { useSessionView } from '@/api/useSessionView';
import { useSessionWhere } from '@/api/useSessionWhere';
import { useUnequipItem } from '@/api/useUnequipItem';
import type { DicePresentationRequestedEvent } from '@/components/ui/dice/dicePresentationEvent';
import {
  createNeutralVisualThrowProfile,
  type VisualThrowProfileV1,
} from '@/components/ui/dice/visualThrowProfile';
import { errorMessage } from '@/utils/combatFormat';
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { EventKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ClockKind,
  DoorState,
  MemberKind,
  Standing,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { classLabel } from '../game/encounterDockHelpers';
import { EquipmentPopover } from '../game/equipment/EquipmentPopover';
import type { EquipIntent } from '../game/equipment/equipmentTypes';
import { cubeToWorld, HEX_SIZE } from '../hex-grid/hexMath';
import { resolveMainHandPresentation } from '../hex-grid/mainHandWeapons';
import { resolveOffHandPresentation } from '../hex-grid/offHandEquipment';
import { Button } from '../ui/Button';
import type { TrayPlaneProjection } from '../ui/dice/trayPlaneProjection';
import { ErrorDisplay, LoadingOverlay } from '../ui/Feedback';
import { buildAtlasPathIndex } from './atlasPath';
import {
  buildScene3D,
  positionToCube,
  resolveSceneLayout,
} from './atlasToScene3D';
import { CombatExperience } from './combat-experience/CombatExperience';
import { LocalWorldDieTile } from './combat-experience/LocalWorldDieTile';
import { movementBudgetFeet } from './combat-experience/selection';
import { useSessionCombatExperience } from './combat-experience/useSessionCombatExperience';
import { holdDownedReveal } from './downedReveal';
import {
  createLocalWorldDieAttemptSnapshot,
  type LocalWorldDieAttemptSnapshot,
} from './local-world-die/localWorldDieAttemptSnapshot';
import { localWorldDieReleaseEvent } from './local-world-die/localWorldDieAuthority';
import type {
  LocalWorldDieCommand,
  LocalWorldDieHeldState,
} from './local-world-die/localWorldDieCommand';
import { LocalWorldDieLayer } from './local-world-die/LocalWorldDieLayer';
import {
  fingerprintLocalWorldDieColliders,
  preSimulateLocalWorldDie,
} from './local-world-die/localWorldDiePreSimulation';
import { publishLocalWorldDie } from './local-world-die/localWorldDiePublish';
import { LocalWorldDieWitnessInbox } from './local-world-die/localWorldDieWitnessInbox';
import type {
  LocalWorldDieWitnessExpectation,
  LocalWorldDieWitnessPlan,
} from './local-world-die/localWorldDieWitnessPlan';
import { consumeLocalWorldDieWitnessStream } from './local-world-die/localWorldDieWitnessStream';
import { SessionCanvas } from './SessionCanvas';
import { sightingsToEntities } from './sightingEntities';
import {
  type SessionRefreshKey,
  useCoalescedSessionRefreshes,
} from './useCoalescedSessionRefreshes';
import {
  type SessionEventDeliveryMetadata,
  useSessionEventStream,
} from './useSessionEventStream';
import { useSessionWalk } from './useSessionWalk';

export interface SessionEncounterViewProps {
  sessionId: string;
  characterId?: string;
  playerId: string;
  onBack: () => void;
}

function authoritySeqFromPresentationId(
  presentationId: string
): bigint | undefined {
  const segment = presentationId.split(':').at(-1);
  if (!segment || !/^\d+$/.test(segment)) return undefined;
  return BigInt(segment);
}

function endingHeadline(ending: string): string {
  switch (ending) {
    case 'boss-down':
      return 'The tomb is cleared.';
    case 'withdrawn':
      return 'The party withdrew.';
    case 'abandoned':
      return 'The run was abandoned.';
    default:
      return 'The run has ended.';
  }
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A key boundary makes session/member state replacement synchronous. Every
 * private cache, selection, Story/Debug controller, timer, and stale callback
 * belongs to exactly one mounted scope.
 */
export function SessionEncounterView(props: SessionEncounterViewProps) {
  return (
    <SessionEncounterScope
      key={`${props.sessionId}\u0000${props.characterId ?? ''}\u0000${props.playerId}`}
      {...props}
    />
  );
}

function SessionEncounterScope({
  sessionId,
  characterId,
  playerId,
  onBack,
}: SessionEncounterViewProps) {
  const member = characterId ?? '';
  const {
    atlas,
    loading: atlasLoading,
    error: atlasError,
    refetch: refetchAtlas,
  } = useSessionAtlas(sessionId);
  const {
    position: wherePosition,
    loading: whereLoading,
    error: whereError,
    refetch: refetchWhere,
  } = useSessionWhere(sessionId, member);
  const { sightings, refetch: refetchView } = useSessionView(sessionId, member);
  const { roster, refetch: refetchRoster } = useSessionRoster(sessionId);
  const { doors, refetch: refetchDoors } = useSessionDoors(sessionId);
  const {
    clock: affordClock,
    declarations: affordDeclarations,
    fresh: affordFresh,
    invalidate: invalidateAfford,
    refetch: refetchAfford,
  } = useSessionAfford(sessionId, member);
  const {
    clock: turnClock,
    active: turnActive,
    round: turnRound,
    participants: turnParticipants,
    fresh: turnFresh,
    invalidate: invalidateTurn,
    refetch: refetchTurn,
  } = useSessionTurn(sessionId, member);
  const {
    characterData,
    loading: characterDataLoading,
    error: characterDataError,
    refetch: refetchCharacterData,
    replace: replaceCharacterData,
  } = useCharacterData(member, playerId);

  const { equipItem, loading: equipping } = useEquipItem();
  const { unequipItem, loading: unequipping } = useUnequipItem();
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [runEnded, setRunEnded] = useState<string | null>(null);
  const [doorNotice, setDoorNotice] = useState<string | null>(null);
  const encounterContentRef = useRef<HTMLDivElement>(null);
  const leaveRunButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const underlying = encounterContentRef.current;
    if (runEnded === null) {
      underlying?.removeAttribute('inert');
      return;
    }

    // Native inert removes every underlying canvas/panel control from pointer
    // and sequential-focus interaction. aria-hidden mirrors that isolation for
    // assistive technology while focus moves to the modal's one primary action.
    underlying?.setAttribute('inert', '');
    leaveRunButtonRef.current?.focus();
    return () => underlying?.removeAttribute('inert');
  }, [runEnded]);

  const layoutOutcome = useMemo(
    () => (atlas ? resolveSceneLayout(atlas) : null),
    [atlas]
  );
  const scene = useMemo(
    () =>
      atlas && layoutOutcome?.ok
        ? buildScene3D(atlas, HEX_SIZE, layoutOutcome.layout)
        : null,
    [atlas, layoutOutcome]
  );
  const pathIndex = useMemo(
    () => (atlas ? buildAtlasPathIndex(atlas, doors) : null),
    [atlas, doors]
  );

  // Once owner-private CharacterData has been confirmed it remains valid
  // presentation input while a background refresh is loading or reports a
  // transient status error. Neither condition may freeze newer public door /
  // path snapshots behind the prior scene.
  const canDrawSceneNow =
    !!scene && scene.floorTiles.size > 0 && !!wherePosition;
  const lastGoodSceneRef = useRef<typeof scene>(null);
  const lastGoodPositionRef = useRef<ReturnType<typeof positionToCube> | null>(
    null
  );
  const lastGoodPathIndexRef = useRef<typeof pathIndex>(null);
  if (canDrawSceneNow) {
    lastGoodSceneRef.current = scene;
    lastGoodPositionRef.current = positionToCube(wherePosition);
    lastGoodPathIndexRef.current = pathIndex;
  }
  const canDrawScene =
    lastGoodSceneRef.current !== null && lastGoodPositionRef.current !== null;

  // Only coherent snapshots authorize movement. WORLD/WORLD echoes the empty
  // selector; TURN/TURN requires one exact available non-empty Move offer.
  const moveOffers = affordDeclarations.filter(
    (declaration) =>
      declaration.verb === Verb.MOVE &&
      declaration.targetKind === TargetKind.PATH &&
      declaration.available &&
      declaration.id.length > 0
  );
  const authorityFresh =
    turnFresh &&
    affordFresh &&
    turnClock !== ClockKind.UNSPECIFIED &&
    turnClock === affordClock;
  const moveDeclarationId: string | undefined = authorityFresh
    ? turnClock === ClockKind.WORLD
      ? ''
      : turnClock === ClockKind.TURN && moveOffers.length === 1
        ? moveOffers[0]!.id
        : undefined
    : undefined;

  const authorityFreshRef = useRef(authorityFresh);
  authorityFreshRef.current = authorityFresh;
  const isMoveAuthorityFresh = useCallback(() => authorityFreshRef.current, []);
  const staleMoveRecoveryRef = useRef<(declarationId: string) => void>(
    () => {}
  );
  const moveAcceptedRef = useRef<() => void>(() => {});
  const handleStaleMoveRefusal = useCallback((declarationId: string) => {
    staleMoveRecoveryRef.current(declarationId);
  }, []);
  const handleMoveAccepted = useCallback(() => {
    moveAcceptedRef.current();
  }, []);

  const {
    displayPosition,
    movePath,
    moveSeq,
    busy: walking,
    walkTo,
    onWalkAnimationComplete,
    moveError,
  } = useSessionWalk(
    sessionId,
    member,
    lastGoodPathIndexRef.current,
    wherePosition,
    refetchWhere,
    moveDeclarationId,
    handleStaleMoveRefusal,
    isMoveAuthorityFresh,
    handleMoveAccepted
  );

  const otherMembers = useMemo(
    () => sightingsToEntities(sightings, member),
    [member, sightings]
  );
  const publicMemberNames = useMemo(
    () => new Map([...roster].map(([id, entry]) => [id, entry.name])),
    [roster]
  );
  const publicMemberRoles = useMemo(() => {
    const roles = new Map<string, 'player' | 'monster'>();
    for (const [id, entry] of roster) {
      if (entry.kind === MemberKind.PLAYER) roles.set(id, 'player');
      if (entry.kind === MemberKind.MONSTER) roles.set(id, 'monster');
    }
    return roles;
  }, [roster]);
  const experienceClock =
    turnClock === affordClock ? turnClock : ClockKind.UNSPECIFIED;
  const coherentDeclarations =
    experienceClock === ClockKind.UNSPECIFIED ? [] : affordDeclarations;
  // A path preview is actionable only with coherent Move authority. Known
  // WORLD/WORLD uses the valid empty selector and remains unlocked; partial,
  // mismatched, missing, or duplicate authority is shown as locked rather than
  // advertising a path the click handler must refuse.
  const turnLocked =
    !authorityFresh ||
    moveDeclarationId === undefined ||
    (turnClock === ClockKind.TURN && turnActive !== member);

  const invalidateAuthoritySnapshots = useCallback(() => {
    authorityFreshRef.current = false;
    invalidateTurn();
    invalidateAfford();
  }, [invalidateAfford, invalidateTurn]);

  const refreshCallbacks = useMemo(
    () => ({
      characterData: refetchCharacterData,
      turn: refetchTurn,
      afford: refetchAfford,
      view: refetchView,
      where: refetchWhere,
      roster: refetchRoster,
      doors: refetchDoors,
    }),
    [
      refetchAfford,
      refetchCharacterData,
      refetchDoors,
      refetchRoster,
      refetchTurn,
      refetchView,
      refetchWhere,
    ]
  );
  const scheduleRefresh = useCoalescedSessionRefreshes(
    `${sessionId}\u0000${member}`,
    refreshCallbacks
  );

  const combat = useSessionCombatExperience({
    session: sessionId,
    member,
    clock: experienceClock,
    active: turnActive,
    authorityFresh,
    memberNames: publicMemberNames,
    memberRoles: publicMemberRoles,
    participants: turnParticipants,
    declarations: coherentDeclarations,
    invalidateAuthoritySnapshots,
    scheduleRefresh,
  });
  staleMoveRecoveryRef.current = (declarationId) =>
    combat.recoverStaleDeclaration(declarationId, Verb.MOVE);
  moveAcceptedRef.current = () => {
    combat.invalidateAuthority();
    scheduleRefresh(['turn', 'afford']);
  };

  // `struck` and `downed` both refresh 'view' (see refreshKeysForEvent
  // below), so the killing blow's DOWNED standing arrives from the server
  // while the player's own d20 is still tumbling. Hold the felled subject on
  // its feet until that roll has actually been revealed; nothing else about
  // the sighting is touched. See downedReveal.ts.
  const revealedMembers = useMemo(
    () => holdDownedReveal(otherMembers, combat.unresolvedAttackTargets),
    [otherMembers, combat.unresolvedAttackTargets]
  );
  const localWorldDieOpenDoors = useMemo(
    () =>
      new Set(
        [...doors]
          .filter(([, door]) => door.state === DoorState.OPEN)
          .map(([id]) => id)
      ),
    [doors]
  );
  const localWorldDieRequest = combat.diceEvents.find(
    (event): event is DicePresentationRequestedEvent =>
      event.type === 'dice-presentation-requested'
  );
  const localWorldDieProjectionRef = useRef<TrayPlaneProjection | undefined>(
    undefined
  );
  const localWorldDieCommandId = useRef(1);
  const localWorldDieProfile = useRef<VisualThrowProfileV1 | undefined>(
    undefined
  );
  const localWorldDiePlanningOperation = useRef(0);
  const admittedWitnessPlans = useRef(new Set<string>());
  const witnessInbox = useRef(
    new LocalWorldDieWitnessInbox({ ttlMs: 1_500, capacity: 16 })
  );
  const witnessExpectationRef = useRef<
    LocalWorldDieWitnessExpectation | undefined
  >(undefined);
  const localWorldDieAttemptSnapshotRef = useRef<
    LocalWorldDieAttemptSnapshot | undefined
  >(undefined);
  const [localWorldDieCommand, setLocalWorldDieCommand] =
    useState<LocalWorldDieCommand>({ id: 0, kind: 'reset' });
  const [localWorldDieReady, setLocalWorldDieReady] = useState(false);
  const [localWorldDieRolling, setLocalWorldDieRolling] = useState(false);
  const [localWorldDiePendingRoll, setLocalWorldDiePendingRoll] =
    useState(false);
  const [localWorldDieAttemptState, setLocalWorldDieAttemptState] = useState({
    presentationId: localWorldDieRequest?.presentationId,
    attempt: 1,
  });
  const localWorldDieAttempt =
    localWorldDieAttemptState.presentationId ===
    localWorldDieRequest?.presentationId
      ? localWorldDieAttemptState.attempt
      : 1;
  const [localWorldDieWitnessActive, setLocalWorldDieWitnessActive] =
    useState(false);
  const [localWorldDieSettled, setLocalWorldDieSettled] = useState(false);
  const [localWorldDiePresentationFailed, setLocalWorldDiePresentationFailed] =
    useState(false);
  const localWorldDiePhysical =
    combat.diceWitnessRole === 'roller' &&
    combat.phase === 'awaiting-roll' &&
    !combat.diceSemanticFallback &&
    localWorldDieRequest !== undefined;
  const snapshotScene = lastGoodSceneRef.current;
  const localWorldDieAttemptScopeKey =
    localWorldDieRequest && snapshotScene
      ? `${sessionId.length}:${sessionId}:${localWorldDieRequest.presentationId.length}:${localWorldDieRequest.presentationId}:${localWorldDieRequest.roller.entityId.length}:${localWorldDieRequest.roller.entityId}:${localWorldDieAttempt}`
      : undefined;
  if (!localWorldDieAttemptScopeKey || !snapshotScene) {
    localWorldDieAttemptSnapshotRef.current = undefined;
  } else if (
    localWorldDieAttemptSnapshotRef.current?.scopeKey !==
    localWorldDieAttemptScopeKey
  ) {
    localWorldDieAttemptSnapshotRef.current =
      createLocalWorldDieAttemptSnapshot({
        scopeKey: localWorldDieAttemptScopeKey,
        scene: snapshotScene,
        openDoorIds: localWorldDieOpenDoors,
      });
  }
  const localWorldDieAttemptSnapshot = localWorldDieAttemptSnapshotRef.current;
  const [localWorldDieFingerprintState, setLocalWorldDieFingerprintState] =
    useState<
      Readonly<{ scopeKey: string; fingerprint: Uint8Array }> | undefined
    >(undefined);
  const localWorldDieFingerprint =
    localWorldDieFingerprintState &&
    localWorldDieAttemptSnapshot &&
    localWorldDieFingerprintState.scopeKey ===
      localWorldDieAttemptSnapshot.scopeKey
      ? localWorldDieFingerprintState.fingerprint
      : undefined;

  useEffect(() => {
    let active = true;
    if (!localWorldDieAttemptSnapshot) return;
    void fingerprintLocalWorldDieColliders(
      localWorldDieAttemptSnapshot.colliders
    ).then((fingerprint) => {
      if (!active) return;
      setLocalWorldDieFingerprintState({
        scopeKey: localWorldDieAttemptSnapshot.scopeKey,
        fingerprint,
      });
    });
    return () => {
      active = false;
    };
  }, [localWorldDieAttemptSnapshot]);

  const witnessAuthoritySeq = localWorldDieRequest
    ? authoritySeqFromPresentationId(localWorldDieRequest.presentationId)
    : undefined;
  const witnessExpectation = useMemo(
    () =>
      combat.diceWitnessRole === 'spectator' &&
      localWorldDieRequest?.roller.role === 'player' &&
      localWorldDieRequest.roller.entityId !== member &&
      witnessAuthoritySeq !== undefined &&
      localWorldDieFingerprint
        ? {
            session: sessionId,
            presentationId: localWorldDieRequest.presentationId,
            authoritySeq: witnessAuthoritySeq,
            roller: localWorldDieRequest.roller.entityId,
            attempt: localWorldDieAttempt,
            viewerMember: member,
            fingerprint: localWorldDieFingerprint,
          }
        : undefined,
    [
      combat.diceWitnessRole,
      localWorldDieAttempt,
      localWorldDieFingerprint,
      localWorldDieRequest,
      member,
      sessionId,
      witnessAuthoritySeq,
    ]
  );
  witnessExpectationRef.current = witnessExpectation;

  const playWitnessPlan = useCallback((plan: LocalWorldDieWitnessPlan) => {
    const identity = `${plan.presentationId}:${plan.attempt}`;
    if (admittedWitnessPlans.current.has(identity)) return;
    admittedWitnessPlans.current.add(identity);
    setLocalWorldDieWitnessActive(true);
    setLocalWorldDieCommand({
      id: localWorldDieCommandId.current++,
      kind: 'witness',
      plan,
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void consumeLocalWorldDieWitnessStream({
      session: sessionId,
      member,
      signal: controller.signal,
      onPlan: (wirePlan) => {
        const plan = witnessInbox.current.offer(
          wirePlan,
          witnessExpectationRef.current,
          performance.now()
        );
        if (plan) playWitnessPlan(plan);
      },
      onUnavailable: () => {},
    });
    return () => controller.abort();
  }, [member, playWitnessPlan, sessionId]);

  useEffect(() => {
    localWorldDiePlanningOperation.current += 1;
    setLocalWorldDieAttemptState({
      presentationId: localWorldDieRequest?.presentationId,
      attempt: 1,
    });
    admittedWitnessPlans.current.clear();
    setLocalWorldDieWitnessActive(false);
    setLocalWorldDieSettled(false);
    setLocalWorldDiePresentationFailed(false);
    setLocalWorldDiePendingRoll(false);
    localWorldDieProfile.current = undefined;
  }, [localWorldDieRequest?.presentationId]);

  useEffect(() => {
    if (!witnessExpectation) return;
    const plan = witnessInbox.current.reconsider(
      witnessExpectation,
      performance.now()
    );
    if (plan) playWitnessPlan(plan);
  }, [playWitnessPlan, witnessExpectation]);

  useEffect(() => {
    if (localWorldDiePhysical) return;
    localWorldDiePlanningOperation.current += 1;
    setLocalWorldDieCommand({
      id: localWorldDieCommandId.current++,
      kind: 'reset',
    });
    setLocalWorldDieReady(false);
    setLocalWorldDieRolling(false);
    localWorldDieProjectionRef.current = undefined;
  }, [localWorldDiePhysical]);

  const handleLocalWorldDieHeld = useCallback(
    (held: LocalWorldDieHeldState | undefined) => {
      if (localWorldDieRolling) return;
      setLocalWorldDieCommand(
        held
          ? {
              id: localWorldDieCommandId.current++,
              kind: 'held',
              held,
            }
          : { id: localWorldDieCommandId.current++, kind: 'reset' }
      );
    },
    [localWorldDieRolling]
  );
  const failLocalWorldDiePresentation = useCallback(() => {
    localWorldDiePlanningOperation.current += 1;
    setLocalWorldDieRolling(false);
    setLocalWorldDiePendingRoll(false);
    setLocalWorldDiePresentationFailed(true);
    setLocalWorldDieCommand({
      id: localWorldDieCommandId.current++,
      kind: 'reset',
    });
  }, []);

  const handleLocalWorldDieRelease = useCallback(
    (held: LocalWorldDieHeldState, profile: VisualThrowProfileV1) => {
      localWorldDieProfile.current = profile;
      setLocalWorldDieRolling(true);
      const snapshot = localWorldDieAttemptSnapshotRef.current;
      if (!snapshot) {
        failLocalWorldDiePresentation();
        return;
      }
      const operation = ++localWorldDiePlanningOperation.current;
      setLocalWorldDieCommand({
        id: localWorldDieCommandId.current++,
        kind: 'held',
        held,
      });
      void preSimulateLocalWorldDie({
        scene: snapshot.scene,
        colliders: snapshot.colliders,
        held,
        profile,
      }).then(
        async (terminal) => {
          if (
            localWorldDiePlanningOperation.current !== operation ||
            !localWorldDiePhysical
          )
            return;
          const request = localWorldDieRequest;
          const authoritySeq = request
            ? authoritySeqFromPresentationId(request.presentationId)
            : undefined;
          if (request && authoritySeq !== undefined) {
            try {
              await publishLocalWorldDie({
                session: sessionId,
                member,
                presentationId: request.presentationId,
                authoritySeq,
                attempt: localWorldDieAttempt,
                plan: terminal,
              });
              if (localWorldDiePlanningOperation.current !== operation) return;
            } catch {
              if (localWorldDiePlanningOperation.current !== operation) return;
              // Decorative transport failure keeps the authoritative actor
              // functional through the same local planned playback.
            }
          }
          setLocalWorldDieCommand({
            id: localWorldDieCommandId.current++,
            kind: 'released',
            held,
            profile,
            plannedTerminal: terminal,
          });
        },
        () => {
          if (localWorldDiePlanningOperation.current !== operation) return;
          failLocalWorldDiePresentation();
        }
      );
    },
    [
      failLocalWorldDiePresentation,
      localWorldDieAttempt,
      localWorldDiePhysical,
      localWorldDieRequest,
      member,
      sessionId,
    ]
  );
  const runLocalWorldDieNeutralRoll = useCallback(() => {
    const origin = lastGoodPositionRef.current;
    if (!origin) return;
    const world = cubeToWorld(origin, HEX_SIZE);
    const authoritySeq = localWorldDieRequest
      ? authoritySeqFromPresentationId(localWorldDieRequest.presentationId)
      : undefined;
    handleLocalWorldDieRelease(
      { position: [world.x, world.z], height: 1.25 },
      createNeutralVisualThrowProfile(
        Number((authoritySeq ?? 0n) & 0xffff_ffffn)
      )
    );
  }, [handleLocalWorldDieRelease, localWorldDieRequest]);
  const handleLocalWorldDieRoll = useCallback(() => {
    if (!localWorldDieReady) {
      setLocalWorldDiePendingRoll(true);
      return;
    }
    runLocalWorldDieNeutralRoll();
  }, [localWorldDieReady, runLocalWorldDieNeutralRoll]);

  useEffect(() => {
    if (!localWorldDiePendingRoll || !localWorldDieReady) return;
    setLocalWorldDiePendingRoll(false);
    runLocalWorldDieNeutralRoll();
  }, [
    localWorldDiePendingRoll,
    localWorldDieReady,
    runLocalWorldDieNeutralRoll,
  ]);

  const handleLocalWorldDieFailureReveal = useCallback(() => {
    const request = localWorldDieRequest;
    if (!request) return;
    const authoritySeq = authoritySeqFromPresentationId(request.presentationId);
    const profile =
      localWorldDieProfile.current ??
      createNeutralVisualThrowProfile(
        Number((authoritySeq ?? 0n) & 0xffff_ffffn)
      );
    setLocalWorldDiePresentationFailed(false);
    setLocalWorldDiePendingRoll(false);
    setLocalWorldDieSettled(true);
    setLocalWorldDieRolling(false);
    setLocalWorldDieCommand({
      id: localWorldDieCommandId.current++,
      kind: 'reset',
    });
    combat.onDiceReleaseRequest(localWorldDieReleaseEvent(request, profile));
  }, [combat, localWorldDieRequest]);

  const handleLocalWorldDieTerminal = useCallback(
    (kind: 'settled' | 'off-table' | 'failure') => {
      if (localWorldDieWitnessActive) {
        if (kind === 'off-table') {
          setLocalWorldDieAttemptState({
            presentationId: localWorldDieRequest?.presentationId,
            attempt: localWorldDieAttempt + 1,
          });
        }
        setLocalWorldDieWitnessActive(false);
        setLocalWorldDieCommand({
          id: localWorldDieCommandId.current++,
          kind: 'reset',
        });
        return;
      }
      if (kind === 'failure') {
        failLocalWorldDiePresentation();
        return;
      }
      if (kind === 'off-table') {
        setLocalWorldDieAttemptState({
          presentationId: localWorldDieRequest?.presentationId,
          attempt: localWorldDieAttempt + 1,
        });
        setLocalWorldDieRolling(false);
        setLocalWorldDieCommand({
          id: localWorldDieCommandId.current++,
          kind: 'reset',
        });
        return;
      }
      const request = localWorldDieRequest;
      const profile = localWorldDieProfile.current;
      if (!request || !profile) return;
      setLocalWorldDieSettled(true);
      setLocalWorldDieRolling(false);
      setLocalWorldDieCommand({
        id: localWorldDieCommandId.current++,
        kind: 'reset',
      });
      combat.onDiceReleaseRequest(localWorldDieReleaseEvent(request, profile));
    },
    [
      combat,
      failLocalWorldDiePresentation,
      localWorldDieAttempt,
      localWorldDieRequest,
      localWorldDieWitnessActive,
    ]
  );

  const refreshKeysForEvent = useCallback(
    (event: SessionEvent): SessionRefreshKey[] => {
      switch (event.body.case) {
        case 'moved':
          return event.body.value.member === member
            ? ['where', 'afford', 'turn']
            : ['view'];
        case 'struck':
        case 'missed':
          return ['characterData', 'afford', 'view'];
        case 'downed':
          return ['characterData', 'afford', 'turn', 'view'];
        case 'fightStarted':
        case 'fightEnded':
          return ['characterData', 'afford', 'turn', 'view'];
        case 'turnEnded':
          return ['characterData', 'afford', 'turn', 'view'];
        case 'ended':
          return ['characterData', 'afford', 'turn', 'view'];
        case 'joined':
          return ['roster'];
        case 'door':
          return ['doors'];
        case 'exited':
        case undefined:
          return event.kind === EventKind.ENDED
            ? ['characterData', 'afford', 'turn', 'view']
            : [];
      }
    },
    [member]
  );

  // One delivered-event funnel: immediate query invalidation, immediate raw
  // Debug/authority ingestion, presentation-only pacing, then route handlers.
  const { acceptStreamEvent, invalidateAuthority } = combat;
  const handleSessionEvent = useCallback(
    (event: SessionEvent, metadata: SessionEventDeliveryMetadata) => {
      // Every delivered sequence advancement revokes action authority before
      // the coalesced snapshots can begin. Last-good values remain display-only.
      invalidateAuthority();
      scheduleRefresh([
        ...new Set<SessionRefreshKey>([
          'turn',
          'afford',
          ...refreshKeysForEvent(event),
        ]),
      ]);
      acceptStreamEvent(event, metadata);

      if (event.body.case === 'door') setDoorNotice(null);
      if (event.body.case === 'ended' || event.kind === EventKind.ENDED) {
        // Equipment must disappear in the same authoritative event update,
        // before the modal receives focus or can be layered over the panel.
        setEquipmentOpen(false);
        setRunEnded(event.body.case === 'ended' ? event.body.value.ending : '');
      }
    },
    [
      acceptStreamEvent,
      invalidateAuthority,
      refreshKeysForEvent,
      scheduleRefresh,
    ]
  );

  const handleStreamAgedOut = useCallback(() => {
    invalidateAuthority();
    scheduleRefresh(['characterData', 'turn', 'afford', 'view', 'where']);
  }, [invalidateAuthority, scheduleRefresh]);
  const streamState = useSessionEventStream(
    sessionId,
    member,
    handleSessionEvent,
    handleStreamAgedOut
  );

  useEffect(() => {
    if (!wherePosition) return;
    scheduleRefresh(['view']);
  }, [scheduleRefresh, wherePosition]);
  useEffect(() => {
    if (!member) return;
    scheduleRefresh(['afford', 'turn']);
  }, [member, scheduleRefresh]);
  const handleWalkAnimationComplete = useCallback(
    (completedSeq: number) => {
      onWalkAnimationComplete(completedSeq);
    },
    [onWalkAnimationComplete]
  );

  const handleDoorClick = useCallback(
    (door: string) => {
      const state = doors.get(door)?.state;
      if (!member || state === undefined || state === DoorState.OPEN) return;
      setDoorNotice(null);
      void (async () => {
        try {
          if (state === DoorState.LOCKED) {
            const response = await sessionClient.unlock({
              session: sessionId,
              member,
              door,
            });
            setDoorNotice(
              response.beaten
                ? `Picked the lock — ${response.total} vs DC ${response.dc}. The door swings open.`
                : `The lock holds — ${response.total} vs DC ${response.dc}.`
            );
          } else {
            await sessionClient.openDoor({ session: sessionId, member, door });
            setDoorNotice('The door opens.');
          }
          scheduleRefresh(['doors']);
        } catch (error) {
          setDoorNotice(errorMessage(error));
        }
      })();
    },
    [doors, member, scheduleRefresh, sessionId]
  );

  const handleEquipIntent = useCallback(
    async (intent: EquipIntent) => {
      if (!member) return;
      try {
        const response =
          intent.kind === 'EquipItem'
            ? await equipItem({
                characterId: member,
                item: intent.ref,
                slotKey: intent.slotKey,
              })
            : await unequipItem({
                characterId: member,
                slotKey: intent.slotKey,
              });
        if (!response.character) {
          throw new Error('Equipment response did not include CharacterData');
        }
        // Full authoritative replacement only — no client equipment/AC rules.
        replaceCharacterData(response.character);
      } catch {
        // The mutation hooks retain the transport error. Last confirmed private
        // state remains visible until the player retries.
      }
    },
    [equipItem, member, replaceCharacterData, unequipItem]
  );

  const ownRoster = roster.get(member);
  const characterName = ownRoster?.name || 'You';
  const classRefId = ownRoster?.classRef || undefined;
  const raceRefId = ownRoster?.raceRef || undefined;
  const localIsDowned =
    turnParticipants.find((participant) => participant.member === member)
      ?.standing === Standing.DOWNED;
  const mainHandResolution = useMemo(
    () => resolveMainHandPresentation(characterData?.equipped ?? {}),
    [characterData?.equipped]
  );
  const offHandResolution = useMemo(
    () => resolveOffHandPresentation(characterData?.equipped ?? {}),
    [characterData?.equipped]
  );
  const loading = atlasLoading || whereLoading;
  const blockingError = atlasError ?? whereError;
  const privateStatus = characterData
    ? characterDataError
      ? ('stale' as const)
      : characterDataLoading
        ? ('loading' as const)
        : ('ready' as const)
    : characterDataError
      ? ('unavailable' as const)
      : ('loading' as const);
  const localWorldDieControl =
    combat.diceWitnessRole === 'roller' && combat.phase === 'awaiting-roll' ? (
      localWorldDiePresentationFailed ? (
        <LocalWorldDieTile
          mode="fallback"
          onRevealResult={handleLocalWorldDieFailureReveal}
        />
      ) : localWorldDieRolling ? (
        <LocalWorldDieTile mode="status" />
      ) : combat.diceSemanticFallback ? (
        <LocalWorldDieTile
          mode="fallback"
          onRevealResult={combat.onDiceSemanticReleaseRequest}
        />
      ) : localWorldDieAttemptSnapshot &&
        !localWorldDieRolling &&
        !localWorldDieSettled ? (
        <LocalWorldDieTile
          mode="ready"
          pickupReady={localWorldDieReady}
          scene={localWorldDieAttemptSnapshot.scene}
          projectionRef={localWorldDieProjectionRef}
          onHeldChange={handleLocalWorldDieHeld}
          onRelease={handleLocalWorldDieRelease}
          onRoll={handleLocalWorldDieRoll}
        />
      ) : null
    ) : null;
  const localWorldDieLayer =
    (localWorldDiePhysical || localWorldDieWitnessActive) &&
    localWorldDieAttemptSnapshot &&
    localWorldDieRequest ? (
      <LocalWorldDieLayer
        command={localWorldDieCommand}
        scene={localWorldDieAttemptSnapshot.scene}
        colliders={localWorldDieAttemptSnapshot.colliders}
        authoritativeFace={localWorldDieRequest.die.authoritativeResult}
        projectionRef={localWorldDieProjectionRef}
        onReadyChange={setLocalWorldDieReady}
        onTerminal={handleLocalWorldDieTerminal}
      />
    ) : null;

  let content: React.ReactNode;
  if (!characterId) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="No character selected"
          message="Can't place you in this session without a character."
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (canDrawScene) {
    content = (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          ref={encounterContentRef}
          data-testid="session-encounter-content"
          aria-hidden={runEnded !== null ? true : undefined}
          onClickCapture={(event) => {
            if (runEnded === null) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDownCapture={(event) => {
            if (runEnded === null) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: runEnded !== null ? 'none' : undefined,
          }}
        >
          <CombatExperience
            layout="fill-parent"
            viewerMember={member}
            viewerName={characterName}
            viewerClassRefId={classRefId}
            memberNames={publicMemberNames}
            clock={experienceClock}
            round={turnRound}
            participants={turnParticipants}
            declarations={coherentDeclarations}
            characterData={characterData}
            privateStatus={privateStatus}
            privateStatusMessage={
              characterDataError ? errorMessage(characterDataError) : undefined
            }
            onRetryPrivateStatus={() => void refetchCharacterData()}
            authorityFresh={authorityFresh}
            presentationState={combat.presentationState}
            phase={combat.phase}
            showTurnNotice={combat.showTurnNotice}
            logMode={combat.logMode}
            streamState={streamState}
            story={combat.story}
            debug={combat.debug}
            result={combat.result}
            diceEvents={combat.diceEvents}
            diceSemanticFallback={combat.diceSemanticFallback}
            diceRollerName={combat.diceRollerName}
            localWorldDieControl={localWorldDieControl}
            localWorldDieSettled={localWorldDieSettled}
            location={{ name: 'The Reference Tomb', area: 'Current chamber' }}
            pacingNotice={combat.pacingNotice}
            renderMap={({ attackableTargets, onTargetClick }) => (
              <SessionCanvas
                scene={lastGoodSceneRef.current!}
                hexSize={HEX_SIZE}
                characterId={member}
                characterName={characterName}
                classRefId={classRefId}
                raceRefId={raceRefId}
                localIsDowned={localIsDowned}
                mainHandPresentation={mainHandResolution.presentation}
                offHandPresentation={offHandResolution.presentation}
                roster={roster}
                doors={doors}
                onDoorClick={runEnded === null ? handleDoorClick : undefined}
                myPosition={displayPosition ?? lastGoodPositionRef.current!}
                movePath={movePath}
                moveSeq={moveSeq}
                onHexClick={runEnded === null ? walkTo : undefined}
                onEntityClick={runEnded === null ? onTargetClick : undefined}
                onMovementPresentationComplete={
                  runEnded === null ? handleWalkAnimationComplete : undefined
                }
                otherMembers={revealedMembers}
                attackableTargets={
                  runEnded === null ? [...attackableTargets] : []
                }
                pathIndex={lastGoodPathIndexRef.current}
                turnLocked={turnLocked}
                movementBudgetFeet={movementBudgetFeet(coherentDeclarations)}
                presentationLayer={localWorldDieLayer}
              />
            )}
            onSelectDeclaration={combat.onSelectDeclaration}
            onTargetClick={combat.onTargetClick}
            onEndTurn={combat.onEndTurn}
            onLogModeChange={combat.onLogModeChange}
            onOpenEquipment={
              characterData
                ? () => setEquipmentOpen((open) => !open)
                : undefined
            }
            equipmentOpen={characterData ? equipmentOpen : false}
            {...(combat.diceWitnessRole === 'roller'
              ? {
                  diceWitnessRole: 'roller' as const,
                  onDiceReleaseRequest: combat.onDiceReleaseRequest,
                  onDiceSemanticReleaseRequest:
                    combat.onDiceSemanticReleaseRequest,
                }
              : { diceWitnessRole: 'spectator' as const })}
          />

          <div
            style={{
              position: 'absolute',
              zIndex: 20,
              top: 12,
              left: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Button variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
            {walking && <span>Walking…</span>}
            {moveError && !walking && (
              <span style={{ color: 'var(--color-error, #f87171)' }}>
                {moveError}
              </span>
            )}
            {doorNotice && <span>{doorNotice}</span>}
          </div>

          <div
            style={{
              position: 'fixed',
              zIndex: 40,
              left: 0,
              right: 0,
              bottom: 174,
              height: 0,
            }}
          >
            {runEnded === null && characterData && (
              <EquipmentPopover
                open={equipmentOpen}
                characterName={characterName}
                classLabel={classLabel(classRefId) ?? undefined}
                slots={characterData.slots}
                equipped={characterData.equipped}
                items={characterData.inventory.filter(
                  (
                    item
                  ): item is typeof item & {
                    ref: NonNullable<typeof item.ref>;
                  } => item.ref !== undefined
                )}
                armorClass={
                  characterData.armorClassDetail
                    ? {
                        total: characterData.armorClassDetail.total,
                        note: characterData.armorClassDetail.note,
                      }
                    : undefined
                }
                mainHandDamage={characterData.mainHandDamage}
                onIntent={(intent) => void handleEquipIntent(intent)}
                busy={equipping || unequipping}
              />
            )}
          </div>
        </div>

        {runEnded !== null && (
          <div
            data-testid="run-ended-overlay"
            style={{
              position: 'absolute',
              zIndex: 1000,
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.72)',
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="run-ended-headline"
              style={{
                textAlign: 'center',
                padding: '32px 48px',
                borderRadius: 12,
                background: 'var(--bg-secondary, #1c1c22)',
              }}
            >
              <h2 id="run-ended-headline">{endingHeadline(runEnded)}</h2>
              <p>The encounter is over — the outcome is recorded.</p>
              <Button ref={leaveRunButtonRef} size="sm" onClick={onBack}>
                Leave
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  } else if (loading) {
    content = <LoadingOverlay visible text="Loading the tomb…" />;
  } else if (blockingError) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Couldn't load the session"
          message={errorMessage(blockingError)}
          onRetry={() => {
            void refetchAtlas();
            void refetchWhere();
            void refetchCharacterData();
          }}
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (layoutOutcome && !layoutOutcome.ok) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Can't draw this map yet"
          message={layoutOutcome.message}
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Nothing to draw"
          message="The session has no atlas cells, or no known position for you yet."
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  }

  return createPortal(
    <div
      data-testid="session-encounter-view"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #0a0a0a)',
      }}
    >
      {content}
    </div>,
    document.body
  );
}
