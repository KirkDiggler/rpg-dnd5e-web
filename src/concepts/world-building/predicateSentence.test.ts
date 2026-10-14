import { describe, expect, it } from 'vitest';
import { createGuardCastDocument } from '../encounter-studio/fixtures/castDocument';
import {
  dispositionLine,
  dispositionSentence,
  pairMindName,
  predicateSentence,
} from './predicateSentence';

const names = new Map([['gate-1', 'gate-1']]);

describe('predicateSentence', () => {
  it('says a fact judged on a mind', () => {
    expect(
      predicateSentence(
        { fact: 'party-recognized' },
        { names, mindName: 'captain, the garrison’s mind' }
      )
    ).toBe('captain, the garrison’s mind, knows party-recognized');
  });

  it('says a fact anyone may know', () => {
    expect(predicateSentence({ fact: 'alarm-raised' }, { names })).toBe(
      'alarm-raised is known'
    );
  });

  it('says a round', () => {
    expect(predicateSentence({ round: 12 }, { names })).toBe('round 12 begins');
  });

  it('says a placement down by its shown name', () => {
    expect(predicateSentence({ down: 'gate-1' }, { names })).toBe(
      'gate-1 is down'
    );
  });

  it('says a stance', () => {
    expect(
      predicateSentence(
        { stance: { between: ['garrison', 'party'], is: 'hostile' } },
        { names }
      )
    ).toBe('the garrison and the party are hostile');
  });
});

describe('dispositionSentence', () => {
  const document = () => {
    const d = createGuardCastDocument();
    d.draft.scene.actorNames = { 'gate-1': 'captain' };
    d.scope.factions = [{ id: 'garrison', mind: 'gate-1' }, { id: 'kitchen' }];
    return d;
  };

  it('the garrison’s disposition reads until the captain knows, then hostile', () => {
    const d = document();
    expect(
      dispositionSentence(
        {
          between: ['garrison', 'party'],
          stance: 'neutral',
          until: { fact: 'party-recognized' },
        },
        'garrison',
        d
      )
    ).toBe(
      'Neutral to the party until captain, the garrison’s mind, knows party-recognized; then hostile.'
    );
  });

  it('says a disposition nothing turns', () => {
    expect(
      dispositionSentence(
        { between: ['kitchen', 'party'], stance: 'neutral' },
        'kitchen',
        document()
      )
    ).toBe('Neutral to the party, with nothing that turns it.');
  });

  it('a faction of one has its member as its mind; the party has none', () => {
    const d = document();
    d.draft.room.monsterBindings = { 'gate-2': { faction: 'kitchen' } };
    expect(pairMindName(d, ['kitchen', 'party'])).toBe(
      'Guard, the kitchen’s mind'
    );
    delete d.draft.room.monsterBindings;
    expect(pairMindName(d, ['kitchen', 'party'])).toBeUndefined();
  });

  it('says the pair from neither side for the authored list', () => {
    expect(
      dispositionLine(
        {
          between: ['garrison', 'party'],
          stance: 'hostile',
          until: { round: 3 },
        },
        document()
      )
    ).toBe(
      'The garrison and the party are hostile until round 3 begins; then neutral.'
    );
  });
});
