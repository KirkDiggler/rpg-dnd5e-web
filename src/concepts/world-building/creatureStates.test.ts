import { describe, expect, it } from 'vitest';
import { statePicks, validateStates } from './creatureStates';

const recipe = (transition: unknown) => ({
  initial: 'posted',
  posted: { transitions: [transition] },
  asleep: {},
});
describe('creature state recipe — dungeonspec/states.go', () => {
  it('carries every recipe word and transition order without executing it', () => {
    const value = recipe({
      on: 'heard',
      within: 6,
      regions: 1,
      rounds: 3,
      when: { not: { fact: 'alarm' } },
      to: 'asleep',
      do: [{ anchor: true }, { wake_in: 2 }, { pick: 'march' }],
      reason: 'heard a crash',
    });
    expect(validateStates(value, 'guard.states')).toEqual(value);
    expect(statePicks(validateStates(value, 'guard.states'))).toEqual([
      'march',
    ]);
  });
  it.each([
    'time',
    'heard',
    'seen',
    'deed',
    'deed:attacked',
    'fact',
    'clock:world',
    'clock:fight',
    'clock:bell:alarm',
  ])('accepts the shipped beat %s', (on) => {
    expect(validateStates(recipe({ on }), 'guard.states')).toEqual(
      recipe({ on })
    );
  });
  it.each([
    [recipe({ on: 'hear' }), '.on', 'not a beat'],
    [recipe({ on: 'clock:' }), '.on', 'not a beat'],
    [recipe({ on: 'deed:nope' }), '.on', 'not a beat'],
    [{ initial: 'missing', posted: {} }, '.initial', 'not a state'],
    [{ posted: {} }, '.initial', 'initial'],
    [recipe({ on: 'time', to: 'missing' }), '.to', 'not a state'],
    [
      {
        initial: 'posted',
        posted: { terminal: true, transitions: [{ on: 'time' }] },
      },
      '.terminal',
      'listens for nothing',
    ],
    [recipe({ on: 'fact', within: 2 }), '.within', 'happened nowhere'],
    [recipe({ on: 'time', regions: 1 }), '.within', 'happened nowhere'],
    [recipe({ on: 'heard', within: -1 }), '.within', 'whole number'],
    [recipe({ on: 'heard', rounds: 1.5 }), '.rounds', 'whole number'],
    [
      recipe({ on: 'time', when: { enemy: 'reach' } }),
      '.when.enemy',
      'seen, remembered or none',
    ],
    [
      recipe({ on: 'time', when: { attacked: { within: 2 } } }),
      '.when',
      'enemy',
    ],
    [
      recipe({ on: 'time', when: { enemy: 'seen', fact: 'alarm' } }),
      '.when',
      'one of',
    ],
    [
      recipe({ on: 'time', do: [{ pick: 'time', wake_in: 2 }] }),
      '.do[0]',
      'one of',
    ],
    [
      recipe({ on: 'time', do: [{ wake_in: 0 }] }),
      '.do[0].wake_in',
      'counted from 1',
    ],
    [recipe({ on: 'time', do: [{ anchor: false }] }), '.do[0].anchor', 'true'],
    [
      recipe({ on: 'time', do: [{ pick: 'success' }] }),
      '.do[0].pick',
      'table key',
    ],
    [
      recipe({ on: 'time', do: [{ pick: 'intimidated' }] }),
      '.do[0].pick',
      'table key',
    ],
    // A transition field this codec does not read is carried now
    // (rpg-project#857): see "carries a transition field and a cell field".
    // An unknown STATE field is carried now (rpg-project#857): see "keeps a
    // state field it does not read". A transition stays exact.
    [
      { initial: 'posted', posted: { blocks: 'yes' } },
      '.posted.blocks',
      'boolean',
    ],
    [
      { initial: 'posted', posted: { holds: { at: [] } } },
      '.posted.holds.door',
      'names the door',
    ],
    [
      { initial: 'posted', posted: { holds: { door: 'gate', against: 'in' } } },
      '.posted.holds.against',
      'both, entering or leaving',
    ],
    [
      {
        initial: 'posted',
        posted: { holds: { door: 'gate', at: [{ q: 1 }] } },
      },
      '.posted.holds.at[0].r',
      'whole number',
    ],
    [
      {
        initial: 'posted',
        posted: { holds: { door: 'gate', at: { q: 1, r: 2 } } },
      },
      '.posted.holds.at',
      'list',
    ],
    [
      { initial: 'posted', posted: { holds: { door: 'gate', pass: 3 } } },
      '.posted.holds.pass',
      'text',
    ],
    [
      { initial: 'down', down: { terminal: true, blocks: true } },
      '.down.blocks',
      'holds no post',
    ],
    [
      { initial: 'down', down: { terminal: true, holds: { door: 'gate' } } },
      '.down.holds',
      'holds no post',
    ],
  ])('refuses malformed recipe %# at its field', (value, path, words) => {
    expect(() => validateStates(value, 'guard.states')).toThrow(path as string);
    expect(() => validateStates(value, 'guard.states')).toThrow(
      words as string
    );
  });
  it('accepts an idle sink, a terminal, zero scope and nested not without inventing actions', () => {
    const value = {
      initial: 'idle',
      idle: {},
      ended: { terminal: true },
      waiting: {
        transitions: [
          { on: 'fact', within: 0, when: { not: { not: { enemy: 'none' } } } },
        ],
      },
    };
    expect(validateStates(value, 'states')).toEqual(value);
  });
});

