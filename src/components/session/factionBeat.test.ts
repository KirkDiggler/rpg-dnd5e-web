import { create } from '@bufbuild/protobuf';
import {
  ArrivedSchema,
  EventKind,
  EventSchema,
  StanceChangedSchema,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DissolveKind,
  PlacementKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  dissolveSentence,
  formatFactionBeat,
  pairPhrase,
  sidePhrase,
} from './factionBeat';

/** The beats as the wire carries them (rpg-api-protos 5b99c3fc). */
function stanceChanged(between: string[], stance: string): SessionEvent {
  return create(EventSchema, {
    kind: EventKind.STANCE_CHANGED,
    body: {
      case: 'stanceChanged',
      value: create(StanceChangedSchema, { between, stance }),
    },
  });
}
function arrived(
  id: string,
  kind: PlacementKind,
  cell?: { x: number; y: number }
): SessionEvent {
  return create(EventSchema, {
    kind: EventKind.ARRIVED,
    body: { case: 'arrived', value: create(ArrivedSchema, { id, kind, cell }) },
  });
}

describe('the stance beat (rpg-project#375 §5)', () => {
  it('neutral: the pair are no longer hostile — R2, said as "not hostile"', () => {
    expect(
      formatFactionBeat(stanceChanged(['goblins', 'party'], 'neutral'))
    ).toBe('The goblins and the party are no longer hostile.');
  });

  it('keeps the pair in the order the beat carries it', () => {
    expect(
      formatFactionBeat(stanceChanged(['party', 'goblins'], 'neutral'))
    ).toBe('The party and the goblins are no longer hostile.');
  });

  it('allied and hostile have their own sentences; an unknown word is read back', () => {
    expect(
      formatFactionBeat(stanceChanged(['goblins', 'party'], 'allied'))
    ).toBe('The goblins and the party are now allies.');
    expect(
      formatFactionBeat(stanceChanged(['goblins', 'party'], 'hostile'))
    ).toBe('The goblins and the party are now hostile.');
    expect(formatFactionBeat(stanceChanged(['goblins', 'party'], 'wary'))).toBe(
      'The goblins and the party now stand wary.'
    );
  });

  it('spells a side as the author’s own word', () => {
    expect(sidePhrase('hill-goblins')).toBe('the hill goblins');
    expect(sidePhrase('')).toBe('');
    expect(pairPhrase([])).toBe('the two sides');
    expect(pairPhrase(['goblins'])).toBe('the goblins');
  });
});

describe('the arrival beat (rpg-project#375 §3.7)', () => {
  it('a monster arrives, a prop appears — at the cell the beat names', () => {
    expect(
      formatFactionBeat(
        arrived('reinforcement-1', PlacementKind.MONSTER, { x: 1, y: 4 })
      )
    ).toBe('The reinforcement 1 arrives at 1,4.');
    expect(
      formatFactionBeat(arrived('letter', PlacementKind.PROP, { x: 1, y: 3 }))
    ).toBe('The letter appears at 1,3.');
  });

  it('without a cell the sentence simply does not claim one', () => {
    expect(formatFactionBeat(arrived('scout', PlacementKind.MONSTER))).toBe(
      'The scout arrives.'
    );
  });

  it('answers null for every other beat', () => {
    expect(
      formatFactionBeat(create(EventSchema, { kind: EventKind.JOINED }))
    ).toBeNull();
  });
});

describe('the fight-ended sentence, by cause (R1)', () => {
  it('BY_STANCE says the sides stood down; every other cause keeps the old line', () => {
    expect(dissolveSentence(DissolveKind.BY_STANCE)).toBe(
      'The fight dissolves — the sides are no longer hostile.'
    );
    expect(dissolveSentence(DissolveKind.BY_DEFEAT)).toBe('The fight is over.');
    expect(dissolveSentence(DissolveKind.UNSPECIFIED)).toBe(
      'The fight is over.'
    );
  });
});
