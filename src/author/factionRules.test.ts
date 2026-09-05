import { describe, expect, it } from 'vitest';
import {
  addDisposition,
  addEnding,
  addFaction,
  addIntel,
  emptyDungeon,
  paintCell,
  placeAt,
  PREDICATE_SHAPE,
  setIntelReveals,
  updateDisposition,
  updateEnding,
  updateFaction,
  updatePlacement,
  type DungeonDoc,
} from './dungeonYaml';
import {
  factionChoices,
  factionRefusals,
  factNote,
  messagesAt,
  MONSTERS_HAS_NO_MIND,
  NAME_A_MIND,
  NO_RECORD_REVEALS_THIS,
  predicatePaths,
  predicateRefusals,
  refusalsAt,
  UNTIL_NOT_BUILT,
} from './factionRules';
import { fromOffset } from './hexOffset';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);

/** A camp: two named goblins in `goblins` (the chief its mind), a named
 * prop, one record revealing `saved-wiseman`, and the hostile-until
 * disposition. Index 3 is a spare floor cell. */
function camp(): DungeonDoc {
  let doc = emptyDungeon();
  for (let c = 0; c < 5; c += 1) doc = paintCell(doc, 'region-1', p(c, 0));
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

/** The camp plus a stray goblin on the reserved side, named. */
function withStray(): DungeonDoc {
  const doc = placeAt(camp(), { ref: 'dnd5e:monsters:goblin', at: p(3, 0) });
  return updatePlacement(doc, 3, { id: 'stray' });
}

describe('the fixture-shaped camp earns no refusal', () => {
  it('is clean', () => {
    expect(factionRefusals(camp())).toEqual([]);
  });

  it('offers the declared factions and BOTH reserved sides, once each', () => {
    expect(factionChoices(camp())).toEqual(['goblins', 'party', 'monsters']);
    let doc = addFaction(camp());
    doc = updateFaction(doc, 'faction-2', { id: 'party' });
    expect(factionChoices(doc)).toEqual(['goblins', 'party', 'monsters']);
  });
});

describe('factions — the compiler’s sentences, at factions[i].id and .mind', () => {
  it('refuses `party` declared', () => {
    let doc = addFaction(camp());
    doc = updateFaction(doc, 'faction-2', { id: 'party' });
    expect(refusalsAt(factionRefusals(doc), 'factions[1].id')).toEqual([
      "`party` is the players' side and is never declared — name the faction the monsters are in",
    ]);
  });

  it('ALLOWS `monsters` declared — that is how the unauthored side gets a mind', () => {
    let doc = addFaction(withStray());
    doc = updateFaction(doc, 'faction-2', { id: 'monsters', mind: 'stray' });
    expect(refusalsAt(factionRefusals(doc), 'factions[1].id')).toEqual([]);
    expect(refusalsAt(factionRefusals(doc), 'factions[1].mind')).toEqual([]);
    // A goblin with a faction key is outside `monsters`.
    doc = updateFaction(doc, 'monsters', { mind: 'scout' });
    expect(refusalsAt(factionRefusals(doc), 'factions[1].mind')).toEqual([
      'faction "monsters" names "scout" as its mind, but "dnd5e:monsters:goblin" is in faction "goblins" — a mind is a monster in its own faction',
    ]);
  });

  it('refuses a blank id and a duplicate', () => {
    let doc = addFaction(camp());
    doc = { ...doc, factions: [doc.factions[0], { id: '' }] };
    expect(refusalsAt(factionRefusals(doc), 'factions[1].id')).toEqual([
      'the faction has no id',
    ]);
    doc = { ...doc, factions: [doc.factions[0], { id: 'goblins' }] };
    expect(refusalsAt(factionRefusals(doc), 'factions[1].id')).toEqual([
      'faction "goblins" is already declared at factions[0]',
    ]);
  });

  it('refuses a mind that is a prop, outside its faction, or nobody', () => {
    let doc = updateFaction(camp(), 'goblins', { mind: 'letter' });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')).toEqual([
      'faction "goblins" names "letter" as its mind, and "dnd5e:props:scroll" is a prop — a mind is a monster in the faction',
    ]);
    doc = updateFaction(withStray(), 'goblins', { mind: 'stray' });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')).toEqual([
      'faction "goblins" names "stray" as its mind, but "dnd5e:monsters:goblin" is in faction "monsters" — a mind is a monster in its own faction',
    ]);
    doc = updateFaction(camp(), 'goblins', { mind: 'nobody' });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')).toEqual([
      'faction "goblins" names "nobody" as its mind, and no placement in this dungeon has that id',
    ]);
  });

  it('a faction of many waiting on a fact with no mind: the design’s hint at the mind, the compiler’s reason at the until', () => {
    const doc = updateFaction(camp(), 'goblins', { mind: undefined });
    expect(refusalsAt(factionRefusals(doc), 'factions[0].mind')).toEqual([
      NAME_A_MIND,
    ]);
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].until')).toEqual([
      `this until waits for a fact, and faction "goblins" has 2 monsters and no mind, and \`party\` is the players' side and has no mind — ${NAME_A_MIND}`,
    ]);
  });

  it('a faction of ONE needs no mind — its member is the mind; unnamed, it cannot be', () => {
    let doc = updateFaction(camp(), 'goblins', { mind: undefined });
    doc = updatePlacement(doc, 2, { faction: '' });
    expect(factionRefusals(doc)).toEqual([]);
    doc = updatePlacement(doc, 1, { id: '' });
    expect(
      refusalsAt(factionRefusals(doc), 'dispositions[0].until')[0]
    ).toContain(`faction "goblins"'s one monster has no id to be its mind`);
  });
});

