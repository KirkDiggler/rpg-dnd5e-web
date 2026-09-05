import { create } from '@bufbuild/protobuf';
import {
  ArrivedSchema,
  EventKind,
  EventSchema,
  JoinedSchema,
  MovedSchema,
  StanceChangedSchema,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { PlacementKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { refreshKeysFor } from './sessionRefreshKeys';

const VIEWER = 'p1';

describe('the refresh table (lifted from SessionEncounterView)', () => {
  it('keeps the rows it had: a move of my own vs another’s, a join', () => {
    const mine = create(EventSchema, {
      kind: EventKind.MOVED,
      body: { case: 'moved', value: create(MovedSchema, { member: VIEWER }) },
    });
    const theirs = create(EventSchema, {
      kind: EventKind.MOVED,
      body: { case: 'moved', value: create(MovedSchema, { member: 'scout' }) },
    });
    expect(refreshKeysFor(mine, VIEWER)).toEqual(['where', 'afford', 'turn']);
    expect(refreshKeysFor(theirs, VIEWER)).toEqual(['view']);
    const joined = create(EventSchema, {
      kind: EventKind.JOINED,
      body: { case: 'joined', value: create(JoinedSchema, { member: 'p2' }) },
    });
    expect(refreshKeysFor(joined, VIEWER)).toEqual(['roster']);
  });
});

describe('the hold-out’s two rows (rpg-project#375 §5)', () => {
  it('STANCE_CHANGED refreshes who may be attacked and what is seen', () => {
    const event: SessionEvent = create(EventSchema, {
      kind: EventKind.STANCE_CHANGED,
      body: {
        case: 'stanceChanged',
        value: create(StanceChangedSchema, {
          between: ['goblins', 'party'],
          stance: 'neutral',
        }),
      },
    });
    expect(refreshKeysFor(event, VIEWER)).toEqual(['afford', 'view']);
  });

  it('ARRIVED re-pulls the roster for a monster, the atlas for a prop — the first the client hears of a reserved placement', () => {
    const monster = create(EventSchema, {
      kind: EventKind.ARRIVED,
      body: {
        case: 'arrived',
        value: create(ArrivedSchema, {
          id: 'reinforcement-1',
          kind: PlacementKind.MONSTER,
          cell: { x: 1, y: 4 },
        }),
      },
    });
    const prop = create(EventSchema, {
      kind: EventKind.ARRIVED,
      body: {
        case: 'arrived',
        value: create(ArrivedSchema, {
          id: 'letter',
          kind: PlacementKind.PROP,
          cell: { x: 1, y: 3 },
        }),
      },
    });
    expect(refreshKeysFor(monster, VIEWER)).toEqual(['roster', 'view']);
    expect(refreshKeysFor(prop, VIEWER)).toEqual(['atlas', 'view']);
  });
});
