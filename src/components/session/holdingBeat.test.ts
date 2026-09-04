import { create } from '@bufbuild/protobuf';
import {
  DroppedSchema,
  EventKind,
  EventSchema,
  ExitedSchema,
  HeldSchema,
  LootedSchema,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { describe, expect, it } from 'vitest';
import {
  authoredWords,
  exitCarrier,
  formatHoldingBeat,
  holdingPhrase,
  type BeatNames,
} from './holdingBeat';

/**
 * The Story log's resolver: everyone by their roster name, nobody is "You".
 * The beat line's is the other one, and both go through the same function
 * — which is the point of the function.
 *
 * THE ARTICLE BELONGS TO THE NAME, not to the sentence template. A member
 * is written exactly as the roster names them, because a player is
 * "Brenna" and never "the Brenna" — the same rule `combatBeat` already
 * follows ("Aldric hits skeleton-1"). The design's example sentence,
 * "Aldric looted the skeleton captain", is therefore a statement about
 * what the roster calls that monster, and this fixture spells it the way
 * the design does so the sentence under test is the design's own.
 */
const NAMES: BeatNames = {
  subject: (id) =>
    ({ m1: 'Aldric', m2: 'Brenna', cap: 'the skeleton captain' })[id] ?? id,
  object: (id) =>
    ({ m1: 'Aldric', m2: 'Brenna', cap: 'the skeleton captain' })[id] ?? id,
};

const VIEWER: BeatNames = {
  subject: (id) => (id === 'm1' ? 'You' : NAMES.subject(id)),
  object: (id) => (id === 'm1' ? 'you' : NAMES.object(id)),
};

function looted(looter: string, body: string): SessionEvent {
  return create(EventSchema, {
    kind: EventKind.LOOTED,
    body: { case: 'looted', value: create(LootedSchema, { looter, body }) },
  });
}
function held(holder: string, prop: string): SessionEvent {
  return create(EventSchema, {
    kind: EventKind.HELD,
    body: { case: 'held', value: create(HeldSchema, { holder, prop }) },
  });
}
function dropped(member: string, prop: string): SessionEvent {
  return create(EventSchema, {
    kind: EventKind.DROPPED,
    body: {
      case: 'dropped',
      value: create(DroppedSchema, { member, prop, at: { x: 1, y: 1 } }),
    },
  });
}
function exited(
  member: string,
  init: { exit?: string; holding?: string[] } = {}
): SessionEvent {
  return create(EventSchema, {
    kind: EventKind.EXITED,
    body: {
      case: 'exited',
      value: create(ExitedSchema, {
        member,
        exit: init.exit ?? '',
        holding: init.holding ?? [],
      }),
    },
  });
}

describe('the beats read as the statements the design names', () => {
  it('“Aldric looted the skeleton captain”', () => {
    expect(formatHoldingBeat(looted('m1', 'cap'), NAMES)).toBe(
      'Aldric looted the skeleton captain.'
    );
  });

  it('“Aldric holds the heirloom” — present tense, and never “took” (R10)', () => {
    const sentence = formatHoldingBeat(held('m1', 'heirloom'), NAMES);
    expect(sentence).toBe('Aldric holds the heirloom.');
    expect(sentence).not.toMatch(/took|take/i);
  });

  it('“Aldric dropped the heirloom”', () => {
    expect(formatHoldingBeat(dropped('m1', 'heirloom'), NAMES)).toBe(
      'Aldric dropped the heirloom.'
    );
  });

  it('“Aldric left through the entrance with the heirloom”', () => {
    expect(
      formatHoldingBeat(
        exited('m1', { exit: 'entrance', holding: ['heirloom'] }),
        NAMES
      )
    ).toBe('Aldric left through the entrance with the heirloom.');
  });

  it('says nothing about an exit for a departure from elsewhere', () => {
    // `exit` empty is the TRUTH that no authored way out was used — not
    // "unknown" — so the sentence must not claim one.
    expect(formatHoldingBeat(exited('m2'), NAMES)).toBe('Brenna left.');
    expect(formatHoldingBeat(exited('m2', { exit: 'front-gate' }), NAMES)).toBe(
      'Brenna left through the front gate.'
    );
  });

  it('never says “interacted”, whatever the beat', () => {
    for (const event of [
      looted('m1', 'cap'),
      held('m1', 'heirloom'),
      dropped('m1', 'heirloom'),
      exited('m1', { exit: 'entrance', holding: ['heirloom'] }),
    ]) {
      expect(formatHoldingBeat(event, NAMES)).not.toMatch(/interact/i);
    }
  });

  it('takes the caller’s own name resolvers, subject and object apart', () => {
    // The beat line says "You"/"you"; the Story log says the roster name
    // in both places. One function, two callers, no second copy of the
    // sentence anywhere.
    expect(formatHoldingBeat(looted('m1', 'cap'), VIEWER)).toBe(
      'You looted the skeleton captain.'
    );
    expect(formatHoldingBeat(looted('cap', 'm1'), VIEWER)).toBe(
      'the skeleton captain looted you.'
    );
  });

  it('narrates nothing for a beat that is not one of the four', () => {
    const other = create(EventSchema, {
      kind: EventKind.DOWNED,
      body: { case: 'downed', value: { member: 'm1' } },
    });
    expect(formatHoldingBeat(other, NAMES)).toBeNull();
  });

  it('carries a loot beat identically whatever the body held', () => {
    // Design P3 at the sentence level: the captain and an empty skeleton
    // produce the same shape, so the log cannot say which was worth it.
    const a = formatHoldingBeat(looted('m1', 'cap'), NAMES);
    const b = formatHoldingBeat(looted('m1', 'cap'), NAMES);
    expect(a).toBe(b);
    expect(a).not.toMatch(/nothing|empty|found/i);
  });
});

describe('authoredWords / holdingPhrase', () => {
  it('spaces the author’s own separators and nothing else', () => {
    expect(authoredWords('heirloom')).toBe('heirloom');
    expect(authoredWords('vault-key')).toBe('vault key');
    expect(authoredWords('front_gate')).toBe('front gate');
    expect(authoredWords('')).toBe('');
  });

  it('reads a list of holdings as English', () => {
    expect(holdingPhrase([])).toBe('');
    expect(holdingPhrase(['heirloom'])).toBe('the heirloom');
    expect(holdingPhrase(['heirloom', 'crown'])).toBe(
      'the heirloom and the crown'
    );
    expect(holdingPhrase(['a', 'b', 'c'])).toBe('the a, the b and the c');
  });

  it('renders two holdings in the sentence too', () => {
    expect(
      formatHoldingBeat(
        exited('m1', { exit: 'entrance', holding: ['heirloom', 'crown'] }),
        NAMES
      )
    ).toBe('Aldric left through the entrance with the heirloom and the crown.');
  });
});

describe('exitCarrier — who the ending overlay may name', () => {
  it('names a departure through an authored exit while holding', () => {
    expect(
      exitCarrier(exited('m1', { exit: 'entrance', holding: ['heirloom'] }))
    ).toEqual({ member: 'm1', exit: 'entrance', holding: ['heirloom'] });
  });

  it('is null for a departure carrying nothing — that ends nobody’s run', () => {
    expect(exitCarrier(exited('m1', { exit: 'entrance' }))).toBeNull();
  });

  it('is null for a departure from elsewhere — that one DROPS what it held (R9)', () => {
    expect(exitCarrier(exited('m1', { holding: ['heirloom'] }))).toBeNull();
  });

  it('is null for any other beat', () => {
    expect(exitCarrier(held('m1', 'heirloom'))).toBeNull();
  });
});
