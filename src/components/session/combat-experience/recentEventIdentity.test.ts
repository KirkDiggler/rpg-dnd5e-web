import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  ClockMark,
  Family,
  PartyKind,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { recentEventIdentity } from './recentEventIdentity';
const context = {
  viewerMember: 'player',
  memberNames: { guard: 'Skeleton guard', player: 'Aldric', mira: 'Mira' },
};
const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
describe('recent event what/who', () => {
  it('names the attacking actor on a miss, not the defender named first by narration', () => {
    const act = create(ActSchema, {
      family: Family.ACT,
      body: {
        case: 'attack',
        value: {
          by: member('guard'),
          to: member('player'),
          outcome: AttackOutcome.MISS,
        },
      },
    });
    expect(recentEventIdentity(act, context)).toMatchObject({
      what: 'Miss',
      who: 'Skeleton guard',
    });
  });
  it('uses the supplied result instead of comparing roll numbers', () => {
    const act = create(ActSchema, {
      family: Family.ACT,
      body: {
        case: 'attack',
        value: {
          by: member('player'),
          outcome: AttackOutcome.HIT,
          roll: { total: 1, against: 20 },
        },
      },
    });
    expect(recentEventIdentity(act, context)).toMatchObject({
      what: 'Attack',
      who: 'Aldric',
    });
  });
  it('names the answerer and the subject of state changes from their typed fields', () => {
    expect(
      recentEventIdentity(
        create(ActSchema, {
          family: Family.TABLE_ANSWER,
          body: {
            case: 'tableAnswer',
            value: { who: member('guard'), word: 'hello' },
          },
        }),
        context
      )
    ).toMatchObject({ what: 'Answer', who: 'Skeleton guard' });
    expect(
      recentEventIdentity(
        create(ActSchema, {
          family: Family.STATE,
          body: {
            case: 'state',
            value: {
              party: member('mira'),
              change: StateKind.CONCENTRATION_ENDED,
            },
          },
        }),
        context
      )
    ).toMatchObject({ what: 'Concentration ended', who: 'Mira' });
  });
  it('does not invent an initiator for encounter events or an absent actor', () => {
    expect(
      recentEventIdentity(
        create(ActSchema, {
          family: Family.CLOCK,
          body: { case: 'clock', value: { mark: ClockMark.FIGHT_FORMED } },
        }),
        context
      )
    ).toMatchObject({ what: 'Fight begins', who: 'Encounter' });
    expect(
      recentEventIdentity(
        create(ActSchema, {
          family: Family.ACT,
          body: { case: 'attack', value: {} },
        }),
        context
      ).who
    ).toBe('Unknown actor');
  });
});
