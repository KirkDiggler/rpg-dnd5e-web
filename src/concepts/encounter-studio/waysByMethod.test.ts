/**
 * THE WAYS, COUNTED BY METHOD (rpg-project#974, R30, R39). The expected
 * numbers are computed here from the fixture's own statements, a second way:
 * a way the engine says once per carrier has the carrier in its id
 * (`…:line:<carrier>:<option>`), so dropping that segment names the way as a
 * player would; its alternatives are its `by` method connections.
 */
import { describe, expect, it } from 'vitest';
import { expectedCastleWayTable as expectedCastleTable } from './fixtures/castleWayTable';
import { castlePlacesReadBack } from './fixtures/engineReadBack';
import { syntheticJoin } from './fixtures/placesSynthetic';
import { placesOf } from './placesView';
import {
  methodCountsOf,
  wayUnitsOf,
  waysInto,
  waysTotal,
} from './waysByMethod';

const KITCHEN = 'door:region-great-hall:region-kitchen:kitchen-wall-door';
const CELLS_DOOR = 'door:region-barracks:region-cells:cells-wall-door';
const GRATE_TO_CELLS = 'passage:region-kitchen:region-cells:prop-grate';
const ARREST =
  'passage:region-gatehouse+room-1-region:region-cells:conversation-front-gate';
const GATE = 'door:region-courtyard:region-gatehouse:gate-wall-door';

describe('methodCountsOf on the castle', () => {
  const counts = () => methodCountsOf(placesOf(castlePlacesReadBack()));

  it('matches the table computed from the fixture’s connections', () => {
    const expected = expectedCastleTable();
    expect(
      new Map(
        counts().map((row) => [
          row.key,
          { ways: row.ways, min: row.min, max: row.max },
        ])
      )
    ).toEqual(expected);
  });

  it('a tool is not a row: it is part of the approach before it, and Dexterity counts the kitchen and the cells', () => {
    expect(counts().some((row) => row.key.startsWith('tool:'))).toBe(false);
    const dex = counts().find((row) => row.key === 'ability:dex')!;
    expect(dex.ways).toBe(2);
    expect(dex.label).toBe('Dexterity');
    expect(dex.joinIds.sort()).toEqual([CELLS_DOOR, KITCHEN].sort());
  });

  it('the troupe claim, said by three holders, counts once under each of its methods', () => {
    const gateWays = wayUnitsOf(
      placesOf(castlePlacesReadBack()).joins.find((j) => j.id === GATE)!
    );
    const troupe = gateWays.filter((unit) => unit.option === 'troupe');
    expect(troupe).toHaveLength(1);
    expect(troupe[0]!.carriers).toEqual(['gate-1', 'gate-2', 'captain']);
    expect(counts().find((row) => row.key === 'skill:performance')!.ways).toBe(
      1
    );
  });

  it('rows are labelled plainly and sorted by count, then name; no row has zero', () => {
    const rows = counts();
    expect(rows.every((row) => row.ways > 0)).toBe(true);
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1]!, rows[i]!];
      expect(
        a.ways > b.ways ||
          (a.ways === b.ways &&
            a.label.localeCompare(b.label, undefined, {
              sensitivity: 'base',
            }) <= 0)
      ).toBe(true);
    }
    const labels = new Map(rows.map((row) => [row.key, row.label]));
    expect(labels.get('skill:persuasion')).toBe('Persuasion');
    expect(labels.get('ability:str')).toBe('Strength');
    expect(labels.get('knowledge')).toBe('knowledge');
    expect(labels.get('fight')).toBe('the fight');
    expect(labels.get('free')).toBe('no check');
  });
});

describe('methodCountsOf on the engine’s other shapes', () => {
  it('partial and none are never counted', () => {
    const rows = methodCountsOf(
      placesOf(
        syntheticJoin([
          {
            kind: 'place.way.partial',
            connects: [
              ['bar', 'hold', 'lifts'],
              ['method', 'skill:persuasion', 'by'],
            ],
          },
          { kind: 'place.way.none', connects: [['bar', 'lock', 'unlifted']] },
          {
            kind: 'place.way.lock',
            connects: [
              ['bar', 'lock', 'lifts'],
              ['method', 'ability:str', 'by'],
            ],
          },
        ])
      )
    );
    expect(rows.map((row) => [row.key, row.ways])).toEqual([
      ['ability:str', 1],
    ]);
  });

  it('a way with two alternatives counts under each, and its tool under neither', () => {
    const rows = methodCountsOf(
      placesOf(
        syntheticJoin([
          {
            kind: 'place.way.lock',
            connects: [
              ['bar', 'lock', 'lifts'],
              ['method', 'ability:dex', 'by'],
              ['method', 'tool:dnd5e:item:thieves-tools', 'with'],
              ['method', 'ability:str', 'by'],
            ],
          },
        ])
      )
    );
    expect(rows.map((row) => [row.key, row.ways])).toEqual([
      ['ability:dex', 1],
      ['ability:str', 1],
    ]);
  });

  it('same-named lines on two carriers stay two ways when what they need differs', () => {
    const line = (carrier: string, need: string) => ({
      kind: 'place.way.line',
      connects: [
        ['bar', 'hold', 'lifts'],
        ['line', `${carrier}/hail`, 'by'],
        ['creature', carrier, 'by'],
        ['fact', need, 'needs'],
        ['method', 'skill:persuasion', 'by'],
      ] as [string, string, string][],
    });
    const places = placesOf(
      syntheticJoin([line('a-1', 'x'), line('a-2', 'x'), line('a-3', 'y')])
    );
    const units = wayUnitsOf(places.joins[0]!);
    expect(units.map((unit) => unit.carriers)).toEqual([
      ['a-1', 'a-2'],
      ['a-3'],
    ]);
    expect(methodCountsOf(places)[0]!.ways).toBe(2);
  });
});

