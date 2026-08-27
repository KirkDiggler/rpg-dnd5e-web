import type {
  DiceKind,
  DiceRollGroupInput,
  DiceRollGroupKey,
  DiceRollModifier,
  DiceRollPurpose,
} from '../../components/ui/dice/diceRollGroup';
import type { DiceMaterialTreatment } from '../../components/ui/dice/materialFreeCarvedMesh';
import {
  parseSharedTableDiceScenarioRecord,
  type SharedTableDicePlayerFixture,
  type SharedTableDiceScenario,
  type SharedTableDiceScenarioId,
  type SharedTableDiceScenarioRecord,
  type SharedTableDiceSetFixture,
} from './sharedTableDiceScenario';

export type {
  SharedTableDicePlayerFixture,
  SharedTableDiceScenario,
  SharedTableDiceScenarioId,
  SharedTableDiceScenarioRecord,
  SharedTableDiceSetFixture,
} from './sharedTableDiceScenario';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child as never);
    Object.freeze(value);
  }
  return value;
}

const PRESET_BY_KIND: Readonly<Record<DiceKind, string>> = Object.freeze({
  d4: 'dice.original.carved.d4',
  d6: 'dice.original.carved.d6',
  d8: 'dice.original.carved.d8',
  d10: 'dice.original.carved.d10',
  d12: 'dice.original.carved.d12',
  d20: 'dice.original.carved.d20',
});

const OBSIDIAN_TREATMENT: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});

const IVORY_TREATMENT: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#4f2a12',
  numeralColor: '#f3efe1',
  roughness: 0.58,
  metalness: 0.18,
});

const PLAYERS = deepFreeze([
  {
    memberId: 'member:roller',
    name: 'Aria',
    setId: 'set:obsidian',
  },
  {
    memberId: 'member:witness',
    name: 'Bram',
    setId: 'set:ivory',
  },
] satisfies readonly SharedTableDicePlayerFixture[]);

const SETS = deepFreeze([
  {
    id: 'set:obsidian',
    displayName: 'Fixture / simulated · Obsidian carved set',
    treatment: OBSIDIAN_TREATMENT,
    presetByKind: PRESET_BY_KIND,
  },
  {
    id: 'set:ivory',
    displayName: 'Fixture / simulated · Ivory carved set',
    treatment: IVORY_TREATMENT,
    presetByKind: PRESET_BY_KIND,
  },
] satisfies readonly SharedTableDiceSetFixture[]);

function modifier(
  id: string,
  displayLabel: string,
  order: number,
  value: number,
  sourceMemberId = 'member:roller'
): DiceRollModifier {
  return Object.freeze({
    id,
    sourceRef: id,
    displayLabel,
    sourceMemberId,
    order,
    value,
  });
}

function die(input: {
  id: string;
  kind: DiceKind;
  setId: string;
  originalFace: number;
  finalFace: number;
  contributorMemberId: string;
  purpose?: DiceRollPurpose;
  rerolls?: readonly {
    before: number;
    after: number;
    reasonRef: string;
    displayLabel: string;
  }[];
  sourceRef?: string;
  sourceLabel?: string;
}) {
  return Object.freeze({
    id: input.id,
    kind: input.kind,
    presetId: PRESET_BY_KIND[input.kind],
    setId: input.setId,
    originalFace: input.originalFace,
    finalFace: input.finalFace,
    rerolls: Object.freeze(
      (input.rerolls ?? []).map((reroll) => Object.freeze({ ...reroll }))
    ),
    disposition: 'counted' as const,
    sourceRef: input.sourceRef ?? `source:${input.id}`,
    sourceLabel: input.sourceLabel ?? 'Fixture die',
    contributorMemberId: input.contributorMemberId,
    purpose: input.purpose ?? 'base',
  });
}

function group(input: {
  key: DiceRollGroupKey;
  dice: DiceRollGroupInput['dice'];
  modifiers?: readonly DiceRollModifier[];
  suppliedFinalTotal?: number;
  verdictLabel?: string;
  impactLabel?: string;
}): DiceRollGroupInput {
  return deepFreeze({
    key: input.key,
    dice: [...input.dice],
    modifiers: [...(input.modifiers ?? [])],
    ...(input.suppliedFinalTotal === undefined
      ? {}
      : { suppliedFinalTotal: input.suppliedFinalTotal }),
    ...(input.verdictLabel ? { verdictLabel: input.verdictLabel } : {}),
    ...(input.impactLabel ? { impactLabel: input.impactLabel } : {}),
  });
}

