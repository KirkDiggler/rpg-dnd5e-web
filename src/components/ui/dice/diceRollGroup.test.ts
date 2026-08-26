import { describe, expect, it } from 'vitest';
import { parseDiceRollGroupInput } from './diceRollGroup';

function reroll(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    before: 1,
    after: 1,
    reasonRef: 'rule:gwm',
    displayLabel: 'Great Weapon Fighting',
    ...overrides,
  };
}

function die(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'die:1',
    kind: 'd20',
    presetId: 'lightning',
    setId: 'set:1',
    originalFace: 1,
    finalFace: 1,
    rerolls: [],
    disposition: 'counted',
    sourceRef: 'source:1',
    sourceLabel: 'Longsword',
    contributorMemberId: 'member:1',
    purpose: 'base',
    ...overrides,
  };
}

function modifierValue(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'modifier:1',
    sourceRef: 'source:1',
    displayLabel: 'Great Weapon Fighting',
    sourceMemberId: 'member:1',
    order: 0,
    value: 3,
    ...overrides,
  };
}

function modifierText(
  text: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'modifier:1',
    sourceRef: 'source:1',
    displayLabel: 'Great Weapon Fighting',
    sourceMemberId: 'member:1',
    order: 0,
    text,
    ...overrides,
  };
}

function complexGroup(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    key: 'damage',
    dice: [
      die({
        originalFace: 1,
        finalFace: 5,
        rerolls: [reroll({ before: 1, after: 5 })],
      }),
    ],
    modifiers: [modifierValue()],
    suppliedFinalTotal: 999,
    verdictLabel: 'critical hit',
    impactLabel: 'slashing',
    ...overrides,
  };
}

