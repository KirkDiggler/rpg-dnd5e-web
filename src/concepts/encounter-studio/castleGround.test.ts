import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  groundRefAt,
  paintRegionGround,
  setRegionGroundBase,
} from '../world-building/regionGround';
import { fromRows } from '../world-building/regionRuns';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from '../world-building/roomDraft';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-ground-source.yaml?raw';

// Current operator-served castle before ground fold-back: API 2355058,
// content blob 4ffc0bf55cea81b5850bf95e2704638e6e1c29f8. Its file hash was
// checked against the actual castle deployment mount, not inferred from dev.
const GRASS = 'dnd5e:ground:fantasy-kingdom:grass_01';
const DIRT = 'dnd5e:ground:fantasy-kingdom:dirt_01';
const STONE = 'dnd5e:ground:dungeon:stone_01';
const REGION = 'region-courtyard';
const path = [
  { r: -6, q: [[3, 3]] },
  { r: -5, q: [[2, 3]] },
  { r: -4, q: [[2, 2]] },
  { r: -3, q: [[1, 2]] },
  { r: -2, q: [[1, 1]] },
  { r: -1, q: [[0, 1]] },
  { r: 0, q: [[-14, 14]] },
  { r: 1, q: [[-1, 0]] },
  { r: 2, q: [[-1, -1]] },
  { r: 3, q: [[-2, -1]] },
  { r: 4, q: [[-2, -2]] },
  { r: 5, q: [[-3, -2]] },
  { r: 6, q: [[-3, -3]] },
];

describe('current QA castle ground fold-back', () => {
  it('imports the served source byte-exactly, then changes only courtyard appearance through native save/reopen', () => {
    const opened = readDraftYaml(served);
    if (!opened.ok) throw new Error(opened.refusal);
    expect(exportDraftYaml(opened, opened.key)).toBe(served);
    const based = setRegionGroundBase(opened.draft, REGION, GRASS);
    const painted = paintRegionGround(
      based,
      REGION,
      fromRows(path, 'courtyard route'),
      DIRT
    );
    const persisted = parseRoomDocumentJson(
      stringifyRoomDraft(painted, opened.scope)
    );
    const yaml = exportDraftYaml(persisted, opened.key);
    const original = parse(served),
      result = parse(yaml);
    const courtyard = result.room.room.regions.find(
      (r: { id: string }) => r.id === REGION
    );
    expect(courtyard.ground).toEqual({
      baseRef: GRASS,
      paint: [{ ref: DIRT, cells: path }],
    });
    delete courtyard.ground;
    expect(result).toEqual(original); // Includes current posts, passes, tables, roster, walls, doors and cells.

    const reopened = readDraftYaml(yaml);
    if (!reopened.ok) throw new Error(reopened.refusal);
    const region = reopened.draft.room.regions.find((r) => r.id === REGION)!;
    for (const cell of [
      { q: -3, r: 6 },
      { q: 3, r: -6 },
      { q: -14, r: 0 },
      { q: 14, r: 0 },
    ])
      expect(groundRefAt(region, cell)).toBe(DIRT);
    expect(groundRefAt(region, { q: 7, r: 2 })).toBe(GRASS);
    const changedBase = setRegionGroundBase(reopened.draft, REGION, STONE);
    const erased = paintRegionGround(
      changedBase,
      REGION,
      [{ q: 0, r: 0 }],
      null
    );
    const after = erased.room.regions.find((r) => r.id === REGION)!;
    expect(groundRefAt(after, { q: 0, r: 0 })).toBe(STONE);
    expect(groundRefAt(after, { q: -3, r: 6 })).toBe(DIRT);
    expect(
      erased.room.regions.find((r) => r.id === 'region-gatehouse')?.ground
    ).toBeUndefined();
  });
});
