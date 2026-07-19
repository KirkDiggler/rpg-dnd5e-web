import { create } from '@bufbuild/protobuf';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { ActionTarget } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EncounterMode,
  EntityType,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useRef, useState } from 'react';
import { v2PositionToV1 } from '../../api/positionConvert';
import { useActivateFeature } from '../../api/useActivateFeature';
import { useDevPlayerIdAuth } from '../../api/useDevPlayerIdAuth';
import { useEncounterStream } from '../../api/useEncounterStream';
import { useEndTurn } from '../../api/useEndTurn';
import { useInteract } from '../../api/useInteract';
import { useMoveEntity } from '../../api/useMoveEntity';
import { useSetReactionReady } from '../../api/useSetReactionReady';
import { useTakeAction } from '../../api/useTakeAction';
import { useEncounterState } from '../../hooks/useEncounterState';
import { errorMessage, formatSourceRefs } from '../../utils/combatFormat';
import { getConditionDisplay } from '../../utils/conditionIcons';
import { protoPositionToHex } from '../../utils/hexCoord';
import { PromptModal } from '../game/PromptModal';
import { StatusBadgeList } from '../ui/StatusBadgeList';
import { ActionMenu } from './ActionMenu';
import { actionKey, targetKindNeedsPrompt } from './actionMenuHelpers';
import { EconomyBar } from './EconomyBar';
import { PlaytestMap } from './PlaytestMap';

/**
 * View mode for the playtest harness.
 *  - 'both' (default): visual map on top + dev panel below. Use this for
 *    normal verification — you can drive the game by clicking the map
 *    while keeping the raw event log + entity table visible for debugging.
 *  - 'visual': just the visual map. The reaction modal + ready-reactions
 *    panel still render above the map as floating overlays so the player
 *    can still arm Shield / Take a reaction without the dev panel.
 *  - 'dev': just the dev panel. Use when you don't want the WebGL canvas
 *    (e.g. low-end browser, screen-reader testing).
 */
type ViewMode = 'both' | 'visual' | 'dev';

const ATTACK_ACTION_REF = {
  module: 'dnd5e',
  type: 'action',
  id: 'attack',
} as const;

const RAGE_FEATURE_REF = {
  module: 'dnd5e',
  type: 'features',
  id: 'rage',
} as const;

const MODE_LABEL: Record<EncounterMode, string> = {
  [EncounterMode.UNSPECIFIED]: 'UNSPECIFIED',
  [EncounterMode.FREE_ROAM]: 'FREE_ROAM',
  [EncounterMode.TURN_BASED]: 'TURN_BASED',
};

/**
 * Condition ids with a direct Synty HUD icon mapping (#467, see
 * `src/utils/conditionIcons.ts`), listed here for the `?syntyicons=1` dev
 * demo strip so every mapped PNG can be eyeballed without needing a live
 * StatusApplied event from a backend.
 */
const SYNTY_ICON_DEMO_CONDITIONS = [
  'raging',
  'dodging',
  'unconscious',
  'dying',
  'dead',
  'helped',
  'cursed',
  'bleeding',
  'poisoned',
  'entangled',
  'restrained',
  'charmed',
];

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

/** Short, log-friendly descriptor of an ActionTarget for the Recent-events
 * log (e.g. ` → goblin-1`, ` → self`, or `` for an untargeted NONE action).
 * Read-only formatting of the oneof the harness already constructed — no
 * targeting logic. */
function describeActionTarget(target: ActionTarget | undefined): string {
  const kind = target?.kind;
  if (!kind || kind.case === undefined) return '';
  switch (kind.case) {
    case 'entityId':
      return ` → ${String(kind.value)}`;
    case 'self':
      return ' → self';
    default:
      return ` → ${kind.case}`;
  }
}

/**
 * Dev-only playtest verification harness. Renders at
 * ?encounterId=<id>&playerId=<id> in development mode. Uses ONLY the
 * v1alpha2 stream/action-hook path. Permanent verification surface
 * (design.md) sharing the game's hooks/components — not a deletion target.
 */