describe('parseDiceRollGroupInput', () => {
  it('accepts a supplied total that is not recomputed from dice or modifiers', () => {
    const parsed = parseDiceRollGroupInput({
      key: 'damage',
      dice: [die({ originalFace: 1, finalFace: 6 })],
      modifiers: [modifierValue({ value: 3, order: 0 })],
      suppliedFinalTotal: 999,
    });
    expect(parsed?.suppliedFinalTotal).toBe(999);
  });

  it('accepts a valid reroll chain without inspecting reason refs', () => {
    const parsed = parseDiceRollGroupInput({
      key: 'attack',
      dice: [
        die({
          kind: 'd6',
          originalFace: 1,
          finalFace: 5,
          rerolls: [reroll({ before: 1, after: 5 })],
        }),
      ],
      modifiers: [],
    });

    expect(parsed?.dice[0].finalFace).toBe(5);
  });

  it('rejects a reroll chain when a step does not match the current face', () => {
    expect(
      parseDiceRollGroupInput({
        key: 'attack',
        dice: [
          die({
            kind: 'd6',
            originalFace: 1,
            finalFace: 5,
            rerolls: [reroll({ before: 2, after: 5 })],
          }),
        ],
        modifiers: [],
      })
    ).toBeUndefined();
  });

  it.each([
    ['top-level', { ...complexGroup(), extra: true }],
    [
      'die',
      {
        ...complexGroup(),
        dice: [{ ...die(), extra: true }],
      },
    ],
    [
      'modifier',
      {
        ...complexGroup(),
        modifiers: [{ ...modifierValue(), extra: true }],
      },
    ],
    [
      'reroll',
      {
        ...complexGroup(),
        dice: [
          {
            ...die({
              originalFace: 1,
              finalFace: 5,
              rerolls: [reroll({ before: 1, after: 5 })],
            }),
            rerolls: [{ ...reroll({ before: 1, after: 5 }), extra: true }],
          },
        ],
      },
    ],
  ])('rejects unknown keys at the %s boundary', (_label, value) => {
    expect(parseDiceRollGroupInput(value)).toBeUndefined();
  });

  it.each([
    ['top-level', { ...complexGroup(), [Symbol('roll-group')]: true }],
    [
      'die getter',
      {
        ...complexGroup(),
        dice: [
          Object.defineProperty(
            die({
              originalFace: 1,
              finalFace: 5,
              rerolls: [reroll({ before: 1, after: 5 })],
            }),
            'sourceLabel',
            {
              enumerable: true,
              get() {
                throw Error('hostile getter');
              },
            }
          ),
        ],
      },
    ],
    [
      'modifier proxy',
      {
        ...complexGroup(),
        modifiers: [
          new Proxy(modifierValue(), {
            ownKeys() {
              throw Error('hostile proxy');
            },
          }),
        ],
      },
    ],
  ])(
    'fails closed for symbol keys and hostile accessors at the %s boundary',
    (_label, value) => {
      expect(() => parseDiceRollGroupInput(value)).not.toThrow();
      expect(parseDiceRollGroupInput(value)).toBeUndefined();
    }
  );

  const faceCases = [
    { kind: 'd4', max: 4 },
    { kind: 'd6', max: 6 },
    { kind: 'd8', max: 8 },
    { kind: 'd10', max: 10 },
    { kind: 'd12', max: 12 },
    { kind: 'd20', max: 20 },
  ] as const;

  for (const { kind, max } of faceCases) {
    it(`rejects original faces below the ${kind} range`, () => {
      expect(
        parseDiceRollGroupInput({
          key: 'attack',
          dice: [
            {
              id: 'die:1',
              kind,
              presetId: 'lightning',
              setId: 'set:1',
              originalFace: 0,
              finalFace: 1,
              rerolls: [],
              disposition: 'counted',
              sourceRef: 'source:1',
              sourceLabel: 'Longsword',
              contributorMemberId: 'member:1',
              purpose: 'base',
            },
          ],
          modifiers: [],
        })
      ).toBeUndefined();
    });

    it(`rejects final faces above the ${kind} range`, () => {
      expect(
        parseDiceRollGroupInput({
          key: 'attack',
          dice: [
            {
              id: 'die:1',
              kind,
              presetId: 'lightning',
              setId: 'set:1',
              originalFace: 1,
              finalFace: max + 1,
              rerolls: [],
              disposition: 'counted',
              sourceRef: 'source:1',
              sourceLabel: 'Longsword',
              contributorMemberId: 'member:1',
              purpose: 'base',
            },
          ],
          modifiers: [],
        })
      ).toBeUndefined();
    });
  }

  it.each([
    ['d4', 5],
    ['d6', 7],
    ['d8', 9],
    ['d10', 11],
    ['d12', 13],
    ['d20', 21],
  ])('rejects reroll faces outside the %s range', (kind, badFace) => {
    expect(
      parseDiceRollGroupInput({
        key: 'damage',
        dice: [
          die({
            kind,
            originalFace: 1,
            finalFace: 1,
            rerolls: [reroll({ before: 1, after: badFace })],
          }),
        ],
        modifiers: [modifierValue()],
      })
    ).toBeUndefined();
  });

  it.each([
    ['attack group without dice', { key: 'attack', dice: [], modifiers: [] }],
    [
      'attack group without dice but with a modifier',
      { key: 'attack', dice: [], modifiers: [modifierValue()] },
    ],
    [
      'damage group without dice, modifier, or impact label',
      { key: 'damage', dice: [], modifiers: [] },
    ],
    [
      'damage group without dice and with an empty impact label',
      { key: 'damage', dice: [], modifiers: [], impactLabel: '' },
    ],
    [
      'attack group with an empty verdict label',
      { key: 'attack', dice: [die()], modifiers: [], verdictLabel: '' },
    ],
  ])('rejects %s', (_label, value) => {
    expect(parseDiceRollGroupInput(value)).toBeUndefined();
  });

  it.each([
    [
      'damage group with a value modifier',
      {
        key: 'damage',
        dice: [],
        modifiers: [modifierValue()],
        impactLabel: 'slashing',
      },
    ],
    [
      'damage group with a text modifier',
      {
        key: 'damage',
        dice: [],
        modifiers: [modifierText('Flat bonus')],
        impactLabel: 'slashing',
      },
    ],
  ])('accepts %s', (_label, value) => {
    expect(parseDiceRollGroupInput(value)).toBeDefined();
  });

  it.each([
    [
      'duplicate die ids',
      {
        key: 'damage',
        dice: [die({ id: 'die:1' }), die({ id: 'die:1', setId: 'set:2' })],
        modifiers: [modifierValue()],
      },
    ],
    [
      'modifier with both value and text',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [modifierValue({ text: 'also present' })],
      },
    ],
    [
      'modifier with neither value nor text',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [
          {
            id: 'modifier:1',
            sourceRef: 'source:1',
            displayLabel: 'Great Weapon Fighting',
            sourceMemberId: 'member:1',
            order: 0,
          },
        ],
      },
    ],
    [
      'modifier with a non-finite value',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [modifierValue({ value: Number.NaN })],
      },
    ],
    [
      'modifier with empty text',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [modifierText('')],
      },
    ],
    [
      'duplicate modifier ids',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [
          modifierValue({ id: 'modifier:1', order: 0 }),
          modifierValue({ id: 'modifier:1', order: 1, value: 4 }),
        ],
      },
    ],
    [
      'duplicate modifier orders',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [
          modifierValue({ id: 'modifier:1', order: 0 }),
          modifierValue({ id: 'modifier:2', order: 0 }),
        ],
      },
    ],
    [
      'non-contiguous modifier orders',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [
          modifierValue({ id: 'modifier:1', order: 0 }),
          modifierValue({ id: 'modifier:2', order: 2 }),
        ],
      },
    ],
    [
      'negative modifier order',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [modifierValue({ order: -1 })],
      },
    ],
    [
      'whitespace-only modifier text',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [modifierText('   ')],
      },
    ],
    [
      'empty modifier display label',
      {
        key: 'damage',
        dice: [die()],
        modifiers: [modifierValue({ displayLabel: '' })],
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(parseDiceRollGroupInput(value)).toBeUndefined();
  });

  it.each([
    ['die preset id', { dice: [die({ presetId: 'https://evil.test' })] }],
    ['die set id', { dice: [die({ setId: '../set' })] }],
    ['die source ref', { dice: [die({ sourceRef: 'source/id' })] }],
    [
      'die contributor member id',
      { dice: [die({ contributorMemberId: 'member/id' })] },
    ],
    [
      'modifier id',
      { modifiers: [modifierValue({ id: 'https://evil.test' })] },
    ],
    [
      'modifier source ref',
      { modifiers: [modifierValue({ sourceRef: 'source/id' })] },
    ],
    [
      'modifier source member id',
      { modifiers: [modifierValue({ sourceMemberId: 'member/id' })] },
    ],
  ])('rejects malformed %s', (_label, partial) => {
    expect(
      parseDiceRollGroupInput({
        ...complexGroup(),
        ...partial,
      })
    ).toBeUndefined();
  });

  it('strictly reconstructs and deeply freezes inbound data', () => {
    const inbound = complexGroup();
    const parsed = parseDiceRollGroupInput(inbound);

    expect(parsed).toEqual(inbound);
    expect(parsed).not.toBe(inbound);
    expect(parsed?.dice).not.toBe(inbound.dice);
    expect(parsed?.dice[0]).not.toBe(inbound.dice[0]);
    expect(parsed?.dice[0].rerolls).not.toBe(inbound.dice[0].rerolls);
    expect(parsed?.dice[0].rerolls[0]).not.toBe(inbound.dice[0].rerolls[0]);
    expect(parsed?.modifiers).not.toBe(inbound.modifiers);
    expect(parsed?.modifiers[0]).not.toBe(inbound.modifiers[0]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.dice)).toBe(true);
    expect(Object.isFrozen(parsed?.dice[0])).toBe(true);
    expect(Object.isFrozen(parsed?.dice[0].rerolls)).toBe(true);
    expect(Object.isFrozen(parsed?.dice[0].rerolls[0])).toBe(true);
    expect(Object.isFrozen(parsed?.modifiers)).toBe(true);
    expect(Object.isFrozen(parsed?.modifiers[0])).toBe(true);
    expect(Reflect.ownKeys(parsed ?? {})).toEqual([
      'key',
      'dice',
      'modifiers',
      'suppliedFinalTotal',
      'verdictLabel',
      'impactLabel',
    ]);
    expect(Reflect.ownKeys(parsed?.dice[0] ?? {})).toEqual([
      'id',
      'kind',
      'presetId',
      'setId',
      'originalFace',
      'finalFace',
      'rerolls',
      'disposition',
      'sourceRef',
      'sourceLabel',
      'contributorMemberId',
      'purpose',
    ]);
    expect(Reflect.ownKeys(parsed?.dice[0].rerolls[0] ?? {})).toEqual([
      'before',
      'after',
      'reasonRef',
      'displayLabel',
    ]);
    expect(Reflect.ownKeys(parsed?.modifiers[0] ?? {})).toEqual([
      'id',
      'sourceRef',
      'displayLabel',
      'sourceMemberId',
      'order',
      'value',
    ]);

    inbound.dice[0].originalFace = 2;
    inbound.dice[0].rerolls[0].after = 6;
    inbound.modifiers[0].order = 99;
    inbound.suppliedFinalTotal = 1;

    expect(parsed?.dice[0].originalFace).toBe(1);
    expect(parsed?.dice[0].rerolls[0].after).toBe(5);
    expect(parsed?.modifiers[0].order).toBe(0);
    expect(parsed?.suppliedFinalTotal).toBe(999);
    expect(Object.isFrozen(inbound)).toBe(false);
  });
});
