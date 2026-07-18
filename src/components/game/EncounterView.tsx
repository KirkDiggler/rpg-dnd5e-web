/**
 * EncounterView — GameView slice 2's live-combat surface (#440). Mounts when
 * LobbyFlow's StreamLobby delivers encounter_started. Built entirely on the
 * shared harness stack (design.md: "Already shared or generic"):
 * useEncounterStream + useEncounterState for the SnapshotDelivered-first
 * flow, ActionMenu/EconomyBar rendered verbatim off the server-pushed
 * TurnState, EncounterMap (HexGrid) for movement/targeting, and PromptModal
 * for skill-check/reaction prompts — the same component PlaytestHarness
 * renders, not a copy.
 *
 * The local player's entityId is the bound `characterId` (what
 * StartEncounter used as the toolkit AddPlayer EntityID — see
 * rpg-api's lobby orchestrator start_encounter.go), NOT `char-<playerId>`.
 * That shortcut only works in the harness because devseed happens to name
 * characters that way; GameView threads the real characterId through
 * instead (see GameView/LobbyFlow props).
 *
 * Single room this slice — multi-room accumulation is slice 4. Door
 * interaction is out of scope here too: HexGrid's door-click surface needs a
 * DoorInfo[] the v2 stream doesn't accumulate yet (the same documented gap
 * PlaytestMap has — see docs/architecture/components/playtest-harness.md
 * "Known limitations"), and devseed's single-room fixture has no door to
 * exercise it against.
 */

import { create } from '@bufbuild/protobuf';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { ActionTarget } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import type {
  AvailableAction,
  Entity,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EncounterMode,
  EntityType,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useState } from 'react';
import { v2PositionToV1 } from '../../api/positionConvert';
import { useEncounterStream } from '../../api/useEncounterStream';
import { useEndTurn } from '../../api/useEndTurn';
import { useMoveEntity } from '../../api/useMoveEntity';
import { useTakeAction } from '../../api/useTakeAction';
import { useCombatLog } from '../../hooks/useCombatLog';
import { useEncounterState } from '../../hooks/useEncounterState';
import { errorMessage, formatStatusBadges } from '../../utils/combatFormat';
import { protoPositionToHex } from '../../utils/hexCoord';
import { ActionMenu } from '../playtest/ActionMenu';
import { targetKindNeedsPrompt } from '../playtest/actionMenuHelpers';
import { EconomyBar } from '../playtest/EconomyBar';
import { CombatLog } from './CombatLog';
import { EncounterMap } from './EncounterMap';
import { PromptModal } from './PromptModal';

const ATTACK_ACTION_REF = {
  module: 'dnd5e',
  type: 'action',
  id: 'attack',
} as const;

const MODE_LABEL: Record<EncounterMode, string> = {
  [EncounterMode.UNSPECIFIED]: 'UNSPECIFIED',
  [EncounterMode.FREE_ROAM]: 'FREE_ROAM',
  [EncounterMode.TURN_BASED]: 'TURN_BASED',
};

export interface EncounterViewProps {
  encounterId: string;
  /**
   * The character bound at lobby create/join — the entity id in this
   * encounter. Optional: resume-after-refresh (#444) reaches this component
   * with only encounterId + playerId (GetMyActiveLobby's response carries
   * neither the resuming player's characterId nor a lobby roster to look
   * one up from — the lobby record itself is a dead husk once STARTED, see
   * rpg-api's lobbyrepo.Status). When omitted, entityId is resolved from
   * the stream's own first snapshot instead — see resolveMyEntityId below.
   */
  characterId?: string;
  /** The authenticated player id — carried on the stream request for viewer identity. */
  playerId: string;
  onBack: () => void;
}

/**
 * resolveMyEntityId scans a SnapshotDelivered event's entities for the one
 * CharacterData entity whose player_id matches playerId — the same
 * ownership binding StartEncounter's AddPlayer set up server-side
 * (rpg-api's lobby orchestrator), just read back from the wire instead of
 * threaded down as a prop. Returns undefined if no match is found (e.g. the
 * snapshot hasn't arrived yet, or this player has no character in this
 * encounter).
 */
function resolveMyEntityId(
  entities: Entity[],
  playerId: string
): string | undefined {
  const match = entities.find(
    (entity) =>
      entity.type === EntityType.CHARACTER &&
      entity.data?.case === 'character' &&
      entity.data.value.playerId === playerId
  );
  return match?.id;
}