describe('a state’s post (rpg-project#836, #852, #857)', () => {
  const posted = {
    initial: 'posted',
    posted: {
      blocks: true,
      holds: {
        door: 'gate-wall-door',
        at: [
          { q: -3, r: 7 },
          { q: -4, r: 7 },
        ],
        against: 'entering',
        pass: 'troupe-admitted',
      },
      transitions: [{ on: 'heard', within: 6, to: 'alert' }],
    },
    alert: { blocks: true, holds: { door: 'gate-wall-door' } },
  };

  it('reads blocks and holds in the author’s key order', () => {
    const states = validateStates(posted, 'gate-1.states');
    expect(states).toEqual(posted);
    expect(JSON.stringify(states)).toBe(JSON.stringify(posted));
  });

  it.each(['both', 'entering', 'leaving'])('accepts against: %s', (against) => {
    expect(
      validateStates(
        { initial: 'p', p: { holds: { door: 'd', against } } },
        's'
      )
    ).toEqual({ initial: 'p', p: { holds: { door: 'd', against } } });
  });

  it('a terminal state may say blocks: false, which holds nothing', () => {
    const down = { initial: 'down', down: { terminal: true, blocks: false } };
    expect(validateStates(down, 's')).toEqual(down);
  });

  it('keeps a state field it does not read, and a holds field, as written and in place', () => {
    const future = {
      initial: 'posted',
      posted: {
        blocks: true,
        watches: { door: 'postern', every: 2 },
        holds: { door: 'gate', challenge: ['who goes there'], against: 'both' },
        transitions: [{ on: 'time' }],
      },
    };
    const states = validateStates(future, 'gate-1.states');
    expect(JSON.stringify(states)).toBe(JSON.stringify(future));
    // A copy, not the parsed object: an edit to the source never leaks in.
    future.posted.watches.every = 9;
    expect(states.posted).toMatchObject({ watches: { every: 2 } });
  });
});

describe('the codec carries what it does not read (rpg-project#857)', () => {
  it('carries a transition field and a cell field, in place, as written', () => {
    const future = {
      initial: 'posted',
      posted: {
        holds: { door: 'gate', at: [{ q: 1, r: 2, level: 1 }] },
        transitions: [
          { on: 'time', surprise: true, to: 'posted', escort: 'x' },
        ],
      },
    };
    const states = validateStates(future, 'gate-1.states');
    expect(JSON.stringify(states)).toBe(JSON.stringify(future));
  });

  it('reads an empty against as both, as the server does, and keeps the word', () => {
    const empty = { initial: 'p', p: { holds: { door: 'd', against: '' } } };
    expect(validateStates(empty, 's')).toEqual(empty);
  });
});
