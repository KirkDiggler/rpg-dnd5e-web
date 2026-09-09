// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  JoinedSchema,
  MovedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { arrivingStep } from './arrivingStep';

/** `to` is the WIRE shape: axial (q, r) carried as x/y, not cube. */
const movedEvent = (member: string, to?: { x: number; y: number }) =>
  create(EventSchema, {
    kind: EventKind.MOVED,
    body: {
      case: 'moved',
      value: create(MovedSchema, {
        member,
        ...(to ? { to: create(PositionSchema, to) } : {}),
      }),
    },
  });

describe('arrivingStep', () => {
  it('reads the member and the cell out of a movement beat', () => {
    // Wire axial q=2, r=-2 bridges to cube (2, 0, -2) via positionBridge.
    expect(arrivingStep(movedEvent('scout', { x: 2, y: -2 }))).toEqual({
      member: 'scout',
      to: { x: 2, y: 0, z: -2 },
    });
  });

  it('is nothing for a beat that is not a movement', () => {
    const joined = create(EventSchema, {
      kind: EventKind.JOINED,
      body: { case: 'joined', value: create(JoinedSchema, { member: 'p2' }) },
    });

    expect(arrivingStep(joined)).toBeUndefined();
  });

  it('is nothing when the beat names no cell — there is nowhere to walk to', () => {
    expect(arrivingStep(movedEvent('scout'))).toBeUndefined();
  });
});
