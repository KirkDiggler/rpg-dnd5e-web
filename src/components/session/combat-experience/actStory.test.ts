// @vitest-environment node
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  ClockMark,
  Family,
  PartyKind,
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

function story(...acts: ReturnType<typeof create<typeof ActSchema>>[]) {
  return buildActStory(
    acts.map((act) => ({
      act,
      index: 0,
      seq: 1n,
      source: 'live' as const,
      visible: true,
    })),
    context
  );
}
const at = (id: string, family: Family, body: Body, verb = '', tag = '') =>
  create(ActSchema, { session: 's', id, family, verb, act: tag, body });
const fightFormed = at('id-f', Family.CLOCK, {
  case: 'clock',
  value: { mark: ClockMark.FIGHT_FORMED, fight: { order: [alice, gate] } },
});
const fightEnded = at('id-e', Family.CLOCK, {
  case: 'clock',
  value: {
    mark: ClockMark.FIGHT_DISSOLVED,
    dissolved: { members: [alice, gate] },
  },
});
const swingAtAlice = (id: string) =>
  at(id, Family.ACT, {
    case: 'attack',
    value: {
      by: gate,
      to: alice,
      attack: { name: 'Halberd' },
      outcome: AttackOutcome.MISS,
      roll: { total: 9, against: 15, beaten: false },
    },
  });

