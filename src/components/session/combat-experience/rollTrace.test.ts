// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  DamageComponentSchema,
  DiceKeepSchema,
  DiceRerollSchema,
  DiceTraceSchema,
  KeepRule,
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

/** A source that names the ENTITY behind it (R7), which is what the keep line
 * reads to decide whether to say "from <somebody>". */
function sourced(ref: string, name: string, sourceId: string) {
  return create(RollSourceSchema, { ref, name, sourceId });
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
            // A REROLL AND A KEEP RECORD ON ONE POOL (rpg-project#462). The
            // two are siblings and answer different questions: `rerolls`
            // explains why the FACES changed, `keep` explains why one of them
            // counted. A renderer that handled only one would drop the other.
            keep: create(DiceKeepSchema, {
              rule: KeepRule.ADVANTAGE,
              granted: [source('anything:lucky', 'Lucky')],
            }),
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
      '2d8 [1 → 3 → 7, 2] kept 7 · advantage: Lucky + 1d4 [4] = 91'
    );
  });

  it('prints both faces and the kept one when the two faces are equal', () => {
    // THE FORMAT CHANGED HERE AND THE TEST'S POINT CHANGED WITH IT
    // (rpg-project#462). It used to assert `(kept indices [0])`, which named a
    // POSITION IN AN ARRAY and said nothing about why that die counted. The
    // spec replaces that text with the face and the rule.
    //
    // WHICH of two identical faces was kept is no longer printed, and that is
    // the right trade: a reader cannot act on "it was the left 5", and the
    // fact they need — a 5 counted, because advantage — is now said out loud
    // where the index never said it.
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
            keep: create(DiceKeepSchema, {
              rule: KeepRule.ADVANTAGE,
              granted: [source('dnd5e:actions:help', 'Help')],
            }),
          }),
        }),
      ],
      total: 5,
    });

    expect(formatRollCalculation(calculation)).toBe(
      '2d20 [5, 5] kept 5 · advantage: Help = 5'
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

// The four lines the design writes out, and the two that must NOT appear
// (rpg-project#462, design rpg-project#463 "Web").
//
// THE RULE IS READ, NEVER INFERRED. Two faces do not mean advantage and one
// face does not mean a straight roll — a CANCELLED pool has one face and a
// record saying two rules met, which is the whole case the log has never been
// able to show.
describe('the keep record in the log line', () => {
  function d20(
    faces: number[],
    keptIndices: number[],
    keep?: ReturnType<typeof create<typeof DiceKeepSchema>>
  ): RollCalculation {
    return create(RollCalculationSchema, {
      components: [
        create(RollComponentSchema, {
          // The roller's own id on the pool: R7, every pool names the entity
          // whose rule threw it. It is what lets "from <me>" be omitted below.
          source: sourced(
            'dnd5e:skills:intimidation',
            'Intimidation',
            'char-bob'
          ),
          dice: create(DiceTraceSchema, {
            notation: `${faces.length}d20`,
            dieSize: 20,
            originalRolls: faces,
            finalRolls: faces,
            keptIndices,
            subtotal: faces[keptIndices[0] ?? 0],
            keep,
          }),
        }),
      ],
      total: faces[keptIndices[0] ?? 0],
    });
  }

  it('a straight roll says nothing about a rule', () => {
    // The case that runs on almost every roll in the game. Nobody touched the
    // pool, and the absent record says exactly that.
    expect(formatRollCalculation(d20([11], []))).toBe(
      '1d20 [11] Intimidation (char-bob) = 11'
    );
  });

  it('advantage names the rule that granted it', () => {
    const calculation = d20(
      [7, 18],
      [1],
      create(DiceKeepSchema, {
        rule: KeepRule.ADVANTAGE,
        granted: [
          sourced('dnd5e:features:reckless', 'Reckless Attack', 'char-bob'),
        ],
      })
    );
    expect(formatRollCalculation(calculation)).toBe(
      '2d20 [7, 18] kept 18 · advantage: Reckless Attack Intimidation (char-bob) = 18'
    );
  });

  it('disadvantage names the rule that imposed it', () => {
    // The sentence the front room goblin shipped without: a character who
    // threw two dice and kept the lower now learns WHY.
    const calculation = d20(
      [7, 18],
      [0],
      create(DiceKeepSchema, {
        rule: KeepRule.DISADVANTAGE,
        imposed: [sourced('dnd5e:rules:untrained', 'Untrained', 'char-bob')],
      })
    );
    expect(formatRollCalculation(calculation)).toBe(
      '2d20 [7, 18] kept 7 · disadvantage: Untrained Intimidation (char-bob) = 7'
    );
  });

  it('a cancellation says both rules met, on a pool of one die', () => {
    // R2: RAW rolls one die; we roll one die and SAY WHY. Without this line a
    // player who was Helped and rolled untrained sees a plain d20 and never
    // learns the two rules ate each other.
    const calculation = d20(
      [11],
      [],
      create(DiceKeepSchema, {
        rule: KeepRule.CANCELLED,
        granted: [sourced('dnd5e:actions:help', 'Help', 'char-alice')],
        imposed: [sourced('dnd5e:rules:untrained', 'Untrained', 'char-bob')],
      })
    );
    expect(
      formatRollCalculation(calculation, (sourceId) =>
        sourceId === 'char-alice' ? 'Alice' : 'Bob'
      )
    ).toBe(
      '1d20 [11] · advantage (Help, from Alice) cancelled by ' +
        'disadvantage (Untrained) Intimidation (Bob) = 11'
    );
  });

  it('omits "from" for the roller themself, and without a resolver', () => {
    // "advantage: Reckless Attack, from Bob" told to Bob about Bob's own feat
    // is noise. The fact worth printing is somebody ELSE spending something,
    // which is why Help keeps its "from Alice" in the case above.
    const ownFeat = d20(
      [7, 18],
      [1],
      create(DiceKeepSchema, {
        rule: KeepRule.ADVANTAGE,
        granted: [
          sourced('dnd5e:features:reckless', 'Reckless Attack', 'char-bob'),
        ],
      })
    );
    expect(formatRollCalculation(ownFeat, () => 'Bob')).toBe(
      '2d20 [7, 18] kept 18 · advantage: Reckless Attack Intimidation (Bob) = 18'
    );

    const helped = d20(
      [7, 18],
      [1],
      create(DiceKeepSchema, {
        rule: KeepRule.ADVANTAGE,
        granted: [sourced('dnd5e:actions:help', 'Help', 'char-alice')],
      })
    );
    // No resolver: there is nobody to name, so the clause is left off rather
    // than printing a raw id at a player.
    expect(formatRollCalculation(helped)).toBe(
      '2d20 [7, 18] kept 18 · advantage: Help Intimidation (char-bob) = 18'
    );
  });

  it('invents no rule when the record is absent from a two-face pool', () => {
    // Server-side validation refuses this combination, so it is a producer
    // defect. The web renders the faces and claims nothing — deriving
    // "advantage" from two faces is exactly the client calculating that this
    // slice exists to stop.
    expect(formatRollCalculation(d20([7, 18], []))).toBe(
      '2d20 [7, 18] Intimidation (char-bob) = 7'
    );
  });

  it('keeps the old text out of the line entirely', () => {
    // The `(kept indices [N])` text is REPLACED, not kept beside the new
    // words: it named a position in an array and said nothing about why.
    const calculation = d20(
      [7, 18],
      [0],
      create(DiceKeepSchema, {
        rule: KeepRule.DISADVANTAGE,
        imposed: [sourced('dnd5e:rules:untrained', 'Untrained', 'char-bob')],
      })
    );
    expect(formatRollCalculation(calculation)).not.toContain('kept indices');
  });
});
