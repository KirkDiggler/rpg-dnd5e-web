import { create } from '@bufbuild/protobuf';
import {
  AnsweredSchema,
  ArrivedSchema,
  CastSchema,
  ConcealmentRevealedSchema,
  ConcentrationEndedSchema,
  EventKind,
  EventSchema,
  JoinedSchema,
  MovedSchema,
  PersuadedSchema,
  RollWindowOpenedSchema,
  SavedSchema,
  SightedSchema,
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

describe('the concentration break’s row (design rpg-project#407, R11)', () => {
  const broke = create(EventSchema, {
    kind: EventKind.CONCENTRATION_ENDED,
    body: {
      case: 'concentrationEnded',
      value: create(ConcentrationEndedSchema, {
        caster: VIEWER,
        reason: 'damage',
      }),
    },
  });

  it('re-reads the cards the strip emptied and the roster the flag lives on', () => {
    // `turn`, NOT `roster`. The concentrating bool rides GetTurn's
    // participants — the roster row the initiative strip draws — so a
    // refresh of GetRoster would leave the marker standing after the break.
    expect(refreshKeysFor(broke, VIEWER)).toEqual(['characterData', 'turn']);
  });

  it('refreshes for a break that is somebody else’s', () => {
    // The child conditions come off OTHER members' sheets, so a viewer who
    // is not the caster still has a card to re-read.
    expect(refreshKeysFor(broke, 'someone-else')).toEqual([
      'characterData',
      'turn',
    ]);
  });
});

describe('the sighting row (perception stream, slice 1)', () => {
  const sighted = (
    gained: string[],
    lost: string[] = [],
    changed: string[] = []
  ) =>
    create(EventSchema, {
      kind: EventKind.SIGHTED,
      body: {
        case: 'sighted',
        value: create(SightedSchema, { gained, lost, changed }),
      },
    });

  it('refetches the scene and nothing else — nobody moved and nothing was spent', () => {
    expect(refreshKeysFor(sighted(['goblin-2']), VIEWER)).toEqual(['view']);
  });

  it('reads the same whichever way perception went', () => {
    // Somebody arriving and somebody leaving are one question to this
    // client: what do I perceive now? Both answers come from GetView, so
    // both rows are the same row.
    expect(refreshKeysFor(sighted([], ['wolf-3']), VIEWER)).toEqual(['view']);
    expect(refreshKeysFor(sighted(['orc-1'], ['wolf-3']), VIEWER)).toEqual([
      'view',
    ]);
  });

  it('reads the same for a peer who changed under us', () => {
    // The third list: somebody still in view whose weapon moved. Not a
    // transition — we could see them before and can see them now — but the
    // same answer, because what we may now perceive of them is only in the
    // view we are about to re-read.
    expect(refreshKeysFor(sighted([], [], ['goblin-2']), VIEWER)).toEqual([
      'view',
    ]);
    expect(
      refreshKeysFor(sighted(['orc-1'], ['wolf-3'], ['goblin-2']), VIEWER)
    ).toEqual(['view']);
  });

  it('does not pull the card, the turn or what is affordable', () => {
    // The guard for the tempting "refresh everything, it is cheap" edit. A
    // sighting spends no action, moves nobody and changes no sheet, so
    // anything beyond `view` is work for a beat that changed none of it.
    const keys = refreshKeysFor(
      sighted(['goblin-2'], ['wolf-3'], ['orc-1']),
      VIEWER
    );
    expect(keys).not.toContain('characterData');
    expect(keys).not.toContain('afford');
    expect(keys).not.toContain('turn');
    expect(keys).not.toContain('roster');
  });
});

// The front room goblin (rpg-project#458). The two social checks are scoped
// to the ACTOR; the creature's ANSWER is not, and the difference is the whole
// reason they are separate rows.
describe('the social beats and the creature’s answer', () => {
  function persuaded(actor: string): SessionEvent {
    return create(EventSchema, {
      kind: EventKind.PERSUADED,
      body: {
        case: 'persuaded',
        value: create(PersuadedSchema, {
          actor,
          target: 'front-goblin',
          dc: 10,
          total: 13,
          beaten: true,
        }),
      },
    });
  }

  it('my own appeal re-reads my card and what I may still declare', () => {
    const keys = refreshKeysFor(persuaded(VIEWER), VIEWER);
    expect(keys).toContain('characterData');
    expect(keys).toContain('afford');
  });

  it("somebody else's appeal costs me nothing to re-read", () => {
    // Scoped to the actor, the way `moved` is. Their action was spent, not
    // mine, and nothing about my own card or offers moved.
    expect(refreshKeysFor(persuaded('someone-else'), VIEWER)).toEqual([]);
  });

  it('an appeal does not re-read the view — nobody stepped', () => {
    // A social verb reaches exactly the people who could already see the
    // actor, which is what made them the audience.
    expect(refreshKeysFor(persuaded(VIEWER), VIEWER)).not.toContain('view');
  });

  it('the creature’s answer re-reads the view and offers for EVERYBODY', () => {
    // NOT SCOPED TO THE ACTOR, and that is the point. An answer can move the
    // creature — `flee` routes it away — and can teach a fact that flips a
    // stance, and either changes what every player may do next and who they
    // may do it to. A client that skipped `view` here would go on drawing a
    // goblin that walked out of the room.
    const answered = create(EventSchema, {
      kind: EventKind.ANSWERED,
      body: {
        case: 'answered',
        value: create(AnsweredSchema, {
          creature: 'front-goblin',
          beaten: false,
          roll: 3,
          of: 4,
          entry: 1,
          say: 'Boss! BOSS!',
        }),
      },
    });

    const mine = refreshKeysFor(answered, VIEWER);
    expect(mine).toContain('view');
    expect(mine).toContain('afford');
    // The creature spent its own nothing; no player's sheet moved.
    expect(mine).not.toContain('characterData');
    // And it is the same answer for a bystander, because it is not about
    // whose turn it was.
    expect(refreshKeysFor(answered, 'someone-else')).toEqual(mine);
  });

  describe('concealment_revealed (rpg-api-protos#352, landed in the v0.1.207 bump)', () => {
    it('re-reads the doors and the atlas — one secret, both patch surfaces', () => {
      // CONCEALMENT_REVEALED supersedes BOTH doorRevealed and regionRevealed:
      // one beat carries the hidden floor cells and props (an atlas patch) plus
      // the member doors and their doorways (a doors-list patch). So this row
      // is the reveal union, by the same deliberate re-verify path the two
      // reveals above use rather than splicing the beat's own payload.
      const revealed = create(EventSchema, {
        kind: EventKind.CONCEALMENT_REVEALED,
        body: {
          case: 'concealmentRevealed',
          value: create(ConcealmentRevealedSchema, {
            concealment: 'vault',
          }),
        },
      });
      expect(refreshKeysFor(revealed, VIEWER)).toEqual(['doors', 'atlas']);
    });
  });
});
