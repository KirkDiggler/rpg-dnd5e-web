import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { WORLD_BUILDING_CATALOG_BY_REF } from '../world-building/catalog';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from '../world-building/roomDraft';
import {
  createWall,
  layoutWallPieces,
  setWallAppearance,
} from '../world-building/structuralWallEditing';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-walls-source.yaml?raw';

// Exact API 9a3896e source, also verified in the isolated castle container.
// The test catches dropped ground/gameplay data or a model ref lost at native
// save/reopen; it does not grant finish or miter capability to arbitrary models.
const STONE = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
const TIMBER = 'dnd5e:env:fantasy-kingdom:house_wall_05';
const replacements: Readonly<Record<string, string>> = {
  'hall-wall': STONE,
  'kitchen-south-wall': TIMBER,
};

describe('courtyard wall model configuration', () => {
  it('changes only selected appearances through current castle native save/reopen', () => {
    const opened = readDraftYaml(served);
    if (!opened.ok) throw Error(opened.refusal);
    expect(exportDraftYaml(opened, opened.key)).toBe(served);
    const originals = structuredClone(opened.draft.room.walls!);
    const edited = {
      ...opened.draft,
      room: {
        ...opened.draft.room,
        walls: opened.draft.room.walls!.map((wall) =>
          replacements[wall.id]
            ? setWallAppearance(wall, {
                ...wall.appearance,
                assetRef: replacements[wall.id]!,
                height: 2.8,
              })
            : wall
        ),
      },
    };
    const persisted = parseRoomDocumentJson(
      stringifyRoomDraft(edited, opened.scope)
    );
    const yaml = exportDraftYaml(persisted, opened.key);
    const reopened = readDraftYaml(yaml);
    if (!reopened.ok) throw Error(reopened.refusal);
    for (const [id, ref] of Object.entries(replacements)) {
      expect(
        reopened.draft.room.walls!.find((wall) => wall.id === id)?.appearance
      ).toEqual({ assetRef: ref, height: 2.8, thickness: 0.3, elevation: 0 });
    }
    // Compare every source fact, not an expected count of walls or actors.
    const result = parse(yaml);
    for (const wall of result.room.room.walls) {
      if (replacements[wall.id])
        wall.appearance = originals.find(
          (original) => original.id === wall.id
        )!.appearance;
    }
    expect(result).toEqual(parse(served));
    expect(opened.draft.room.walls).toEqual(originals);

    const restored = {
      ...reopened.draft,
      room: {
        ...reopened.draft.room,
        walls: reopened.draft.room.walls!.map((wall) =>
          replacements[wall.id]
            ? setWallAppearance(
                wall,
                originals.find((original) => original.id === wall.id)!
                  .appearance
              )
            : wall
        ),
      },
    };
    const restoredDocument = parseRoomDocumentJson(
      stringifyRoomDraft(restored, reopened.scope)
    );
    expect(parse(exportDraftYaml(restoredDocument, opened.key))).toEqual(
      parse(served)
    );
  });

  it('retains native wall and prop material choices without changing the rest of the current castle', () => {
    const opened = readDraftYaml(served);
    if (!opened.ok) throw Error(opened.refusal);
    const choice = {
      surfaceId: 'atlas',
      materialRef: 'dnd5e:material:fantasy-kingdom:atlas_04_c',
    };
    const draft = structuredClone(opened.draft);
    draft.room.walls![0] = setWallAppearance(draft.room.walls![0], {
      ...draft.room.walls![0].appearance,
      materialOverrides: [choice],
    });
    draft.scene.items[0].materialOverrides = [{ ...choice }];
    const stored = parseRoomDocumentJson(
      stringifyRoomDraft(draft, opened.scope)
    );
    const yaml = exportDraftYaml(stored, opened.key);
    const reopened = readDraftYaml(yaml);
    if (!reopened.ok) throw Error(reopened.refusal);
    expect(reopened.draft.room.walls![0].appearance.materialOverrides).toEqual([
      choice,
    ]);
    expect(reopened.draft.scene.items[0].materialOverrides).toEqual([choice]);
    const actual = parse(yaml);
    delete actual.room.room.walls[0].appearance.materialOverrides;
    delete actual.room.scene.items[0].materialOverrides;
    expect(actual).toEqual(parse(served));
    delete reopened.draft.room.walls![0].appearance.materialOverrides;
    delete reopened.draft.scene.items[0].materialOverrides;
    expect(parse(exportDraftYaml(reopened, opened.key))).toEqual(parse(served));
  });

  it.each([4, 14])(
    'fits the published timber model around a doorway on a %s-unit wall',
    (length) => {
      const entry = WORLD_BUILDING_CATALOG_BY_REF.get(TIMBER);
      if (entry?.source !== 'generated')
        throw Error('Published timber wall missing');
      const [width, height, depth] = entry.asset.boundsMeters;
      const wall = {
        ...createWall({
          id: 'edge',
          start: { x: 0, z: 0 },
          end: { x: length, z: 0 },
          assetRef: TIMBER,
          height: 3,
          thickness: 0.3,
          elevation: 0,
        }),
        openings: [{ id: 'door', position: 2, width: 1 }],
      };
      const before = structuredClone(wall);
      const spans = layoutWallPieces({
        wall,
        sourceWidthMeters: width,
        sourceHeightMeters: height,
        sourceDepthMeters: depth,
      });
      expect(spans.map(({ span }) => span)).toEqual([
        { start: 0, end: 1.5 },
        { start: 2.5, end: length },
      ]);
      for (const { span, pieces } of spans) {
        expect(pieces.length).toBeGreaterThan(0);
        const first = pieces[0]!,
          last = pieces.at(-1)!;
        expect(first.point.x - (first.widthScale * width) / 2).toBeCloseTo(
          span.start
        );
        expect(last.point.x + (last.widthScale * width) / 2).toBeCloseTo(
          span.end
        );
        for (const piece of pieces) {
          expect(
            piece.point.x - (piece.widthScale * width) / 2
          ).toBeGreaterThanOrEqual(span.start - 1e-9);
          expect(
            piece.point.x + (piece.widthScale * width) / 2
          ).toBeLessThanOrEqual(span.end + 1e-9);
          expect(piece.heightScale * height).toBeCloseTo(3);
          expect(piece.depthScale * depth).toBeCloseTo(0.3);
        }
      }
      expect(wall).toEqual(before);
    }
  );
});
