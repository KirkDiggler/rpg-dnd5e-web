// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  CellsLearnedSchema,
  SecretRevealedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import {
  cellsPatchFromJson,
  cellsPatchOf,
  secretPatchFromJson,
  secretPatchOf,
} from './actGeometry';

describe('a perception act’s geometry, as atlas rows', () => {
  it('cells learned cross field for field, a doorway’s door as its connection', () => {
    const patch = cellsPatchOf(
      create(CellsLearnedSchema, {
        regions: [{ id: 'cell', cells: [{ x: 2, y: 0 }] }],
        scenery: [{ x: 3, y: 0 }],
        sealed: [{ x: 4, y: 0 }],
        doorways: [{ door: 'gate', from: { x: 1, y: 0 }, to: { x: 2, y: 0 } }],
        segments: [{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, height: 1 }],
      })
    );
    expect(patch.regions.map((r) => r.id)).toEqual(['cell']);
    expect(patch.regions[0]!.cells).toEqual([
      expect.objectContaining({ x: 2, y: 0 }),
    ]);
    expect(patch.scenery).toEqual([expect.objectContaining({ x: 3, y: 0 })]);
    expect(patch.sealed).toEqual([expect.objectContaining({ x: 4, y: 0 })]);
    expect(patch.doorways.map((d) => d.connection)).toEqual(['gate']);
    expect(patch.segments).toHaveLength(1);
    expect(patch.props).toEqual([]);
  });

  it('a revealed secret’s door rows give their doorways; the doors are left to GetDoors', () => {
    const patch = secretPatchOf(
      create(SecretRevealedSchema, {
        concealment: 'secret',
        cells: [{ x: 1, y: 0 }],
        doors: [
          {
            door: 'postern',
            state: 'closed',
            doorways: [
              { door: 'postern', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
            ],
          },
        ],
        structuralDoors: [{ id: 'postern', ref: 'ref:postern' }],
      })
    );
    expect(patch.concealment).toBe('secret');
    expect(patch.cells).toEqual([expect.objectContaining({ x: 1, y: 0 })]);
    expect(patch.doorways.map((d) => d.connection)).toEqual(['postern']);
    expect(patch.structuralDoors.map((d) => d.id)).toEqual(['postern']);
  });

  it('a CellsLearned field this bridge does not map throws rather than vanishing', () => {
    expect(() => cellsPatchFromJson({ regions: [], futureRows: [] })).toThrow(
      'actGeometry: CellsLearned.futureRows has no atlas row'
    );
  });

  it('a SecretRevealed field this bridge does not map throws rather than vanishing', () => {
    expect(() =>
      secretPatchFromJson({ concealment: 'secret', futureRows: [] })
    ).toThrow('actGeometry: SecretRevealed.futureRows has no atlas row');
  });

  it('a row field the atlas row lacks throws rather than vanishing', () => {
    expect(() =>
      cellsPatchFromJson({ regions: [{ id: 'cell', futureField: 1 }] })
    ).toThrow();
    expect(() =>
      secretPatchFromJson({ props: [{ id: 'chest', futureField: 1 }] })
    ).toThrow();
  });
});
