import { describe, expect, it } from 'vitest';
import type { DiceKind } from '../../components/ui/dice/diceRollGroup';
import { parseDiceRollGroupInput } from '../../components/ui/dice/diceRollGroup';
import {
  SHARED_TABLE_DICE_SCENARIOS,
  type SharedTableDiceScenario,
} from './sharedTableDiceFixtures';

function expectRecursivelyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>))
    expectRecursivelyFrozen(child);
}

function kindsRecord(): Readonly<Record<DiceKind, string>> {
  return Object.freeze({
    d4: 'dice.original.carved.d4',
    d6: 'dice.original.carved.d6',
    d8: 'dice.original.carved.d8',
    d10: 'dice.original.carved.d10',
    d12: 'dice.original.carved.d12',
    d20: 'dice.original.carved.d20',
  });
}

function expectScenarioIntegrity(scenario: SharedTableDiceScenario) {
  expect(scenario.label).toContain('Fixture / simulated');
  expect(scenario.players.map((player) => player.memberId)).toEqual([
    ...new Set(scenario.players.map((player) => player.memberId)),
  ]);
  expect(scenario.players.map((player) => player.setId)).toEqual([
    ...new Set(scenario.players.map((player) => player.setId)),
  ]);
  expect(scenario.sets.map((set) => set.id)).toEqual([
    ...new Set(scenario.sets.map((set) => set.id)),
  ]);
  expect(
    scenario.players.some(
      (player) => player.memberId === scenario.rollerMemberId
    )
  ).toBe(true);
  expect(
    scenario.players.some(
      (player) => player.memberId === scenario.witnessMemberId
    )
  ).toBe(true);
  expect(scenario.rollerMemberId).not.toBe(scenario.witnessMemberId);

  const playersById = new Map(
    scenario.players.map((player) => [player.memberId, player] as const)
  );
  const setsById = new Map(scenario.sets.map((set) => [set.id, set] as const));

  for (const set of scenario.sets) {
    expect(set.displayName).toContain('Fixture / simulated');
    expect(set.presetByKind).toEqual(kindsRecord());
  }

  for (const group of [scenario.attack, scenario.damage].filter(Boolean)) {
    const parsed = parseDiceRollGroupInput(group);
    expect(parsed).toEqual(group);
    for (const die of group!.dice) {
      const contributor = playersById.get(die.contributorMemberId);
      expect(contributor).toBeDefined();
      expect(contributor?.setId).toBe(die.setId);
      expect(setsById.has(die.setId)).toBe(true);
    }
  }

  expectRecursivelyFrozen(scenario);
}

describe('shared table dice fixtures', () => {
  it('publishes unique strict scenarios with visible fixture labels and exact Original carved presets', () => {
    const scenarios = Object.values(SHARED_TABLE_DICE_SCENARIOS);

    expect(Object.keys(SHARED_TABLE_DICE_SCENARIOS)).toEqual([
      'single-d20',
      'bless-mixed-attack',
      'ordinary-damage',
      'critical-damage',
      'great-weapon-fighting',
      'duplicate-release',
      'missing-release',
      'reduced-motion',
      'provider-failure',
    ]);
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      ...new Set(scenarios.map((scenario) => scenario.id)),
    ]);
    for (const scenario of scenarios) expectScenarioIntegrity(scenario);

    const serializedTreatments = new Set(
      scenarios
        .flatMap((scenario) => scenario.sets)
        .map((set) => JSON.stringify(set.treatment))
    );
    expect(serializedTreatments.size).toBe(2);
  });

  it('pins the single-d20 and bless attack facts without deriving totals', () => {
    const single = SHARED_TABLE_DICE_SCENARIOS['single-d20'];
    const bless = SHARED_TABLE_DICE_SCENARIOS['bless-mixed-attack'];

    expect(single.hit).toBe(false);
    expect(single.damage).toBeUndefined();
    expect(single.attack.key).toBe('attack');
    expect(single.attack.dice).toHaveLength(1);
    expect(single.attack.dice[0]).toMatchObject({
      kind: 'd20',
      contributorMemberId: single.rollerMemberId,
      purpose: 'base',
    });

    expect(bless.hit).toBe(false);
    expect(bless.damage).toBeUndefined();
    expect(bless.attack.dice).toHaveLength(2);
    expect(bless.attack.dice.map((die) => die.kind)).toEqual(['d20', 'd4']);
    expect(bless.attack.dice[0]?.contributorMemberId).toBe(
      bless.rollerMemberId
    );
    expect(bless.attack.dice[1]?.contributorMemberId).toBe(
      bless.witnessMemberId
    );
    expect(bless.attack.dice[0]?.setId).not.toBe(bless.attack.dice[1]?.setId);
  });

  it('pins the supplied ordinary, critical, and great-weapon-fighting damage facts', () => {
    const ordinary = SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'];
    const critical = SHARED_TABLE_DICE_SCENARIOS['critical-damage'];
    const gwf = SHARED_TABLE_DICE_SCENARIOS['great-weapon-fighting'];

    expect(ordinary.hit).toBe(true);
    expect(ordinary.damage?.dice.length).toBeGreaterThanOrEqual(2);
    expect(ordinary.impactLabel).toBeDefined();

    expect(critical.hit).toBe(true);
    expect(
      critical.damage?.dice.some((die) => die.purpose === 'critical')
    ).toBe(true);

    expect(gwf.hit).toBe(true);
    expect(gwf.damage?.dice).toHaveLength(3);
    expect(gwf.damage?.dice.map((die) => die.finalFace)).toEqual([5, 4, 6]);
    expect(gwf.damage?.dice[0]?.rerolls).toEqual([
      {
        before: 1,
        after: 5,
        reasonRef: 'reason:great-weapon-fighting',
        displayLabel: 'Great Weapon Fighting',
      },
    ]);
    expect(gwf.damage?.dice[1]?.rerolls).toEqual([
      {
        before: 2,
        after: 4,
        reasonRef: 'reason:great-weapon-fighting',
        displayLabel: 'Great Weapon Fighting',
      },
    ]);
    expect(gwf.damage?.dice[2]?.rerolls).toEqual([]);
  });

  it('reuses the exact supplied ordinary-damage facts for duplicate, missing, reduced-motion, and provider-failure exercises', () => {
    const ordinary = SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'];
    const duplicate = SHARED_TABLE_DICE_SCENARIOS['duplicate-release'];
    const missing = SHARED_TABLE_DICE_SCENARIOS['missing-release'];
    const reduced = SHARED_TABLE_DICE_SCENARIOS['reduced-motion'];
    const provider = SHARED_TABLE_DICE_SCENARIOS['provider-failure'];

    for (const scenario of [duplicate, missing, reduced, provider]) {
      expect(scenario.players).toBe(ordinary.players);
      expect(scenario.sets).toBe(ordinary.sets);
      expect(scenario.attack).toBe(ordinary.attack);
      expect(scenario.damage).toBe(ordinary.damage);
      expect(scenario.hit).toBe(ordinary.hit);
      expect(scenario.impactLabel).toBe(ordinary.impactLabel);
    }

    expect(duplicate.exercise).toBe('duplicate-release');
    expect(missing.exercise).toBe('missing-release');
    expect(reduced.exercise).toBeUndefined();
    expect(provider.exercise).toBe('provider-failure');
  });
});