export function PlaytestHarness() {
  const params = new URLSearchParams(window.location.search);
  const encounterId = params.get('encounterId') || 'dev-encounter';
  const playerId = params.get('playerId');
  // Dev-only demo strip for visually verifying the Synty HUD status icon
  // mapping (#467) without needing a live StatusApplied event from a
  // backend. Gated behind ?syntyicons=1 so it never shows in normal
  // playtest sessions.
  const showSyntyIconDemo = params.get('syntyicons') === '1';

  // Sync dev playerId override into the gRPC auth store before stream mounts.
  // useLayoutEffect fires before any child useEffect, preventing a race where
  // the first request goes out without the override applied.
  useDevPlayerIdAuth(playerId);

  const entityId = playerId ? `char-${playerId}` : '';

  const [log, setLog] = useState<
    Array<{ id: number; text: string; isError: boolean }>
  >([]);
  // Monotonic id for log entries. Entries are prepended, so the array index is
  // an unstable React key (it re-associates DOM nodes as the log shifts); a
  // per-entry id keyed off this counter stays stable across prepends.
  const logIdRef = useRef(0);
  const [targetQ, setTargetQ] = useState(0);
  const [targetR, setTargetR] = useState(0);
  const [targetS, setTargetS] = useState(0);
  const [targetDoorId, setTargetDoorId] = useState('');
  const [attackTargetId, setAttackTargetId] = useState('');
  // Default to stacked layout: visual map on top + dev panel below. Kirk's
  // stated need: clickable map for intuitive driving without losing the
  // event log / entity table he uses for backend verification mid-playtest.
  const [viewMode, setViewMode] = useState<ViewMode>('both');

  const encounterState = useEncounterState();
  const {
    moveEntity,
    loading: moveLoading,
    error: moveError,
  } = useMoveEntity();
  const {
    interact,
    loading: interactLoading,
    error: interactError,
  } = useInteract();
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
  // Wave 2.11d: per-character per-reaction readiness toggle. The panel below
  // the prompt section uses this to arm/unarm reactions like Shield + OA.
  const {
    setReactionReady,
    loading: setReactionReadyLoading,
    error: setReactionReadyError,
  } = useSetReactionReady();
  // Wave 3: v1alpha2 ActivateFeature RPC — Rage button for barbarian.
  const {
    activateFeature,
    loading: activateFeatureLoading,
    error: activateFeatureError,
  } = useActivateFeature();

  // isError styles the entry red in the Recent-events log — used for rejected
  // RPCs (currently TakeAction, #428) so a server rejection is visible in the
  // harness's primary verification surface, not just the console.
  const addLog = (msg: string, isError = false) => {
    const entry = {
      id: logIdRef.current++,
      text: `[${formatTime(new Date())}] ${msg}`,
      isError,
    };
    setLog((prev) => [entry, ...prev].slice(0, 30));
  };

  const stream = useEncounterStream(
    playerId ? encounterId : null,
    playerId ?? '',
    {
      onSnapshotDelivered: (e) => {
        // Apply v1alpha2 turn state from the snapshot when present.
        // encounter.mode and encounter.turnState carry initiative order,
        // active entity, and round — populate those fields so the harness
        // header shows the correct state without waiting for delta events.
        if (e.encounter) {
          encounterState.applySnapshotTurnState(
            e.encounter.mode,
            e.encounter.turnState
          );
          // Seed entities from the snapshot's space entities list in a single
          // batch setState call to avoid N intermediate renders for N entities.
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
              // #462: same snapshot-status-hydration fix as EncounterView —
              // the harness shares the same reducer and had the identical
              // gap (condition badges couldn't survive a reconnect here
              // either).
              statusEffects: entity.statusEffects,
              // #491: same identity-block data gap as EncounterView — the
              // harness shares the same reducer.
              displayName: entity.displayName,
              classRefId:
                entity.data?.case === 'character'
                  ? entity.data.value.classRef?.id
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
        addLog('SnapshotDelivered (stream up)');
      },
      onEntityMoved: (e) => {
        const last = e.actualPath[e.actualPath.length - 1];
        if (last) {
          encounterState.applyEntityPositionUpdate(
            e.entityId,
            v2PositionToV1(last)
          );
        }
        const pos = last ? `(${last.x},${last.y},${last.z})` : '(no path)';
        addLog(`EntityMoved ${e.entityId} → ${pos}`);
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
        addLog(`GeometryRevealed ${positions.length} hex(es)`);
      },
      onEntityAppeared: (e) => {
        if (!e.entity || !e.entity.position) return;
        // Create a v1alpha1 stub for positional tracking in the entities Map.
        // The v1alpha2 Entity fields (type, hp, MonsterData) flow separately
        // into entityMeta and entityHP via applyEntityMeta below.
        const stub = create(EntityStateSchema, {
          entityId: e.entity.id,
          position: v2PositionToV1(e.entity.position),
        });
        encounterState.applyEntityAppeared(stub);
        // Store v1alpha2 identity metadata and seed initial HP + AC.
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
        encounterState.applyEntityMeta(
          e.entity.id,
          e.entity.type,
          monsterRefId,
          initialHP,
          e.entity.armorClass,
          e.entity.displayName,
          classRefId
        );
        addLog(`EntityAppeared ${e.entity.id}`);
      },
      onEntityDisappeared: (e) => {
        if (e.lastKnownPosition) {
          encounterState.applyEntityDisappeared(
            e.entityId,
            protoPositionToHex(e.lastKnownPosition)
          );
        }
        addLog(`EntityDisappeared ${e.entityId}`);
      },
      onDoorOpened: (e) => {
        // Cause/effect split: DoorOpened only carries the door identity in
        // Wave 2.7; the newly-visible hexes flow on a parallel
        // GeometryRevealed event handled above. Log both lines independently.
        encounterState.applyDoorOpened(e.doorEntityId);
        addLog(`DoorOpened ${e.doorEntityId}`);
      },
      onEntityDamaged: (e) => {
        encounterState.applyEntityDamaged(e);
        const hp = e.hpAfter;
        const hpStr = hp ? ` hp_after=${hp.current}/${hp.max}` : '';
        const breakdownStr =
          e.damageBreakdown && e.damageBreakdown.length > 0
            ? ' [' +
              e.damageBreakdown
                .map(
                  (c) =>
                    `${c.source}:${c.amount}${c.isCritical ? '(crit)' : ''}`
                )
                .join(', ') +
              ']'
            : '';
        addLog(
          `EntityDamaged ${e.entityId} amount=${e.amount}${hpStr}${breakdownStr}`
        );
      },
      onStatusApplied: (e) => {
        encounterState.applyStatusApplied(e);
        const id = e.status?.source?.id ?? '?';
        const display = getConditionDisplay(id);
        addLog(
          `StatusApplied ${e.entityId} <- ${id} (${display.icon} ${display.label})`
        );
      },
      onStatusRemoved: (e) => {
        encounterState.applyStatusRemoved(e);
        const id = e.statusSource?.id ?? '?';
        const display = getConditionDisplay(id);
        addLog(
          `StatusRemoved ${e.entityId} -> ${id} (${display.icon} ${display.label})`
        );
      },
      onModeChanged: (e) => {
        encounterState.applyModeChanged(e);
        addLog(
          `ModeChanged ${MODE_LABEL[e.from]} → ${MODE_LABEL[e.to]} (${e.reason || '—'})`
        );
      },
      onTurnStarted: (e) => {
        encounterState.applyTurnStarted(e);
        addLog(`TurnStarted ${e.entityId} round=${e.round}`);
      },
      onTurnEnded: (e) => {
        encounterState.applyTurnEnded();
        addLog(`TurnEnded ${e.entityId}`);
      },
      // TakeAction wave (#426): the live menu/economy push. Swap in the
      // server-authored TurnState wholesale (Invariant 12, no polling). The
      // action menu + economy bar re-render off this — web computes nothing.
      onTurnStateChanged: (e) => {
        encounterState.applyTurnStateChanged(e.turnState);
        const n = e.turnState?.availableActions.length ?? 0;
        addLog(`TurnStateChanged (${n} action(s) in menu)`);
      },
      // TakeAction wave (#426): umbrella resolution beat for any action. Render
      // it as a combat-log line. The roll/hit/miss detail rides AttackResolved;
      // damage rides EntityDamaged.
      onActionResolved: (e) => {
        const refStr = e.actionRef
          ? `${e.actionRef.module}:${e.actionRef.type}:${e.actionRef.id}`
          : '(no ref)';
        const targetPart = e.targetEntityId ? ` → ${e.targetEntityId}` : '';
        addLog(`ActionResolved ${e.actorEntityId} ${refStr}${targetPart}`);
      },
      // TakeAction wave (#426 / #594): per-attack roll detail. CRUCIAL — this
      // fires on a MISS too (hit=false). Render the miss in the combat log so a
      // whiff is no longer silent.
      // Beat 2 (#430): has_advantage/has_disadvantage + *_sources are copied
      // verbatim from the toolkit's AttackResult — rendered as-is, never
      // recomputed from other fields (Invariant 1: web computes nothing).
      onAttackResolved: (e) => {
        const outcome = e.critical ? 'CRIT' : e.hit ? 'HIT' : 'MISS';
        const advPart = e.hasAdvantage
          ? ` [advantage: ${formatSourceRefs(e.advantageSources) || '?'}]`
          : '';
        const disadvPart = e.hasDisadvantage
          ? ` [disadvantage: ${formatSourceRefs(e.disadvantageSources) || '?'}]`
          : '';
        addLog(
          `AttackResolved ${e.attackerEntityId} → ${e.targetEntityId}: ${outcome} ` +
            `(roll ${e.attackRoll}+${e.attackBonus} vs AC ${e.targetAc})${advPart}${disadvPart}`
        );
      },
      onEntityDied: (e) => {
        encounterState.applyEntityDied(e);
        const killerPart = e.killerEntityId ? ` by ${e.killerEntityId}` : '';
        addLog(`EntityDied ${e.entityId}${killerPart}`);
      },
      onEntityRemoved: (e) => {
        encounterState.applyEntityRemoved(e);
        addLog(`EntityRemoved ${e.entityId} (${e.reason})`);
      },
      onEncounterEnded: (e) => {
        encounterState.applyEncounterEnded(e);
        addLog(`EncounterEnded: ${e.reason}`);
      },
      // Death-save arc (rpg-toolkit#742, wave KirkDiggler/rpg-project#75):
      // log-only — the derived flags are copied verbatim from the toolkit,
      // never recomputed, and appended to the base roll line when set.
      onDeathSaveRolled: (e) => {
        const parts: string[] = [];
        if (e.isCriticalFail) parts.push('nat-1');
        if (e.isCriticalSuccess) parts.push('nat-20');
        if (e.dead) parts.push('DEAD');
        if (e.stabilized) parts.push('STABILIZED');
        if (e.regainedConsciousness) parts.push('regained consciousness');
        if (e.hpRestored > 0) parts.push(`+${e.hpRestored}hp`);
        const flags = parts.length > 0 ? ` [${parts.join(', ')}]` : '';
        addLog(
          `DeathSave ${e.entityId}: roll ${e.roll} (${e.successes}S/${e.failures}F)${flags}`
        );
      },
      onEntityStabilized: (e) => {
        addLog(`Stabilized ${e.entityId}`);
      },
      // Wave 2.11d (#409): server-pushed InputRequired prompts. Reactions
      // triggered by NPC actions arrive here because the attacker's RPC
      // response can't carry a prompt for a different player. Funnels into
      // the same setPendingPrompt path used by Interact/TakeAction responses
      // so the existing prompt-switch (skillCheck / reactionPrompt / …) in
      // the JSX below renders the right modal branch.
      onInputRequiredDelivered: (e) => {
        if (!e.inputRequired) {
          // Defensive: proto field is optional, but a delivered event with
          // no payload is meaningless. Log + drop so a malformed wire frame
          // doesn't silently steal an in-flight prompt.
          addLog('InputRequiredDelivered: (no payload)');
          return;
        }
        // PromptModal resets its own transient result/timer state whenever
        // the prompt object identity changes — no reset needed here.
        encounterState.setPendingPrompt(e.inputRequired);
        addLog(
          `InputRequiredDelivered: ${e.inputRequired.kind?.case ?? 'unknown'}`
        );
      },
    }
  );

  if (!playerId) {
    return (
      <div style={{ padding: 16, color: 'red', fontFamily: 'monospace' }}>
        Error: playerId is required — add ?playerId=alice to the URL
      </div>
    );
  }

  const myEntity = encounterState.state.entities.get(entityId);
  const myPosition = myEntity?.position;

  // Slice 1's SnapshotDelivered.encounter field is empty by design, so the
  // harness has no current position until the first move triggers events.
  // Without a fallback the move button stays permanently disabled. These
  // hardcoded values match the manually-seeded encounter (`enc:v2:dev-encounter`
  // in Redis) so the first move can dispatch correctly. After it lands,
  // EntityMoved updates real state and the fallback is unused.
  const SEEDED_FALLBACK: Record<string, { x: number; y: number; z: number }> = {
    alice: { x: 0, y: 0, z: 0 },
    bob: { x: 1, y: -1, z: 0 },
  };
  const fallback = playerId ? SEEDED_FALLBACK[playerId] : undefined;
  const usingFallback = !myPosition && !!fallback;
  const canMove = !!myPosition || !!fallback;

  const handleMove = async () => {
    const currentPos = myPosition
      ? { x: myPosition.x ?? 0, y: myPosition.y ?? 0, z: myPosition.z ?? 0 }
      : (fallback ?? { x: 0, y: 0, z: 0 });
    const target = { x: targetQ, y: targetR, z: targetS };
    try {
      await moveEntity(encounterId, entityId, [currentPos, target]);
    } catch {
      // error is surfaced via moveError state — no rethrow needed here
    }
  };

  const handleOpenDoor = async () => {
    const id = targetDoorId.trim();
    if (!id) return;
    try {
      const response = await interact(encounterId, id, 'open');
      addLog(`Interact(open) → ${id}`);
      if (response.inputRequired) {
        // PromptModal resets its own transient result/timer state whenever
        // the prompt object identity changes — no reset needed here.
        encounterState.setPendingPrompt(response.inputRequired);
        addLog(
          `InputRequired: ${response.inputRequired.kind?.case ?? 'unknown'}`
        );
      }
    } catch {
      // error is surfaced via interactError state
    }
  };

  const handleAttack = async () => {
    const id = attackTargetId.trim();
    if (!id) return;
    // Construct the v2 ActionTarget oneof for entity-target attacks.
    // The proto's `kind` is a oneof; setting case='entityId' picks the
    // single-target variant.
    const target = {
      kind: { case: 'entityId', value: id },
    } as unknown as ActionTarget;
    try {
      await takeAction({
        encounterId,
        actorEntityId: entityId,
        actionRef: ATTACK_ACTION_REF,
        target,
      });
      addLog(`TakeAction(attack) → ${id}`);
    } catch (err) {
      // #428: a rejected TakeAction was previously console-only. Log it here
      // (in addition to the takeActionError panel below) so it's visible in
      // the harness's Recent-events log — the verification surface.
      addLog(`TakeAction(attack) → ${id} REJECTED: ${errorMessage(err)}`, true);
    }
  };

  const handleEndTurn = async () => {
    try {
      await endTurn(encounterId, entityId);
      addLog(`EndTurn → ${entityId}`);
    } catch {
      // error is surfaced via endTurnError state
    }
  };

  // TakeAction wave (#426): dispatch a server-menu action. The web does NOT
  // decide what's legal — it reads target_kind off the menu entry (the server's
  // verdict) to raise the right targeting prompt, then sends the action ref +
  // ActionTarget. The server gates availability/legality and pushes the
  // refreshed menu/economy back via TurnStateChanged.
  const handleSelectAction = async (action: AvailableAction) => {
    if (!action.ref) {
      addLog('SelectAction: menu entry missing ref (server defect)');
      return;
    }
    const refStr = actionKey(action);

    // Targeted kinds need a target chosen first. The dev panel's "Target id"
    // input drives SINGLE_ENTITY for verification; POSITION/AREA prompting is a
    // later wave (no L1 action this beat uses them). If a target is required but
    // none is selected, tell the player rather than guessing one.
    if (targetKindNeedsPrompt(action.targetKind)) {
      if (action.targetKind === TargetKind.SINGLE_ENTITY) {
        const id = attackTargetId.trim();
        if (!id) {
          addLog(`${refStr}: select a target id first (single-entity action)`);
          return;
        }
        await dispatchAction(action.ref, {
          kind: { case: 'entityId', value: id },
        } as unknown as ActionTarget);
        return;
      }
      // POSITION / AREA — no L1 action this beat reaches here; surface clearly.
      addLog(
        `${refStr}: ${action.targetKind === TargetKind.POSITION ? 'position' : 'area'}-targeted actions not yet wired in the harness`
      );
      return;
    }

    // SELF → target the actor; NONE → untargeted (no prompt). Both fire with no
    // user prompt; the difference is whether an ActionTarget is attached.
    if (action.targetKind === TargetKind.SELF) {
      await dispatchAction(action.ref, {
        kind: { case: 'self', value: {} },
      } as unknown as ActionTarget);
      return;
    }
    // NONE (e.g. Dash) or UNSPECIFIED defect: fire with no target; the server
    // accepts NONE untargeted and rejects a true defect.
    await dispatchAction(action.ref, undefined);
  };

  const dispatchAction = async (
    actionRef: { module: string; type: string; id: string },
    target: ActionTarget | undefined
  ) => {
    try {
      await takeAction({
        encounterId,
        actorEntityId: entityId,
        actionRef,
        // The proto target field is required by the request schema; an
        // untargeted (NONE) action sends an empty ActionTarget oneof.
        target: target ?? ({ kind: { case: undefined } } as ActionTarget),
      });
      addLog(`TakeAction(${actionRef.id})${describeActionTarget(target)}`);
    } catch (err) {
      // #428: surface the rejection in the Recent-events log, not just console.
      addLog(
        `TakeAction(${actionRef.id})${describeActionTarget(target)} REJECTED: ${errorMessage(err)}`,
        true
      );
    }
  };

  // Wave 2.11d: toggle readiness for a single reaction on the active
  // character. Optimistic local update on success — server is source of truth
  // but the panel reflects intent immediately so the player isn't waiting on
  // a stream snapshot to confirm the toggle.
  const handleToggleReactionReady = async (
    reactionRef: { module: string; type: string; id: string },
    ready: boolean
  ) => {
    try {
      await setReactionReady({
        encounterId,
        characterId: entityId,
        reactionRef,
        ready,
      });
      const refStr = `${reactionRef.module}:${reactionRef.type}:${reactionRef.id}`;
      encounterState.setReactionReadyLocal(entityId, refStr, ready);
      addLog(`SetReactionReady → ${refStr} = ${ready.toString()}`);
    } catch {
      // error surfaced via setReactionReadyError state
    }
  };

  // Wave 3: call ActivateFeature with the rage feature ref. State changes
  // (raging condition applied, charges decremented, action consumed) flow back
  // as StatusApplied on the encounter stream — we do not compute them locally.
  const handleActivateRage = async () => {
    try {
      await activateFeature({
        encounterId,
        characterId: entityId,
        featureRef: RAGE_FEATURE_REF,
      });
      addLog(`ActivateFeature(rage) → ${entityId}`);
    } catch {
      // error is surfaced via activateFeatureError state
    }
  };

  const entitiesArray = Array.from(encounterState.state.entities.entries());
  const revealedKeys = Array.from(encounterState.state.revealedHexes);
  const openDoorKeys = Array.from(encounterState.state.openDoors);
  const myHP = encounterState.state.entityHP.get(entityId);
  const myStatuses = encounterState.state.entityStatuses.get(entityId) ?? [];
  // Wave 3: raging is active when the "raging" condition is in the local
  // status list (populated by StatusApplied stream events). The v1alpha2
  // Entity/CharacterData proto does not carry feature charge counts — RageCharges
  // remaining is not available from the stream/snapshot in the current proto
  // version. The raging indicator shows whether the condition is active.
  const isRaging = myStatuses.some((s) => s.source.id === 'raging');
  const encounterEnded = encounterState.state.encounterStatus === 'ended';
  const isMyTurn =
    encounterState.state.mode === EncounterMode.TURN_BASED &&
    encounterState.state.activeEntityId === entityId;
  // combatEnabled: requires TURN_BASED + local player's turn + encounter not ended.
  // The server rejects requests once ended; disabling is courtesy UX only.
  const combatEnabled =
    !encounterEnded &&
    encounterState.state.mode === EncounterMode.TURN_BASED &&
    isMyTurn;

  // TakeAction wave (#426): the server-authored menu + economy. Rendered
  // verbatim — the web never recomputes availability or cost. NULL until the
  // first TurnStateChanged / snapshot turnState arrives.
  const turnState = encounterState.state.turnState;
  const availableActions = turnState?.availableActions ?? [];
  const economy = turnState?.economy ?? null;

  // Visual map handlers. The map's hex click hands back the full computed
  // path; we forward to moveEntity as the existing handleMove does. Entity
  // clicks dispatch attack against monsters when combat-enabled; otherwise
  // selecting the row for inspection (log + populate the dev-panel target
  // input). In FREE_ROAM both moves and "attacks" still dispatch — the
  // server is the gate, per `feedback_no_logic_in_web`.
  const handleVisualMove = async (
    path: Array<{ x: number; y: number; z: number }>
  ) => {
    if (encounterEnded || path.length === 0) return;
    try {
      await moveEntity(encounterId, entityId, path);
      const last = path[path.length - 1];
      if (last) {
        addLog(
          `VisualMove → (${last.x},${last.y},${last.z}) via ${path.length}-step path`
        );
      }
    } catch {
      // error surfaced via moveError state
    }
  };

  const handleVisualEntityClick = async (targetId: string) => {
    if (targetId === entityId) {
      addLog(`Selected self ${targetId}`);
      return;
    }
    const targetMeta = encounterState.state.entityMeta.get(targetId);
    const isMonster = targetMeta?.type === EntityType.MONSTER;
    // Always populate the dev-panel attack-target input so the dev panel
    // reflects the visual selection — helps Kirk cross-check the click
    // landed on the entity he intended without scrolling to find the row.
    setAttackTargetId(targetId);
    if (!isMonster) {
      addLog(`Selected ${targetId}`);
      return;
    }
    if (encounterEnded) {
      addLog(`Selected ${targetId} (encounter ended; no attack dispatched)`);
      return;
    }
    // Dispatch attack. Mirrors handleAttack but takes the target inline so
    // we don't race the setAttackTargetId render. Per the boundary rule,
    // FREE_ROAM clicks still dispatch — server returns FailedPrecondition
    // if not in combat, and the existing error surface shows it.
    const target = {
      kind: { case: 'entityId', value: targetId },
    } as unknown as ActionTarget;
    try {
      await takeAction({
        encounterId,
        actorEntityId: entityId,
        actionRef: ATTACK_ACTION_REF,
        target,
      });
      addLog(`VisualAttack → ${targetId}`);
    } catch (err) {
      // #428: surface the rejection in the Recent-events log, not just console.
      addLog(`VisualAttack → ${targetId} REJECTED: ${errorMessage(err)}`, true);
    }
  };

  const showVisual = viewMode === 'both' || viewMode === 'visual';
  const showDev = viewMode === 'both' || viewMode === 'dev';

  return (
    <div
      style={{
        fontFamily: 'monospace',
        padding: 16,
        background: '#111',
        color: '#eee',
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <div
        data-testid="harness-header"
        style={{
          background: '#222',
          padding: '8px 12px',
          marginBottom: 16,
          borderRadius: 4,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <span>
          Playtest <strong>{encounterId}</strong> as <strong>{playerId}</strong>
        </span>
        <span>
          connection: <strong>{stream.connectionState}</strong>
        </span>
        <span>entityId: {entityId}</span>
        <span>
          mode: <strong>{MODE_LABEL[encounterState.state.mode]}</strong>
        </span>
        <span>
          active:{' '}
          <strong>{encounterState.state.activeEntityId || '(none)'}</strong>
        </span>
        <span>
          round: <strong>{encounterState.state.round}</strong>
        </span>
        <span>
          HP: <strong>{myHP ? `${myHP.current}/${myHP.max}` : '—'}</strong>
        </span>
        {/* Wave 3: raging status indicator — lit when StatusApplied "raging"
            condition is active on the local player's character. */}
        <span
          data-testid="rage-status-indicator"
          style={{ color: isRaging ? '#ff6633' : '#555' }}
        >
          rage: <strong>{isRaging ? 'RAGING' : 'off'}</strong>
        </span>
        {encounterState.state.mode === EncounterMode.TURN_BASED &&
          encounterState.state.initiativeOrder.length > 0 && (
            <span>
              initiative:{' '}
              <strong>
                {encounterState.state.initiativeOrder.join(' → ')}
              </strong>
            </span>
          )}
      </div>

      {/* Dev-only demo strip for the Synty HUD status icon mapping (#467).
          Renders every directly-mapped condition icon so it can be visually
          verified without a live StatusApplied event from a backend.
          Behind ?syntyicons=1 — never shown in a normal playtest session. */}
      {showSyntyIconDemo && (
        <div
          data-testid="synty-icon-demo"
          style={{
            background: '#1a1a2a',
            padding: '8px 12px',
            marginBottom: 16,
            borderRadius: 4,
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 12,
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#888' }}>
            Synty status icons (dev demo, #467):
          </span>
          {SYNTY_ICON_DEMO_CONDITIONS.map((id) => {
            const display = getConditionDisplay(id);
            return (
              <span
                key={id}
                data-testid={`synty-icon-demo-${id}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {display.iconUrl ? (
                  // Decorative: the label right after it carries the
                  // semantics (Copilot review, #467 PR #473).
                  <img
                    src={display.iconUrl}
                    alt=""
                    aria-hidden="true"
                    title={display.description || display.label}
                    width={20}
                    height={20}
                  />
                ) : (
                  <span aria-hidden="true">{display.icon}</span>
                )}
                {display.label}
              </span>
            );
          })}
        </div>
      )}

      {/* View-mode toolbar — pick visual / dev / both. Visible above the
          map so Kirk can switch presentation without losing focus. Default
          is 'both' for normal verification — visual UX + dev backend view. */}
      <div
        data-testid="view-mode-toolbar"
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          marginBottom: 16,
          fontSize: 12,
          color: '#aaa',
        }}
      >
        <span>View:</span>
        {(['both', 'visual', 'dev'] as const).map((mode) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              data-testid={`view-mode-${mode}`}
              onClick={() => setViewMode(mode)}
              aria-pressed={active}
              style={{
                padding: '4px 12px',
                background: active ? '#2a4a4a' : '#222',
                color: active ? '#8ff' : '#999',
                border: `1px solid ${active ? '#4a7a7a' : '#444'}`,
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: 11,
              }}
            >
              {mode === 'both'
                ? 'Map + Dev panel'
                : mode === 'visual'
                  ? 'Map only'
                  : 'Dev panel only'}
            </button>
          );
        })}
      </div>

      {/* Encounter-ended banner (Wave 2.10) */}
      {encounterEnded && (
        <div
          data-testid="encounter-ended-banner"
          style={{
            background: '#2a1a00',
            border: '1px solid #aa6600',
            borderRadius: 4,
            padding: '10px 16px',
            marginBottom: 16,
            color: '#ffcc66',
            fontWeight: 'bold',
            fontSize: 14,
          }}
        >
          Encounter ended
          {encounterState.state.encounterEndedReason
            ? `: ${encounterState.state.encounterEndedReason}`
            : ''}
        </div>
      )}

      {/* Reaction overlay (Wave 2.11d) — pending-prompt modal (skill check
          / reaction prompt / unsupported placeholder) + ready-reactions
          panel. Lifted out of the dev grid so it stays reachable in
          'Map only' mode: reactions are gameplay surfaces, not dev
          surfaces, and the player must be able to arm Shield / Take a
          reaction even when the dev panel is hidden. The testids
          (`skill-check-prompt`, `reaction-prompt`, `unsupported-prompt`,
          `ready-reactions-panel`) are preserved so existing tests
          continue to query at top level. */}
      {/* Skill check / reaction prompt (Wave 2.9 / 2.11d) — shared with
          GameView's EncounterView via PromptModal (#440). */}
      <PromptModal
        encounterId={encounterId}
        entityId={entityId}
        prompt={encounterState.state.pendingPrompt}
        onDismiss={() => encounterState.setPendingPrompt(null)}
        onLog={addLog}
      />

      {/* Wave 2.11d ready-reactions panel: per-character per-reaction toggles.
          Server is source of truth (reactionReadiness map flows from
          SetReactionReady responses + optimistic local mirror). Reads from
          state.reactionReadiness. Renders fixed rows for OA + Shield in this
          wave; future waves add Counterspell + Lucky as additional rows.

          Tri-state per #410: undefined means UNKNOWN — the snapshot
          proto does not carry reaction_readiness today (rpg-api-protos#158),
          so server-seeded defaults (e.g. OA default-on at AddPlayer for
          melee combatants) are invisible to the client until the player
          toggles. The panel MUST render "unknown" instead of falsely
          defaulting to unready, which would lie about server-seeded
          ready state and cause the first click to send ready=true to a
          server that already considered it ready. The first toggle
          attempts ready=true (the natural opt-in action) and resolves
          the unknown locally. */}
      <h3 style={{ margin: '16px 0 4px', color: '#aaa' }}>Ready reactions</h3>
      <div
        data-testid="ready-reactions-panel"
        style={{ fontSize: 12, marginBottom: 12 }}
      >
        {(() => {
          const myReadiness =
            encounterState.state.reactionReadiness.get(entityId);
          const rows: Array<{
            refStr: string;
            refTriple: { module: string; type: string; id: string };
            label: string;
            hint: string;
          }> = [
            {
              refStr: 'dnd5e:conditions:opportunity_attack',
              refTriple: {
                module: 'dnd5e',
                type: 'conditions',
                id: 'opportunity_attack',
              },
              label: 'Opportunity Attack',
              hint: 'Free — react when an enemy leaves your reach',
            },
            {
              refStr: 'dnd5e:spells:shield',
              refTriple: {
                module: 'dnd5e',
                type: 'spells',
                id: 'shield',
              },
              label: 'Shield',
              hint: 'Spell slot — react to add +5 AC when hit',
            },
          ];
          return rows.map((row) => {
            const ready = myReadiness?.get(row.refStr);
            // Tri-state label + next-action computation. UNKNOWN clicks
            // attempt ready=true (the opt-in action); KNOWN clicks flip.
            const stateLabel =
              ready === undefined ? 'unknown' : ready ? 'READY' : 'unready';
            const nextReady = ready === undefined ? true : !ready;
            const ariaAction =
              ready === undefined ? 'ready' : ready ? 'unready' : 'ready';
            // Visual treatment: ready=green (READY), false=dim grey
            // (unready), undefined=dashed-border grey (unknown).
            const background =
              ready === true
                ? '#2a3a2a'
                : ready === false
                  ? '#2a2a2a'
                  : '#1f1f1f';
            const color =
              ready === true ? '#afa' : ready === false ? '#888' : '#aaa';
            const borderColor =
              ready === true ? '#4a6a4a' : ready === false ? '#444' : '#666';
            const borderStyle = ready === undefined ? 'dashed' : 'solid';
            return (
              <div
                key={row.refStr}
                data-testid={`reaction-row-${row.refStr}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: '1px solid #2a2a2a',
                }}
              >
                <div>
                  <div style={{ color: '#ddd', fontWeight: 500 }}>
                    {row.label}
                  </div>
                  <div style={{ color: '#888', fontSize: 11 }}>{row.hint}</div>
                </div>
                <button
                  data-testid={`reaction-toggle-${row.refStr}`}
                  onClick={() =>
                    void handleToggleReactionReady(row.refTriple, nextReady)
                  }
                  disabled={setReactionReadyLoading || encounterEnded}
                  aria-pressed={ready === true}
                  aria-label={`${row.label}: ${stateLabel} (click to ${ariaAction})`}
                  style={{
                    padding: '2px 10px',
                    background,
                    color,
                    border: `1px ${borderStyle} ${borderColor}`,
                    cursor:
                      setReactionReadyLoading || encounterEnded
                        ? 'not-allowed'
                        : 'pointer',
                    fontSize: 11,
                  }}
                >
                  {stateLabel}
                </button>
              </div>
            );
          });
        })()}
        {setReactionReadyError && (
          <div style={{ color: '#f88', marginTop: 4, fontSize: 11 }}>
            SetReactionReady error: {setReactionReadyError.message}
          </div>
        )}
      </div>

      {/* Visual map (Three.js HexGrid). Renders when viewMode is 'visual' or
          'both'. Click a hex to move there (the existing path-preview from
          the game routes drives the route); click a monster entity to
          attack it. Move/attack errors surface via the dev panel's existing
          error rows below. */}
      {showVisual && (
        <div
          data-testid="visual-map-container"
          style={{
            width: '100%',
            height: showDev ? '420px' : 'calc(100vh - 220px)',
            marginBottom: 16,
          }}
        >
          <PlaytestMap
            entities={encounterState.state.entities}
            entityMeta={encounterState.state.entityMeta}
            revealedHexes={encounterState.state.revealedHexes}
            walls={encounterState.state.walls}
            entityHP={encounterState.state.entityHP}
            entityStatuses={encounterState.state.entityStatuses}
            myEntityId={entityId}
            fallbackPosition={fallback}
            // In TURN_BASED we gate moves on whose turn it is. In FREE_ROAM
            // (or unspecified mode) we let clicks dispatch — the server is
            // source of truth and will reject if the request is invalid.
            isMyTurn={
              encounterState.state.mode === EncounterMode.TURN_BASED
                ? isMyTurn
                : true
            }
            onMove={(path) => {
              void handleVisualMove(path);
            }}
            onEntityClick={(targetId) => {
              void handleVisualEntityClick(targetId);
            }}
          />
        </div>
      )}

      {showDev && (
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
        >
          {/* Left column: entities + hexes */}
          <div>
            {/* Entities table */}
            <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
              Entities ({entitiesArray.length})
            </h3>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>id</th>
                  <th style={{ padding: '4px 8px' }}>type</th>
                  <th style={{ padding: '4px 8px' }}>HP</th>
                  <th style={{ padding: '4px 8px' }}>AC</th>
                  <th style={{ padding: '4px 8px' }}>x</th>
                  <th style={{ padding: '4px 8px' }}>y</th>
                  <th style={{ padding: '4px 8px' }}>z</th>
                  <th style={{ padding: '4px 8px' }}>ghost?</th>
                  <th style={{ padding: '4px 8px' }}>status</th>
                </tr>
              </thead>
              <tbody>
                {entitiesArray.map(([id, entity]) => {
                  const isLocalPlayer = id === entityId;
                  // Only show active-actor highlight in TURN_BASED mode to avoid
                  // stale highlighting when activeEntityId persists after mode changes.
                  const isActiveActor =
                    encounterState.state.mode === EncounterMode.TURN_BASED &&
                    encounterState.state.activeEntityId !== '' &&
                    id === encounterState.state.activeEntityId;
                  const meta = encounterState.state.entityMeta.get(id);
                  const hp = encounterState.state.entityHP.get(id);
                  const ac = encounterState.state.entityAC.get(id);
                  // Beat 2 (#430): status icons on ANY entity, not just the
                  // local player — the Help/Hide playtest beats specifically
                  // need a third party to observe a condition on someone
                  // else (e.g. the Fighter's Helped condition, or the
                  // goblin's Dodging). Driven entirely by server-sent
                  // StatusApplied events (Invariant 1: web computes nothing).
                  const statuses =
                    encounterState.state.entityStatuses.get(id) ?? [];
                  // Row background: active actor (yellow/orange) takes priority over
                  // local player (green) so both states are distinguishable when
                  // it's the local player's turn.
                  const rowBackground = isActiveActor
                    ? '#2a2200'
                    : isLocalPlayer
                      ? '#1a2a1a'
                      : 'transparent';
                  const typeLabel =
                    meta?.type === EntityType.MONSTER
                      ? `MONSTER${meta.monsterRefId ? ` (${meta.monsterRefId})` : ''}`
                      : meta?.type === EntityType.CHARACTER
                        ? 'CHARACTER'
                        : meta
                          ? (EntityType[meta.type] ?? '?')
                          : '—';
                  return (
                    <tr
                      key={id}
                      style={{
                        background: rowBackground,
                        borderTop: '1px solid #333',
                        outline: isActiveActor
                          ? '1px solid #aa6600'
                          : undefined,
                      }}
                    >
                      <td style={{ padding: '4px 8px' }}>
                        {isActiveActor ? '→ ' : ''}
                        {id}
                      </td>
                      <td style={{ padding: '4px 8px', color: '#aaa' }}>
                        {typeLabel}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {hp ? `${hp.current}/${hp.max}` : '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {ac !== undefined ? ac : '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {entity.position?.x ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {entity.position?.y ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {entity.position?.z ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {entity.ghost ? 'yes' : ''}
                      </td>
                      <td
                        data-testid={`entity-status-${id}`}
                        style={{ padding: '4px 8px', color: '#ccc' }}
                      >
                        {statuses.length === 0 ? (
                          '—'
                        ) : (
                          <StatusBadgeList statuses={statuses} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {entitiesArray.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ padding: '4px 8px', color: '#555' }}
                    >
                      (no entities yet)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Revealed hexes */}
            <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
              Revealed hexes ({encounterState.state.revealedHexes.size})
            </h3>
            <div style={{ fontSize: 12, color: '#777', marginBottom: 16 }}>
              {revealedKeys.length === 0
                ? '(none)'
                : revealedKeys.slice(0, 20).join(', ') +
                  (revealedKeys.length > 20
                    ? ` … +${revealedKeys.length - 20} more`
                    : '')}
            </div>

            {/* Move controls */}
            <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
              Move {entityId}
            </h3>
            {!canMove && (
              <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                (waiting for first event — position unknown)
              </div>
            )}
            {usingFallback && (
              <div style={{ color: '#aa8', fontSize: 12, marginBottom: 8 }}>
                (using seeded fallback position — no events received yet)
              </div>
            )}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <label style={{ fontSize: 12 }}>
                Q{' '}
                <input
                  type="number"
                  value={targetQ}
                  onChange={(e) => setTargetQ(Number(e.target.value))}
                  style={{
                    width: 60,
                    background: '#333',
                    color: '#eee',
                    border: '1px solid #555',
                    padding: '2px 4px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                R{' '}
                <input
                  type="number"
                  value={targetR}
                  onChange={(e) => setTargetR(Number(e.target.value))}
                  style={{
                    width: 60,
                    background: '#333',
                    color: '#eee',
                    border: '1px solid #555',
                    padding: '2px 4px',
                  }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                S{' '}
                <input
                  type="number"
                  value={targetS}
                  onChange={(e) => setTargetS(Number(e.target.value))}
                  style={{
                    width: 60,
                    background: '#333',
                    color: '#eee',
                    border: '1px solid #555',
                    padding: '2px 4px',
                  }}
                />
              </label>
              <button
                onClick={() => void handleMove()}
                disabled={!canMove || moveLoading}
                style={{
                  padding: '4px 12px',
                  background: canMove ? '#2a4a2a' : '#2a2a2a',
                  color: canMove ? '#8f8' : '#666',
                  border: '1px solid #555',
                  cursor: canMove && !moveLoading ? 'pointer' : 'not-allowed',
                }}
              >
                {moveLoading ? 'Moving…' : 'Move there'}
              </button>
            </div>
            {moveError && (
              <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
                Move error: {moveError.message}
              </div>
            )}

            {/* Open-door controls (Wave 2.7 verification scaffold; permanent — see design.md) */}
            <h3 style={{ margin: '16px 0 8px', color: '#aaa' }}>Open door</h3>
            <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>
              Open doors ({openDoorKeys.length}):{' '}
              {openDoorKeys.length === 0 ? '(none)' : openDoorKeys.join(', ')}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <label style={{ fontSize: 12 }}>
                Door id{' '}
                <input
                  type="text"
                  value={targetDoorId}
                  onChange={(e) => setTargetDoorId(e.target.value)}
                  placeholder="door-east"
                  aria-label="door id"
                  style={{
                    width: 140,
                    background: '#333',
                    color: '#eee',
                    border: '1px solid #555',
                    padding: '2px 4px',
                  }}
                />
              </label>
              <button
                onClick={() => void handleOpenDoor()}
                disabled={!targetDoorId.trim() || interactLoading}
                style={{
                  padding: '4px 12px',
                  background: targetDoorId.trim() ? '#2a4a2a' : '#2a2a2a',
                  color: targetDoorId.trim() ? '#8f8' : '#666',
                  border: '1px solid #555',
                  cursor:
                    targetDoorId.trim() && !interactLoading
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                {interactLoading ? 'Opening…' : 'Open door'}
              </button>
            </div>
            {interactError && (
              <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
                Interact error: {interactError.message}
              </div>
            )}

            {/* Combat controls (Wave 2.8 verification scaffold; permanent — see design.md) */}
            <h3 style={{ margin: '16px 0 8px', color: '#aaa' }}>Combat</h3>
            <div
              data-testid="my-statuses"
              style={{ fontSize: 12, color: '#777', marginBottom: 8 }}
            >
              Statuses ({myStatuses.length}):{' '}
              {myStatuses.length === 0 ? (
                '(none)'
              ) : (
                <StatusBadgeList statuses={myStatuses} />
              )}
            </div>

            {/* TakeAction wave (#426): server-authored economy + action menu.
                The menu drives the UI (Invariant 11/12) — entries are grouped by
                economy_slot, disabled with the server's unavailable_reason when
                available=false, and clicking dispatches per target_kind. The web
                computes NO availability/legality/cost (no-logic-in-web, D7). */}
            <h4 style={{ margin: '8px 0 4px', color: '#888' }}>
              Action economy (live)
            </h4>
            <EconomyBar economy={economy} />
            <h4 style={{ margin: '8px 0 4px', color: '#888' }}>
              Action menu (server-driven)
            </h4>
            <ActionMenu
              actions={availableActions}
              enabled={combatEnabled}
              loading={takeActionLoading}
              onSelectAction={(a) => void handleSelectAction(a)}
            />

            {/* HP is now shown inline in the entities table above. */}
            {!isMyTurn &&
              encounterState.state.mode === EncounterMode.TURN_BASED && (
                <div style={{ color: '#aa8', fontSize: 12, marginBottom: 8 }}>
                  (waiting for your turn — active actor:{' '}
                  {encounterState.state.activeEntityId || 'none'})
                </div>
              )}
            {encounterState.state.mode !== EncounterMode.TURN_BASED && (
              <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                (combat actions enabled only in TURN_BASED mode)
              </div>
            )}
            {/* Manual target picker + raw Attack — a dev verification scaffold.
                The server-driven Action menu above is the real UI; this stays so
                a tester can pick a single-entity target id and drive a raw
                attack while debugging. */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <label style={{ fontSize: 12 }}>
                Target id{' '}
                <input
                  type="text"
                  value={attackTargetId}
                  onChange={(e) => setAttackTargetId(e.target.value)}
                  placeholder="goblin-1"
                  aria-label="attack target id"
                  style={{
                    width: 140,
                    background: '#333',
                    color: '#eee',
                    border: '1px solid #555',
                    padding: '2px 4px',
                  }}
                />
              </label>
              <button
                onClick={() => void handleAttack()}
                disabled={
                  !combatEnabled || !attackTargetId.trim() || takeActionLoading
                }
                style={{
                  padding: '4px 12px',
                  background:
                    combatEnabled && attackTargetId.trim()
                      ? '#4a2a2a'
                      : '#2a2a2a',
                  color:
                    combatEnabled && attackTargetId.trim() ? '#f88' : '#666',
                  border: '1px solid #555',
                  cursor:
                    combatEnabled && attackTargetId.trim() && !takeActionLoading
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                {takeActionLoading ? 'Attacking…' : 'Attack'}
              </button>
              <button
                onClick={() => void handleEndTurn()}
                disabled={!combatEnabled || endTurnLoading}
                style={{
                  padding: '4px 12px',
                  background: combatEnabled ? '#2a4a2a' : '#2a2a2a',
                  color: combatEnabled ? '#8f8' : '#666',
                  border: '1px solid #555',
                  cursor:
                    combatEnabled && !endTurnLoading
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                {endTurnLoading ? 'Ending…' : 'End turn'}
              </button>
            </div>
            {/* Wave 3: Rage button — calls v1alpha2 ActivateFeature with the
                rage feature ref. State changes (raging condition, charges
                decremented, action consumed) flow back via StatusApplied on
                the stream. Enabled whenever combat is active; server gates on
                charges/action availability per the boundary rule. */}
            <h3 style={{ margin: '16px 0 4px', color: '#aaa' }}>Features</h3>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                data-testid="rage-button"
                onClick={() => void handleActivateRage()}
                disabled={!combatEnabled || activateFeatureLoading}
                style={{
                  padding: '4px 14px',
                  background: isRaging
                    ? '#4a1a00'
                    : combatEnabled
                      ? '#4a2200'
                      : '#2a2a2a',
                  color: isRaging
                    ? '#ff8855'
                    : combatEnabled
                      ? '#ffaa55'
                      : '#666',
                  border: `1px solid ${isRaging ? '#aa4400' : combatEnabled ? '#884400' : '#444'}`,
                  cursor:
                    !combatEnabled || activateFeatureLoading
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: isRaging ? 'bold' : 'normal',
                }}
              >
                {activateFeatureLoading
                  ? 'Raging…'
                  : isRaging
                    ? 'RAGING (activate again?)'
                    : 'Rage'}
              </button>
              <span
                style={{ fontSize: 11, color: isRaging ? '#ff8855' : '#777' }}
              >
                {isRaging ? 'Condition active' : 'Bonus action'}
              </span>
            </div>
            {activateFeatureError && (
              <div style={{ color: '#f88', marginTop: 4, fontSize: 12 }}>
                ActivateFeature error: {activateFeatureError.message}
              </div>
            )}
            {takeActionError && (
              <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
                TakeAction error: {takeActionError.message}
              </div>
            )}
            {endTurnError && (
              <div style={{ color: '#f88', marginTop: 8, fontSize: 12 }}>
                EndTurn error: {endTurnError.message}
              </div>
            )}
          </div>

          {/* Right column: event log */}
          <div>
            <h3 style={{ margin: '0 0 8px', color: '#aaa' }}>
              Recent events ({log.length})
            </h3>
            <div
              data-testid="event-log"
              style={{
                background: '#0a0a0a',
                border: '1px solid #333',
                padding: 8,
                fontSize: 11,
                height: 400,
                overflowY: 'auto',
              }}
            >
              {log.length === 0 && (
                <span style={{ color: '#555' }}>(waiting for events…)</span>
              )}
              {log.map((entry) => (
                <div
                  key={entry.id}
                  data-testid={
                    entry.isError ? 'event-log-entry-error' : 'event-log-entry'
                  }
                  style={{
                    color: entry.isError ? '#f88' : '#9d9',
                    marginBottom: 2,
                  }}
                >
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
