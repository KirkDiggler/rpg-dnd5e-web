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
    [recipe({ on: 'time', surprise: true }), '.transitions[0]', 'surprise'],
    [{ initial: 'posted', posted: { unknown: true } }, '.posted', 'unknown'],
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
