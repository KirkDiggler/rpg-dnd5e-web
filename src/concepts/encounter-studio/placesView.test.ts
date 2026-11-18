/**
 * THE PLACES THE ENGINE SAYS (rpg-project#972, R30, R31). The joins and
 * their ways are read from the read-back's statements and connections; the
 * studio groups ways by the bar each says it lifts and decides nothing.
 */
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
import { castlePlacesReadBack } from './fixtures/engineReadBack';
import { syntheticJoin } from './fixtures/placesSynthetic';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { joinAnchor } from './placesGeometry';
import { joinName, methodLabel, placesOf, waySectionsOf } from './placesView';
import { methodCountsOf } from './waysByMethod';

const castle = (() => {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
})();

const places = () => placesOf(castlePlacesReadBack());
const joinBy = (id: string) => places().joins.find((join) => join.id === id)!;
const GATE = 'door:region-courtyard:region-gatehouse:gate-wall-door';
const KITCHEN = 'door:region-great-hall:region-kitchen:kitchen-wall-door';
const GRATE_TO_CHAPEL = 'passage:region-kitchen:region-chapel:prop-grate';

describe('placesOf on the castle', () => {
  it('lists the twelve joins the engine says, by kind', () => {
    const { joins } = places();
    expect(joins).toHaveLength(12);
    const kinds = joins.map((join) => join.kind);
    expect(kinds.filter((kind) => kind === 'place.join.door')).toHaveLength(7);
    expect(kinds.filter((kind) => kind === 'place.join.open')).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'place.join.passage')).toHaveLength(
      3
    );
    expect(places().unjoined).toEqual([]);
  });

  it('a join’s bars are the bars its ways say they lift', () => {
    expect(joinBy(GATE).bars).toEqual(['hold']);
    expect(joinBy(KITCHEN).bars).toEqual(['lock']);
    expect(joinBy(GRATE_TO_CHAPEL).bars).toEqual(['hidden']);
    expect(
      joinBy('door:region-courtyard:region-great-hall:hall-wall-door').bars
    ).toEqual([]);
  });

  it('the gate’s holders are lifted by its lines, per carrier, and the fight', () => {
    const sections = waySectionsOf(joinBy(GATE));
    expect(sections.bars.map((group) => group.bar)).toEqual(['hold']);
    const ways = sections.bars[0]!.ways;
    expect(ways).toHaveLength(11);
    expect(
      ways.map((way) =>
        way.kind === 'place.way.fight'
          ? 'fight'
          : way.carriers.find((c) => c.kind === 'line')!.id
      )
    ).toEqual([
      'gate-1/vouch',
      'gate-1/straggler',
      'gate-1/troupe',
      'gate-2/vouch',
      'gate-2/straggler',
      'gate-2/troupe',
      'captain/guest',
      'captain/troupe',
      'captain/stand-aside',
      'captain/turn',
      'fight',
    ]);
    const troupe = ways[2]!;
    expect(troupe.methods.map(methodLabel)).toEqual([
      'Performance 13',
      'Deception 15',
    ]);
    expect(sections.free).toEqual([]);
  });

  it('the kitchen door shows two lock ways', () => {
    const sections = waySectionsOf(joinBy(KITCHEN));
    expect(sections.bars).toHaveLength(1);
    expect(sections.bars[0]!.bar).toBe('lock');
    expect(
      sections.bars[0]!.ways.map((way) => way.methods.map(methodLabel))
      // The tool is a part of the Dexterity approach (`with`), not an
      // alternative of its own (rpg-toolkit#2444).
    ).toEqual([['Strength 15'], ['Dexterity 13 with thieves-tools']]);
  });

  it('the grate’s passage: search and told under the hidden bar, the passage way apart', () => {
    const sections = waySectionsOf(joinBy(GRATE_TO_CHAPEL));
    expect(sections.bars.map((group) => group.bar)).toEqual(['hidden']);
    expect(sections.bars[0]!.ways.map((way) => way.kind)).toEqual([
      'place.way.search',
      'place.way.told',
    ]);
    expect(sections.free.map((way) => way.kind)).toEqual(['place.way.passage']);
    expect(sections.bars[0]!.ways[1]!.carriers).toContainEqual(
      expect.objectContaining({ kind: 'record', id: 'kitchen-way' })
    );
  });

  it('no way is listed under a bar it does not carry', () => {
    for (const join of places().joins) {
      for (const group of waySectionsOf(join).bars)
        for (const way of group.ways) expect(way.bars).toContain(group.bar);
    }
  });

  it('a way of a kind the studio does not know is still listed, by its join', () => {
    const readBack = castlePlacesReadBack();
    const group = readBack.sections[0]!.groups[0]!;
    const free = group.statements.find((s) => s.kind === 'place.way.free')!;
    group.statements.push({
      ...free,
      kind: 'place.way.teleport',
      sentence: 'A brand new way, as the engine says it.',
    });
    const join = placesOf(readBack).joins.find((candidate) =>
      free.connects.some((c) => c.kind === 'join' && c.id === candidate.id)
    )!;
    expect(
      waySectionsOf(join).free.map((way) => way.statement.sentence)
    ).toContain('A brand new way, as the engine says it.');
  });
});