describe('placements — faction, and the id a reserved or holdable thing needs', () => {
  it('refuses an unknown faction, `party`, and a faction on a prop', () => {
    let doc = updatePlacement(camp(), 2, { faction: 'wolves' });
    expect(refusalsAt(factionRefusals(doc), 'place[2].faction')).toEqual([
      '"dnd5e:monsters:goblin" is in faction "wolves", and no faction in this dungeon has that id — declare it under `factions:`',
    ]);
    doc = updatePlacement(camp(), 2, { faction: 'party' });
    expect(refusalsAt(factionRefusals(doc), 'place[2].faction')).toEqual([
      '"dnd5e:monsters:goblin" cannot be in `party`: that is the players\' side',
    ]);
    doc = camp();
    doc = {
      ...doc,
      place: [{ ...doc.place[0], faction: 'goblins' }, ...doc.place.slice(1)],
    };
    expect(refusalsAt(factionRefusals(doc), 'place[0].faction')).toEqual([
      '"dnd5e:props:scroll" is not a monster and cannot be in a faction',
    ]);
  });

  it('a reserved prop, or a holdable one, has to be nameable — at its id', () => {
    let doc = updatePlacement(camp(), 0, { id: '', arrives: { round: 6 } });
    expect(refusalsAt(factionRefusals(doc), 'place[0].id')).toEqual([
      '"dnd5e:props:scroll" arrives on a predicate and has no id, and a thing that arrives has to be nameable',
    ]);
    doc = updatePlacement(camp(), 0, { id: '', holdable: true });
    expect(refusalsAt(factionRefusals(doc), 'place[0].id')).toEqual([
      '"dnd5e:props:scroll" is holdable and has no id, and a thing that can be picked up has to be nameable',
    ]);
  });

  it('judges an `arrives` predicate at the compiler’s sub-paths, and refuses waiting for its own fall', () => {
    let doc = updatePlacement(camp(), 2, { arrives: { down: 'nobody' } });
    expect(refusalsAt(factionRefusals(doc), 'place[2].arrives.down')).toEqual([
      '"nobody" is not a placement in this dungeon',
    ]);
    doc = updatePlacement(camp(), 2, { arrives: { down: 'scout' } });
    expect(refusalsAt(factionRefusals(doc), 'place[2].arrives.down')).toEqual([
      '"scout" cannot wait for its own fall — it is not here to fall until it arrives',
    ]);
    doc = updatePlacement(camp(), 2, { arrives: { down: 'chief' } });
    expect(factionRefusals(doc)).toEqual([]);
  });
});

