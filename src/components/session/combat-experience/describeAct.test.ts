import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  CastOutcome,
  ClockMark,
  DamageType,
  Family,
  PartyKind,
  RollSchema,
  Sense,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import {
  actToasts,
  describeAct,
  formatRollBreakdown,
  formatRollShort,
} from './describeAct';

const context = {
  viewerMember: 'alice',
  memberNames: { alice: 'Alice', 'gate-1': 'Gate Guard' },
};
const alice = { kind: PartyKind.MEMBER, id: 'alice' };
const gate = { kind: PartyKind.MEMBER, id: 'gate-1' };
const d20 = {
  expression: '1d20+5',
  dice: [15],
  modifiers: [
    { source: 'Strength', value: 3 },
    { source: 'Proficiency', value: 2 },
  ],
  total: 20,
  against: 13,
  beaten: true,
};

type Body = MessageInitShape<typeof ActSchema>['body'];
function act(family: Family, body: Body, verb = '') {
  return create(ActSchema, {
    id: 'id-1',
    act: verb ? `${verb}:id-1` : '',
    verb,
    family,
    body,
  });
}

/**
 * One case per member of Act's body oneof. The guard below reads the oneof
 * from the schema, so a body added to the contract fails this table until it
 * has a case — and `describeAct`'s exhaustive switch fails to compile.
 */
const EVERY_BODY: Record<string, [ReturnType<typeof act>, string | null]> = {
  walk: [
    act(Family.ACT, {
      case: 'walk',
      value: {
        mover: alice,
        path: [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }],
      },
    }),
    'Alice moves',
  ],
  attack: [
    act(Family.ACT, {
      case: 'attack',
      value: {
        by: alice,
        to: gate,
        outcome: AttackOutcome.HIT,
        damage: 4,
        roll: d20,
        attack: { name: 'Longsword', damageType: DamageType.SLASHING },
      },
    }),
    'Alice strikes Gate Guard',
  ],
  cast: [
    act(Family.ACT, {
      case: 'cast',
      value: {
        by: alice,
        spell: { name: 'Bless' },
        targets: [gate],
        results: [{ target: gate, outcome: CastOutcome.FAILED }],
      },
    }),
    'Alice casts Bless at Gate Guard',
  ],
  activate: [
    act(Family.ACT, {
      case: 'activate',
      value: { by: alice, ability: { name: 'Second Wind' } },
    }),
    'Alice uses Second Wind',
  ],
  speak: [
    act(Family.ACT, {
      case: 'speak',
      value: {
        by: alice,
        to: gate,
        line: 'Stand aside.',
        skill: 'persuasion',
        roll: d20,
      },
    }),
    'Alice to Gate Guard: "Stand aside."',
  ],
  deathSave: [
    act(Family.ACT, {
      case: 'deathSave',
      value: { by: alice, outcome: 'success', successes: 2, failures: 1 },
    }),
    'Alice rolls a death save',
  ],
  loot: [
    act(Family.ACT, { case: 'loot', value: { by: alice, from: gate } }),
    'Alice loots Gate Guard',
  ],
  hold: [
    act(Family.ACT, {
      case: 'hold',
      value: { by: alice, prop: { kind: PartyKind.PROP, id: 'iron-crown' } },
    }),
    'Alice holds the iron crown',
  ],
  drop: [
    act(Family.ACT, {
      case: 'drop',
      value: { by: alice, prop: { kind: PartyKind.PROP, id: 'iron-crown' } },
    }),
    'Alice drops the iron crown',
  ],
  door: [
    act(Family.ACT, {
      case: 'door',
      value: { by: alice, door: 'gate-door', state: 'open' },
    }),
    'Alice: the gate door is open',
  ],
  equip: [
    act(Family.ACT, {
      case: 'equip',
      value: { by: alice, item: 'longsword', change: 'draw' },
    }),
    'Alice draws longsword',
  ],
  stay: [
    act(Family.ACT, { case: 'stay', value: { member: gate, why: 'no_path' } }),
    'Gate Guard stays put',
  ],
  sneak: [
    act(Family.ACT, {
      case: 'sneak',
      value: { by: alice, watcher: gate, roll: d20 },
    }),
    'Alice sneaks past Gate Guard',
  ],
  rest: [
    act(Family.ACT, {
      case: 'rest',
      value: {
        by: alice,
        kind: 'short',
        hitPointsRestored: 5,
        hitPoints: 12,
        hitDiceSpent: 1,
      },
    }),
    'Alice takes a short rest',
  ],
  tableAnswer: [
    act(
      Family.TABLE_ANSWER,
      { case: 'tableAnswer', value: { who: gate, word: 'refuse', say: 'No.' } },
      'speak'
    ),
    'Gate Guard: "No."',
  ],
  state: [
    act(Family.STATE, {
      case: 'state',
      value: { party: gate, change: StateKind.DOWNED },
    }),
    'Gate Guard falls',
  ],
  perception: [
    act(Family.PERCEPTION, {
      case: 'perception',
      value: {
        observer: alice,
        sense: Sense.HEARING,
        heard: { kind: 'footsteps', hops: 2 },
      },
    }),
    'Alice hears footsteps',
  ],
  clock: [
    act(Family.CLOCK, {
      case: 'clock',
      value: {
        mark: ClockMark.TURN_ENDED,
        turn: { member: alice, next: gate },
      },
    }),
    "Gate Guard's turn",
  ],
};

