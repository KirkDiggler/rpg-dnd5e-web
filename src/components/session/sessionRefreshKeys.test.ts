import { create } from '@bufbuild/protobuf';
import {
  ArrivedSchema,
  CastSchema,
  EventKind,
  EventSchema,
  JoinedSchema,
  MovedSchema,
  RollWindowOpenedSchema,
  SavedSchema,
  StanceChangedSchema,
  WindowOpenedSchema,
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

describe('the cast door’s two rows (design rpg-project#405)', () => {
  it('CAST refreshes the card, what is still declarable, and the scene', () => {
    const event = create(EventSchema, {
      kind: EventKind.CAST,
      body: {
        case: 'cast',
        value: create(CastSchema, { actor: VIEWER, target: 'skeleton-1' }),
      },
    });
    // The same three an activation's result refreshes: a cantrip spends the
    // action Afford priced and its effects land on somebody's card.
    expect(refreshKeysFor(event, VIEWER)).toEqual([
      'characterData',
      'afford',
      'view',
    ]);
  });

  it('SAVED refreshes too, even though the save delivers nothing itself', () => {
    const event = create(EventSchema, {
      kind: EventKind.SAVED,
      body: {
        case: 'saved',
        value: create(SavedSchema, {
          saver: 'skeleton-1',
          ability: 'wis',
          roll: 7,
          total: 9,
          dc: 13,
          succeeded: false,
        }),
      },
    });
    // The beats that carry what the save cost arrive separately; refreshing
    // here keeps the card and the log from disagreeing across that gap.
    expect(refreshKeysFor(event, VIEWER)).toEqual([
      'characterData',
      'afford',
      'view',
    ]);
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

describe('the reaction window row (rpg-project#316)', () => {
  it('WINDOW_OPENED re-reads what it changed: the offer, and the board', () => {
    const event: SessionEvent = create(EventSchema, {
      kind: EventKind.WINDOW_OPENED,
      body: {
        case: 'windowOpened',
        value: create(WindowOpenedSchema, {
          audience: [VIEWER],
          mover: 'skeleton-1',
        }),
      },
    });
    expect(refreshKeysFor(event, VIEWER)).toEqual(['afford', 'view']);
  });

  it('says the same to a member the window was not posed to', () => {
    const event: SessionEvent = create(EventSchema, {
      kind: EventKind.WINDOW_OPENED,
      body: {
        case: 'windowOpened',
        value: create(WindowOpenedSchema, {
          audience: ['someone-else'],
          mover: 'skeleton-1',
        }),
      },
    });
    // Their verbs are frozen too — the WINDOW_OPEN shortfall is only in
    // Afford, so everyone re-reads it.
    expect(refreshKeysFor(event, VIEWER)).toEqual(['afford', 'view']);
  });

  it('ROLL_WINDOW_OPENED re-reads the offer alone, because nobody moved', () => {
    const event: SessionEvent = create(EventSchema, {
      kind: EventKind.ROLL_WINDOW_OPENED,
      body: {
        case: 'rollWindowOpened',
        value: create(RollWindowOpenedSchema, {
          audience: VIEWER,
          roll: 9,
          total: 13,
        }),
      },
    });
    // `view` is deliberately absent: this window has no mover and no cells,
    // so the scene is exactly what it was.
    expect(refreshKeysFor(event, VIEWER)).toEqual(['afford']);
  });
});