describe('dispositions — the compiler’s sentences at .between, .between[j], .until', () => {
  it('refuses a second disposition for one pair, naming the first', () => {
    let doc = addDisposition(camp());
    doc = updateDisposition(doc, 1, { between: ['party', 'goblins'] });
    expect(refusalsAt(factionRefusals(doc), 'dispositions[1].between')).toEqual(
      [
        'goblins and party already have a disposition at dispositions[0], and one pair has one',
      ]
    );
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].between')).toEqual(
      []
    );
  });

  it('refuses an unknown or blank faction at the element, and the same faction twice at the pair', () => {
    let doc = updateDisposition(camp(), 0, { between: ['wolves', 'party'] });
    expect(
      refusalsAt(factionRefusals(doc), 'dispositions[0].between[0]')
    ).toEqual([
      '"wolves" is not a faction in this dungeon — declare it under `factions:`, or write `party`',
    ]);
    doc = updateDisposition(camp(), 0, { between: ['goblins', ''] });
    expect(
      refusalsAt(factionRefusals(doc), 'dispositions[0].between[1]')
    ).toEqual(['the disposition does not say which faction']);
    doc = updateDisposition(camp(), 0, { between: ['goblins', 'goblins'] });
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].between')).toEqual(
      [
        'a disposition is between two different factions, and this one names "goblins" twice',
      ]
    );
  });

  it('refuses `until` on a non-hostile stance, at the until', () => {
    let doc = camp();
    doc = {
      ...doc,
      dispositions: [{ ...doc.dispositions[0], stance: 'allied' }],
    };
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].until')).toEqual([
      'only a hostile pair has something to stop doing: this pair is allied, so drop the until or make it hostile',
    ]);
  });

  it('an until that is not a fact is not built yet — the compiler’s one sentence', () => {
    const doc = updateDisposition(camp(), 0, { until: { round: 3 } });
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].until')).toEqual([
      UNTIL_NOT_BUILT,
    ]);
  });

  it('a fact-until between sides where nobody can learn: the composed reason, `monsters` undeclared included', () => {
    const doc = updateDisposition(camp(), 0, {
      between: ['monsters', 'party'],
    });
    expect(refusalsAt(factionRefusals(doc), 'dispositions[0].until')).toEqual([
      `this until waits for a fact, and ${MONSTERS_HAS_NO_MIND}, and \`party\` is the players' side and has no mind — ${NAME_A_MIND}`,
    ]);
    // Declare it with a mind and the line clears.
    let stray = withStray();
    stray = updateDisposition(stray, 0, { between: ['monsters', 'party'] });
    stray = addFaction(stray);
    stray = updateFaction(stray, 'faction-2', {
      id: 'monsters',
      mind: 'stray',
    });
    expect(refusalsAt(factionRefusals(stray), 'dispositions[0].until')).toEqual(
      []
    );
  });
});

describe('endings — an id, no two alike, and a predicate that is one', () => {
  it('a new ending fires on the first named monster’s fall and earns no refusal', () => {
    const doc = addEnding(camp());
    expect(doc.endings).toEqual([{ id: 'ending-1', when: { down: 'chief' } }]);
    expect(factionRefusals(doc)).toEqual([]);
  });

  it('refuses a blank id, a duplicate, and a predicate naming nobody — at the compiler’s paths', () => {
    let doc = addEnding(camp());
    doc = addEnding(doc);
    doc = updateEnding(doc, 1, { id: 'ending-1' });
    expect(refusalsAt(factionRefusals(doc), 'endings[1].id')).toEqual([
      'ending "ending-1" is already declared at endings[0]',
    ]);
    doc = updateEnding(doc, 1, { id: '', when: { down: 'nobody' } });
    expect(refusalsAt(factionRefusals(doc), 'endings[1].id')).toEqual([
      'the ending has no id',
    ]);
    expect(refusalsAt(factionRefusals(doc), 'endings[1].when.down')).toEqual([
      '"nobody" is not a placement in this dungeon',
    ]);
  });
});

