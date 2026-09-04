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
import { useGetCharacter } from '@/api/hooks';
import { useCharacterData } from '@/api/useCharacterData';
import { useEquipItem } from '@/api/useEquipItem';
import { useSessionAfford } from '@/api/useSessionAfford';
import { useSessionAtlas } from '@/api/useSessionAtlas';
import { useSessionDoors } from '@/api/useSessionDoors';
import { useSessionInteract } from '@/api/useSessionInteract';
import { useSessionRoster } from '@/api/useSessionRoster';
import { useSessionSearch } from '@/api/useSessionSearch';
import { useSessionTrade } from '@/api/useSessionTrade';
import { useSessionTurn } from '@/api/useSessionTurn';
import { useSessionView } from '@/api/useSessionView';
import { useSessionWhere } from '@/api/useSessionWhere';
import { useUnequipItem } from '@/api/useUnequipItem';
import type { DicePresentationRequestedEvent } from '@/components/ui/dice/dicePresentationEvent';
import {
  createNeutralVisualThrowProfile,
  type VisualThrowProfileV1,
} from '@/components/ui/dice/visualThrowProfile';
import { useDiceDials } from '@/feel/useFeelDials';
import { errorMessage } from '@/utils/combatFormat';
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { EventKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type {
  VendorStockEntry,
  WorldNPCDescriptor,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
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
import { coordToKey, cubeToWorld, HEX_SIZE } from '../hex-grid/hexMath';
import { resolveMainHandPresentation } from '../hex-grid/mainHandWeapons';
import { resolveOffHandPresentation } from '../hex-grid/offHandEquipment';
import { Button } from '../ui/Button';
import type { TrayPlaneProjection } from '../ui/dice/trayPlaneProjection';
import { ErrorDisplay, LoadingOverlay } from '../ui/Feedback';
import { applyDoorRevealed, applyRegionRevealed } from './applyReveal';
import { type AtlasPathIndex, buildAtlasPathIndex } from './atlasPath';
import { regionAt } from './atlasRegion';
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
import { localWorldDieDimensions } from './local-world-die/diceDials';
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
import { SEARCH_NOTICE } from './searchNotice';
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
import { VendorPopover } from './vendor/VendorPopover';

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
  // GetCharacter is the local owner's complete creation projection and the
  // only private session source that carries Appearance.hair. Peer looks stay
  // on public roster Customization and never trigger another sheet read.
  const { data: ownerCharacter } = useGetCharacter(member);
  const {
    atlas,
    loading: atlasLoading,
    error: atlasError,
    refetch: refetchAtlas,
    applyReveal: applyAtlasReveal,
  } = useSessionAtlas(sessionId, member);
  const {
    position: wherePosition,
    loading: whereLoading,
    error: whereError,
    refetch: refetchWhere,
  } = useSessionWhere(sessionId, member);
  const { sightings, refetch: refetchView } = useSessionView(sessionId, member);
  const { roster, refetch: refetchRoster } = useSessionRoster(sessionId);
  const { doors, refetch: refetchDoors } = useSessionDoors(sessionId, member);
  const { search, loading: searching } = useSessionSearch();
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
  const { interact } = useSessionInteract();
  const { trade, loading: tradeLoading } = useSessionTrade();
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [runEnded, setRunEnded] = useState<string | null>(null);
  const [doorNotice, setDoorNotice] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [activeVendor, setActiveVendor] = useState<{
    subject: string;
    descriptor: WorldNPCDescriptor;
  } | null>(null);
  const [vendorNotice, setVendorNotice] = useState<string | null>(null);
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

  // The searcher's own current region, resolved from data this member's
  // own atlas already carries — never chosen, never guessed (the law: "a
  // player cannot target structure they do not know exists").
  const region = useMemo(
    () => regionAt(atlas, wherePosition),
    [atlas, wherePosition]
  );
  // "You search the area" stops describing the player's surroundings the
  // moment those surroundings change — matches `doorNotice`'s own
  // staleness law, just for a different trigger (a door's notice goes
  // stale when the door's OWN state moves on; a search's notice goes
  // stale when the SEARCHER moves on). Cosmetic only — the text is
  // content-invariant either way, so this has no secrecy implication.
  useEffect(() => {
    setSearchNotice(null);
  }, [region, member]);
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
  const lastGoodPathIndexRef = useRef<AtlasPathIndex | null>(null);
  if (canDrawSceneNow) {
    lastGoodSceneRef.current = scene;
    lastGoodPositionRef.current = positionToCube(wherePosition);
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

  // The path PREVIEW must route around exactly what the server's own Move
  // already refuses to enter — a live other member's cell, world NPC,
  // monster, or player alike (the vendor is only what made the gap
  // visible: it is the first entity that sits permanently in open floor).
  // A `remembered` sighting is filtered out here, not left for
  // `buildAtlasPathIndex` to guess: it is a held memory, not confirmed
  // still there, and must never block a route the way a live one does —
  // the same distinction `SightedMember.remembered`'s own doc comment
  // already draws for rendering.
  const occupiedCellKeys = useMemo(
    () =>
      new Set(
        otherMembers
          .filter((m) => !m.remembered)
          .map((m) => coordToKey(m.position))
      ),
    [otherMembers]
  );
  const pathIndex = useMemo(
    () => (atlas ? buildAtlasPathIndex(atlas, doors, occupiedCellKeys) : null),
    [atlas, doors, occupiedCellKeys]
  );
  if (canDrawSceneNow) {
    lastGoodPathIndexRef.current = pathIndex;
  }

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
      atlas: refetchAtlas,
    }),
    [
      refetchAfford,
      refetchAtlas,
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
  // `?dieScale=`/`?rollFlash=` (diceDials.ts) — LIVE (#906 batch 2). Note
  // dieScale specifically: LocalWorldDieLayer.tsx only mounts while a throw
  // is in flight, so in practice a drawer edit here takes effect the next
  // time the die is thrown, not mid-throw.
  const diceDials = useDiceDials();
  // The no-drag "Roll" button below needs the same held-height default the
  // drag gesture uses.
  const localWorldDieDimensionsForNeutralRoll = useMemo(
    () => localWorldDieDimensions(diceDials.dieScale),
    [diceDials.dieScale]
  );
  // The die-anchored flash (`?rollFlash=die`/`both`) — round 3 fix: this
  // USED to be gated on `localWorldDieSettled` + `combat.result`, but
  // `localWorldDieSettled` only flips true at the END of the 750ms hold
  // (`handleLocalWorldDieTerminal`), by which point the layer is already
  // being torn down — the flash never actually rendered. LocalWorldDieLayer
  // now triggers and renders its own flash internally, from the moment the
  // die is physically at rest (see its own doc comment), using
  // `authoritativeFace` it already has — so this view only needs to pass
  // whether die-mode is on at all. Passed to the SAME LocalWorldDieLayer
  // instance used for both the roller's own throw AND a spectator's witness
  // playback (see `localWorldDieLayer` below), so a witnessed throw flashes
  // too.
  const dieRollFlashEnabled =
    diceDials.rollFlash === 'die' || diceDials.rollFlash === 'both';
  const runLocalWorldDieNeutralRoll = useCallback(() => {
    const origin = lastGoodPositionRef.current;
    if (!origin) return;
    const world = cubeToWorld(origin, HEX_SIZE);
    const authoritySeq = localWorldDieRequest
      ? authoritySeqFromPresentationId(localWorldDieRequest.presentationId)
      : undefined;
    handleLocalWorldDieRelease(
      {
        position: [world.x, world.z],
        height: localWorldDieDimensionsForNeutralRoll.holdHeightDefault,
      },
      createNeutralVisualThrowProfile(
        Number((authoritySeq ?? 0n) & 0xffff_ffffn)
      )
    );
  }, [
    handleLocalWorldDieRelease,
    localWorldDieRequest,
    localWorldDieDimensionsForNeutralRoll,
  ]);
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
        case 'activationResult':
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
        // DOOR_REVEALED / REGION_REVEALED patch this recipient's cached
        // GetDoors / GetAtlas views in place, per the protos' own doc
        // comment on both messages. Chosen refresh path (deliberate, per
        // rpg-project#886): re-run the now member-scoped GetDoors/GetAtlas
        // rather than splice the event's own doorways/boundaries/props
        // payload into the cached atlas by hand — reveals are rare beats,
        // not a hot path, and reusing the already-proven fetch path costs
        // one extra round trip in exchange for not inventing new
        // merge/dedup logic this wave has no live server to verify
        // against. A doorRevealed door may also compose with a lock, so
        // its DoorInfo belongs in 'doors' too, not atlas alone.
        case 'doorRevealed':
          return ['doors', 'atlas'];
        case 'regionRevealed':
          return ['atlas'];
        case 'activated':
        case 'exited':
        case undefined:
          return event.kind === EventKind.ENDED
            ? ['characterData', 'afford', 'turn', 'view']
            : [];
        // Newer event kinds (unrelated waves — rpg-api#911's Death Save,
        // rpg-toolkit#1275's Loot/Hold/Drop) this session route doesn't
        // build UI for yet. Grouped with the nearest existing case by
        // cache-invalidation shape rather than left unhandled: a death
        // save is a downed-character state change (same refresh as
        // 'downed'); loot/hold/drop change what a character carries
        // (same refresh as 'struck'/'missed' — character data changed,
        // turn state didn't).
        case 'deathSaveRolled':
          return ['characterData', 'afford', 'turn', 'view'];
        case 'looted':
        case 'held':
        case 'dropped':
          return ['characterData', 'afford', 'view'];
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

      // A REVEAL PATCHES THE HELD ATLAS IN THE SAME FRAME (design §5.2
      // as amended): the room, its walls and its sealed cells appear now,
      // not a round trip later. `applyReveal.ts` holds the merge rule —
      // segments append, sealed replaces within the revealed region's
      // cells — and the refetch scheduled above still lands afterwards
      // with the server's own answer, so the patch buys the frame and
      // the server keeps the truth.
      if (event.body.case === 'regionRevealed') {
        const beat = event.body.value;
        applyAtlasReveal((current) => applyRegionRevealed(current, beat));
      }
      if (event.body.case === 'doorRevealed') {
        const beat = event.body.value;
        applyAtlasReveal((current) => applyDoorRevealed(current, beat));
      }
      if (event.body.case === 'door') setDoorNotice(null);
      // The same law: a DOOR_REVEALED/REGION_REVEALED beat is search's own
      // "the world moved on" signal, mirroring the 'door' case above.
      if (
        event.body.case === 'doorRevealed' ||
        event.body.case === 'regionRevealed'
      ) {
        setSearchNotice(null);
      }
      if (event.body.case === 'ended' || event.kind === EventKind.ENDED) {
        // Equipment must disappear in the same authoritative event update,
        // before the modal receives focus or can be layered over the panel.
        setEquipmentOpen(false);
        setRunEnded(event.body.case === 'ended' ? event.body.value.ending : '');
      }
    },
    [
      acceptStreamEvent,
      applyAtlasReveal,
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

  // Vendor NPC interaction (rpg-api#903 Phase 1, SessionService.Interact).
  // No client-side reach/adjacency check — same law every other session
  // verb keeps; an out-of-range click surfaces the server's own refusal as
  // `vendorNotice` rather than being pre-empted here.
  const handleVendorInteract = useCallback(
    (subject: string) => {
      if (!member) return;
      setVendorNotice(null);
      // Clear any already-open vendor before firing — a failed or
      // descriptor-less response for THIS click must never leave a
      // PREVIOUS vendor's stale popover on screen (Copilot review, PR #920).
      setActiveVendor(null);
      void (async () => {
        try {
          const response = await interact({
            session: sessionId,
            actor: member,
            target: subject,
          });
          if (response.descriptor) {
            setEquipmentOpen(false);
            setActiveVendor({ subject, descriptor: response.descriptor });
          }
        } catch (error) {
          setVendorNotice(errorMessage(error));
        }
      })();
    },
    [interact, member, sessionId]
  );

  // Vendor purchase (rpg-project#369/#370, SessionService.Trade). One
  // item per click, quantity read off the row itself (LIMITED rows carry
  // a real count; UNLIMITED rows default to 1 — see vendorStock.ts's own
  // `quantity ?? 0` convention for the same reason). `give` is always
  // empty this wave — one-directional acquisition only.
  const handleVendorBuy = useCallback(
    (entry: VendorStockEntry) => {
      if (!member || !activeVendor) return;
      setVendorNotice(null);
      void (async () => {
        try {
          const response = await trade({
            session: sessionId,
            actor: member,
            target: activeVendor.subject,
            equipmentType: entry.equipmentType,
            equipmentId: entry.equipmentId,
            quantity: entry.quantity ?? 1,
          });
          if (response.descriptor) {
            setActiveVendor({
              subject: activeVendor.subject,
              descriptor: response.descriptor,
            });
            setVendorNotice(`Bought ${entry.displayName}.`);
            // Unlike EquipItem/UnequipItem, TradeResponse carries the
            // VENDOR's descriptor, not the buyer's CharacterData — there
            // is nothing here to replaceCharacterData from. Without this,
            // the bought item wouldn't reach the equipment panel until
            // some unrelated stream event (e.g. turnEnded) happened to
            // include 'characterData' in its own refresh set — a real
            // gap caught live: free-roam vendor purchases have no turn
            // boundary to piggyback on at all.
            void refetchCharacterData();
          }
        } catch (error) {
          setVendorNotice(errorMessage(error));
        }
      })();
    },
    [activeVendor, member, refetchCharacterData, sessionId, trade]
  );

  // THE SECRECY LAW, ENFORCED HERE (rpg-project#350/#886): SearchResponse
  // carries no outcome, so this handler never reads `response` at all —
  // only whether the call itself resolved or threw. A find or a fruitless
  // room both land on the exact same `setSearchNotice(SEARCH_NOTICE)`
  // call; only a genuine RPC/transport failure (a caller defect, never a
  // check outcome) gets a different message, the same distinction
  // `handleDoorClick` already draws. A find still reaches the searcher —
  // later, as its own recipient-scoped DOOR_REVEALED beat on the stream,
  // handled by `refreshKeysForEvent` — never through this call's return
  // value, so no refresh is scheduled here.
  const handleSearch = useCallback(() => {
    if (!member || !region) return;
    setSearchNotice(null);
    void (async () => {
      try {
        await search({ session: sessionId, member, region });
        setSearchNotice(SEARCH_NOTICE);
      } catch (error) {
        setSearchNotice(errorMessage(error));
      }
    })();
  }, [member, region, search, sessionId]);

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
        rollFlashEnabled={dieRollFlashEnabled}
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
                localHair={ownerCharacter?.appearance?.hair}
                localIsDowned={localIsDowned}
                mainHandPresentation={mainHandResolution.presentation}
                offHandPresentation={offHandResolution.presentation}
                roster={roster}
                doors={doors}
                onDoorClick={runEnded === null ? handleDoorClick : undefined}
                onInteractClick={
                  runEnded === null ? handleVendorInteract : undefined
                }
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
                ? () => {
                    // Both popovers anchor to the exact same corner
                    // (`.equip-popover`'s own CSS) — only one at a time.
                    setActiveVendor(null);
                    setEquipmentOpen((open) => !open);
                  }
                : undefined
            }
            equipmentOpen={characterData ? equipmentOpen : false}
            onSearch={runEnded === null && region ? handleSearch : undefined}
            searchPending={searching}
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
            {searchNotice && <span>{searchNotice}</span>}
            {vendorNotice && <span>{vendorNotice}</span>}
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
            {runEnded === null && activeVendor && (
              <VendorPopover
                open
                displayName={activeVendor.descriptor.displayName}
                inventory={activeVendor.descriptor.inventory}
                onClose={() => setActiveVendor(null)}
                onBuy={(entry: VendorStockEntry) => handleVendorBuy(entry)}
                busy={tradeLoading}
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
