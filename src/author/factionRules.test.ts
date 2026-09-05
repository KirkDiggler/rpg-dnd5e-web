import { describe, expect, it } from 'vitest';
import {
  addDisposition,
  addFaction,
  addIntel,
  emptyDungeon,
  paintCell,
  placeAt,
  setIntelReveals,
  updateDisposition,
  updateFaction,
  updatePlacement,
  type DungeonDoc,
} from './dungeonYaml';
import {
  factionChoices,
  factionRefusals,
  factNote,
  NAME_A_MIND,
  NO_RECORD_REVEALS_THIS,
  predicateRefusals,
  refusalsAt,
} from './factionRules';
import { fromOffset } from './hexOffset';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);

/** A camp: two named goblins in `goblins`, a named prop, one record
 * revealing `saved-wiseman`, and the hostile-until disposition. */
function camp(): DungeonDoc {
  let doc = emptyDungeon();
  for (let c = 0; c < 4; c += 1) doc = paintCell(doc, 'region-1', p(c, 0));
  doc = placeAt(doc, {
    ref: 'dnd5e:props:scroll',
    at: p(0, 0),
    blocksMovement: false,
    blocksLos: false,
  });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:goblin-boss', at: p(1, 0) });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:goblin', at: p(2, 0) });
  doc = updatePlacement(doc, 0, { id: 'letter' });
  doc = updatePlacement(doc, 1, { id: 'chief', faction: 'goblins' });
  doc = updatePlacement(doc, 2, { id: 'scout', faction: 'goblins' });
  doc = addFaction(doc);
  doc = updateFaction(doc, 'faction-1', { id: 'goblins', mind: 'chief' });
  doc = addIntel(doc);
  doc = setIntelReveals(doc, 'intel-1', 'fact', 'saved-wiseman');
  doc = addDisposition(doc);
  return updateDisposition(doc, 0, { until: { fact: 'saved-wiseman' } });
}

describe('the fixture-shaped camp earns no refusal', () => {
  it('is clean', () => {
    expect(factionRefusals(camp())).toEqual([]);
  });

  it('offers the declared factions and the party, never `monsters`', () => {
    expect(factionChoices(camp())).toEqual(['goblins', 'party']);
  });

  it('offers the party ONCE when a faction is mistakenly declared `party`', () => {
    let doc = addFaction(camp());
    doc = updateFaction(doc, 'faction-2', { id: 'party' });
    expect(factionChoices(doc)).toEqual(['goblins', 'party']);
  });
});

describe('factions (§2)', () => {
  it('refuses `party` declared, in the design’s terms', () => {
    let doc = addFaction(camp());
    doc = updateFaction(doc, 'faction-2', { id: 'party' });
    const messages = refusalsAt(factionRefusals(doc), 'factions[1].id');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('`party`');
    expect(messages[0]).toContain('players');
  });

  it('refuses a blank name and a duplicate', () => {
    let doc = addFaction(camp());
    doc = { ...doc, factions: [doc.factions[0], { id: '' }] };
    expect(refusalsAt(factionRefusals(doc), 'factions[1].id')[0]).toContain(
      'needs a name'
    );
    doc = { ...doc, factions: [doc.factions[0], { id: 'goblins' }] };
    expect(refusalsAt(factionRefusals(doc), 'factions[1].id')[0]).toContain(
      'already called "goblins"'
    );
  });

  it('refuses a mind outside its faction, and one naming nobody', () => {
    // The letter is a prop; the scout is a goblin but `wolves` has none.
    let doc = updateFaction(camp(), 'goblins', { mind: 'letter' });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')[0]).toContain(
      '"letter" is not in goblins'
    );
    doc = updateFaction(camp(), 'goblins', { mind: 'nobody' });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')[0]).toContain(
      'no placement is called "nobody"'
    );
  });

  it('a faction of many waiting on a fact with no mind: the design’s own sentence', () => {
    const doc = updateFaction(camp(), 'goblins', { mind: undefined });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')).toEqual([
      NAME_A_MIND,
    ]);
  });

  it('a faction of ONE needs no mind — its member is the mind', () => {
    let doc = updateFaction(camp(), 'goblins', { mind: undefined });
    doc = updatePlacement(doc, 2, { faction: '' });
    expect(factionRefusals(doc)).toEqual([]);
  });

  it('a faction of many with no `until: { fact }` needs no mind either', () => {
    let doc = updateFaction(camp(), 'goblins', { mind: undefined });
    doc = updateDisposition(doc, 0, { until: { round: 3 } });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')).toEqual([]);
  });
});

