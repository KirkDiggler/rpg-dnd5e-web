// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/linked-conditions.json';
import { isLinkedConditionData, parseConditionData } from './conditionData';

const parse = (value: unknown) =>
  parseConditionData(new TextEncoder().encode(JSON.stringify(value)));

describe('current linked condition data', () => {
  it('accepts provider-produced pending coordinators and local recipients unchanged', () => {
    for (const value of Object.values(fixtures)) {
      const result = parse(value);
      expect(isLinkedConditionData(result)).toBe(true);
      expect(result).toEqual(value);
    }
  });

  it.each(['blessed', 'baned', 'concentrating'])(
    'refuses the retired %s shape',
    (id) => {
      expect(
        parse({
          ref: `dnd5e:conditions:${id}`,
          member_id: 'recipient',
          source_id: 'caster',
          turn_ends_left: 10,
          monk_level: 20,
        })
      ).toBeUndefined();
    }
  );

  it.each([
    { ...fixtures.pendingCoordinator, runtime: undefined },
    { ...fixtures.pendingCoordinator, application_id: '' },
    { ...fixtures.pendingCoordinator, role: 'unknown' },
    {
      ...fixtures.recipient,
      runtime: {
        ...fixtures.recipient.runtime,
        lifetime: fixtures.pendingCoordinator.runtime.lifetime,
      },
    },
    {
      ...fixtures.recipient,
      bindings: { ...fixtures.recipient.bindings, owner: undefined },
    },
    {
      ...fixtures.pendingCoordinator,
      runtime: {
        ...fixtures.pendingCoordinator.runtime,
        lifetime: { phase: 'live', live_members: [] },
      },
    },
    {
      ...fixtures.pendingCoordinator,
      runtime: {
        ...fixtures.pendingCoordinator.runtime,
        lifetime: {
          phase: 'live',
          pending_members: ['same'],
          live_members: ['same'],
        },
      },
    },
  ])(
    'refuses malformed current envelopes without another reader interpreting them',
    (value) => {
      expect(parse({ ...value, monk_level: 20 })).toBeUndefined();
    }
  );
});
