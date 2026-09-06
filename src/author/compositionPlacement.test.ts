import { compositionRef } from '@/compositions/compositionRef';
import { describe, expect, it } from 'vitest';
import {
  addRegion,
  emitDungeon,
  emptyDungeon,
  movePlacement,
  paintCell,
  parseDungeon,
  placeAt,
  removePlacement,
  suggestPlacementId,
  updatePlacement,
} from './dungeonYaml';
import type { Axial } from './hexOffset';

const a = (q: number, r: number): Axial => ({ q, r });

function floorDoc() {
  let doc = addRegion(emptyDungeon());
  doc = paintCell(doc, doc.regions[0]!.id, a(0, 0));
  doc = paintCell(doc, doc.regions[0]!.id, a(1, 0));
  doc = paintCell(doc, doc.regions[0]!.id, a(2, 0));
  return doc;
}

describe('composition placements in dungeon YAML', () => {
  it('preserves opaque refs, required placement ids, facing and coordinates', () => {
    const ref = compositionRef('decorated-table');
    let doc = floorDoc();
    doc = placeAt(doc, {
      ref,
      id: 'decorated-table',
      at: a(0, 0),
      blocksMovement: true,
      blocksLos: false,
      facing: 'se',
    });

    const yaml = emitDungeon(doc);
    expect(yaml).toContain('id: decorated-table');
    expect(yaml).toContain('ref: "composition:props:decorated-table"');
    expect(parseDungeon(yaml).place[0]).toEqual(doc.place[0]);
    expect(emitDungeon(parseDungeon(yaml))).toBe(yaml);
  });

  it('moves, rotates, and removes one instance without changing the other', () => {
    const ref = compositionRef('decorated-table');
    let doc = floorDoc();
    doc = placeAt(doc, {
      ref,
      id: suggestPlacementId(doc, ref),
      at: a(0, 0),
      blocksMovement: true,
      blocksLos: false,
    });
    doc = placeAt(doc, {
      ref,
      id: suggestPlacementId(doc, ref),
      at: a(1, 0),
      blocksMovement: true,
      blocksLos: false,
    });
    expect(doc.place.map(({ id }) => id)).toEqual([
      'decorated-table',
      'decorated-table-2',
    ]);

    const secondBefore = doc.place[1];
    doc = movePlacement(doc, 0, a(2, 0));
    doc = updatePlacement(doc, 0, { facing: 'w' });
    expect(doc.place[0]).toMatchObject({
      id: 'decorated-table',
      at: a(2, 0),
      facing: 'w',
    });
    expect(doc.place[1]).toEqual(secondBefore);

    doc = removePlacement(doc, 0);
    expect(doc.place).toEqual([secondBefore]);
    expect(parseDungeon(emitDungeon(doc)).place).toEqual([secondBefore]);
  });
});