describe('placements (§2)', () => {
  it('refuses an unknown faction on a monster, naming where to declare it', () => {
    const doc = updatePlacement(camp(), 2, { faction: 'wolves' });
    const messages = refusalsAt(factionRefusals(doc), 'place[2].faction');
    expect(messages[0]).toContain('no faction is called "wolves"');
    expect(messages[0]).toContain('Factions');
  });

  it('refuses a faction on a prop — a hand-written file can carry one', () => {
    let doc = camp();
    doc = {
      ...doc,
      place: [{ ...doc.place[0], faction: 'goblins' }, ...doc.place.slice(1)],
    };
    expect(refusalsAt(factionRefusals(doc), 'place[0].faction')[0]).toContain(
      'only a monster'
    );
  });

  it('judges an `arrives` predicate and its cell, at the placement', () => {
    let doc = updatePlacement(camp(), 2, { arrives: { down: 'nobody' } });
    expect(refusalsAt(factionRefusals(doc), 'place[2].arrives')[0]).toContain(
      'no placement is called "nobody"'
    );
    doc = updatePlacement(camp(), 2, { arrives: { down: 'chief' } });
    doc = {
      ...doc,
      place: doc.place.map((x, i) => (i === 2 ? { ...x, at: p(9, 9) } : x)),
    };
    expect(refusalsAt(factionRefusals(doc), 'place[2].arrives')).toEqual([
      'the cell it arrives on must be floor',
    ]);
  });
});

describe('dispositions (§2)', () => {
  it('refuses a second disposition for one pair, whichever way round', () => {
    let doc = addDisposition(camp());
    doc = updateDisposition(doc, 1, { between: ['party', 'goblins'] });
    expect(
      refusalsAt(factionRefusals(doc), 'dispositions[1].between')[0]
    ).toContain('already have a disposition');
    // The first of the pair is not the one refused.
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].between')).toEqual(
      []
    );
  });

  it('refuses an unknown faction in `between`', () => {
    const doc = updateDisposition(camp(), 0, { between: ['wolves', 'party'] });
    expect(
      refusalsAt(factionRefusals(doc), 'dispositions[0].between')[0]
    ).toContain('no faction is called "wolves"');
  });

  it('refuses `until` on a non-hostile stance, at the stance', () => {
    // A hand-written file: the mutator would have dropped `until` itself.
    let doc = camp();
    doc = {
      ...doc,
      dispositions: [{ ...doc.dispositions[0], stance: 'allied' }],
    };
    const messages = refusalsAt(factionRefusals(doc), 'dispositions[0].stance');
    expect(messages[0]).toContain('`until`');
    expect(messages[0]).toContain('hostile');
  });
});

describe('predicates (§2)', () => {
  it('round: counted from 1', () => {
    const doc = camp();
    expect(predicateRefusals(doc, { round: 0 }, 'x')).toEqual([
      { path: 'x', message: 'a round is counted from 1' },
    ]);
    expect(predicateRefusals(doc, { round: 1 }, 'x')).toEqual([]);
  });

  it('down: an unknown placement, and a blank', () => {
    const doc = camp();
    expect(predicateRefusals(doc, { down: 'chief' }, 'x')).toEqual([]);
    expect(
      predicateRefusals(doc, { down: 'nobody' }, 'x')[0].message
    ).toContain('no placement is called "nobody"');
    expect(predicateRefusals(doc, { down: '' }, 'x')[0].message).toContain(
      'pick the monster'
    );
  });

  it('fact: a blank is refused; an unrevealed one is a NOTE, not a refusal (R8)', () => {
    const doc = camp();
    expect(predicateRefusals(doc, { fact: '' }, 'x')[0].message).toContain(
      'name the fact'
    );
    expect(predicateRefusals(doc, { fact: 'rumour' }, 'x')).toEqual([]);
    expect(factNote(doc, { fact: 'rumour' })).toBe(NO_RECORD_REVEALS_THIS);
    expect(factNote(doc, { fact: 'saved-wiseman' })).toBeNull();
    expect(factNote(doc, { fact: '' })).toBeNull();
  });

  it('stance: both names must be sides this dungeon has', () => {
    const doc = camp();
    expect(
      predicateRefusals(
        doc,
        { stance: { between: ['goblins', 'party'], is: 'neutral' } },
        'x'
      )
    ).toEqual([]);
    expect(
      predicateRefusals(
        doc,
        { stance: { between: ['goblins', 'wolves'], is: 'neutral' } },
        'x'
      )[0].message
    ).toContain('"wolves"');
  });
});
