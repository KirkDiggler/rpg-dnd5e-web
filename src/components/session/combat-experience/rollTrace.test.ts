import { create } from '@bufbuild/protobuf';
import {
  DamageComponentSchema,
  DiceRerollSchema,
  DiceTraceSchema,
  RollCalculationSchema,
  RollComponentSchema,
  RollSourceSchema,
  type DamageComponent,
  type RollCalculation,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { DamageType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { formatDamageRolls, formatRollCalculation } from './rollTrace';

function source(ref: string, name: string, label = '') {
  return create(RollSourceSchema, { ref, name, label });
}

function greatswordComponents(): DamageComponent[] {
  return [
    create(DamageComponentSchema, {
      source: 'weapon',
      damageType: DamageType.SLASHING,
      roll: create(RollComponentSchema, {
        source: source('provider:weapon:any', 'Greatsword'),
        dice: create(DiceTraceSchema, {
          notation: '2d6',
          dieSize: 6,
          originalRolls: [1, 5],
          rerolls: [
            create(DiceRerollSchema, {
              dieIndex: 0,
              before: 1,
              after: 4,
              source: source('provider:condition:any', 'Great Weapon Fighting'),
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
        source: source('provider:ability:any', 'Strength'),
        modifier: 3,
      }),
    }),
  ];
}

function secondWindCalculation(): RollCalculation {
  return create(RollCalculationSchema, {
    components: [
      create(RollComponentSchema, {
        source: source('provider:feature:any', 'Second Wind'),
        dice: create(DiceTraceSchema, {
          notation: '1d10',
          dieSize: 10,
          originalRolls: [6],
          finalRolls: [6],
          subtotal: 6,
        }),
      }),
      create(RollComponentSchema, {
        source: source('provider:class:any', 'Fighter', 'Fighter level'),
        modifier: 1,
      }),
    ],
    total: 7,
  });
}

describe('roll trace presentation', () => {
  it('renders the exact physical GWF expression without recognizing provider refs', () => {
    const components = greatswordComponents();
    const calculation = create(RollCalculationSchema, {
      components: components.map((component) => component.roll!),
      total: 12,
    });

    expect(formatDamageRolls(components)).toBe('2d6 [1 → 4, 5] + 3 Strength');
    expect(formatRollCalculation(calculation)).toBe(
      '2d6 [1 → 4, 5] + 3 Strength = 12'
    );
  });

  it('renders the exact Second Wind calculation with the provider label', () => {
    expect(formatRollCalculation(secondWindCalculation())).toBe(
      '1d10 [6] + 1 Fighter level = 7'
    );
  });

  it('correlates ordered rerolls by die index, shows kept faces, and uses the asserted total', () => {
    const calculation = create(RollCalculationSchema, {
      components: [
        create(RollComponentSchema, {
          source: source('anything:first', 'First pool'),
          dice: create(DiceTraceSchema, {
            notation: '2d8',
            dieSize: 8,
            originalRolls: [1, 2],
            rerolls: [
              create(DiceRerollSchema, {
                dieIndex: 0,
                before: 1,
                after: 3,
                source: source('anything:reroll-a', 'First reroll'),
              }),
              create(DiceRerollSchema, {
                dieIndex: 0,
                before: 3,
                after: 7,
                source: source('anything:reroll-b', 'Second reroll'),
              }),
            ],
            finalRolls: [7, 2],
            keptIndices: [0],
            subtotal: 7,
          }),
        }),
        create(RollComponentSchema, {
          source: source('anything:second', 'Second pool'),
          dice: create(DiceTraceSchema, {
            notation: '1d4',
            dieSize: 4,
            originalRolls: [4],
            finalRolls: [4],
            subtotal: 4,
          }),
        }),
      ],
      // Deliberately inconsistent: presentation must print, not derive, authority.
      total: 91,
    });

    expect(formatRollCalculation(calculation)).toBe(
      '2d8 [1 → 3 → 7, 2] (kept indices [0]) + 1d4 [4] = 91'
    );
  });

  it('retains kept die identity when final faces are duplicates', () => {
    const calculation = create(RollCalculationSchema, {
      components: [
        create(RollComponentSchema, {
          source: source('anything:advantage', 'Advantage'),
          dice: create(DiceTraceSchema, {
            notation: '2d20',
            dieSize: 20,
            originalRolls: [5, 5],
            finalRolls: [5, 5],
            keptIndices: [0],
            subtotal: 5,
          }),
        }),
      ],
      total: 5,
    });

    expect(formatRollCalculation(calculation)).toBe(
      '2d20 [5, 5] (kept indices [0]) = 5'
    );
  });

  it('preserves present-zero and negative modifiers and safely escapes provider labels', () => {
    const calculation = create(RollCalculationSchema, {
      components: [
        create(RollComponentSchema, {
          source: source('anything:zero', 'Ignored name', 'Zero modifier'),
          modifier: 0,
        }),
        create(RollComponentSchema, {
          source: source(
            'anything:negative',
            'Ignored name',
            'Line "curse"\nback\\slash'
          ),
          modifier: -2,
        }),
      ],
      total: -44,
    });

    expect(formatRollCalculation(calculation)).toBe(
      String.raw`0 Zero modifier - 2 "Line \"curse\"\nback\\slash" = -44`
    );
    expect(formatRollCalculation(calculation)).not.toContain('\nback\\slash');

    const damage = [
      ...greatswordComponents(),
      create(DamageComponentSchema, {
        source: 'effect',
        damageType: DamageType.SLASHING,
        roll: create(RollComponentSchema, {
          source: source('anything:penalty', 'Penalty'),
          modifier: -2,
        }),
      }),
    ];
    expect(formatDamageRolls(damage)).toBe(
      '2d6 [1 → 4, 5] + 3 Strength - 2 Penalty'
    );
  });

  it('preserves multiplier presence and provider names without treating them as additive modifiers', () => {
    const components = [
      ...greatswordComponents(),
      create(DamageComponentSchema, {
        source: 'monster_trait',
        damageType: DamageType.SLASHING,
        multiplier: 0,
        roll: create(RollComponentSchema, {
          source: source('anything:immunity', 'Provider Immunity'),
        }),
      }),
      create(DamageComponentSchema, {
        source: 'environment',
        damageType: DamageType.SLASHING,
        multiplier: -0.5,
        roll: create(RollComponentSchema, {
          source: source('anything:odd', 'Odd multiplier'),
        }),
      }),
    ];

    expect(formatDamageRolls(components)).toBe(
      '2d6 [1 → 4, 5] + 3 Strength × 0 Provider Immunity × -0.5 Odd multiplier'
    );
  });

  it('uses an all-or-nothing fallback for wholly legacy, mixed, and empty new damage components', () => {
    const legacy = create(DamageComponentSchema, {
      source: 'weapon',
      sourceRef: 'legacy:weapon',
      dice: '2d6',
      finalRolls: [4, 5],
      flatBonus: 3,
      damageType: DamageType.SLASHING,
    });
    const emptyNew = create(DamageComponentSchema, {
      source: 'effect',
      damageType: DamageType.SLASHING,
      roll: create(RollComponentSchema, {
        source: source('anything:empty', 'Empty provider source'),
      }),
    });

    expect(formatDamageRolls([legacy])).toBeUndefined();
    expect(
      formatDamageRolls([...greatswordComponents(), legacy])
    ).toBeUndefined();
    expect(formatDamageRolls([emptyNew])).toBeUndefined();
    expect(
      formatDamageRolls([...greatswordComponents(), emptyNew])
    ).toBeUndefined();
    expect(formatDamageRolls([])).toBeUndefined();
    expect(
      formatRollCalculation(
        create(RollCalculationSchema, { components: [], total: 73 })
      )
    ).toBeUndefined();
    expect(
      formatRollCalculation(undefined as unknown as RollCalculation)
    ).toBeUndefined();
  });

  it('accepts a valid multiplier-only new damage component', () => {
    const multiplier = create(DamageComponentSchema, {
      source: 'monster_trait',
      damageType: DamageType.SLASHING,
      multiplier: 0,
      roll: create(RollComponentSchema, {
        source: source('anything:immunity', 'Provider Immunity'),
      }),
    });

    expect(formatDamageRolls([multiplier])).toBe('× 0 Provider Immunity');
    expect(formatDamageRolls([...greatswordComponents(), multiplier])).toBe(
      '2d6 [1 → 4, 5] + 3 Strength × 0 Provider Immunity'
    );
  });
});
