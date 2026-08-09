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
import { buildOnePlacement } from './preview3d/DungeonPreview3D';

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
});