const SINGLE_D20_ATTACK = group({
  key: 'attack',
  dice: [
    die({
      id: 'die:single:attack:d20',
      kind: 'd20',
      setId: 'set:obsidian',
      originalFace: 7,
      finalFace: 7,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:attack:single',
      sourceLabel: 'Longsword attack',
    }),
  ],
  modifiers: [modifier('modifier:single:ability', 'Attack bonus', 0, 5)],
  suppliedFinalTotal: 12,
  verdictLabel: 'Miss',
});

const BLESS_MIXED_ATTACK = group({
  key: 'attack',
  dice: [
    die({
      id: 'die:bless:attack:d20',
      kind: 'd20',
      setId: 'set:obsidian',
      originalFace: 7,
      finalFace: 7,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:attack:bless:weapon',
      sourceLabel: 'Warhammer attack',
    }),
    die({
      id: 'die:bless:attack:d4',
      kind: 'd4',
      setId: 'set:ivory',
      originalFace: 1,
      finalFace: 1,
      contributorMemberId: 'member:witness',
      purpose: 'granted',
      sourceRef: 'source:attack:bless',
      sourceLabel: 'Bless',
    }),
  ],
  modifiers: [modifier('modifier:bless:ability', 'Attack bonus', 0, 3)],
  suppliedFinalTotal: 11,
  verdictLabel: 'Miss',
});

const ORDINARY_ATTACK = group({
  key: 'attack',
  dice: [
    die({
      id: 'die:ordinary:attack:d20',
      kind: 'd20',
      setId: 'set:obsidian',
      originalFace: 14,
      finalFace: 14,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:attack:ordinary',
      sourceLabel: 'Longbow attack',
    }),
  ],
  modifiers: [modifier('modifier:ordinary:ability', 'Attack bonus', 0, 7)],
  suppliedFinalTotal: 21,
  verdictLabel: 'Hit',
});

const ORDINARY_DAMAGE = group({
  key: 'damage',
  dice: [
    die({
      id: 'die:ordinary:damage:d8',
      kind: 'd8',
      setId: 'set:obsidian',
      originalFace: 6,
      finalFace: 6,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:damage:ordinary:weapon',
      sourceLabel: 'Longbow damage',
    }),
    die({
      id: 'die:ordinary:damage:d6',
      kind: 'd6',
      setId: 'set:obsidian',
      originalFace: 5,
      finalFace: 5,
      contributorMemberId: 'member:roller',
      purpose: 'feature',
      sourceRef: 'source:damage:ordinary:feature',
      sourceLabel: 'Hunter mark',
    }),
  ],
  modifiers: [modifier('modifier:ordinary:damage', 'Dexterity', 0, 4)],
  suppliedFinalTotal: 15,
  impactLabel: '15 piercing damage',
});

const CRITICAL_DAMAGE = group({
  key: 'damage',
  dice: [
    die({
      id: 'die:critical:damage:d8:base',
      kind: 'd8',
      setId: 'set:obsidian',
      originalFace: 8,
      finalFace: 8,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:damage:critical:weapon',
      sourceLabel: 'Rapier damage',
    }),
    die({
      id: 'die:critical:damage:d8:critical',
      kind: 'd8',
      setId: 'set:obsidian',
      originalFace: 7,
      finalFace: 7,
      contributorMemberId: 'member:roller',
      purpose: 'critical',
      sourceRef: 'source:damage:critical:extra',
      sourceLabel: 'Critical die',
    }),
    die({
      id: 'die:critical:damage:d6:feature',
      kind: 'd6',
      setId: 'set:ivory',
      originalFace: 4,
      finalFace: 4,
      contributorMemberId: 'member:witness',
      purpose: 'granted',
      sourceRef: 'source:damage:critical:granted',
      sourceLabel: 'Allied strike',
    }),
  ],
  modifiers: [modifier('modifier:critical:damage', 'Dexterity', 0, 0)],
  suppliedFinalTotal: 19,
  impactLabel: '19 piercing damage',
});

const GREAT_WEAPON_DAMAGE = group({
  key: 'damage',
  dice: [
    die({
      id: 'die:gwf:damage:one',
      kind: 'd6',
      setId: 'set:obsidian',
      originalFace: 1,
      finalFace: 5,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:damage:gwf:weapon',
      sourceLabel: 'Greatsword damage',
      rerolls: [
        {
          before: 1,
          after: 5,
          reasonRef: 'reason:great-weapon-fighting',
          displayLabel: 'Great Weapon Fighting',
        },
      ],
    }),
    die({
      id: 'die:gwf:damage:two',
      kind: 'd6',
      setId: 'set:obsidian',
      originalFace: 2,
      finalFace: 4,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:damage:gwf:weapon',
      sourceLabel: 'Greatsword damage',
      rerolls: [
        {
          before: 2,
          after: 4,
          reasonRef: 'reason:great-weapon-fighting',
          displayLabel: 'Great Weapon Fighting',
        },
      ],
    }),
    die({
      id: 'die:gwf:damage:three',
      kind: 'd6',
      setId: 'set:obsidian',
      originalFace: 6,
      finalFace: 6,
      contributorMemberId: 'member:roller',
      sourceRef: 'source:damage:gwf:weapon',
      sourceLabel: 'Greatsword damage',
    }),
  ],
  modifiers: [modifier('modifier:gwf:damage', 'Strength', 0, 3)],
  suppliedFinalTotal: 18,
  impactLabel: '18 slashing damage',
});