describe('describeAct', () => {
  it('describe every family', () => {
    const oneof = ActSchema.oneofs.find((o) => o.name === 'body');
    expect(oneof).toBeDefined();
    const members = oneof!.fields.map((f) => f.localName).sort();
    expect(Object.keys(EVERY_BODY).sort()).toEqual(members);
    for (const [name, [a, headline]] of Object.entries(EVERY_BODY)) {
      expect(describeAct(a, context)?.headline, name).toBe(headline);
    }
  });

  it('reads like the E3 transcript: who, what, to whom, how decided, what changed', () => {
    const [swing] = EVERY_BODY.attack!;
    const line = describeAct(swing, context)!;
    expect(`${line.headline}: ${line.detail}`).toBe(
      'Alice strikes Gate Guard: Longsword: hit, 1d20+5 = 20 vs 13, 4 slashing damage'
    );
    expect(line.roll?.total).toBe(20);
  });

  it('a reaction names what it was taken as', () => {
    const oa = act(Family.REACTION, {
      case: 'attack',
      value: {
        by: gate,
        to: alice,
        outcome: AttackOutcome.MISS,
        reaction: { name: 'Opportunity Attack' },
        attack: { name: 'Spear' },
        roll: d20,
      },
    });
    const line = describeAct(oa, context)!;
    expect(line.eyebrow).toBe('Reaction · Opportunity Attack');
    expect(line.headline).toBe('Alice evades Gate Guard');
  });

  it('bookkeeping describes to nothing: sight, cells, a tick, the scene opening', () => {
    for (const a of [
      act(Family.PERCEPTION, {
        case: 'perception',
        value: { observer: alice, sense: Sense.SIGHT, sighted: {} },
      }),
      act(Family.PERCEPTION, {
        case: 'perception',
        value: { observer: alice, sense: Sense.CELLS, cells: {} },
      }),
      act(Family.CLOCK, {
        case: 'clock',
        value: { mark: ClockMark.TICK, tick: 2n },
      }),
      act(Family.CLOCK, {
        case: 'clock',
        value: { mark: ClockMark.SCENE_OPENED },
      }),
    ]) {
      expect(describeAct(a, context)).toBeNull();
    }
  });

  it('a refused act still takes its line', () => {
    const refused = create(ActSchema, {
      id: 'id-9',
      verb: 'speak',
      family: Family.TABLE_ANSWER,
      refused: true,
      refusal: 'undecoded',
    });
    expect(describeAct(refused, context)?.detail).toBe('undecoded');
  });

  it('a death save tallies after its authored outcome, and never opens on a bare colon', () => {
    const save = (outcome: string) =>
      describeAct(
        act(Family.ACT, {
          case: 'deathSave',
          value: { by: alice, outcome, successes: 2, failures: 1 },
        }),
        context
      )?.detail;
    expect(save('success')).toBe('success: 2 successes, 1 failure');
    expect(save('')).toBe('2 successes, 1 failure');
  });
});

