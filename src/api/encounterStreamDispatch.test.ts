import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { describe, expect, it, vi } from 'vitest';
import {
  dispatchEncounterStreamEvent,
  type EncounterEventMetadata,
  type EncounterStreamOptions,
} from './encounterStreamDispatch';

function makeEvent<K extends string, V>(
  caseName: K,
  value: V,
  metadata: EncounterEventMetadata = {
    sequence: 1n,
    timestamp: undefined,
    correlationId: '',
  }
): EncounterEvent {
  return {
    ...metadata,
    event: { case: caseName, value },
  } as unknown as EncounterEvent;
}

const routedCases = [
  ['snapshotDelivered', 'onSnapshotDelivered', { encounter: undefined }],
  ['entityMoved', 'onEntityMoved', { entityId: 'a', actualPath: [] }],
  ['geometryRevealed', 'onGeometryRevealed', { hexes: [] }],
  ['entityAppeared', 'onEntityAppeared', { entity: { id: 'g' }, reason: '' }],
  ['entityDisappeared', 'onEntityDisappeared', { entityId: 'g' }],
  ['doorOpened', 'onDoorOpened', { doorEntityId: 'door-east' }],
  ['entityDamaged', 'onEntityDamaged', { entityId: 'g', amount: 5 }],
  ['statusApplied', 'onStatusApplied', { entityId: 'g', status: {} }],
  ['statusRemoved', 'onStatusRemoved', { entityId: 'g', statusSource: {} }],
  ['modeChanged', 'onModeChanged', { from: 1, to: 2, reason: 'ambush' }],
  ['initiativeRolled', 'onInitiativeRolled', { order: [] }],
  ['turnStarted', 'onTurnStarted', { entityId: 'a', round: 1 }],
  ['turnEnded', 'onTurnEnded', { entityId: 'a' }],
  [
    'actionResolved',
    'onActionResolved',
    {
      actorEntityId: 'a',
      actionRef: {},
      targetEntityId: 'g',
      economyConsumed: {},
    },
  ],
  [
    'attackResolved',
    'onAttackResolved',
    {
      attackerEntityId: 'a',
      targetEntityId: 'g',
      hit: false,
      critical: false,
      attackRoll: 4,
      attackBonus: 5,
      targetAc: 13,
    },
  ],
  ['turnStateChanged', 'onTurnStateChanged', { turnState: {} }],
  ['entityDied', 'onEntityDied', { entityId: 'g' }],
  ['entityRemoved', 'onEntityRemoved', { entityId: 'g', reason: 'destroyed' }],
  ['encounterEnded', 'onEncounterEnded', { reason: 'ended' }],
  ['deathSaveRolled', 'onDeathSaveRolled', { entityId: 'a', roll: 14 }],
  ['entityStabilized', 'onEntityStabilized', { entityId: 'a' }],
  ['inputRequiredDelivered', 'onInputRequiredDelivered', { inputRequired: {} }],
] as const;

