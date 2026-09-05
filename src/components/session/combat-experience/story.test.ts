import { create } from '@bufbuild/protobuf';
import {
  ActivatedSchema,
  ActivationResultSchema,
  ArrivedSchema,
  CapacityGrantedSchema,
  ConditionAppliedSchema,
  ConditionRemovedSchema,
  DamageComponentSchema,
  DiceRerollSchema,
  DiceTraceSchema,
  DownedSchema,
  EventKind,
  EventSchema,
  FightEndedSchema,
  HealingAppliedSchema,
  RollCalculationSchema,
  RollComponentSchema,
  RollSourceSchema,
  StanceChangedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AbilityRefSchema,
  DamageType,
  DissolveKind,
  PlacementKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import {
  buildCombatAttackOutcome,
  buildCombatStory,
  type CombatStoryFact,
} from './story';

const context = {
  viewerMember: 'aldric',
  memberNames: {
    aldric: 'Aldric',
    'skeleton-guard': 'Skeleton Guard',
  },
};

function visible(
  event: CombatStoryFact['event'],
  source: CombatStoryFact['source'] = 'live'
): CombatStoryFact {
  return { event, source, visible: true };
}

function activated(seq = 24n) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 10n,
    recipient: 'aldric',
    kind: EventKind.ACTIVATED,
    body: {
      case: 'activated',
      value: create(ActivatedSchema, {
        actor: 'aldric',
        ability: create(AbilityRefSchema, {
          ref: 'dnd5e:features:second_wind',
          name: 'Second Wind',
        }),
        target: '',
      }),
    },
  });
}

function rollSource(ref: string, name: string, label = '') {
  return create(RollSourceSchema, { ref, name, label });
}

function secondWindCalculation() {
  return create(RollCalculationSchema, {
    components: [
      create(RollComponentSchema, {
        source: rollSource('provider:feature:wind', 'Second Wind'),
        dice: create(DiceTraceSchema, {
          notation: '1d10',
          dieSize: 10,
          originalRolls: [6],
          finalRolls: [6],
          subtotal: 6,
        }),
      }),
      create(RollComponentSchema, {
        source: rollSource(
          'provider:class:fighter',
          'Fighter',
          'Fighter level'
        ),
        modifier: 1,
      }),
    ],
    total: 7,
  });
}

function healingResult(
  modifier: number,
  requested: number,
  seq = 25n,
  roll = 6,
  amount = 2,
  hpBefore = 8,
  hpAfter = 10
) {
  return create(EventSchema, {
    session: 'crypt-run',
    seq,
    at: 10n,
    recipient: 'aldric',
    kind: EventKind.ACTIVATION_RESULT,
    body: {
      case: 'activationResult',
      value: create(ActivationResultSchema, {
        actor: 'aldric',
        result: {
          case: 'healingApplied',
          value: create(HealingAppliedSchema, {
            target: 'aldric',
            amount,
            requested,
            roll,
            modifier,
            sourceRef: 'dnd5e:features:second_wind',
            sourceName: 'Second Wind',
            hpBefore,
            hpAfter,
          }),
        },
      }),
    },
  });
}

