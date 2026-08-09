import { create } from '@bufbuild/protobuf';
import {
  FloorPlanCellSchema,
  FloorPlanPlacementSchema,
  FloorPlanSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { PlacementOffsetSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyCanvasYaml } from './creation/emptyCanvasDoc';
import {
  movePlacementAcrossLists,
  parseDungeon,
  serializeDungeon,
  setBossOffset,
  setPlacementOffset,
  stripToV1Subset,
  toDungeonDoc,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import {
  buildOnePlacement,
  projectedFloorPlanPlacements,
} from './preview3d/DungeonPreview3D';

const WITH_OFFSETS = SHOWCASE_YAML.replace(
  'at: [1, 1], blocks_movement: true, blocks_los: false',
  'at: [1, 1], offset: [0, 0, 0], blocks_movement: true, blocks_los: false'
).replace(
  'boss: { ref: "dnd5e:monsters:skeleton-captain", at: [5, 5] }',
  'boss: { ref: "dnd5e:monsters:skeleton-captain", at: [5, 5], offset: [-0.25, 0.5, 0.75] }'
);

describe('ratified v0.4 Builder world offset', () => {
  it('distinguishes omission, explicit zero, and nonzero boss projection', () => {
    const doc = parseDungeon(WITH_OFFSETS).doc;
    expect(doc.rooms[0]!.place[0]!.offset).toEqual([0, 0, 0]);
    expect(doc.rooms[0]!.place[1]!.offset).toBeNull();
    expect(doc.rooms[2]!.boss?.offset).toEqual([-0.25, 0.5, 0.75]);
  });

  it('parses the same contract on a top-level canvas placement', () => {
    const yaml = emptyCanvasYaml(5, 5).replace(
      'place: []',
      'place: [{ ref: "dnd5e:props:bookcase", at: [2, 3], offset: [0.125, -0.25, 0.5] }]'
    );
    expect(parseDungeon(yaml).doc.place[0]!.offset).toEqual([
      0.125, -0.25, 0.5,
    ]);
  });

  it.each(['[0, 0]', '[0, 0, 0, 0]', '[0, nope, 0]', '[0, .inf, 0]'])(
    'rejects an invalid exact-triple offset %s',
    (offset) => {
      const yaml = SHOWCASE_YAML.replace(
        'at: [1, 1], blocks_movement: true',
        `at: [1, 1], offset: ${offset}, blocks_movement: true`
      );
      expect(() => parseDungeon(yaml)).toThrow(/exactly three finite/);
    }
  );

  it('writes explicit zero, changes exact values, and removes presence', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setPlacementOffset(cst, 'antechamber', 0, [0, 0, 0]);
    setBossOffset(cst, 'vault', [-0.25, 0.5, 0.75]);
    let reparsed = parseDungeon(serializeDungeon(cst)).doc;
    expect(reparsed.rooms[0]!.place[0]!.offset).toEqual([0, 0, 0]);
    expect(reparsed.rooms[2]!.boss?.offset).toEqual([-0.25, 0.5, 0.75]);

    setPlacementOffset(cst, 'antechamber', 0, [0.125, -0.25, 0.5]);
    setBossOffset(cst, 'vault', null);
    reparsed = parseDungeon(serializeDungeon(cst)).doc;
    expect(reparsed.rooms[0]!.place[0]!.offset).toEqual([0.125, -0.25, 0.5]);
    expect(reparsed.rooms[2]!.boss?.offset).toBeNull();
  });

  it('preserves the exact world triple across room/canvas list movement', () => {
    const { cst, doc } = parseDungeon(WITH_OFFSETS);
    movePlacementAcrossLists(
      cst,
      'antechamber',
      0,
      null,
      [3, 2],
      doc.rooms[0]!.place[0]!
    );
    expect(toDungeonDoc(cst).place[0]!.offset).toEqual([0, 0, 0]);
  });

  it('never strips offset from the validate-only candidate', () => {
    const result = stripToV1Subset(WITH_OFFSETS, undefined);
    expect(result.yaml).toContain('offset: [ 0, 0, 0 ]');
    expect(result.yaml).toContain('offset: [ -0.25, 0.5, 0.75 ]');
  });

  it('adds the world vector once in the shared Builder preview for prop and monster', () => {
    const { doc } = parseDungeon(WITH_OFFSETS);
    const prop = doc.rooms[0]!.place[0]!;
    const baseline = buildOnePlacement(
      doc,
      { ...prop, offset: null },
      1,
      1,
      { roomId: 'antechamber', index: 0 },
      'base'
    ).prop!;
    const shifted = buildOnePlacement(
      doc,
      { ...prop, offset: [0.25, -0.5, 0.75] },
      1,
      1,
      { roomId: 'antechamber', index: 0 },
      'shifted'
    ).prop!;
    expect(shifted.position).toEqual([
      baseline.position[0] + 0.25,
      baseline.position[1] - 0.5,
      baseline.position[2] + 0.75,
    ]);

    const monster = {
      ...prop,
      ref: 'dnd5e:monsters:skeleton',
      isMonster: true,
    };
    const monsterBase = buildOnePlacement(
      doc,
      { ...monster, offset: null },
      1,
      1,
      { roomId: 'antechamber', index: 0 },
      'monster-base'
    ).monster!;
    const monsterShifted = buildOnePlacement(
      doc,
      { ...monster, offset: [-0.25, 0.5, -0.75] },
      1,
      1,
      { roomId: 'antechamber', index: 0 },
      'monster-shifted'
    ).monster!;
    expect(monsterShifted.position).toEqual([
      monsterBase.position[0] - 0.25,
      monsterBase.position[1] + 0.5,
      monsterBase.position[2] - 0.75,
    ]);
  });

  it('routes the five real provider placement kinds through resolver-owned transforms', () => {
    const roomDoc = parseDungeon(WITH_OFFSETS).doc;
    const placement = (
      sourcePath: string,
      ref: string,
      column: number,
      row: number,
      offset?: [number, number, number],
      facing?: number
    ) =>
      create(FloorPlanPlacementSchema, {
        sourcePath,
        ref,
        at: create(FloorPlanCellSchema, { column, row }),
        facing,
        offset: offset
          ? create(PlacementOffsetSchema, {
              x: offset[0],
              y: offset[1],
              z: offset[2],
            })
          : undefined,
      });
    const projected = projectedFloorPlanPlacements(
      create(FloorPlanSchema, {
        placements: [
          placement(
            'rooms[0].place[0]',
            'dnd5e:props:bookcase',
            9,
            4,
            [0.125, -0.25, 0.375],
            2
          ),
          placement(
            'rooms[0].place[1]',
            'dnd5e:monsters:skeleton',
            10,
            4,
            [-0.25, 0.5, 0.75],
            5
          ),
          placement(
            'rooms[2].boss',
            'dnd5e:monsters:skeleton-captain',
            20,
            5,
            [-0.75, 0.625, 0.25],
            1
          ),
        ],
      }),
      roomDoc
    );
    expect(projected.props).toHaveLength(1);
    expect(projected.props[0]!.offset).toEqual([0.125, -0.25, 0.375]);
    expect(projected.props[0]!.sel).toEqual({
      roomId: 'antechamber',
      index: 0,
    });
    expect(projected.monsters).toHaveLength(2);
    expect(projected.monsters[0]!.position[1]).toBe(0.5);
    expect(projected.monsters[1]!.sel).toEqual({
      roomId: 'vault',
      boss: true,
    });

    const canvasDoc = parseDungeon(
      emptyCanvasYaml(5, 5).replace(
        'place: []',
        'place: [{ ref: "dnd5e:props:bookcase", at: [0, 0] }, { ref: "dnd5e:monsters:zombie", at: [1, 1] }]'
      )
    ).doc;
    const canvas = projectedFloorPlanPlacements(
      create(FloorPlanSchema, {
        placements: [
          placement('place[0]', 'dnd5e:props:bookcase', 3, 2, [1, -2, 3]),
          placement(
            'place[1]',
            'dnd5e:monsters:zombie',
            4,
            3,
            [0.5, 1, -1.5],
            4
          ),
        ],
      }),
      canvasDoc
    );
    expect(canvas.props[0]!.sel).toEqual({ roomId: null, index: 0 });
    expect(canvas.props[0]!.offset).toEqual([1, -2, 3]);
    expect(canvas.monsters[0]!.sel).toEqual({ roomId: null, index: 1 });
    expect(canvas.monsters[0]!.visual.selection).toEqual({
      selected: false,
      reason: 'family-not-enrolled',
    });
    expect(canvas.monsters[0]!.position).toEqual(
      canvas.monsters[0]!.visual.placement.legacy.position
    );

    const fiveKinds = [
      projected.props[0],
      canvas.props[0],
      projected.monsters[0],
      canvas.monsters[0],
      projected.monsters[1],
    ];
    expect(projected.props[0]!.visual.selection.selected).toBe(true);
    expect(canvas.props[0]!.visual.selection.selected).toBe(true);
    for (const monster of [
      projected.monsters[0],
      canvas.monsters[0],
      projected.monsters[1],
    ]) {
      expect(monster!.visual.selection).toEqual({
        selected: false,
        reason: 'family-not-enrolled',
      });
    }
    expect(fiveKinds).toHaveLength(5);
    for (const item of fiveKinds) {
      expect(item!.position).toEqual(item!.visual.placement.legacy.position);
      expect(item!.visual.placement.diagnostics.offsetPresence).toBe(
        'explicit'
      );
      expect(item!.position).toEqual([
        item!.canonicalPosition[0] + item!.offset![0],
        item!.canonicalPosition[1] + item!.offset![1],
        item!.canonicalPosition[2] + item!.offset![2],
      ]);
    }
  });
  it('keeps production Builder free of preview overrides and hand-composed p+o mutations', () => {
    const source = readFileSync(
      'src/author/preview3d/DungeonPreview3D.tsx',
      'utf8'
    );
    expect(source).not.toMatch(
      /placementPreviewOverride|applyPlacementPreviewOverride/
    );
    expect(source).not.toContain('canonicalPosition[0] + offset[0]');
    expect(source).not.toContain('canonicalPosition[1] + offset[1]');
    expect(source).not.toContain('canonicalPosition[2] + offset[2]');
    expect(source.match(/<PropModel\b/g)).toHaveLength(1);
    expect(source.match(/<PreviewMonsterModel\b/g)).toHaveLength(1);
    expect(source).toContain('m.visual.placement.legacy.position');
    expect(source).toContain('m.visual.placement.legacy.rotationY');

    const caller = readFileSync(
      'src/author/creation/CreationConcept.tsx',
      'utf8'
    );
    expect(caller).toContain('placementFloorPlan={liveFloorPlan ?? undefined}');
    expect(source).toContain(
      'buildPlacements(placementFloorPlan ?? floorPlan, doc)'
    );
  });
});
