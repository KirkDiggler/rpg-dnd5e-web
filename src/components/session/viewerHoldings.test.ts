// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { nextViewerHoldingsFromAct as nextViewerHoldings } from './viewerHoldings';

const ME = 'char-1';
const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
const prop = (id: string) => ({ kind: PartyKind.PROP, id });

const held = (holder: string, id: string) =>
  create(ActSchema, {
    family: Family.ACT,
    body: { case: 'hold', value: { by: member(holder), prop: prop(id) } },
  });
const dropped = (by: string, id: string) =>
  create(ActSchema, {
    family: Family.ACT,
    body: {
      case: 'drop',
      value: { by: member(by), prop: prop(id), cell: { x: 1, y: 1 } },
    },
  });
const exited = (who: string) =>
  create(ActSchema, {
    family: Family.CLOCK,
    body: {
      case: 'clock',
      value: { mark: ClockMark.EXITED, departure: { member: member(who) } },
    },
  });

describe('nextViewerHoldingsFromAct — what the local member is carrying', () => {
  it('takes one up on HELD', () => {
    expect(nextViewerHoldings([], held(ME, 'heirloom'), ME)).toEqual([
      'heirloom',
    ]);
  });

  it('puts one down on DROPPED', () => {
    expect(
      nextViewerHoldings(['heirloom'], dropped(ME, 'heirloom'), ME)
    ).toEqual([]);
  });

  it('carries nothing once the member has left', () => {
    expect(nextViewerHoldings(['heirloom'], exited(ME), ME)).toEqual([]);
  });

  it('ignores every beat about somebody else', () => {
    const mine = ['heirloom'];
    expect(nextViewerHoldings(mine, held('char-2', 'crown'), ME)).toBe(mine);
    expect(nextViewerHoldings(mine, dropped('char-2', 'heirloom'), ME)).toBe(
      mine
    );
    expect(nextViewerHoldings(mine, exited('char-2'), ME)).toBe(mine);
  });

  it('leaves one holding after a beat delivered twice', () => {
    // The member picked up one thing. A redelivered HELD must not make it
    // two, or the Leave button would threaten to drop a second heirloom.
    const once = nextViewerHoldings([], held(ME, 'heirloom'), ME);
    const twice = nextViewerHoldings(once, held(ME, 'heirloom'), ME);
    expect(twice).toEqual(['heirloom']);
    expect(twice).toBe(once);
  });

  it('is unchanged by a DROPPED for something the member was not carrying', () => {
    const mine = ['heirloom'];
    expect(nextViewerHoldings(mine, dropped(ME, 'crown'), ME)).toBe(mine);
  });

  it('returns the same array when nothing moved, so callers do not re-render', () => {
    const mine = ['heirloom'];
    const other = create(ActSchema, {
      family: Family.STATE,
      body: {
        case: 'state',
        value: { party: member(ME), change: StateKind.DOWNED },
      },
    });
    expect(nextViewerHoldings(mine, other, ME)).toBe(mine);
    // IDENTITY, not equality: `toEqual` here would pass with the
    // already-empty guard deleted, and the caller uses this return value
    // as a `useState` updater.
    const empty: readonly string[] = [];
    expect(nextViewerHoldings(empty, exited(ME), ME)).toBe(empty);
  });

  it('carries two things when the member picked up two', () => {
    let holdings = nextViewerHoldings([], held(ME, 'heirloom'), ME);
    holdings = nextViewerHoldings(holdings, held(ME, 'crown'), ME);
    expect(holdings).toEqual(['heirloom', 'crown']);
    holdings = nextViewerHoldings(holdings, dropped(ME, 'heirloom'), ME);
    expect(holdings).toEqual(['crown']);
  });
});
