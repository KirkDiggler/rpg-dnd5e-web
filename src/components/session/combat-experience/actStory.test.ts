// @vitest-environment node
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { buildActStory } from './actStory';

const context = {
  viewerMember: 'alice',
  memberNames: { alice: 'Alice', 'gate-1': 'Gate Guard' },
};
const alice = { kind: PartyKind.MEMBER, id: 'alice' };
const gate = { kind: PartyKind.MEMBER, id: 'gate-1' };
type Body = MessageInitShape<typeof ActSchema>['body'];

function row(id: string, family: Family, body: Body, verb = '') {
  const act = create(ActSchema, { session: 's', id, family, verb, body });
  const [entry] = buildActStory(
    [{ act, index: 0, seq: 1n, source: 'live', visible: true }],
    context
  );
  return entry;
}

describe('buildActStory carries each family’s toast flag onto its row', () => {
  it('a deed, a reaction, a state change and a spoken answer toast', () => {
    const deed = row('id-1', Family.ACT, {
      case: 'loot',
      value: { by: alice, from: gate },
    });
    const reaction = row('id-2', Family.REACTION, {
      case: 'loot',
      value: { by: alice, from: gate },
    });
    const state = row('id-3', Family.STATE, {
      case: 'state',
      value: { party: alice, change: StateKind.DOWNED },
    });
    const spoken = row(
      'id-4',
      Family.TABLE_ANSWER,
      { case: 'tableAnswer', value: { who: gate, word: 'refuses' } },
      'speak'
    );
    for (const entry of [deed, reaction, state, spoken]) {
      expect(entry).toBeDefined();
      expect(entry?.toast).toBe(true);
    }
  });

  it('a turn end and an unspoken table answer stay in the log only', () => {
    const turn = row('id-5', Family.CLOCK, {
      case: 'clock',
      value: {
        mark: ClockMark.TURN_ENDED,
        turn: { member: alice, next: gate },
      },
    });
    const answer = row('id-6', Family.TABLE_ANSWER, {
      case: 'tableAnswer',
      value: { who: gate, word: 'refuses' },
    });
    for (const entry of [turn, answer]) {
      expect(entry).toBeDefined();
      expect(entry?.toast).toBe(false);
    }
  });
});
