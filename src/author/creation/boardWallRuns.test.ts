/**
 * boardWallRuns — the board's picture of the document's walls and doors
 * (rpg-project#360 slice 2).
 *
 * There is nothing to fit any more: a wall is a line between two
 * authored positions, and the board draws it by placing those two points
 * and joining them — the same `positionPoint` formula the picker and the
 * server's own segment agree on. See this module's own header comment
 * for the fitting engine that used to sit here and why it is gone.
 */
import { describe, expect, it } from 'vitest';
import {
  addWall,
  emptyDungeon,
  paintCell,
  type DungeonDoc,
} from '../dungeonYaml';
import { referenceTombDoc } from '../fixtures/referenceTomb';
import { positionPoint, type PositionRef } from '../hexGeometry';
import { fromOffset, type Axial } from '../hexOffset';
import { boardWallScene } from './boardWallRuns';

const SIZE = 24;
const p = (col: number, row: number): Axial => fromOffset('pointy', [col, row]);

describe('boardWallScene — each authored wall draws as one line', () => {
  it('a wall’s endpoints are exactly positionPoint of its two authored positions', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    const start: PositionRef = { cell: p(0, 0), offset: [0, 0] };
    const end: PositionRef = { cell: p(1, 0), offset: [0, 0] };
    doc = addWall(doc, start, end);

    const scene = boardWallScene(doc, SIZE);
    expect(scene.walls).toHaveLength(1);
    expect(scene.walls[0].a).toEqual(positionPoint('pointy', start, SIZE));
    expect(scene.walls[0].b).toEqual(positionPoint('pointy', end, SIZE));
  });

  it('the pixel formula itself: a centre-to-east-midpoint wall, exact numbers, no round trip', () => {
    // Centre of (0,0) is the plane origin; the east side midpoint has
    // lattice (u,v) = (2,0), so latticePoint puts it at
    // (size·√3·2/4, 0) = (size·√3/2, 0) — hand-derived from hexGeometry's
    // own formula, not captured from this module's output.
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    const start: PositionRef = { cell: p(0, 0), offset: [0, 0] };
    const end: PositionRef = { cell: p(0, 0), offset: [0.5, 0] };
    doc = addWall(doc, start, end);

    const scene = boardWallScene(doc, SIZE);
    expect(scene.walls).toHaveLength(1);
    expect(scene.walls[0].a).toEqual({ x: 0, y: 0 });
    expect(scene.walls[0].b.x).toBeCloseTo((SIZE * Math.sqrt(3)) / 2, 12);
    expect(scene.walls[0].b.y).toBe(0);
  });
});

describe('boardWallScene — doors', () => {
  it('a door draws as a gap centred on its own position, oriented along the wall it stands in', () => {
    const doc = referenceTombDoc();
    const scene = boardWallScene(doc, SIZE);
    expect(scene.doors).toHaveLength(2);

    for (const door of scene.doors) {
      const docDoor = doc.doors.find((d) => d.id === door.doorId)!;
      const at = positionPoint('pointy', docDoor.at, SIZE);
      // Centred: the gap's midpoint IS the door's own position.
      expect((door.a.x + door.b.x) / 2).toBeCloseTo(at.x, 10);
      expect((door.a.y + door.b.y) / 2).toBeCloseTo(at.y, 10);
      expect(door.at).toEqual(at);

      // Oriented along the wall: both tomb seams are the line u = const,
      // which `latticePoint` places at constant x — so the gap, running
      // along that same wall, must also hold x constant.
      expect(door.a.x).toBeCloseTo(door.b.x, 10);
      // And it spans exactly one hex side's length (design C15).
      const len = Math.hypot(door.b.x - door.a.x, door.b.y - door.a.y);
      expect(len).toBeCloseTo(SIZE, 10);
    }
  });
});

describe('boardWallScene — a crooked wall is dropped, not drawn', () => {
  it('ends not on one of the twelve directions produce no line', () => {
    // Centre of (0,0) to centre of (2,1): lattice (0,0) → (10,2), whose
    // reduced step (5,1) is not one of the twelve primitive directions —
    // hand-derived from hexGeometry's own DIRECTIONS table, not from this
    // module's own filtering.
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(2, 1));
    const crooked: DungeonDoc = {
      ...doc,
      walls: [
        {
          start: { cell: p(0, 0), offset: [0, 0] },
          end: { cell: p(2, 1), offset: [0, 0] },
        },
      ],
    };
    const scene = boardWallScene(crooked, SIZE);
    expect(scene.walls).toHaveLength(0);
  });
});

describe('boardWallScene — flat-top draws too', () => {
  it('a flat-top document’s wall now draws (it used to return null)', () => {
    let doc = emptyDungeon('flat');
    doc = paintCell(doc, 'region-1', fromOffset('flat', [0, 0]));
    const start: PositionRef = {
      cell: fromOffset('flat', [0, 0]),
      offset: [0, 0],
    };
    const end: PositionRef = {
      cell: fromOffset('flat', [0, 0]),
      offset: [0, 0.5],
    };
    doc = addWall(doc, start, end);

    const scene = boardWallScene(doc, SIZE);
    expect(scene.walls).toHaveLength(1);
    expect(scene.walls[0].a).toEqual(positionPoint('flat', start, SIZE));
    expect(scene.walls[0].b).toEqual(positionPoint('flat', end, SIZE));
  });
});

describe('boardWallScene — the reference tomb', () => {
  it('draws exactly two walls and two doors', () => {
    const doc = referenceTombDoc();
    const scene = boardWallScene(doc, SIZE);
    expect(scene.walls).toHaveLength(2);
    expect(scene.walls.map((w) => w.index)).toEqual([0, 1]);
    expect(scene.doors.map((d) => d.doorId)).toEqual([
      'entrance-hall',
      'hall-tomb',
    ]);
  });

  it('the tomb’s two seams stay axis-true (vertical) in SVG space', () => {
    const scene = boardWallScene(referenceTombDoc(), SIZE);
    for (const wall of scene.walls) {
      expect(Math.abs(wall.a.x - wall.b.x)).toBeLessThan(1e-6 * SIZE);
    }
  });
});