describe('joinAnchor: where a join is drawn (presentation)', () => {
  it('a door join sits at its door, an open join between its two regions, a passage from its carrier', () => {
    const gate = joinAnchor(joinBy(GATE), castle.draft);
    expect(gate?.kind).toBe('point');
    const open = joinAnchor(
      joinBy('open:region-armoury:region-courtyard'),
      castle.draft
    );
    expect(open?.kind).toBe('point');
    const grate = joinAnchor(joinBy(GRATE_TO_CHAPEL), castle.draft);
    expect(grate?.kind).toBe('arrow');
    const item = castle.draft.scene.items.find((i) => i.id === 'grate')!;
    if (grate?.kind === 'arrow')
      expect(grate.from[0]).toEqual({
        x: item.transform.x,
        z: item.transform.z,
      });
  });
});

const regionName = (id: string) => id.toUpperCase();

describe('bars nothing lifts, partial ways and two bars (engine shapes)', () => {
  it('a locked door whose only way is place.way.none is marked locked, and named so', () => {
    const join = placesOf(
      syntheticJoin([
        { kind: 'place.way.none', connects: [['bar', 'lock', 'unlifted']] },
      ])
    ).joins[0]!;
    expect(join.bars).toEqual(['lock']);
    expect(joinName(join, regionName)).toBe(
      'Join: A and B, by the door d1, locked'
    );
    const sections = waySectionsOf(join);
    expect(sections.bars).toEqual([]);
    expect(sections.none.map((way) => way.kind)).toEqual(['place.way.none']);
  });

  it('a join the engine says no way for is not named unbarred', () => {
    const join = placesOf(syntheticJoin([])).joins[0]!;
    expect(join.bars).toEqual([]);
    expect(joinName(join, regionName)).toBe(
      'Join: A and B, by the door d1, no way said'
    );
  });

  it('two bars, a partial way and a none: each set apart by the engine’s kind', () => {
    const join = placesOf(
      syntheticJoin([
        {
          kind: 'place.way.lock',
          connects: [
            ['bar', 'lock', 'lifts'],
            ['method', 'ability:str', 'by'],
          ],
        },
        {
          kind: 'place.way.partial',
          connects: [
            ['bar', 'hold', 'lifts'],
            ['creature', 'x', 'still-holds'],
          ],
        },
        { kind: 'place.way.none', connects: [['bar', 'hold', 'unlifted']] },
      ])
    ).joins[0]!;
    expect(join.bars).toEqual(['lock', 'hold']);
    expect(joinName(join, regionName)).toBe(
      'Join: A and B, by the door d1, locked and held'
    );
    const sections = waySectionsOf(join);
    expect(sections.bars.map((group) => group.bar)).toEqual(['lock']);
    expect(sections.bars[0]!.ways.map((way) => way.kind)).toEqual([
      'place.way.lock',
    ]);
    expect(sections.partial.map((way) => way.kind)).toEqual([
      'place.way.partial',
    ]);
    expect(sections.none.map((way) => way.kind)).toEqual(['place.way.none']);
    expect(sections.free).toEqual([]);
  });
});

describe('a way is a statement of a `place.way.` kind (rpg-project#974)', () => {
  const lock = {
    kind: 'place.way.lock',
    connects: [
      ['bar', 'lock', 'lifts'],
      ['method', 'ability:str', 'by'],
    ] as [string, string, string][],
  };

  it('a hub repeat carrying {join, through} and methods adds no way and nothing to the count', () => {
    const places = placesOf(
      syntheticJoin([
        lock,
        {
          kind: 'record.lift',
          about: { kind: 'record', id: 'kitchen-way' },
          connects: [
            ['bar', 'lock', 'lifts'],
            ['method', 'skill:persuasion', 'by'],
          ],
        },
        {
          kind: 'secret.find',
          about: { kind: 'way', id: 'way:j1:0' },
          connects: [
            ['bar', 'lock', 'lifts'],
            ['method', 'ability:str', 'by'],
          ],
        },
      ])
    );
    expect(places.joins[0]!.ways.map((way) => way.kind)).toEqual([
      'place.way.lock',
    ]);
    expect(methodCountsOf(places).map((row) => [row.key, row.ways])).toEqual([
      ['ability:str', 1],
    ]);
  });

  it('a hub statement about a join is not a join', () => {
    const readBack = syntheticJoin([lock]);
    const group = readBack.sections[0]!.groups[0]!;
    group.statements.push({
      ...group.statements[0]!,
      kind: 'secret.hides',
      about: { ...group.statements[0]!.about!, id: 'j2' },
    });
    expect(placesOf(readBack).joins.map((join) => join.id)).toEqual(['j1']);
  });

  it('an unknown `place.way.<new>` kind still lists plainly', () => {
    const places = placesOf(
      syntheticJoin([
        {
          kind: 'place.way.vanish',
          connects: [['method', 'free', 'by']],
        },
      ])
    );
    const sections = waySectionsOf(places.joins[0]!);
    expect(sections.free.map((way) => way.kind)).toEqual(['place.way.vanish']);
  });
});

describe('one label for one method (rpg-project#974)', () => {
  it('the engine’s method ids read as the count names them', () => {
    expect(methodLabel({ id: 'free', value: 0 })).toBe('no check');
    expect(methodLabel({ id: 'fight', value: 0 })).toBe('the fight');
    expect(methodLabel({ id: 'item', value: 0 })).toBe('an item');
    expect(methodLabel({ id: 'knowledge', value: 0 })).toBe('knowledge');
    expect(methodLabel({ id: 'skill:persuasion', value: 13 })).toBe(
      'Persuasion 13'
    );
  });

  it('the grate’s passage line chip reads "no check"', () => {
    const passage = joinBy(GRATE_TO_CHAPEL).ways.find(
      (way) => way.kind === 'place.way.passage'
    )!;
    expect(passage.methods.map(methodLabel)).toEqual(['no check']);
  });
});
