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
 * Multi-chamber dungeons + door interaction landed in rpg-dnd5e-web#526
 * (The Dungeon wave 2 Slice 2, rpg-project#96): DOOR_*-kind `Wall`s now
 * carry `Wall.id` (rpg-api-protos#186), so a door click resolves directly
 * off `walls` — no separate DoorInfo[] list needed (design doc §Q2, "the
 * DOOR-kind walls already ARE the door list once they carry ids").
 * handleDoorClick below fires `useInteract`'s `Interact(encounterId,
 * doorId, 'open')`; the world-changing effects (open/reveal, or a
 * skill-check prompt for a locked door) flow back as DoorOpened/
 * GeometryRevealed/InputRequiredDelivered events, same as every other verb
 * on this stream. onDoorOpened also flips the matching wall's own kind to
 * DOOR_OPEN in useEncounterState (see applyDoorOpened) so the pose updates
 * immediately, without waiting on a walls-bearing GeometryRevealed.
 */

import { create } from '@bufbuild/protobuf';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { ActionTarget } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import type {
  AvailableAction,
  CharacterData,
  Entity,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EncounterMode,
  EntityType,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { v2PositionToV1 } from '../../api/positionConvert';
import { useEncounterStream } from '../../api/useEncounterStream';
import { useEndTurn } from '../../api/useEndTurn';
import { useEquipItem } from '../../api/useEquipItem';
import { useInteract } from '../../api/useInteract';
import { useMoveEntity } from '../../api/useMoveEntity';
import { useSetReactionReady } from '../../api/useSetReactionReady';
import { useTakeAction } from '../../api/useTakeAction';
import { useUnequipItem } from '../../api/useUnequipItem';
import { useCombatLog } from '../../hooks/useCombatLog';
import type { CharacterEquipment } from '../../hooks/useEncounterState';
import { useEncounterState } from '../../hooks/useEncounterState';
import { errorMessage } from '../../utils/combatFormat';
import { protoPositionToHex } from '../../utils/hexCoord';
import {
  actionKey,
  targetKindNeedsPrompt,
} from '../playtest/actionMenuHelpers';
import { StatusBadgeList } from '../ui/StatusBadgeList';
import { EncounterDock } from './EncounterDock';
import { resolveMovementRemaining, resolveName } from './encounterDockHelpers';
import { EncounterMap } from './EncounterMap';
import type { EquipIntent } from './equipment/equipmentTypes';
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

/**
 * characterEquipmentFrom projects a CharacterData's equipment-facing fields
 * (rpg-dnd5e-web#571) into the local CharacterEquipment shape. The proto
 * fields (Ref/SlotDef/Item/ArmorClassDisplay) are already structurally
 * identical to equipmentTypes.ts's RefLike/SlotDefLike/ItemLike shapes —
 * this is a projection, not a conversion: every field is passed through
 * verbatim, nothing computed. Returns undefined when the entity carries no
 * CharacterData (used both at snapshot/appear time, keyed on `entity.data`,
 * and at RPC-response time, keyed on the response's own `character` field).
 *
 * Defensive on `equipped`/`inventory`/`slots` being absent: a real
 * create()-constructed CharacterData always carries these as their proto
 * zero-value ({}/[]/[]`), but callers building a CharacterData by hand
 * (older/partial fixtures, a future server response that only sets some
 * fields) may omit them — this degrades to "no equipment data" for those
 * fields rather than throwing, matching applyWallsRevealed's guard style
 * for optional wire fields elsewhere in this codebase.
 */
function characterEquipmentFrom(
  data: CharacterData | undefined
): CharacterEquipment | undefined {
  if (!data) return undefined;
  return {
    equipped: data.equipped ?? {},
    // Item.ref is optional on the wire (proto3 sub-message field); ItemLike
    // requires it (every rendered row needs an id to key/look up by).
    // Filtering a ref-less entry is defensive only — no real server
    // response omits it — matching the guard style applyWallsRevealed uses
    // for Wall.from/to above.
    inventory: (data.inventory ?? []).filter(
      (item): item is typeof item & { ref: NonNullable<typeof item.ref> } =>
        item.ref !== undefined
    ),
    slots: data.slots ?? [],
    armorClassDetail: data.armorClassDetail
      ? { total: data.armorClassDetail.total, note: data.armorClassDetail.note }
      : undefined,
    mainHandDamage: data.mainHandDamage ?? '',
  };
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
  // rpg-dnd5e-web#511: the action-selection interaction state. Set by
  // clicking a SINGLE_ENTITY/POSITION/AREA-targeted menu action ("arming"
  // it) — survives exploratory clicks (hover/inspect/camera, an empty-hex
  // move click) and is only cleared by a SUCCESSFUL resolving dispatch or
  // an explicit cancel (Escape, or re-clicking the same armed action). A
  // failed dispatch (server rejects the target) leaves it armed so the
  // player can retry against a different target without re-opening the
  // menu — the existing takeActionError banner below is the "invalid
  // target" feedback, not a silent disarm. Clicking a monster while
  // NOTHING is armed keeps the pre-existing immediate-basic-attack
  // shortcut (the same primary-loop convenience PlaytestMap's VisualAttack
  // click gives the harness) — an explicitly armed action always takes
  // priority over that shortcut once one exists.
  // rpg-dnd5e-web#544: the armed action is pinned to the turn it was armed
  // under (turnKey = round + active entity, captured at arm time). The
  // usable `armedAction` is DERIVED below and goes null the moment the turn
  // key changes, so it can't leak across a turn handover.
  const [armedState, setArmedState] = useState<{
    action: AvailableAction;
    turnKey: string;
  } | null>(null);
  // rpg-dnd5e-web#511's other explicit-cancel affordance (alongside
  // re-clicking the armed button in handleSelectAction). Scoped to this
  // view's lifetime; a no-op when nothing is armed.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmedState(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
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
  // rpg-dnd5e-web#432 harness-parity: PlaytestHarness has had a
  // reaction-readiness panel (OA + Shield toggles) since Wave 2.11d;
  // EncounterView never wired one, so a real player could never arm a
  // reaction outside the harness. Same optimistic-mirror wiring as
  // PlaytestHarness.handleToggleReactionReady below.
  const {
    setReactionReady,
    loading: setReactionReadyLoading,
    error: setReactionReadyError,
  } = useSetReactionReady();
  // rpg-dnd5e-web#526 (wave rpg-project#96 Slice 2): the door click ->
  // Interact bridge. World-changing effects (open/reveal, or a skill-check
  // prompt for a locked door) flow back as events on the stream below, not
  // in this RPC's response.
  const { interact, error: interactError } = useInteract();
  // rpg-dnd5e-web#571: character-scoped equip surface. Character-scoped, out
  // of combat (protos#187), so these calls are never gated on isMyTurn/mode
  // — unlike takeAction/moveEntity/endTurn above.
  const {
    equipItem,
    loading: equipItemLoading,
    error: equipItemError,
  } = useEquipItem();
  const {
    unequipItem,
    loading: unequipItemLoading,
    error: unequipItemError,
  } = useUnequipItem();

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
        encounterState.applySnapshotRegionState(
          e.encounter.space?.theme ?? '',
          e.encounter.space?.zones ?? [],
          e.encounter.space?.hexes ?? []
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
            // #462: hydrate condition badges from the snapshot — without
            // this, entityStatuses is only ever populated by the live
            // onStatusApplied handler below, so a condition already active
            // before this connect never shows on reconnect.
            statusEffects: entity.statusEffects,
            // Encounter dock identity block (rpg-dnd5e-web#491): every
            // Entity carries display_name; only CHARACTER entities carry a
            // class_ref.
            displayName: entity.displayName,
            classRefId:
              entity.data?.case === 'character'
                ? entity.data.value.classRef?.id
                : undefined,
            // rpg-dnd5e-web#528 (charter #523): OBSTACLE/PROP entities
            // carry a Ref (obstacle_ref / prop_ref) whose `id` is the
            // semantic prop name (e.g. "barrel") — composed into a
            // dnd5e:props:<id> reference key by obstaclePropKeys.ts. No
            // real server code path sets either ref yet (verified against
            // rpg-api main), so this is always undefined today; wired now
            // so the resolver activates the moment platform starts
            // sending one, per #523.
            propRefId:
              entity.data?.case === 'obstacle'
                ? entity.data.value.obstacleRef?.id
                : entity.data?.case === 'prop'
                  ? entity.data.value.propRef?.id
                  : undefined,
            // rpg-dnd5e-web#571: equipment/inventory ride the same
            // CharacterData the snapshot already hydrates (rpg-api#682
            // composes it) — no separate fetch on popover open.
            equipment:
              entity.data?.case === 'character'
                ? characterEquipmentFrom(entity.data.value)
                : undefined,
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
        // rpg-dnd5e-web#542: pass the WHOLE actualPath (not just its last
        // element) so HexEntity can step through the real hex-by-hex route
        // instead of teleporting straight to the destination. actualPath is
        // real, backend-populated per-viewer-visible route data (confirmed
        // directly against rpg-api's translateMoveEvent), not a stub.
        encounterState.applyEntityPositionUpdate(
          e.entityId,
          v2PositionToV1(last),
          e.actualPath.map(v2PositionToV1)
        );
      }
    },
    onGeometryRevealed: (e) => {
      encounterState.applyHexesRevealed(e.hexes);
      const walls = e.walls ?? [];
      if (walls.length > 0) {
        encounterState.applyWallsRevealed(walls);
      }
    },
    // Cause/effect split (mirrors PlaytestHarness): DoorOpened only carries
    // the door identity — the newly-visible geometry rides the parallel
    // GeometryRevealed above. State-only for now: HexGrid's door-click
    // surface still needs a v2-shaped DoorInfo[] (see this file's top
    // comment) — tracked separately, not this slice.
    onDoorOpened: (e) => {
      encounterState.applyDoorOpened(e.doorEntityId);
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
      const classRefId =
        e.entity.data?.case === 'character'
          ? e.entity.data.value.classRef?.id
          : undefined;
      // See the matching onSnapshotDelivered comment above — same
      // obstacle_ref/prop_ref -> propRefId derivation for the live
      // (non-snapshot) appearance path.
      const propRefId =
        e.entity.data?.case === 'obstacle'
          ? e.entity.data.value.obstacleRef?.id
          : e.entity.data?.case === 'prop'
            ? e.entity.data.value.propRef?.id
            : undefined;
      encounterState.applyEntityMeta(
        e.entity.id,
        e.entity.type,
        monsterRefId,
        initialHP,
        e.entity.armorClass,
        e.entity.displayName,
        classRefId,
        propRefId,
        e.entity.data?.case === 'character'
          ? characterEquipmentFrom(e.entity.data.value)
          : undefined
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
      // rpg-dnd5e-web#544: event-level disarm. Derived/effect-based guards
      // can be defeated by a batched round-trip (mode or turn leaves and
      // returns within one commit, so no intermediate state ever renders);
      // the stream handler sees EVERY event, batched or not.
      if (e.to !== EncounterMode.TURN_BASED) setArmedState(null);
    },
    onInitiativeRolled: (e) => {
      encounterState.applyInitiativeRolled(e);
    },
    onTurnStarted: (e) => {
      encounterState.applyTurnStarted(e);
      combatLog.recordTurnStarted(e);
      // rpg-dnd5e-web#544: any turn start that isn't the armed action's own
      // turn disarms — including your NEXT turn (new round = new turn; the
      // turnKey derivation below catches that case synchronously too).
      if (e.entityId !== entityId) setArmedState(null);
    },
    onTurnEnded: (e) => {
      encounterState.applyTurnEnded();
      combatLog.recordTurnEnded(e);
    },
    onTurnStateChanged: (e) => {
      encounterState.applyTurnStateChanged(e.turnState);
    },
    // TakeAction wave (#426): umbrella resolution beat for any action. The
    // roll/hit/miss detail rides the correlated AttackResolved below;
    // damage rides EntityDamaged above.
    onActionResolved: (e) => {
      combatLog.recordActionResolved(e);
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
      // rpg-dnd5e-web#544: an ended encounter has no turns to be armed in.
      setArmedState(null);
    },
    // Death-save arc (rpg-toolkit#742, wave KirkDiggler/rpg-project#75):
    // PlaytestHarness has logged these since that wave landed; EncounterView
    // never wired them (rpg-dnd5e-web#432 harness-parity, wave web#471).
    // No new state layer needed — like every other combat-log entry, this
    // renders the raw proto event verbatim, nothing recomputed.
    onDeathSaveRolled: (e) => {
      combatLog.recordDeathSaveRolled(e);
    },
    onEntityStabilized: (e) => {
      combatLog.recordEntityStabilized(e);
    },
    onInputRequiredDelivered: (e) => {
      if (!e.inputRequired) return;
      encounterState.setPendingPrompt(e.inputRequired);
    },
  });

  const myPosition = encounterState.state.entities.get(entityId)?.position;
  const myHP = encounterState.state.entityHP.get(entityId);
  const myAC = encounterState.state.entityAC.get(entityId);
  const myMeta = encounterState.state.entityMeta.get(entityId);
  const myEquipment = encounterState.state.characterEquipment.get(entityId);
  const myStatuses = encounterState.state.entityStatuses.get(entityId) ?? [];
  const encounterEnded = encounterState.state.encounterStatus === 'ended';
  const isMyTurn =
    encounterState.state.mode === EncounterMode.TURN_BASED &&
    encounterState.state.activeEntityId === entityId;
  const combatEnabled =
    !encounterEnded &&
    encounterState.state.mode === EncounterMode.TURN_BASED &&
    isMyTurn;

  // rpg-dnd5e-web#544: an armed action belongs to ONE turn. The live repro
  // showed why an effect on `combatEnabled` alone (the #511/#514-era guard)
  // is not enough: END TURN → instant NPC turns → your next turn can all
  // land in one batched commit, so the boolean round-trips true→true and
  // the effect never fires. turnKey (round + active entity) can't round-
  // trip — a new turn is a new key even when it's yours again. The derived
  // value goes null SYNCHRONOUSLY on any handover/mode-exit/end (no stale
  // paint, and click handlers can never dispatch a stale armed action);
  // the effect then garbage-collects the state. Stray clicks never change
  // turnKey, preserving #511's armed-survives-exploration guarantee, and a
  // rejected dispatch leaves the state untouched.
  const currentTurnKey = `${encounterState.state.round}:${
    encounterState.state.activeEntityId ?? ''
  }`;
  const armedAction =
    armedState && armedState.turnKey === currentTurnKey && combatEnabled
      ? armedState.action
      : null;
  useEffect(() => {
    if (armedState && (armedState.turnKey !== currentTurnKey || !combatEnabled))
      setArmedState(null);
  }, [armedState, currentTurnKey, combatEnabled]);

  const turnState = encounterState.state.turnState;
  const availableActions = turnState?.availableActions ?? [];
  const economy = turnState?.economy ?? null;

  // Returns whether the dispatch succeeded — rpg-dnd5e-web#511's armed-
  // action state clears only on a successful dispatch (a rejected target
  // leaves the action armed so the player can retry against a different
  // target instead of losing their selection to a server-side rejection;
  // the existing takeActionError banner below is the "invalid target"
  // feedback for that case).
  const dispatchAction = async (
    actionRef: { module: string; type: string; id: string },
    target: ActionTarget | undefined
  ): Promise<boolean> => {
    // Resume-after-refresh (#444): entityId is '' until self-resolution
    // completes (see resolveMyEntityId above). Never send an RPC with an
    // empty actor id — a fast click in that window would otherwise reach
    // the server as a real, malformed request (Copilot review on #461).
    if (!entityId) return false;
    try {
      await takeAction({
        encounterId,
        actorEntityId: entityId,
        actionRef,
        target: target ?? ({ kind: { case: undefined } } as ActionTarget),
      });
      return true;
    } catch {
      // error surfaced via takeActionError below
      return false;
    }
  };

  // TakeAction wave (#426): the server-menu drives what's dispatchable — the
  // web reads target_kind off the menu entry (the server's verdict) and
  // raises a target prompt only when required. rpg-dnd5e-web#511: a
  // SINGLE_ENTITY/POSITION/AREA action ARMS instead of requiring a
  // pre-existing click-to-select target — the next qualifying map click
  // resolves it (handleVisualEntityClick below), and it survives clicks
  // that don't resolve it. Re-clicking the already-armed action cancels it
  // (an explicit toggle-off, one of #511's two cancel affordances — Escape
  // is the other, wired via the keydown effect below).
  const handleSelectAction = async (action: AvailableAction) => {
    if (!action.ref) return;
    if (
      armedAction &&
      action.ref &&
      actionKey(action) === actionKey(armedAction)
    ) {
      setArmedState(null);
      return;
    }
    if (targetKindNeedsPrompt(action.targetKind)) {
      // POSITION / AREA: no L1 action needs them yet (matches the harness's
      // current scope) — arming them is forward-compatible with whatever a
      // future targeting UI does with `armedAction.targetKind`, not
      // exercised by real data today.
      setArmedState({ action, turnKey: currentTurnKey });
      return;
    }
    if (action.targetKind === TargetKind.SELF) {
      setArmedState(null);
      await dispatchAction(action.ref, {
        kind: { case: 'self', value: {} },
      } as unknown as ActionTarget);
      return;
    }
    setArmedState(null);
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

  // rpg-dnd5e-web#511: an entity click's meaning depends on whether an
  // action is armed. Armed + SINGLE_ENTITY → this click is the resolving
  // click for THAT action, against whatever entity (or self) was clicked;
  // the server is the only legality judge (ally vs. enemy, range, etc. —
  // none of that is decided here). Armed + POSITION/AREA (Copilot review on
  // #514: no L1 action uses these yet, but the code shouldn't silently
  // mis-dispatch if one ever does) → an entityId target is the wrong shape
  // for those kinds, so this click is a no-op and the action stays armed —
  // real POSITION/AREA resolution needs its own targeting UI, not built
  // here. Nothing armed → preserve the pre-existing "click a monster =
  // immediate basic attack" shortcut; any other click is a no-op (matches
  // the harness's identical primary-loop convenience).
  const handleVisualEntityClick = (targetId: string) => {
    if (!entityId || encounterEnded) return;
    if (armedAction?.ref) {
      if (armedAction.targetKind === TargetKind.SINGLE_ENTITY) {
        const armedRef = armedAction.ref;
        void dispatchAction(armedRef, {
          kind: { case: 'entityId', value: targetId },
        } as unknown as ActionTarget).then((succeeded) => {
          if (succeeded) setArmedState(null);
          // Rejected (e.g. illegal target): stay armed, takeActionError
          // below is the feedback — never a silent disarm.
        });
      }
      return;
    }
    if (targetId === entityId) return;
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

  // Mirrors PlaytestHarness.handleToggleReactionReady: server is source of
  // truth, but the RPC response carries no state to read back, so a
  // successful call optimistically mirrors the toggle into
  // state.reactionReadiness (setReactionReadyLocal) rather than waiting on
  // a stream snapshot that doesn't carry this map today (rpg-api-protos#158).
  const handleToggleReactionReady = async (
    reactionRef: { module: string; type: string; id: string },
    ready: boolean
  ) => {
    if (!entityId) return;
    try {
      await setReactionReady({
        encounterId,
        characterId: entityId,
        reactionRef,
        ready,
      });
      const refStr = `${reactionRef.module}:${reactionRef.type}:${reactionRef.id}`;
      encounterState.setReactionReadyLocal(entityId, refStr, ready);
    } catch {
      // error surfaced via setReactionReadyError below
    }
  };

  // rpg-dnd5e-web#526 (wave rpg-project#96 Slice 2): door click -> Interact
  // bridge. The server decides what happens — open, or (a locked door,
  // Slice 3) a skill-check prompt via InputRequiredDelivered — so this
  // handler computes nothing and gates on nothing; it only forwards the
  // click intent (matches PlaytestHarness's identical
  // `interact(encounterId, id, 'open')` call).
  const handleDoorClick = async (doorId: string) => {
    try {
      await interact(encounterId, doorId, 'open');
    } catch {
      // error surfaced via interactError below
    }
  };

  // rpg-dnd5e-web#571: equip/unequip intent -> the real v1alpha2
  // CharacterService RPCs. Character-scoped (out of combat), so this
  // never checks isMyTurn/combatEnabled — unlike every other dispatch
  // above. The response carries the full recomputed CharacterData; there
  // is no stream push for this RPC's effect (rpg-api#681 tracks live push
  // to OTHER clients), so the acting client mirrors its own response via
  // applyCharacterEquipment (also refreshes entityAC — see its doc comment).
  const handleEquipIntent = async (intent: EquipIntent) => {
    if (!entityId) return;
    try {
      const response =
        intent.kind === 'EquipItem'
          ? await equipItem({
              characterId: entityId,
              item: intent.ref,
              slotKey: intent.slotKey,
            })
          : await unequipItem({
              characterId: entityId,
              slotKey: intent.slotKey,
            });
      const equipment = characterEquipmentFrom(response.character);
      if (equipment) {
        encounterState.applyCharacterEquipment(entityId, equipment);
      }
    } catch {
      // error surfaced via equipItemError/unequipItemError below
    }
  };

  // Portaled straight to document.body, position:fixed inset:0 (rpg-dnd5e-web
  // #491): App.tsx's shared shell wraps every non-character-sheet view in
  // `max-w-7xl mx-auto p-8`, which the lobby's centered-card layout wants but
  // a live encounter doesn't — that padding/width-cap was fighting "map fills
  // the viewport" as much as the old `height: 480` div was. Escaping via
  // portal (rather than threading a per-view padding exception up through
  // App.tsx's shared className logic) mirrors the pre-clean-slate
  // ActionPanelV2's proven fix for the exact same class of problem, and
  // keeps this self-contained to the one view that needs it.
  const anyError =
    moveError ||
    takeActionError ||
    endTurnError ||
    setReactionReadyError ||
    interactError ||
    equipItemError ||
    unequipItemError;

  return createPortal(
    <div
      data-testid="encounter-view"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #0a0a0a)',
      }}
    >
      <div
        data-testid="encounter-header"
        className="flex flex-wrap items-center gap-4 rounded-lg px-4 py-2"
        style={{ background: 'var(--bg-secondary, #1a1a1a)', flexShrink: 0 }}
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
            <StatusBadgeList statuses={myStatuses} />
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
          style={{ background: '#2a1a00', color: '#ffcc66', flexShrink: 0 }}
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

      {/* Map fills whatever the header/banner/dock don't take — this
          `flex: 1, minHeight: 0` (not a fixed pixel height) is the actual
          "maximize to fill the viewport" fix; EncounterMap itself already
          renders at width/height 100% of its container. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <EncounterMap
          entities={encounterState.state.entities}
          entityMeta={encounterState.state.entityMeta}
          revealedHexes={encounterState.state.revealedHexKeys}
          walls={encounterState.state.walls}
          entityHP={encounterState.state.entityHP}
          entityStatuses={encounterState.state.entityStatuses}
          theme={encounterState.state.theme}
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
          movementRemaining={resolveMovementRemaining(
            encounterState.state.mode,
            economy
          )}
          openDoorIds={Array.from(encounterState.state.openDoors)}
          onMove={(path) => void handleVisualMove(path)}
          onEntityClick={handleVisualEntityClick}
          onDoorClick={(doorId) => void handleDoorClick(doorId)}
        />

        {!myPosition && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              fontSize: 12,
              opacity: 0.6,
              background: 'rgba(0,0,0,0.5)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            Waiting for your position…
          </div>
        )}

        {anyError && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {moveError && (
              <div
                style={{
                  color: '#f88',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                Move error: {errorMessage(moveError)}
              </div>
            )}
            {takeActionError && (
              <div
                style={{
                  color: '#f88',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                Action error: {errorMessage(takeActionError)}
              </div>
            )}
            {endTurnError && (
              <div
                style={{
                  color: '#f88',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                End turn error: {errorMessage(endTurnError)}
              </div>
            )}
            {setReactionReadyError && (
              <div
                style={{
                  color: '#f88',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                Reaction ready error: {errorMessage(setReactionReadyError)}
              </div>
            )}
            {interactError && (
              <div
                style={{
                  color: '#f88',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                Door interaction error: {errorMessage(interactError)}
              </div>
            )}
            {(equipItemError || unequipItemError) && (
              <div
                style={{
                  color: '#f88',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                Equip error: {errorMessage(equipItemError ?? unequipItemError)}
              </div>
            )}
          </div>
        )}
      </div>

      <EncounterDock
        entityId={entityId}
        displayName={myMeta?.displayName}
        classRefId={myMeta?.classRefId}
        hp={myHP}
        ac={myAC}
        statuses={myStatuses}
        economy={economy}
        actions={availableActions}
        mode={encounterState.state.mode}
        encounterEnded={encounterEnded}
        isMyTurn={isMyTurn}
        // Spectator strip (#458): whose turn it is, resolved the same way
        // the dock resolves the local player's own name.
        activeEntityName={
          encounterState.state.mode === EncounterMode.TURN_BASED &&
          !isMyTurn &&
          encounterState.state.activeEntityId
            ? resolveName(
                encounterState.state.entityMeta.get(
                  encounterState.state.activeEntityId
                )?.displayName,
                encounterState.state.activeEntityId
              )
            : undefined
        }
        actionsEnabled={combatEnabled}
        actionsLoading={takeActionLoading}
        onSelectAction={(a) => void handleSelectAction(a)}
        armedActionKey={armedAction ? actionKey(armedAction) : undefined}
        reactionReadiness={encounterState.state.reactionReadiness.get(entityId)}
        reactionLoading={setReactionReadyLoading}
        // Copilot review #475: disable during the resume-after-refresh
        // window too (entityId still ''), not just after the encounter
        // ends — matches ActionMenu's gating. Without this, a click in
        // that window was a silent no-op (handleToggleReactionReady's own
        // `if (!entityId) return` guard fires, but nothing tells the
        // player why nothing happened).
        reactionDisabled={encounterEnded || !entityId}
        onToggleReaction={(ref, ready) =>
          void handleToggleReactionReady(ref, ready)
        }
        onEndTurn={() => void handleEndTurn()}
        endTurnDisabled={!combatEnabled || endTurnLoading}
        endTurnLoading={endTurnLoading}
        combatLogEntries={combatLog.entries}
        equipment={myEquipment}
        onEquipIntent={(intent) => void handleEquipIntent(intent)}
        equipLoading={equipItemLoading || unequipItemLoading}
      />
    </div>,
    document.body
  );
}
