// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralWallSchema,
  StructuralWallOpeningsReplacementSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { CellsLearnedSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { cellsPatchOf } from './actGeometry';
import { applyStructuralRecords } from './applyReveal';
import {
  sceneUnitsPerFoot,
  structuralWallSurfaceFromAtlas,
} from './structuralLayout';
const K = 5 / Math.sqrt(3);
const facts = {
  id: 'wall',
  ref: 'opaque:wall',
  from: { x: 0, y: 0 },
  to: { x: 12 * K, y: 0 },
  height: 6 * K,
  thickness: 0.375 * K,
  elevation: 0,
  sections: [
    { id: 'window', ref: 'opaque:window', position: 8 * K, width: 3.75 * K },
  ],
};

describe('captured wall-owned sections', () => {
  it('converts the captured span once into the existing visual owner without inventing an opening', () => {
    const wire = create(AtlasStructuralWallSchema, facts),
      surface = structuralWallSurfaceFromAtlas(wire, sceneUnitsPerFoot(1));
    expect(surface.appearance.sections).toHaveLength(1);
    expect(surface.appearance.sections![0]).toEqual({
      id: 'window',
      assetRef: 'opaque:window',
      position: expect.closeTo(8, 10),
      width: expect.closeTo(3.75, 10),
    });
    expect(surface.openings).toEqual([]);
    surface.appearance.sections![0].assetRef = 'caller:mutation';
    expect(wire.sections[0].ref).toBe('opaque:window');
  });
  it.each([false, true])(
    'installs canonical touching sections without rewriting spans (opening=%s)',
    (withOpening) => {
      const left = { id: 'left', position: 3 * K, width: 6 * K };
      const right = {
        id: 'right',
        ref: 'opaque:right',
        position: 9 * K,
        width: 6 * K,
      };
      expect(right.position - right.width / 2).toBeLessThan(
        left.position + left.width / 2
      );
      const wall = create(AtlasStructuralWallSchema, {
        ...facts,
        openings: withOpening ? [left] : [],
        sections: withOpening
          ? [right]
          : [{ ...left, ref: 'opaque:left' }, right],
      });
      const before = create(GetAtlasResponseSchema);
      const installed = applyStructuralRecords(before, [wall], []);
      expect(installed.structuralWalls[0].sections).toEqual(wall.sections);
      expect(before.structuralWalls).toEqual([]);
      expect(() =>
        structuralWallSurfaceFromAtlas(
          installed.structuralWalls[0],
          sceneUnitsPerFoot(1)
        )
      ).not.toThrow();
      const bad = create(AtlasStructuralWallSchema, {
        ...wall,
        sections: wall.sections.map((section) =>
          section.id === 'right'
            ? { ...section, position: section.position - 1e-8 * K }
            : section
        ),
      });
      expect(() => applyStructuralRecords(installed, [bad], [])).toThrow(
        /overlap/
      );
      expect(installed.structuralWalls[0].sections).toEqual(wall.sections);
    }
  );

  it('keeps recorded sections through the v2 event bridge and an opening-only replacement', () => {
    const event = create(CellsLearnedSchema, { structuralWalls: [facts] }),
      patch = cellsPatchOf(event);
    const before = applyStructuralRecords(
      create(GetAtlasResponseSchema),
      patch.structuralWalls,
      []
    );
    const after = applyStructuralRecords(
      before,
      [],
      [],
      [
        create(StructuralWallOpeningsReplacementSchema, {
          wallId: 'wall',
          openings: [{ id: 'gap', position: 3 * K, width: K }],
        }),
      ]
    );
    expect(after.structuralWalls[0].sections[0].ref).toBe('opaque:window');
    expect(
      structuralWallSurfaceFromAtlas(
        after.structuralWalls[0],
        sceneUnitsPerFoot(1)
      ).appearance.sections![0].position
    ).toBeCloseTo(8);
    event.structuralWalls[0].sections[0].ref = 'event:mutation';
    before.structuralWalls[0].sections[0].ref = 'baseline:mutation';
    expect(after.structuralWalls[0].sections[0].ref).toBe('opaque:window');
  });
  it('refuses malformed section records atomically and leaves legacy absence alone', () => {
    const baseline = create(GetAtlasResponseSchema, {
      structuralWalls: [
        create(AtlasStructuralWallSchema, { ...facts, sections: [] }),
      ],
    });
    expect(
      structuralWallSurfaceFromAtlas(baseline.structuralWalls[0], 1).appearance
        .sections
    ).toBeUndefined();
    for (const sections of [
      [{ ...facts.sections[0], width: 0 }],
      [facts.sections[0], facts.sections[0]],
      [{ ...facts.sections[0], position: 1000 }],
    ]) {
      expect(() =>
        applyStructuralRecords(
          baseline,
          [create(AtlasStructuralWallSchema, { ...facts, sections })],
          []
        )
      ).toThrow(/section/i);
      expect(baseline.structuralWalls[0].sections).toEqual([]);
    }
  });
  it('does not reconstruct any section when its owning wall was not supplied', () => {
    const empty = applyStructuralRecords(
      create(GetAtlasResponseSchema),
      [],
      []
    );
    expect(empty.structuralWalls).toEqual([]);
  });
});
