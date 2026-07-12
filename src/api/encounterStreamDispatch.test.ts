import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { describe, expect, it, vi } from 'vitest';
import {
  dispatchEncounterStreamEvent,
  type EncounterStreamOptions,
} from './encounterStreamDispatch';

function makeEvent<K extends string, V>(caseName: K, value: V): EncounterEvent {
  return {
    event: { case: caseName, value },
    // Other EncounterEvent fields (eventId, deliveredAt) — minimal shape;
    // tests are checking dispatch only, not full proto validity
  } as unknown as EncounterEvent;
}

describe('dispatchEncounterStreamEvent', () => {
  it('routes snapshotDelivered to onSnapshotDelivered', () => {
    const onSnapshotDelivered = vi.fn();
    const options: EncounterStreamOptions = { onSnapshotDelivered };
    const event = makeEvent('snapshotDelivered', { encounter: undefined });
    dispatchEncounterStreamEvent(event, options);
    expect(onSnapshotDelivered).toHaveBeenCalledTimes(1);
  });

  it('routes entityMoved to onEntityMoved', () => {
    const onEntityMoved = vi.fn();
    const options: EncounterStreamOptions = { onEntityMoved };
    const event = makeEvent('entityMoved', {
      entityId: 'a',
      actualPath: [{ x: 0, y: 0, z: 0 }],
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityMoved).toHaveBeenCalledTimes(1);
  });

  it('routes geometryRevealed to onGeometryRevealed', () => {
    const onGeometryRevealed = vi.fn();
    const options: EncounterStreamOptions = { onGeometryRevealed };
    const event = makeEvent('geometryRevealed', { hexes: [] });
    dispatchEncounterStreamEvent(event, options);
    expect(onGeometryRevealed).toHaveBeenCalledTimes(1);
  });

  it('routes entityAppeared to onEntityAppeared', () => {
    const onEntityAppeared = vi.fn();
    const options: EncounterStreamOptions = { onEntityAppeared };
    // NOTE: v1alpha2 Entity uses `id` (not `entityId`); see types_pb.ts.
    const event = makeEvent('entityAppeared', {
      entity: { id: 'g', position: { x: 1, y: -1, z: 0 } },
      reason: '',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityAppeared).toHaveBeenCalledTimes(1);
  });

  it('routes entityDisappeared to onEntityDisappeared', () => {
    const onEntityDisappeared = vi.fn();
    const options: EncounterStreamOptions = { onEntityDisappeared };
    const event = makeEvent('entityDisappeared', {
      entityId: 'g',
      lastKnownPosition: { x: 2, y: -2, z: 0 },
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityDisappeared).toHaveBeenCalledTimes(1);
  });

  it('routes doorOpened to onDoorOpened', () => {
    const onDoorOpened = vi.fn();
    const options: EncounterStreamOptions = { onDoorOpened };
    // Wave 2.7: revealedHexes/walls/removedWalls intentionally empty here;
    // the geometry side flows on a separate GeometryRevealed event.
    const event = makeEvent('doorOpened', {
      doorEntityId: 'door-east',
      revealedHexes: [],
      revealedWalls: [],
      removedWalls: [],
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onDoorOpened).toHaveBeenCalledTimes(1);
  });

  it('routes entityDamaged to onEntityDamaged', () => {
    const onEntityDamaged = vi.fn();
    const options: EncounterStreamOptions = { onEntityDamaged };
    const event = makeEvent('entityDamaged', {
      entityId: 'goblin-1',
      amount: 5,
      hpAfter: { current: 2, max: 7 },
      sourceEntityId: 'char-alice',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityDamaged).toHaveBeenCalledTimes(1);
  });

  it('passes damageBreakdown components to onEntityDamaged when present', () => {
    const onEntityDamaged = vi.fn();
    const options: EncounterStreamOptions = { onEntityDamaged };
    const event = makeEvent('entityDamaged', {
      entityId: 'goblin-1',
      amount: 10,
      hpAfter: { current: 90, max: 100 },
      damageBreakdown: [
        { source: 'dnd5e:weapons:shortsword', amount: 6, isCritical: false },
        { source: 'dnd5e:abilities:dex', amount: 3, isCritical: false },
        { source: 'dnd5e:features:sneak_attack', amount: 1, isCritical: false },
      ],
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityDamaged).toHaveBeenCalledTimes(1);
    const received = onEntityDamaged.mock.calls[0][0];
    expect(received.damageBreakdown).toHaveLength(3);
    expect(received.damageBreakdown[0].source).toBe('dnd5e:weapons:shortsword');
    expect(received.damageBreakdown[2].source).toBe(
      'dnd5e:features:sneak_attack'
    );
  });

  it('routes statusApplied to onStatusApplied', () => {
    const onStatusApplied = vi.fn();
    const options: EncounterStreamOptions = { onStatusApplied };
    const event = makeEvent('statusApplied', {
      entityId: 'char-alice',
      status: {
        source: { module: 'dnd5e', type: 'condition', id: 'poisoned' },
        displayName: 'Poisoned',
      },
      sourceEntityId: 'goblin-1',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onStatusApplied).toHaveBeenCalledTimes(1);
  });

  it('routes statusRemoved to onStatusRemoved', () => {
    const onStatusRemoved = vi.fn();
    const options: EncounterStreamOptions = { onStatusRemoved };
    const event = makeEvent('statusRemoved', {
      entityId: 'char-alice',
      statusSource: { module: 'dnd5e', type: 'condition', id: 'poisoned' },
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onStatusRemoved).toHaveBeenCalledTimes(1);
  });

  it('routes modeChanged to onModeChanged', () => {
    const onModeChanged = vi.fn();
    const options: EncounterStreamOptions = { onModeChanged };
    // EncounterMode enum values: UNSPECIFIED=0, FREE_ROAM=1, TURN_BASED=2.
    const event = makeEvent('modeChanged', {
      from: 1,
      to: 2,
      reason: 'ambush',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onModeChanged).toHaveBeenCalledTimes(1);
  });

  it('routes turnStarted to onTurnStarted', () => {
    const onTurnStarted = vi.fn();
    const options: EncounterStreamOptions = { onTurnStarted };
    const event = makeEvent('turnStarted', {
      entityId: 'char-alice',
      round: 1,
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onTurnStarted).toHaveBeenCalledTimes(1);
  });

  it('routes turnEnded to onTurnEnded', () => {
    const onTurnEnded = vi.fn();
    const options: EncounterStreamOptions = { onTurnEnded };
    const event = makeEvent('turnEnded', {
      entityId: 'char-alice',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onTurnEnded).toHaveBeenCalledTimes(1);
  });

  // Wave 2.10: death + encounter resolution
  it('routes entityDied to onEntityDied', () => {
    const onEntityDied = vi.fn();
    const options: EncounterStreamOptions = { onEntityDied };
    const event = makeEvent('entityDied', {
      entityId: 'goblin-1',
      killerEntityId: 'char-alice',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityDied).toHaveBeenCalledTimes(1);
  });

  it('routes entityRemoved to onEntityRemoved', () => {
    const onEntityRemoved = vi.fn();
    const options: EncounterStreamOptions = { onEntityRemoved };
    const event = makeEvent('entityRemoved', {
      entityId: 'goblin-1',
      reason: 'destroyed',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityRemoved).toHaveBeenCalledTimes(1);
  });

  it('routes encounterEnded to onEncounterEnded', () => {
    const onEncounterEnded = vi.fn();
    const options: EncounterStreamOptions = { onEncounterEnded };
    const event = makeEvent('encounterEnded', {
      reason: 'all hostiles defeated',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEncounterEnded).toHaveBeenCalledTimes(1);
  });

  // Death-save arc (rpg-toolkit#742, wave KirkDiggler/rpg-project#75)
  it('routes deathSaveRolled to onDeathSaveRolled', () => {
    const onDeathSaveRolled = vi.fn();
    const options: EncounterStreamOptions = { onDeathSaveRolled };
    const event = makeEvent('deathSaveRolled', {
      entityId: 'char-alice',
      roll: 14,
      successes: 2,
      failures: 1,
      isCriticalFail: false,
      isCriticalSuccess: false,
      stabilized: false,
      dead: false,
      regainedConsciousness: false,
      hpRestored: 0,
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onDeathSaveRolled).toHaveBeenCalledTimes(1);
  });

  it('routes entityStabilized to onEntityStabilized', () => {
    const onEntityStabilized = vi.fn();
    const options: EncounterStreamOptions = { onEntityStabilized };
    const event = makeEvent('entityStabilized', {
      entityId: 'char-alice',
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onEntityStabilized).toHaveBeenCalledTimes(1);
  });

  // Wave 2.11d: stream-delivered InputRequired prompts (e.g. NPC-attacker
  // reaction prompts whose reactor is not the action's caller).
  it('routes inputRequiredDelivered to onInputRequiredDelivered', () => {
    const onInputRequiredDelivered = vi.fn();
    const options: EncounterStreamOptions = { onInputRequiredDelivered };
    const event = makeEvent('inputRequiredDelivered', {
      inputRequired: {
        kind: {
          case: 'reactionPrompt',
          value: {
            reactionRef: {
              module: 'dnd5e',
              type: 'spells',
              id: 'shield',
            },
            triggerKind: 'incoming_attack',
            triggerSourceEntityId: 'goblin-1',
            displayText: 'Goblin attacks — react with Shield?',
          },
        },
      },
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onInputRequiredDelivered).toHaveBeenCalledTimes(1);
    // First arg is the InputRequiredDelivered payload itself; callers read
    // .inputRequired to extract the prompt for setPendingPrompt.
    const arg = onInputRequiredDelivered.mock.calls[0]?.[0] as {
      inputRequired?: { kind?: { case?: string } };
    };
    expect(arg.inputRequired?.kind?.case).toBe('reactionPrompt');
  });

  // TakeAction wave (#426): the verb-resolution + live-menu spine.
  it('routes actionResolved to onActionResolved', () => {
    const onActionResolved = vi.fn();
    const options: EncounterStreamOptions = { onActionResolved };
    const event = makeEvent('actionResolved', {
      actorEntityId: 'char-alice',
      actionRef: { module: 'dnd5e', type: 'combat_abilities', id: 'attack' },
      targetEntityId: 'goblin-1',
      economyConsumed: { actions: 1 },
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onActionResolved).toHaveBeenCalledTimes(1);
  });

  it('routes attackResolved to onAttackResolved (including a miss)', () => {
    const onAttackResolved = vi.fn();
    const options: EncounterStreamOptions = { onAttackResolved };
    const event = makeEvent('attackResolved', {
      attackerEntityId: 'char-alice',
      targetEntityId: 'goblin-1',
      hit: false, // #594: a miss must still dispatch
      critical: false,
      attackRoll: 4,
      attackBonus: 5,
      targetAc: 13,
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onAttackResolved).toHaveBeenCalledTimes(1);
    const arg = onAttackResolved.mock.calls[0]?.[0] as { hit?: boolean };
    expect(arg.hit).toBe(false);
  });

  it('routes turnStateChanged to onTurnStateChanged', () => {
    const onTurnStateChanged = vi.fn();
    const options: EncounterStreamOptions = { onTurnStateChanged };
    const event = makeEvent('turnStateChanged', {
      turnState: {
        economy: { actionsRemaining: 1, bonusActionsRemaining: 1 },
        availableActions: [],
      },
    });
    dispatchEncounterStreamEvent(event, options);
    expect(onTurnStateChanged).toHaveBeenCalledTimes(1);
  });

  it('logs a warning for unknown event cases without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const event = makeEvent('someUnknownCase' as 'snapshotDelivered', {});
    expect(() => dispatchEncounterStreamEvent(event, {})).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op when no callback is registered for the event type', () => {
    const event = makeEvent('entityMoved', {
      entityId: 'x',
      actualPath: [],
    });
    expect(() => dispatchEncounterStreamEvent(event, {})).not.toThrow();
  });
});