describe('dispatchEncounterStreamEvent', () => {
  describe.each(routedCases)('%s', (caseName, callbackName, payload) => {
    it(`routes payload and exact envelope metadata to ${callbackName}`, () => {
      const callback = vi.fn();
      const metadata: EncounterEventMetadata = {
        sequence: 9007199254740993n,
        timestamp: {
          seconds: 1721815200n,
          nanos: 123456789,
        } as EncounterEventMetadata['timestamp'],
        correlationId: `corr-${caseName}`,
      };

      dispatchEncounterStreamEvent(makeEvent(caseName, payload, metadata), {
        [callbackName]: callback,
      } as EncounterStreamOptions);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(payload, metadata);
    });
  });

  it('passes damageBreakdown components to onEntityDamaged when present', () => {
    const onEntityDamaged = vi.fn();
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

    dispatchEncounterStreamEvent(event, { onEntityDamaged });

    const received = onEntityDamaged.mock.calls[0][0];
    expect(received.damageBreakdown).toHaveLength(3);
    expect(received.damageBreakdown[0].source).toBe('dnd5e:weapons:shortsword');
    expect(received.damageBreakdown[2].source).toBe(
      'dnd5e:features:sneak_attack'
    );
  });

  it('dispatches attackResolved including a miss', () => {
    const onAttackResolved = vi.fn();
    const event = makeEvent('attackResolved', {
      attackerEntityId: 'char-alice',
      targetEntityId: 'goblin-1',
      hit: false,
      critical: false,
      attackRoll: 4,
      attackBonus: 5,
      targetAc: 13,
    });

    dispatchEncounterStreamEvent(event, { onAttackResolved });

    expect(onAttackResolved.mock.calls[0][0].hit).toBe(false);
  });

  it('passes input prompts to onInputRequiredDelivered', () => {
    const onInputRequiredDelivered = vi.fn();
    const event = makeEvent('inputRequiredDelivered', {
      inputRequired: {
        kind: {
          case: 'reactionPrompt',
          value: {
            reactionRef: { module: 'dnd5e', type: 'spells', id: 'shield' },
            triggerKind: 'incoming_attack',
            triggerSourceEntityId: 'goblin-1',
            displayText: 'Goblin attacks - react with Shield?',
          },
        },
      },
    });

    dispatchEncounterStreamEvent(event, { onInputRequiredDelivered });

    expect(
      onInputRequiredDelivered.mock.calls[0][0].inputRequired.kind.case
    ).toBe('reactionPrompt');
  });

  it('passes exact per-envelope metadata with one shared correlation to ActionResolved, AttackResolved, and EntityDamaged', () => {
    const action = vi.fn();
    const attack = vi.fn();
    const damage = vi.fn();
    const actionMetadata: EncounterEventMetadata = {
      sequence: 91n,
      timestamp: {
        seconds: 1721815200n,
        nanos: 100,
      } as EncounterEventMetadata['timestamp'],
      correlationId: 'corr-attack-chain',
    };
    const attackMetadata: EncounterEventMetadata = {
      sequence: 92n,
      timestamp: {
        seconds: 1721815201n,
        nanos: 200,
      } as EncounterEventMetadata['timestamp'],
      correlationId: 'corr-attack-chain',
    };
    const damageMetadata: EncounterEventMetadata = {
      sequence: 93n,
      timestamp: {
        seconds: 1721815202n,
        nanos: 300,
      } as EncounterEventMetadata['timestamp'],
      correlationId: 'corr-attack-chain',
    };
    const options: EncounterStreamOptions = {
      onActionResolved: action,
      onAttackResolved: attack,
      onEntityDamaged: damage,
    };

    dispatchEncounterStreamEvent(
      makeEvent('actionResolved', { actorEntityId: 'a' }, actionMetadata),
      options
    );
    dispatchEncounterStreamEvent(
      makeEvent('attackResolved', { attackerEntityId: 'a' }, attackMetadata),
      options
    );
    dispatchEncounterStreamEvent(
      makeEvent('entityDamaged', { entityId: 'g', amount: 7 }, damageMetadata),
      options
    );

    expect(action.mock.calls[0][1]).toEqual(actionMetadata);
    expect(attack.mock.calls[0][1]).toEqual(attackMetadata);
    expect(damage.mock.calls[0][1]).toEqual(damageMetadata);
    expect(action.mock.calls[0][1].correlationId).toBe(
      attack.mock.calls[0][1].correlationId
    );
    expect(attack.mock.calls[0][1].correlationId).toBe(
      damage.mock.calls[0][1].correlationId
    );
  });

  it('passes empty correlationId and undefined timestamp through unchanged', () => {
    const onTurnStateChanged = vi.fn();
    const metadata: EncounterEventMetadata = {
      sequence: 42n,
      timestamp: undefined,
      correlationId: '',
    };

    dispatchEncounterStreamEvent(
      makeEvent('turnStateChanged', { turnState: {} }, metadata),
      { onTurnStateChanged }
    );

    expect(onTurnStateChanged).toHaveBeenCalledWith(
      { turnState: {} },
      metadata
    );
  });

  it('dispatches modeChanged and initiativeRolled independently when they share the same wire sequence', () => {
    const onModeChanged = vi.fn();
    const onInitiativeRolled = vi.fn();
    const metadata: EncounterEventMetadata = {
      sequence: 42n,
      timestamp: undefined,
      correlationId: '',
    };

    dispatchEncounterStreamEvent(
      makeEvent('modeChanged', { from: 1, to: 2, reason: 'sighted' }, metadata),
      { onModeChanged, onInitiativeRolled }
    );
    dispatchEncounterStreamEvent(
      makeEvent(
        'initiativeRolled',
        { order: ['char-alice', 'goblin-1'] },
        metadata
      ),
      { onModeChanged, onInitiativeRolled }
    );

    expect(onModeChanged).toHaveBeenCalledOnce();
    expect(onInitiativeRolled).toHaveBeenCalledOnce();
  });

  it('logs a warning for unknown event cases without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const event = makeEvent('someUnknownCase' as 'snapshotDelivered', {});

    expect(() => dispatchEncounterStreamEvent(event, {})).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op when no callback is registered for the event type', () => {
    const event = makeEvent('entityMoved', { entityId: 'x', actualPath: [] });

    expect(() => dispatchEncounterStreamEvent(event, {})).not.toThrow();
  });
});