describe('predicates — sub-paths and sentences', () => {
  it('lists every path a predicate’s refusals can land on', () => {
    expect(predicatePaths('x')).toEqual([
      'x',
      'x.round',
      'x.down',
      'x.fact',
      'x.stance',
      'x.stance.between',
      'x.stance.between[0]',
      'x.stance.between[1]',
      'x.stance.is',
    ]);
  });

  it('round: counted from 1', () => {
    const doc = camp();
    expect(predicateRefusals(doc, { round: 0 }, 'x')).toEqual([
      { path: 'x.round', message: 'round 0: a round is counted from 1' },
    ]);
    expect(predicateRefusals(doc, { round: 1 }, 'x')).toEqual([]);
  });

  it('down: a placement that exists and is a monster', () => {
    const doc = camp();
    expect(predicateRefusals(doc, { down: 'chief' }, 'x')).toEqual([]);
    expect(predicateRefusals(doc, { down: 'nobody' }, 'x')).toEqual([
      {
        path: 'x.down',
        message: '"nobody" is not a placement in this dungeon',
      },
    ]);
    // A form picked and not filled in is the compiler's DECODE refusal,
    // word for word — not the blank read back as a name nothing has.
    expect(predicateRefusals(doc, { down: '' }, 'x')).toEqual([
      {
        path: 'x.down',
        message: `this predicate's \`down\` says nothing — ${PREDICATE_SHAPE}`,
      },
    ]);
    expect(predicateRefusals(doc, { down: 'letter' }, 'x')).toEqual([
      {
        path: 'x.down',
        message: '"letter" is a prop, and only a monster can be down',
      },
    ]);
  });

  it('fact: a blank says nothing; an unrevealed one is a NOTE, not a refusal (R8)', () => {
    const doc = camp();
    expect(predicateRefusals(doc, { fact: '' }, 'x')).toEqual([
      {
        path: 'x.fact',
        message: `this predicate's \`fact\` says nothing — ${PREDICATE_SHAPE}`,
      },
    ]);
    expect(predicateRefusals(doc, { fact: 'rumour' }, 'x')).toEqual([]);
    expect(factNote(doc, { fact: 'rumour' })).toBe(NO_RECORD_REVEALS_THIS);
    expect(factNote(doc, { fact: 'saved-wiseman' })).toBeNull();
  });

  it('stance: both names must be sides this dungeon has, and different', () => {
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
      )
    ).toEqual([
      {
        path: 'x.stance.between[1]',
        message:
          '"wolves" is not a faction in this dungeon — declare it under `factions:`, or write `party`',
      },
    ]);
    expect(
      predicateRefusals(
        doc,
        { stance: { between: ['party', 'party'], is: 'neutral' } },
        'x'
      )
    ).toEqual([
      {
        path: 'x.stance.between',
        message:
          'a stance is between two different factions, and this one names "party" twice',
      },
    ]);
  });

  it('messagesAt merges the compiler’s refusals with the client’s, once each', () => {
    const doc = updateFaction(camp(), 'goblins', { mind: undefined });
    const client = factionRefusals(doc);
    const composed = refusalsAt(client, 'dispositions[0].until')[0];
    const server = [
      { path: 'dispositions[0].until', message: composed },
      { path: 'dispositions[0].between[1]', message: 'no such side "party"' },
    ];
    expect(messagesAt(client, server, 'dispositions[0].until')).toEqual([
      composed,
    ]);
    expect(
      messagesAt(
        client,
        server,
        'dispositions[0].between',
        'dispositions[0].between[0]',
        'dispositions[0].between[1]'
      )
    ).toEqual(['no such side "party"']);
  });
});