describe('typed combat Story', () => {
  it('groups exactly one Struck/Missed by authoritative session and sequence', () => {
    const first = createAttackAuthorityFixture();
    const conflictingDuplicate = createAttackAuthorityFixture({
      hit: false,
      damage: 0,
      roll: 2,
      total: 7,
    });

    const story = buildCombatStory(
      [visible(first.event), visible(conflictingDuplicate.event)],
      context
    );

    expect(story).toHaveLength(1);
    expect(story[0]?.detail).toContain('12');
    expect(story[0]?.detail).not.toContain('2 →');
  });

  it('uses the provider full AttackRef, display name, and damage type without deriving HP', () => {
    const facts = createAttackAuthorityFixture({
      attackRef: 'dnd5e:weapons:longsword',
      attackName: 'Longsword',
      damageType: DamageType.SLASHING,
      damage: 8,
    });
    const [entry] = buildCombatStory([visible(facts.event)], context);
    const outcome = buildCombatAttackOutcome(facts.event, context);

    expect(entry).toMatchObject({
      eyebrow: 'Aldric · Longsword',
      attack: {
        ref: 'dnd5e:weapons:longsword',
        name: 'Longsword',
        damageType: DamageType.SLASHING,
      },
    });
    expect(entry?.detail).toContain('8 slashing damage');
    expect(outcome).toMatchObject({
      action: 'Longsword',
      attackRef: 'dnd5e:weapons:longsword',
      damage: 8,
      damageType: 'slashing',
    });
    expect(outcome).not.toHaveProperty('bonus');
    expect(outcome).not.toHaveProperty('hpAfter');
  });

  it('renders exact provider-authored GWF damage while preserving attack d20 presentation', () => {
    const facts = createAttackAuthorityFixture({
      roll: 15,
      total: 20,
      damage: 12,
      attackName: 'Greatsword',
      damageType: DamageType.SLASHING,
    });
    if (facts.event.body.case !== 'struck') throw new Error('expected strike');
    facts.event.body.value.damageComponents = [
      create(DamageComponentSchema, {
        source: 'weapon',
        damageType: DamageType.SLASHING,
        roll: create(RollComponentSchema, {
          source: rollSource('provider:weapon:greatsword', 'Greatsword'),
          dice: create(DiceTraceSchema, {
            notation: '2d6',
            dieSize: 6,
            originalRolls: [1, 5],
            rerolls: [
              create(DiceRerollSchema, {
                dieIndex: 0,
                before: 1,
                after: 4,
                source: rollSource(
                  'provider:condition:gwf',
                  'Great Weapon Fighting'
                ),
              }),
            ],
            finalRolls: [4, 5],
            subtotal: 9,
          }),
        }),
      }),
      create(DamageComponentSchema, {
        source: 'ability',
        damageType: DamageType.SLASHING,
        roll: create(RollComponentSchema, {
          source: rollSource('provider:ability:strength', 'Strength'),
          modifier: 3,
        }),
      }),
    ];

    const [entry] = buildCombatStory([visible(facts.event)], context);

    expect(entry?.detail).toBe(
      'd20 15 · total 20 against AC 13 · Hit · ' +
        'Greatsword rolled 2d6 [1 → 4, 5] + 3 Strength = 12 slashing damage'
    );
  });

  it('keeps legacy damage on its aggregate fallback without fabricating a trace', () => {
    const facts = createAttackAuthorityFixture({ damage: 12 });
    if (facts.event.body.case !== 'struck') throw new Error('expected strike');
    facts.event.body.value.damageComponents = [
      create(DamageComponentSchema, {
        source: 'weapon',
        sourceRef: 'legacy:greatsword',
        dice: '2d6',
        finalRolls: [4, 5],
        flatBonus: 3,
        damageType: DamageType.SLASHING,
      }),
    ];

    const [entry] = buildCombatStory([visible(facts.event)], context);

    expect(entry?.detail).toBe(
      'd20 12 · total 17 against AC 13 · Hit · 12 slashing damage'
    );
    expect(entry?.detail).not.toContain('2d6');
  });

  it('falls back to aggregate damage instead of equating a partial traced expression to the full total', () => {
    const facts = createAttackAuthorityFixture({ damage: 12 });
    if (facts.event.body.case !== 'struck') throw new Error('expected strike');
    facts.event.body.value.damageComponents = [
      create(DamageComponentSchema, {
        source: 'ability',
        damageType: DamageType.SLASHING,
        roll: create(RollComponentSchema, {
          source: rollSource('provider:ability:strength', 'Strength'),
          modifier: 3,
        }),
      }),
      create(DamageComponentSchema, {
        source: 'weapon',
        sourceRef: 'legacy:greatsword',
        dice: '2d6',
        finalRolls: [4, 5],
        flatBonus: 0,
        damageType: DamageType.SLASHING,
      }),
    ];

    const [entry] = buildCombatStory([visible(facts.event)], context);

    expect(entry?.detail).toBe(
      'd20 12 · total 17 against AC 13 · Hit · 12 slashing damage'
    );
    expect(entry?.detail).not.toContain('3 Strength = 12');
  });

  it('renders a Missed event without inventing zero damage', () => {
    const facts = createAttackAuthorityFixture({
      hit: false,
      damage: 0,
      roll: 3,
      total: 8,
    });
    const [entry] = buildCombatStory([visible(facts.event)], context);
    const outcome = buildCombatAttackOutcome(facts.event, context);

    expect(entry?.headline).toBe('Skeleton Guard evades Aldric');
    expect(entry?.detail).toBe('d20 3 · total 8 against AC 13 · Miss');
    expect(outcome).not.toHaveProperty('damage');
    expect(outcome?.hit).toBe(false);
  });

  it('renders Activated and each healing result as ordered separate entries with applied HP and positive arithmetic', () => {
    const activation = activated();
    const healing = healingResult(1, 7);
    activation.payload = new TextEncoder().encode('Use Parsed Ref Name');
    healing.payload = new TextEncoder().encode('Heal 999 HP');

    const story = buildCombatStory(
      [visible(activation), visible(healing)],
      context
    );

    expect(story.map((entry) => entry.headline)).toEqual([
      'Aldric uses Second Wind',
      'Aldric recovers 2 HP',
    ]);
    expect(story[0]?.detail).toBe('Story sequence 24.');
    expect(story[0]?.detail).not.toContain('target');
    expect(story[1]?.detail).toBe(
      'Second Wind rolled 6 + 1 = 7; 2 applied (8 → 10 HP).'
    );
    expect(JSON.stringify(story)).not.toMatch(/Parsed Ref|999/);
  });

  it('renders the exact Second Wind calculation and authoritative clamp facts', () => {
    const healing = healingResult(0, 7);
    if (
      healing.body.case !== 'activationResult' ||
      healing.body.value.result.case !== 'healingApplied'
    ) {
      throw new Error('expected healing result');
    }
    healing.body.value.result.value.calculation = secondWindCalculation();

    const [entry] = buildCombatStory([visible(healing)], context);

    expect(entry?.detail).toBe(
      'Second Wind rolled 1d10 [6] + 1 Fighter level = 7; ' +
        '2 applied (8 → 10 HP).'
    );
  });

  it('keeps the traced calculation when authoritative clamping applies zero healing', () => {
    const healing = healingResult(0, 7, 25n, 0, 0, 10, 10);
    if (
      healing.body.case !== 'activationResult' ||
      healing.body.value.result.case !== 'healingApplied'
    ) {
      throw new Error('expected healing result');
    }
    healing.body.value.result.value.calculation = secondWindCalculation();

    const [entry] = buildCombatStory([visible(healing)], context);

    expect(entry?.detail).toBe(
      'Second Wind rolled 1d10 [6] + 1 Fighter level = 7; ' +
        '0 applied (10 → 10 HP).'
    );
  });

  it('resolves a valid targeted Activated member ID in the detail', () => {
    const event = create(EventSchema, {
      session: 'crypt-run',
      seq: 25n,
      at: 10n,
      recipient: 'aldric',
      kind: EventKind.ACTIVATED,
      body: {
        case: 'activated',
        value: create(ActivatedSchema, {
          actor: 'aldric',
          ability: create(AbilityRefSchema, {
            ref: 'dnd5e:actions:help',
            name: 'Help',
          }),
          target: 'skeleton-guard',
        }),
      },
    });

    const [entry] = buildCombatStory([visible(event)], context);

    expect(entry?.headline).toBe('Aldric uses Help');
    expect(entry?.detail).toBe('Skeleton Guard is the target.');
  });

  it.each([
    {
      label: 'negative',
      modifier: -1,
      requested: 5,
      detail: 'Second Wind rolled 6 - 1 = 5; 2 applied (8 → 10 HP).',
    },
    {
      label: 'zero',
      modifier: 0,
      requested: 6,
      detail: 'Second Wind rolled 6 = 6; 2 applied (8 → 10 HP).',
    },
  ])(
    'formats $label healing modifiers without invalid signed prose',
    (test) => {
      const [entry] = buildCombatStory(
        [visible(healingResult(test.modifier, test.requested))],
        context
      );

      expect(entry?.detail).toBe(test.detail);
      expect(entry?.detail).not.toContain('+ -');
    }
  );

  it('keeps nonzero roll arithmetic when authoritative clamping applies zero healing', () => {
    const [entry] = buildCombatStory(
      [visible(healingResult(1, 7, 25n, 6, 0, 10, 10))],
      context
    );

    expect(entry?.headline).toBe('Aldric recovers 0 HP');
    expect(entry?.detail).toBe(
      'Second Wind rolled 6 + 1 = 7; 0 applied (10 → 10 HP).'
    );
  });

  it('omits healing arithmetic only when both raw roll inputs are zero', () => {
    const [entry] = buildCombatStory(
      [visible(healingResult(0, 0, 25n, 0))],
      context
    );

    expect(entry?.detail).toBe('Second Wind; 2 applied (8 → 10 HP).');
  });

  it('renders every non-healing activation result from its typed provider fields', () => {
    const conditionApplied = create(EventSchema, {
      session: 'crypt-run',
      seq: 26n,
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'aldric',
          result: {
            case: 'conditionApplied',
            value: create(ConditionAppliedSchema, {
              target: 'aldric',
              ref: 'dnd5e:conditions:raging',
              name: 'Raging',
            }),
          },
        }),
      },
    });
    const conditionRemoved = create(EventSchema, {
      session: 'crypt-run',
      seq: 27n,
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'aldric',
          result: {
            case: 'conditionRemoved',
            value: create(ConditionRemovedSchema, {
              target: 'skeleton-guard',
              ref: 'module:condition:provider-slug',
              name: 'Provider Ward',
              reason: 'the ward expired',
            }),
          },
        }),
      },
    });
    const capacity = create(EventSchema, {
      session: 'crypt-run',
      seq: 28n,
      kind: EventKind.ACTIVATION_RESULT,
      body: {
        case: 'activationResult',
        value: create(ActivationResultSchema, {
          actor: 'aldric',
          result: {
            case: 'capacityGranted',
            value: create(CapacityGrantedSchema, {
              member: 'aldric',
              description: '30ft movement',
            }),
          },
        }),
      },
    });

    const story = buildCombatStory(
      [visible(conditionApplied), visible(conditionRemoved), visible(capacity)],
      context
    );

    expect(story).toMatchObject([
      {
        headline: 'Aldric begins Raging',
      },
      {
        headline: 'Skeleton Guard is no longer Provider Ward',
        detail: 'the ward expired',
      },
      {
        headline: 'Aldric gains capacity',
        detail: '30ft movement',
      },
    ]);
    expect(JSON.stringify(story)).not.toContain('provider-slug');
  });

  it('omits a buffered actor event rather than falling back to payload prose', () => {
    const facts = createAttackAuthorityFixture();
    facts.event.payload = new TextEncoder().encode(
      'AUTHORED EARLY SPOILER: Aldric rolled twelve'
    );

    expect(
      buildCombatStory(
        [{ event: facts.event, source: 'live', visible: false }],
        context
      )
    ).toEqual([]);
  });

  it('keeps other Story entries sourced from typed bodies and ignores raw payload', () => {
    const event = create(EventSchema, {
      session: 'crypt-run',
      seq: 24n,
      at: 10n,
      recipient: 'aldric',
      kind: EventKind.DOWNED,
      payload: new TextEncoder().encode('fixture says a dragon explodes'),
      body: {
        case: 'downed',
        value: create(DownedSchema, { member: 'skeleton-guard' }),
      },
    });

    const [entry] = buildCombatStory([visible(event)], context);
    expect(entry?.headline).toBe('Skeleton Guard is downed');
    expect(JSON.stringify(entry)).not.toContain('dragon explodes');
  });
});

