/**
 * The fixture atlas is the Concepts Lab's stand-in for the server's
 * compile. It proves nothing about the real compiler — but it must model
 * the WIRE honestly, or the sandbox shows a picture the server would
 * never send.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyDungeon,
  paintCell,
  paintScenery,
  type DungeonDoc,
} from '../dungeonYaml';
import { fromOffset, type Axial } from '../hexOffset';
import { fixtureAtlasOf } from './fixtureAtlas';

const p = (c: number, r: number): Axial => fromOffset('pointy', [c, r]);

function stripDoc(): DungeonDoc {
  let doc = emptyDungeon();
  for (const c of [0, 1]) doc = paintCell(doc, 'region-1', p(c, 0));
  doc = paintScenery(doc, p(2, 0));
  return doc;
}

describe('fixtureAtlasOf', () => {
  it('carries scenery in `cells` and in no region — the wire shape (design §5.1)', () => {
    const atlas = fixtureAtlasOf(stripDoc());
    const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
    const cells = new Set(atlas.cells.map(key));
    const scenery = p(2, 0);

    // "A cell in `cells` and in no region is scenery."
    expect(cells.has(`${scenery.q},${scenery.r}`)).toBe(true);
    expect(atlas.cells).toHaveLength(3);
    for (const region of atlas.regions) {
      expect(region.cells.map(key)).not.toContain(`${scenery.q},${scenery.r}`);
    }
    // The room cells are still owned, so membership still means something.
    expect(atlas.regions[0].cells.map(key).sort()).toEqual(
      [p(0, 0), p(1, 0)].map((a) => `${a.q},${a.r}`).sort()
    );
  });
});