describe('a way is one unit only when everything but its carrier is the same', () => {
  type Conn = [string, string, string];
  const line = (carrier: string, extra: Conn[], dc = 13) => ({
    kind: 'place.way.line',
    connects: [
      ['bar', 'hold', 'lifts'],
      ['line', `${carrier}/hail`, 'by'],
      ['creature', carrier, 'by'],
      ...extra,
      ['method', 'skill:persuasion', 'by'],
    ] as Conn[],
    dc,
  });
  /** The synthetic shapes carry no DC; set the method's after building. */
  const placesWith = (ways: ReturnType<typeof line>[]) => {
    const readBack = syntheticJoin(ways);
    const statements = readBack.sections[0]!.groups[0]!.statements;
    ways.forEach((way, index) => {
      const method = statements[index + 1]!.connects.find(
        (c) => c.kind === 'method'
      )!;
      method.value = way.dc;
    });
    return placesOf(readBack);
  };
  const carriersOf = (ways: ReturnType<typeof line>[]) =>
    wayUnitsOf(placesWith(ways).joins[0]!).map((unit) => unit.carriers);

  it('the review’s probe: same-named stand-aside lines that draw off and grant different things are two ways', () => {
    const places = placesOf(
      syntheticJoin([
        {
          kind: 'place.way.line',
          connects: [
            ['bar', 'hold', 'lifts'],
            ['line', 'captain/stand-aside', 'by'],
            ['creature', 'captain', 'by'],
            ['creature', 'gate-1', 'draws-off'],
            ['creature', 'gate-2', 'draws-off'],
            ['fact', 'gate-cowed', 'teaches'],
            ['method', 'skill:intimidation', 'by'],
          ],
        },
        {
          kind: 'place.way.line',
          connects: [
            ['bar', 'hold', 'lifts'],
            ['line', 'sergeant/stand-aside', 'by'],
            ['creature', 'sergeant', 'by'],
            ['creature', 'sergeant', 'draws-off'],
            ['topic', 'bribed', 'grants'],
            ['method', 'skill:intimidation', 'by'],
          ],
        },
      ])
    );
    expect(wayUnitsOf(places.joins[0]!)).toHaveLength(2);
    expect(methodCountsOf(places).map((row) => [row.key, row.ways])).toEqual([
      ['skill:intimidation', 2],
    ]);
  });

  it('a carrier that draws off itself is the same as another that draws off itself', () => {
    expect(
      carriersOf([
        line('a-1', [['creature', 'a-1', 'draws-off']]),
        line('a-2', [['creature', 'a-2', 'draws-off']]),
      ])
    ).toEqual([['a-1', 'a-2']]);
  });

  it('lines that differ only in what a miss does are two ways', () => {
    expect(
      carriersOf([
        line('a-1', [['topic', 'turned-away', 'on-miss']]),
        line('a-2', [['topic', 'arrested', 'on-miss']]),
      ])
    ).toEqual([['a-1'], ['a-2']]);
  });

  it('lines that differ only in difficulty are two ways', () => {
    expect(
      carriersOf([
        line('a-1', [], 11),
        line('a-2', [], 15),
        line('a-3', [], 11),
      ])
    ).toEqual([['a-1', 'a-3'], ['a-2']]);
  });
});

describe('the no-check row’s two sub-counts', () => {
  it('on the castle: 6 open, 4 that need something first', () => {
    const free = methodCountsOf(placesOf(castlePlacesReadBack())).find(
      (row) => row.key === 'free'
    )!;
    expect(free.label).toBe('no check');
    expect(free.open).toBe(6);
    expect(free.needing).toBe(4);
    expect(free.ways).toBe(10);
  });
});

describe('the total', () => {
  it('is the number of ways, which the rows add up to more than', () => {
    const places = placesOf(castlePlacesReadBack());
    const total = places.joins.reduce(
      (sum, join) => sum + wayUnitsOf(join).length,
      0
    );
    expect(waysTotal(places)).toBe(total);
    expect(expectedCastleTable().size).toBeGreaterThan(0);
    const summed = methodCountsOf(places).reduce((n, row) => n + row.ways, 0);
    expect(summed).toBeGreaterThan(total);
  });
});

describe('waysInto', () => {
  it('the Cells: the locked door from the Barracks, the grate’s hidden passage and the arrest', () => {
    const into = waysInto(placesOf(castlePlacesReadBack()), 'region-cells');
    expect(into.map((entry) => entry.join.id).sort()).toEqual(
      [CELLS_DOOR, GRATE_TO_CELLS, ARREST].sort()
    );
    const arrest = into.find((entry) => entry.join.id === ARREST)!;
    expect(arrest.units).toHaveLength(1);
    expect(arrest.units[0]!.carriers).toEqual(['gate-1', 'gate-2', 'captain']);
  });

  it('a door is listed under both its places; a passage only where it leads', () => {
    const places = placesOf(castlePlacesReadBack());
    expect(
      waysInto(places, 'region-barracks').some((e) => e.join.id === CELLS_DOOR)
    ).toBe(true);
    expect(
      waysInto(places, 'region-kitchen').some(
        (e) => e.join.id === GRATE_TO_CELLS
      )
    ).toBe(false);
  });
});