function scenario(input: SharedTableDiceScenario): SharedTableDiceScenario {
  return deepFreeze(input);
}

const RAW_SHARED_TABLE_DICE_SCENARIOS: Readonly<
  Record<SharedTableDiceScenarioId, SharedTableDiceScenario>
> = deepFreeze({
  'single-d20': scenario({
    id: 'single-d20',
    label: 'Fixture / simulated · Single d20 miss',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: SINGLE_D20_ATTACK,
    hit: false,
  }),
  'bless-mixed-attack': scenario({
    id: 'bless-mixed-attack',
    label: 'Fixture / simulated · Bless mixed attack miss',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: BLESS_MIXED_ATTACK,
    hit: false,
  }),
  'ordinary-damage': scenario({
    id: 'ordinary-damage',
    label: 'Fixture / simulated · Ordinary attack into damage',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: ORDINARY_ATTACK,
    damage: ORDINARY_DAMAGE,
    hit: true,
    impactLabel: '15 piercing damage',
  }),
  'critical-damage': scenario({
    id: 'critical-damage',
    label: 'Fixture / simulated · Critical attack into damage',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: group({
      key: 'attack',
      dice: [
        die({
          id: 'die:critical:attack:d20',
          kind: 'd20',
          setId: 'set:obsidian',
          originalFace: 20,
          finalFace: 20,
          contributorMemberId: 'member:roller',
          sourceRef: 'source:attack:critical',
          sourceLabel: 'Rapier attack',
        }),
      ],
      modifiers: [modifier('modifier:critical:ability', 'Attack bonus', 0, 7)],
      suppliedFinalTotal: 27,
      verdictLabel: 'Critical hit',
    }),
    damage: CRITICAL_DAMAGE,
    hit: true,
    impactLabel: '19 piercing damage',
  }),
  'great-weapon-fighting': scenario({
    id: 'great-weapon-fighting',
    label: 'Fixture / simulated · Great Weapon Fighting damage',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: group({
      key: 'attack',
      dice: [
        die({
          id: 'die:gwf:attack:d20',
          kind: 'd20',
          setId: 'set:obsidian',
          originalFace: 15,
          finalFace: 15,
          contributorMemberId: 'member:roller',
          sourceRef: 'source:attack:gwf',
          sourceLabel: 'Greatsword attack',
        }),
      ],
      modifiers: [modifier('modifier:gwf:ability', 'Attack bonus', 0, 6)],
      suppliedFinalTotal: 21,
      verdictLabel: 'Hit',
    }),
    damage: GREAT_WEAPON_DAMAGE,
    hit: true,
    impactLabel: '18 slashing damage',
  }),
  'duplicate-release': scenario({
    id: 'duplicate-release',
    label: 'Fixture / simulated · Duplicate release exercise',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: ORDINARY_ATTACK,
    damage: ORDINARY_DAMAGE,
    hit: true,
    impactLabel: '15 piercing damage',
    exercise: 'duplicate-release',
  }),
  'missing-release': scenario({
    id: 'missing-release',
    label: 'Fixture / simulated · Missing release exercise',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: ORDINARY_ATTACK,
    damage: ORDINARY_DAMAGE,
    hit: true,
    impactLabel: '15 piercing damage',
    exercise: 'missing-release',
  }),
  'reduced-motion': scenario({
    id: 'reduced-motion',
    label: 'Fixture / simulated · Reduced motion exercise',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: ORDINARY_ATTACK,
    damage: ORDINARY_DAMAGE,
    hit: true,
    impactLabel: '15 piercing damage',
  }),
  'provider-failure': scenario({
    id: 'provider-failure',
    label: 'Fixture / simulated · Provider failure exercise',
    rollerMemberId: 'member:roller',
    witnessMemberId: 'member:witness',
    players: PLAYERS,
    sets: SETS,
    attack: ORDINARY_ATTACK,
    damage: ORDINARY_DAMAGE,
    hit: true,
    impactLabel: '15 piercing damage',
    exercise: 'provider-failure',
  }),
});

export const SHARED_TABLE_DICE_SCENARIOS:
  | SharedTableDiceScenarioRecord
  | undefined = parseSharedTableDiceScenarioRecord(
  RAW_SHARED_TABLE_DICE_SCENARIOS
);