describe('the Story log on the hold-out beats (rpg-project#375 §5)', () => {
  /** One live, visible fact from a real event, as the stream delivers it. */
  function beat(
    seq: bigint,
    kind: EventKind,
    body: CombatStoryFact['event']['body']
  ): CombatStoryFact {
    return visible(
      create(EventSchema, { session: 'camp-run', seq, kind, body })
    );
  }

  it('a stance change is one entry: the pair and the word, nothing of why', () => {
    const [entry] = buildCombatStory(
      [
        beat(7n, EventKind.STANCE_CHANGED, {
          case: 'stanceChanged',
          value: create(StanceChangedSchema, {
            between: ['goblins', 'party'],
            stance: 'neutral',
          }),
        }),
      ],
      context
    );
    expect(entry.eyebrow).toBe('Stance');
    expect(entry.headline).toBe(
      'The goblins and the party are no longer hostile'
    );
    expect(entry.detail).toContain('Now neutral');
    expect(entry.tone).toBe('success');
  });

  it('an arrival names the placement by the author’s own id', () => {
    const [monster, prop] = buildCombatStory(
      [
        beat(8n, EventKind.ARRIVED, {
          case: 'arrived',
          value: create(ArrivedSchema, {
            id: 'reinforcement-1',
            kind: PlacementKind.MONSTER,
            cell: { x: 1, y: 4 },
          }),
        }),
        beat(9n, EventKind.ARRIVED, {
          case: 'arrived',
          value: create(ArrivedSchema, {
            id: 'letter',
            kind: PlacementKind.PROP,
            cell: { x: 1, y: 3 },
          }),
        }),
      ],
      context
    );
    expect(monster.eyebrow).toBe('Arrival');
    expect(monster.headline).toBe('The reinforcement 1 arrives at 1,4');
    expect(prop.headline).toBe('The letter appears at 1,3');
  });

  it('a fight ended BY_STANCE says the sides stood down; BY_DEFEAT keeps the old line', () => {
    const [byStance, byDefeat] = buildCombatStory(
      [
        beat(10n, EventKind.FIGHT_ENDED, {
          case: 'fightEnded',
          value: create(FightEndedSchema, { cause: DissolveKind.BY_STANCE }),
        }),
        beat(11n, EventKind.FIGHT_ENDED, {
          case: 'fightEnded',
          value: create(FightEndedSchema, { cause: DissolveKind.BY_DEFEAT }),
        }),
      ],
      context
    );
    expect(byStance.headline).toBe(
      'The fight dissolves — the sides are no longer hostile'
    );
    expect(byDefeat.headline).toBe('The fight is over');
  });
});