describe('buildActStory carries the toast policy onto its rows', () => {
  it('a row carries the case the policy named, and none when it named none', () => {
    const rows = story(
      row('id-1', Family.ACT, {
        case: 'walk',
        value: { mover: alice, path: [{}] },
      })!.act!,
      swingAtAlice('id-2')
    );
    expect(rows[0]?.toastRule).toBeUndefined();
    expect(rows[1]?.toastRule?.case).toBe('done-to-you');
    expect(rows[1]?.toastText).toBe('Alice evades Gate Guard — Halberd: miss');
  });

  it('a toast fired in a fight holds; out of a fight it does not', () => {
    const rows = story(
      swingAtAlice('id-1'),
      fightFormed,
      swingAtAlice('id-2'),
      fightEnded,
      swingAtAlice('id-3')
    );
    expect(rows.map((r) => r.toastRule?.hold)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(rows.map((r) => r.inFight)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(rows[1]?.fightEdge).toBe('formed');
    expect(rows[3]?.fightEdge).toBe('dissolved');
  });

  it('a turn passing means a fight is formed, even with its forming unseen', () => {
    const turn = at('id-t', Family.CLOCK, {
      case: 'clock',
      value: {
        mark: ClockMark.TURN_ENDED,
        turn: { member: gate, next: alice },
      },
    });
    const rows = story(turn, swingAtAlice('id-2'));
    expect(rows[1]?.toastRule?.hold).toBe(true);
  });

  it('a line’s own table answer toasts for the member who spoke it', () => {
    const line = at(
      'id-1',
      Family.ACT,
      {
        case: 'speak',
        value: { by: alice, to: gate, line: 'Stand aside.' },
      },
      'speak',
      'speak:id-1'
    );
    const answer = at(
      'id-2',
      Family.TABLE_ANSWER,
      { case: 'tableAnswer', value: { who: gate, word: 'refuses' } },
      'speak',
      'speak:id-1'
    );
    const [, aliceSees] = story(line, answer);
    expect(aliceSees?.toastRule?.case).toBe('answer-to-your-line');
    const [, bobSees] = buildActStory(
      [line, answer].map((act) => ({
        act,
        index: 0,
        seq: 1n,
        source: 'live' as const,
        visible: true,
      })),
      { ...context, viewerMember: 'bob' }
    );
    expect(bobSees?.toastRule).toBeUndefined();
  });

  it('the viewer’s own deed is marked, so it can release a held toast', () => {
    const rows = story(
      at('id-1', Family.ACT, {
        case: 'walk',
        value: { mover: alice, path: [{}] },
      }),
      swingAtAlice('id-2')
    );
    expect(rows.map((r) => r.byViewer)).toEqual([true, false]);
  });
});

describe('idle hold pick hidden', () => {
  it('a table answer with word hold adds no row (R36, proposed)', () => {
    const rows = story(
      at(
        'id-1',
        Family.TABLE_ANSWER,
        { case: 'tableAnswer', value: { who: gate, word: 'hold' } },
        'time'
      ),
      at(
        'id-2',
        Family.TABLE_ANSWER,
        { case: 'tableAnswer', value: { who: gate, word: 'patrol' } },
        'time'
      )
    );
    expect(rows.map((r) => r.headline)).toEqual(['Gate Guard: patrol']);
  });
});

describe('in a fight is the viewer’s own fight', () => {
  it('another fight forming and dissolving does not move the viewer’s', () => {
    const bob = { kind: PartyKind.MEMBER, id: 'bob' };
    const wolf = { kind: PartyKind.MEMBER, id: 'wolf' };
    const rows = story(
      fightFormed,
      at('A2', Family.CLOCK, {
        case: 'clock',
        value: { mark: ClockMark.FIGHT_FORMED, fight: { order: [bob, wolf] } },
      }),
      at('A3', Family.CLOCK, {
        case: 'clock',
        value: {
          mark: ClockMark.FIGHT_DISSOLVED,
          dissolved: { members: [bob, wolf] },
        },
      }),
      swingAtAlice('A4')
    );
    const strike = rows.find((r) => r.act?.id === 'A4');
    expect(strike?.inFight).toBe(true);
    expect(strike?.toastRule?.hold).toBe(true);
    // The other fight's edges are not this viewer's edges, and not news.
    expect(rows[1]?.fightEdge).toBeUndefined();
    expect(rows[2]?.fightEdge).toBeUndefined();
    expect(rows[1]?.toastRule).toBeUndefined();
    expect(rows[2]?.toastRule).toBeUndefined();
  });

  it('a fight the viewer is not in leaves them out of combat', () => {
    const bob = { kind: PartyKind.MEMBER, id: 'bob' };
    const rows = story(
      at('B1', Family.CLOCK, {
        case: 'clock',
        value: { mark: ClockMark.FIGHT_FORMED, fight: { order: [bob, gate] } },
      }),
      swingAtAlice('B2')
    );
    expect(rows[1]?.inFight).toBe(false);
  });
});

describe('a member joining a running fight', () => {
  it('becomes in-fight at the first turn end that names them', () => {
    const bob = { kind: PartyKind.MEMBER, id: 'bob' };
    const rows = story(
      at('J1', Family.CLOCK, {
        case: 'clock',
        value: { mark: ClockMark.FIGHT_FORMED, fight: { order: [gate, bob] } },
      }),
      at('J2', Family.CLOCK, {
        case: 'clock',
        value: { mark: ClockMark.JOINED, member: alice },
      }),
      swingAtAlice('J3'),
      at('J4', Family.CLOCK, {
        case: 'clock',
        value: {
          mark: ClockMark.TURN_ENDED,
          turn: { member: gate, next: bob },
        },
      }),
      swingAtAlice('J5'),
      at('J6', Family.CLOCK, {
        case: 'clock',
        value: {
          mark: ClockMark.TURN_ENDED,
          turn: { member: bob, next: alice },
        },
      }),
      swingAtAlice('J7')
    );
    const inFight = (id: string) => rows.find((r) => r.act?.id === id)?.inFight;
    // Joining names no turn: not yet in the fight.
    expect(inFight('J3')).toBe(false);
    // A turn passing between others still does not name her.
    expect(inFight('J5')).toBe(false);
    // The first turn end that names her puts her in it.
    expect(inFight('J7')).toBe(true);
    expect(rows.find((r) => r.act?.id === 'J7')?.toastRule?.hold).toBe(true);
  });
});
