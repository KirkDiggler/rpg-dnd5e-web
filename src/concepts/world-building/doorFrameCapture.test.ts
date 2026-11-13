import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import {
  captureDoorFramePresentations,
  pinnedFrameMaterials,
} from './doorFrameCapture';
import { createRoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { createWall } from './structuralWallEditing';
import { createStudioDoor } from './studioDoorEditing';
const gray = 'dnd5e:material:fantasy-kingdom:wall_large_brick_01';
const stucco = 'dnd5e:material:fantasy-kingdom:wall_stucco_01';
function fixture() {
  const draft = createRoomDraft(createEmptyScene('scene'), 'room');
  const wall = createWall({
    id: 'wall',
    start: { x: 0, z: 0 },
    end: { x: 12, z: 0 },
    assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01',
    height: 3.75,
    thickness: 0.375,
    elevation: 0,
  });
  draft.room.walls = [
    createStudioDoor(wall, {
      openingId: 'gap',
      doorId: 'door',
      assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01',
      position: 6,
    }),
  ];
  draft.room.doorBindings = { door: { closed: true } };
  draft.scene.version = 7;
  draft.scene.wallFinishes = {
    wall: { 'positive-z': gray, 'negative-z': gray },
  };
  return draft;
}
const frame = (d: ReturnType<typeof fixture>) =>
  d.room.walls![0].openings[0].door!.framePresentation!;
describe('authoring-owned fixed frame capture', () => {
  it('captures only visual extents and wrapped face phases without changing the aperture or source', () => {
    const source = fixture(),
      result = captureDoorFramePresentations(source, pinnedFrameMaterials());
    expect(frame(result)).toBeDefined();
    expect(frame(result).span.before + frame(result).span.after).toBeCloseTo(
      3.75
    );
    expect(frame(result).faceFinishes[0]).toMatchObject({
      side: 'positive-z',
      materialRef: gray,
    });
    expect(frame(result).faceFinishes[0].phaseU).toBeCloseTo(0.6);
    expect(frame(result).faceFinishes[1].phaseU).toBeCloseTo(0.4);
    expect(result.room.walls![0].openings[0].width).toBe(
      source.room.walls![0].openings[0].width
    );
    expect(
      source.room.walls![0].openings[0].door!.framePresentation
    ).toBeUndefined();
  });
  it('updates moved/changed inherited looks atomically but preserves unknown unchanged intent', () => {
    const original = captureDoorFramePresentations(
      fixture(),
      pinnedFrameMaterials()
    );
    const next = structuredClone(original);
    next.scene.wallFinishes!.wall['positive-z'] = stucco;
    next.room.walls![0].openings = [
      { ...next.room.walls![0].openings[0], position: 5 },
    ];
    const changed = captureDoorFramePresentations(
      next,
      pinnedFrameMaterials(),
      original
    );
    expect(frame(changed).faceFinishes[0].materialRef).toBe(stucco);
    expect(frame(changed).faceFinishes[0].phaseU).not.toBe(
      frame(original).faceFinishes[0].phaseU
    );
    frame(original).faceFinishes[0].materialRef = 'unknown:historical';
    original.scene.wallFinishes!.wall['positive-z'] = 'unknown:historical';
    const renamed = { ...original, name: 'New name' };
    expect(captureDoorFramePresentations(renamed, null, original)).toBe(
      renamed
    );
    const moved = structuredClone(original);
    moved.room.walls![0].openings = [
      { ...moved.room.walls![0].openings[0], position: 5 },
    ];
    expect(() => captureDoorFramePresentations(moved, null, original)).toThrow(
      /unavailable/
    );
    expect(() =>
      captureDoorFramePresentations(
        {
          ...renamed,
          scene: {
            ...renamed.scene,
            wallFinishes: { wall: { 'positive-z': 'unknown:new' } },
          },
        },
        null,
        original
      )
    ).toThrow(/unavailable/);
  });
  it('exports new capture facts through the normal codec and preserves them on import/export', () => {
    const source = fixture();
    const yaml = encodeSingleRoomDungeon({ key: 'door-frame', draft: source });
    const decoded = decodeSingleRoomDungeon(yaml);
    expect(frame(decoded.draft)).toBeDefined();
    expect(frame(decoded.draft).faceFinishes[0].phaseU).toBeCloseTo(0.6);
    expect(
      encodeSingleRoomDungeon({ key: 'door-frame', draft: decoded.draft })
    ).toBe(yaml);
    const legacy = parse(yaml);
    delete legacy.room.room.walls[0].openings[0].door.framePresentation;
    const imported = decodeSingleRoomDungeon(stringify(legacy));
    const exported = decodeSingleRoomDungeon(
      encodeSingleRoomDungeon({ key: 'door-frame', draft: imported.draft })
    );
    expect(frame(exported.draft).faceFinishes[0].phaseU).toBeCloseTo(0.6);
  });
});