export function EncounterView({
  encounterId,
  characterId,
  playerId,
  onBack,
}: EncounterViewProps) {
  const [resolvedEntityId, setResolvedEntityId] = useState<string | null>(null);
  const entityId = characterId ?? resolvedEntityId ?? '';
  const encounterState = useEncounterState();
  // #445: game-grade combat narrative — the same dispatched events, rendered
  // as a scrolling log instead of PlaytestHarness's raw dev-log text.
  const combatLog = useCombatLog();
  // Set by clicking any entity on the map — feeds SINGLE_ENTITY-targeted
  // menu actions (e.g. a spell chosen after the player clicks its target).
  // Clicking a monster additionally fires an immediate basic attack, the
  // same primary-loop shortcut PlaytestMap's VisualAttack click gives the
  // harness.
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const { moveEntity, error: moveError } = useMoveEntity();
  const {
    takeAction,
    loading: takeActionLoading,
    error: takeActionError,
  } = useTakeAction();
  const {
    endTurn,
    loading: endTurnLoading,
    error: endTurnError,
  } = useEndTurn();

  const stream = useEncounterStream(encounterId, playerId, {
    onSnapshotDelivered: (e) => {
      if (e.encounter) {
        // Resume-after-refresh (#444): when no characterId prop was
        // supplied, this is the only place entityId can be learned — see
        // resolveMyEntityId's doc comment.
        if (!characterId) {
          const resolved = resolveMyEntityId(
            e.encounter.space?.entities ?? [],
            playerId
          );
          if (resolved) {
            setResolvedEntityId(resolved);
          }
        }
        encounterState.applySnapshotTurnState(
          e.encounter.mode,
          e.encounter.turnState
        );
        const entityEntries = (e.encounter.space?.entities ?? [])
          .filter((entity) => entity.position !== undefined)
          .map((entity) => ({
            entity: create(EntityStateSchema, {
              entityId: entity.id,
              position: v2PositionToV1(entity.position!),
            }),
            type: entity.type,
            monsterRefId:
              entity.data?.case === 'monster'
                ? entity.data.value.monsterRef?.id
                : undefined,
            initialHP: entity.hp
              ? { current: entity.hp.current, max: entity.hp.max }
              : undefined,
            initialAC: entity.armorClass,
          }));
        if (entityEntries.length > 0) {
          encounterState.applyEntityAppearedBatch(entityEntries);
        }
        const walls = e.encounter.space?.walls ?? [];
        if (walls.length > 0) {
          encounterState.applyWallsRevealed(walls);
        }
      }
    },
    onEntityMoved: (e) => {
      const last = e.actualPath[e.actualPath.length - 1];
      if (last) {
        encounterState.applyEntityPositionUpdate(
          e.entityId,
          v2PositionToV1(last)
        );
      }
    },
    onGeometryRevealed: (e) => {
      const positions = e.hexes
        .map((h) => h.position)
        .filter((p): p is NonNullable<typeof p> => p !== undefined);
      encounterState.applyHexRevealed(positions.map(protoPositionToHex));
      const walls = e.walls ?? [];
      if (walls.length > 0) {
        encounterState.applyWallsRevealed(walls);
      }
    },
    onEntityAppeared: (e) => {
      if (!e.entity || !e.entity.position) return;
      const stub = create(EntityStateSchema, {
        entityId: e.entity.id,
        position: v2PositionToV1(e.entity.position),
      });
      encounterState.applyEntityAppeared(stub);
      const monsterRefId =
        e.entity.data?.case === 'monster'
          ? e.entity.data.value.monsterRef?.id
          : undefined;
      const initialHP = e.entity.hp
        ? { current: e.entity.hp.current, max: e.entity.hp.max }
        : undefined;
      encounterState.applyEntityMeta(
        e.entity.id,
        e.entity.type,
        monsterRefId,
        initialHP,
        e.entity.armorClass
      );
    },
    onEntityDisappeared: (e) => {
      if (e.lastKnownPosition) {
        encounterState.applyEntityDisappeared(
          e.entityId,
          protoPositionToHex(e.lastKnownPosition)
        );
      }
    },
    onEntityDamaged: (e) => {
      encounterState.applyEntityDamaged(e);
      combatLog.recordEntityDamaged(e);
    },
    onStatusApplied: (e) => {
      encounterState.applyStatusApplied(e);
      combatLog.recordStatusApplied(e);
    },
    onStatusRemoved: (e) => {
      encounterState.applyStatusRemoved(e);
      combatLog.recordStatusRemoved(e);
    },
    onModeChanged: (e) => {
      encounterState.applyModeChanged(e);
    },
    onInitiativeRolled: (e) => {
      encounterState.applyInitiativeRolled(e);
    },
    onTurnStarted: (e) => {
      encounterState.applyTurnStarted(e);
      combatLog.recordTurnStarted(e);
    },
    onTurnEnded: (e) => {
      encounterState.applyTurnEnded();
      combatLog.recordTurnEnded(e);
    },
    onTurnStateChanged: (e) => {
      encounterState.applyTurnStateChanged(e.turnState);
    },
    // TakeAction wave (#426 / #594): per-attack roll detail. Fires on a MISS
    // too (hit=false) — rendered as-is in the combat log so a whiff isn't
    // silent. Damage rides the correlated EntityDamaged above.
    onAttackResolved: (e) => {
      combatLog.recordAttackResolved(e);
    },
    onEntityDied: (e) => {
      encounterState.applyEntityDied(e);
      combatLog.recordEntityDied(e);
    },
    onEntityRemoved: (e) => {
      encounterState.applyEntityRemoved(e);
      combatLog.recordEntityRemoved(e);
    },
    onEncounterEnded: (e) => {
      encounterState.applyEncounterEnded(e);
      combatLog.recordEncounterEnded(e);
    },
    onInputRequiredDelivered: (e) => {
      if (!e.inputRequired) return;
      encounterState.setPendingPrompt(e.inputRequired);
    },
  });

  const myPosition = encounterState.state.entities.get(entityId)?.position;
  const myHP = encounterState.state.entityHP.get(entityId);
  const myStatuses = encounterState.state.entityStatuses.get(entityId) ?? [];
  const encounterEnded = encounterState.state.encounterStatus === 'ended';
  const isMyTurn =
    encounterState.state.mode === EncounterMode.TURN_BASED &&
    encounterState.state.activeEntityId === entityId;
  const combatEnabled =
    !encounterEnded &&
    encounterState.state.mode === EncounterMode.TURN_BASED &&
    isMyTurn;

  const turnState = encounterState.state.turnState;
  const availableActions = turnState?.availableActions ?? [];
  const economy = turnState?.economy ?? null;

  const dispatchAction = async (
    actionRef: { module: string; type: string; id: string },
    target: ActionTarget | undefined
  ) => {
    // Resume-after-refresh (#444): entityId is '' until self-resolution
    // completes (see resolveMyEntityId above). Never send an RPC with an
    // empty actor id — a fast click in that window would otherwise reach
    // the server as a real, malformed request (Copilot review on #461).
    if (!entityId) return;
    try {
      await takeAction({
        encounterId,
        actorEntityId: entityId,
        actionRef,
        target: target ?? ({ kind: { case: undefined } } as ActionTarget),
      });
    } catch {
      // error surfaced via takeActionError below
    }
  };

  // TakeAction wave (#426): the server-menu drives what's dispatchable — the
  // web reads target_kind off the menu entry (the server's verdict) and
  // raises a target prompt only when required. Mirrors
  // PlaytestHarness.handleSelectAction (design.md: "Already shared or
  // generic" pattern), adapted for this view's targeting source: the
  // harness reads a dev-panel target-id input, this view reads the map's
  // click-to-select state (selectedTargetId) instead.
  const handleSelectAction = async (action: AvailableAction) => {
    if (!action.ref) return;
    if (targetKindNeedsPrompt(action.targetKind)) {
      if (action.targetKind === TargetKind.SINGLE_ENTITY && selectedTargetId) {
        await dispatchAction(action.ref, {
          kind: { case: 'entityId', value: selectedTargetId },
        } as unknown as ActionTarget);
      }
      // POSITION / AREA, and SINGLE_ENTITY with nothing selected yet: no-op.
      // No L1 action needs POSITION/AREA (matches the harness's current
      // scope); SINGLE_ENTITY needs the player to click a target first.
      return;
    }
    if (action.targetKind === TargetKind.SELF) {
      await dispatchAction(action.ref, {
        kind: { case: 'self', value: {} },
      } as unknown as ActionTarget);
      return;
    }
    await dispatchAction(action.ref, undefined);
  };

  const handleVisualMove = async (
    path: Array<{ x: number; y: number; z: number }>
  ) => {
    if (!entityId || encounterEnded || path.length === 0) return;
    try {
      await moveEntity(encounterId, entityId, path);
    } catch {
      // error surfaced via moveError below
    }
  };

  const handleVisualEntityClick = (targetId: string) => {
    if (targetId === entityId) return;
    setSelectedTargetId(targetId);
    if (!entityId || encounterEnded) return;
    const targetMeta = encounterState.state.entityMeta.get(targetId);
    const isMonster = targetMeta?.type === EntityType.MONSTER;
    if (!isMonster) return;
    void dispatchAction(ATTACK_ACTION_REF, {
      kind: { case: 'entityId', value: targetId },
    } as unknown as ActionTarget);
  };

  const handleEndTurn = async () => {
    // combatEnabled already can't be true while entityId is unresolved
    // (isMyTurn compares activeEntityId against entityId, and a real
    // activeEntityId never equals ''), but guard explicitly rather than
    // relying on that indirection — every RPC dispatch path checks
    // entityId directly (Copilot review on #461).
    if (!entityId) return;
    try {
      await endTurn(encounterId, entityId);
    } catch {
      // error surfaced via endTurnError below
    }
  };

  return (
    <div
      data-testid="encounter-view"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div
        data-testid="encounter-header"
        className="flex flex-wrap items-center gap-4 rounded-lg px-4 py-2"
        style={{ background: 'var(--bg-secondary, #1a1a1a)' }}
      >
        <span>
          mode: <strong>{MODE_LABEL[encounterState.state.mode]}</strong>
        </span>
        <span>
          round: <strong>{encounterState.state.round}</strong>
        </span>
        <span>
          active:{' '}
          <strong>{encounterState.state.activeEntityId || '(none)'}</strong>
        </span>
        <span>
          HP: <strong>{myHP ? `${myHP.current}/${myHP.max}` : '—'}</strong>
        </span>
        {myStatuses.length > 0 && (
          <span data-testid="my-status-badges">
            {formatStatusBadges(myStatuses)}
          </span>
        )}
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 12 }}>
          {stream.connectionState}
        </span>
        <button onClick={onBack} style={{ fontSize: 12 }}>
          Leave
        </button>
      </div>

      {encounterEnded && (
        <div
          data-testid="encounter-ended-banner"
          className="rounded-lg px-4 py-3 font-bold"
          style={{ background: '#2a1a00', color: '#ffcc66' }}
        >
          Encounter ended
          {encounterState.state.encounterEndedReason
            ? `: ${encounterState.state.encounterEndedReason}`
            : ''}
        </div>
      )}

      <PromptModal
        encounterId={encounterId}
        entityId={entityId}
        prompt={encounterState.state.pendingPrompt}
        onDismiss={() => encounterState.setPendingPrompt(null)}
      />

      <div style={{ height: 480 }}>
        <EncounterMap
          entities={encounterState.state.entities}
          entityMeta={encounterState.state.entityMeta}
          revealedHexes={encounterState.state.revealedHexes}
          walls={encounterState.state.walls}
          entityHP={encounterState.state.entityHP}
          // Gate by mode: applyModeChanged only flips `mode`, it doesn't
          // clear initiativeOrder/activeEntityId (only the next snapshot's
          // applySnapshotTurnState does that) — without this gate a
          // ModeChanged away from TURN_BASED could leave the turn-order
          // overlay showing stale initiative data until the next snapshot.
          initiativeOrder={
            encounterState.state.mode === EncounterMode.TURN_BASED
              ? encounterState.state.initiativeOrder
              : []
          }
          activeEntityId={
            encounterState.state.mode === EncounterMode.TURN_BASED
              ? encounterState.state.activeEntityId
              : ''
          }
          round={encounterState.state.round}
          myEntityId={entityId}
          isMyTurn={
            encounterState.state.mode === EncounterMode.TURN_BASED
              ? isMyTurn
              : true
          }
          onMove={(path) => void handleVisualMove(path)}
          onEntityClick={handleVisualEntityClick}
        />
      </div>

      {!myPosition && (
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Waiting for your position…
        </div>
      )}

      <CombatLog entries={combatLog.entries} />

      <EconomyBar economy={economy} />
      <ActionMenu
        actions={availableActions}
        enabled={combatEnabled}
        loading={takeActionLoading}
        onSelectAction={(a) => void handleSelectAction(a)}
      />
      <div>
        <button
          onClick={() => void handleEndTurn()}
          disabled={!combatEnabled || endTurnLoading}
        >
          {endTurnLoading ? 'Ending…' : 'End turn'}
        </button>
      </div>

      {moveError && (
        <div style={{ color: '#f88', fontSize: 12 }}>
          Move error: {errorMessage(moveError)}
        </div>
      )}
      {takeActionError && (
        <div style={{ color: '#f88', fontSize: 12 }}>
          Action error: {errorMessage(takeActionError)}
        </div>
      )}
      {endTurnError && (
        <div style={{ color: '#f88', fontSize: 12 }}>
          End turn error: {errorMessage(endTurnError)}
        </div>
      )}
    </div>
  );
}
