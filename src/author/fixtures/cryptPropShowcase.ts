/**
 * A showcase for prop rendering: two galleries either side of a long
 * wall, a raised branch, a corner turn and a locked gate.
 *
 * Its walls are FOUR LINES sharing two positions (rpg-project#360 slice
 * 2). They used to be four taut paths flattened into ~40 loose crossings
 * — the fixture that made the case for the line form, since what it was
 * really trying to say was "a long wall, a branch off it, and a turn".
 * The junction is one position two walls both end at, which is the whole
 * of a corner (F5), and every line here is thin, so nothing is sealed.
 */
import type { DungeonDoc, PositionRef } from '../dungeonYaml';
import { positionAt, type Lattice } from '../hexGeometry';
import { fromOffset } from '../hexOffset';

const seat = (l: Lattice): PositionRef => {
  const p = positionAt('pointy', l);
  if (!p) throw new Error(`cryptPropShowcase: ${l.u},${l.v} is no position`);
  return p;
};

/** The long wall runs down the row midpoint line `v = 9` — between rows
 * 4 and 5 — so it shaves its neighbours and seals nothing. The junction
 * and the east end are the two positions more than one wall ends at. */
const JUNCTION: Lattice = { u: 43, v: 9 };
const EAST_END: Lattice = { u: 59, v: 9 };

export function cryptPropShowcaseDoc(): DungeonDoc {
  const p = (col: number, row: number) => fromOffset('pointy', [col, row]);
  const regionCells = (start: number, end: number) =>
    Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: end - start + 1 }, (_, index) =>
        p(start + index, row)
      )
    ).flat();

  return {
    version: 2,
    key: 'crypt-prop-showcase',
    name: 'Crypt Prop Showcase',
    orientation: 'pointy',
    void: 'opaque',
    regions: [
      {
        id: 'gallery',
        name: 'Gallery',
        archetype: 'crypt',
        lighting: { intensity: 0.4 },
        cells: regionCells(0, 9),
      },
      {
        id: 'chapel',
        name: 'Chapel',
        archetype: 'crypt',
        lighting: { intensity: 0.3 },
        cells: regionCells(10, 19),
      },
    ],
    scenery: [],
    start: { at: p(1, 3) },
    walls: [
      { start: seat({ u: 27, v: 9 }), end: seat(JUNCTION), name: 'west wall' },
      { start: seat(JUNCTION), end: seat(EAST_END), name: 'east wall' },
      // The branch is the one raised wall — a quarter line straight up
      // from the junction, sharing that position exactly.
      {
        start: seat(JUNCTION),
        end: seat({ u: 43, v: 3 }),
        name: 'raised branch',
        height: 2,
      },
      { start: seat(EAST_END), end: seat({ u: 59, v: 17 }), name: 'the turn' },
    ],
    doors: [
      {
        id: 'crypt-sealed-gate',
        at: seat({ u: 35, v: 9 }),
        locked: [{ ability: 'dex', dc: 15 }],
      },
    ],
    place: [
      {
        ref: 'dnd5e:props:skeleton-cage',
        at: p(3, 2),
        blocksMovement: true,
        blocksLos: true,
        facing: 'se',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:skeleton-table',
        at: p(6, 4),
        blocksMovement: true,
        blocksLos: false,
        facing: 'e',
        offset: [0, 0],
      },
      {
        ref: 'dnd5e:props:rug',
        at: p(9, 3),
        blocksMovement: false,
        blocksLos: false,
        facing: 'e',
        offset: [0, 0],
      },
    ],
    // A prop showcase authors no way out and binds no scenario — both
    // fields are written only when they have entries, so this fixture
    // emits exactly the bytes it always did.
    exits: [],
    scenarios: {},
    intel: [],
    factions: [],
    dispositions: [],
  };
}
