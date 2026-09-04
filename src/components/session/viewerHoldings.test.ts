import { create } from '@bufbuild/protobuf';
import {
  DroppedSchema,
  EventKind,
  EventSchema,
  ExitedSchema,
  HeldSchema,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { describe, expect, it } from 'vitest';
import { nextViewerHoldings } from './viewerHoldings';

const ME = 'char-1';

const held = (holder: string, prop: string): SessionEvent =>
  create(EventSchema, {
    kind: EventKind.HELD,
    body: { case: 'held', value: create(HeldSchema, { holder, prop }) },
  });
const dropped = (member: string, prop: string): SessionEvent =>
  create(EventSchema, {
    kind: EventKind.DROPPED,
    body: {
      case: 'dropped',
      value: create(DroppedSchema, { member, prop, at: { x: 1, y: 1 } }),
    },
  });
const exited = (member: string): SessionEvent =>
  create(EventSchema, {
    kind: EventKind.EXITED,
    body: { case: 'exited', value: create(ExitedSchema, { member }) },
  });

describe('nextViewerHoldings — what the local member is carrying', () => {
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
    const other = create(EventSchema, {
      kind: EventKind.DOWNED,
      body: { case: 'downed', value: { member: ME } },
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