describe('the verdict is the server’s, never derived from total and against', () => {
  // Every roll here totals above what it was against, yet the server says it
  // did not beat it. A describer that recomputed total >= against would say
  // beaten, unseen or passed.
  const lost = { dice: [12], total: 15, against: 14, beaten: false };

  it('a save', () => {
    const cast = describeAct(
      act(Family.ACT, {
        case: 'cast',
        value: {
          by: alice,
          spell: { ref: 'dnd5e:spells:sacred-flame', name: 'Sacred Flame' },
          results: [{ target: gate, outcome: CastOutcome.FAILED, save: lost }],
        },
      }),
      context
    );
    expect(formatRollBreakdown(cast?.roll)).toBe(
      '[12] = 15 vs 14 · not beaten'
    );
  });

  it('a check', () => {
    const speak = describeAct(
      act(Family.ACT, {
        case: 'speak',
        value: {
          by: alice,
          to: gate,
          line: 'Stand aside.',
          skill: 'persuasion',
          roll: lost,
        },
      }),
      context
    );
    expect(formatRollBreakdown(speak?.roll)).toBe(
      '[12] = 15 vs 14 · not beaten'
    );
  });

  it('a sneak', () => {
    const sneak = describeAct(
      act(Family.ACT, {
        case: 'sneak',
        value: { by: alice, watcher: gate, roll: lost },
      }),
      context
    );
    expect(sneak?.detail).toBe('spotted, 15 vs 14');
  });

  it('a search', () => {
    const search = describeAct(
      act(Family.PERCEPTION, {
        case: 'perception',
        value: {
          observer: alice,
          sense: Sense.DISCOVERY,
          discovery: { ability: 'perception', roll: lost },
        },
      }),
      context
    );
    expect(search?.detail).toBe('failed perception check, 15 vs 14');
    expect(search?.tone).toBe('neutral');
  });
});

describe('roll breakdown from Roll', () => {
  it('names each modifier by its source and shows the kept faces', () => {
    expect(formatRollBreakdown(undefined)).toBe('');
    const roll = EVERY_BODY.attack![0].body.value as unknown as { roll: never };
    expect(formatRollBreakdown(roll.roll)).toBe(
      '[15] + 3 Strength + 2 Proficiency = 20 vs 13 · beaten'
    );
    expect(formatRollShort(roll.roll)).toBe('1d20+5 = 20 vs 13');
  });

  it('names each dice term by the source that brought it', () => {
    const roll = create(RollSchema, {
      dice: [15, 3],
      modifiers: [{ source: 'Strength', value: 3 }],
      total: 21,
      against: 13,
      beaten: true,
      terms: [
        { count: 1, dieSize: 20, faces: [15], sourceName: 'Longsword' },
        { count: 1, dieSize: 4, faces: [3], sourceName: 'Bless' },
      ],
    });
    expect(formatRollBreakdown(roll)).toBe(
      '1d20 [15] Longsword + 1d4 [3] Bless + 3 Strength = 21 vs 13 · beaten'
    );
  });

  it('a table die reads N of M', () => {
    const t = act(Family.TABLE_ANSWER, {
      case: 'tableAnswer',
      value: { who: gate, word: 'yield', roll: { dice: [4], total: 4, of: 6 } },
    });
    expect(describeAct(t, context)?.detail).toBe('yield, 4 of 6');
  });
});

describe('toast policy per family', () => {
  it.each([
    [Family.ACT, '', true],
    [Family.REACTION, '', true],
    [Family.STATE, 'rest', true],
    [Family.TABLE_ANSWER, 'speak', true],
    [Family.TABLE_ANSWER, 'end_turn', false],
    [Family.PERCEPTION, 'move', false],
    [Family.CLOCK, 'end_turn', false],
  ])('family %s under verb %s toasts: %s', (family, verb, toasts) => {
    expect(actToasts(create(ActSchema, { id: 'id-1', family, verb }))).toBe(
      toasts
    );
  });
});
