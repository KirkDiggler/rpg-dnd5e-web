import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import {
  createRoomDraft,
  loadRoomDraft,
  parseRoomDraftJson,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { layoutWallPieces } from './structuralWallEditing';
import {
  validateStructuralWalls,
  type StructuralWall,
} from './structuralWalls';
import { centeredRoomWorkspace } from './workspaceGeometry';

function wall(): StructuralWall {
  return {
    id: 'wall-1',
    label: 'North wall',
    line: { start: { x: -8, z: -6 }, end: { x: 8, z: 6 } },
    openings: [{ id: 'opening-1', position: 7, width: 2 }],
    appearance: {
      assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
      height: 3,
      thickness: 0.3,
      elevation: -0.1,
    },
    blocker: {
      footprint: { width: 22, depth: 0.5, offsetX: 1, offsetZ: -0.2 },
      blocksMovement: false,
      blocksLineOfSight: true,
    },
  };
}

function draft() {
  const result = createRoomDraft(createEmptyScene('scene'), 'room');
  result.room.walkableHexes = [{ q: 0, r: 0 }];
  result.room.walls = [wall()];
  return result;
}

function wallWithDoor(): StructuralWall {
  return {
    ...wall(),
    openings: [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: {
          id: 'door-1',
          assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
        },
      },
    ],
  };
}

function draftWithDoor() {
  const result = draft();
  result.room.walls = [wallWithDoor()];
  result.room.doorBindings = { 'door-1': {} };
  return result;
}

function validate(value: unknown) {
  return validateStructuralWalls({
    value,
    horizontalLimit: 12,
    itemIds: new Set(),
  });
}

describe('structural walls in the shared room document', () => {
  it('accepts expanded rectangle endpoints with attached doors intact and rejects enclosing-envelope-only endpoints', () => {
    const workspace = centeredRoomWorkspace(73, 48);
    const source = wallWithDoor();
    source.line = { start: { x: -50, z: 0 }, end: { x: -30, z: 0 } };
    const input = {
      value: [source],
      horizontalLimit: workspace.horizontalLimit,
      workspace,
      itemIds: new Set<string>(),
    };
    expect(validateStructuralWalls(input)[0]!.openings).toEqual(
      source.openings
    );
    source.line.end = cubeToWorld({ x: 37, y: -37, z: 0 }, HEX_SIZE);
    expect(Math.abs(source.line.end.x)).toBeLessThan(workspace.horizontalLimit);
    expect(() => validateStructuralWalls(input)).toThrow(
      /line.end.*outside the authoring workspace/
    );
    // Untagged legacy parser retains its scalar endpoint allowance.
    expect(
      validateStructuralWalls({ ...input, workspace: undefined })[0]!.line.end
    ).toEqual(source.line.end);
  });
  it('round trips exact appearance, independent blockers and gaps through JSON and YAML', () => {
    const source = draft();
    expect(parseRoomDraftJson(stringifyRoomDraft(source))).toEqual(source);
    const yaml = encodeSingleRoomDungeon({ key: 'walls', draft: source });
    expect(parse(yaml).version).toBe(4);
    expect(parse(yaml).room.version).toBe(3);
    const result = decodeSingleRoomDungeon(yaml).draft;
    expect(result).toEqual(source);
    expect(result.room.walls?.[0].blocker.footprint.width).toBe(22);
    expect(result.room.walkableHexes).toEqual(source.room.walkableHexes);
    expect(result.scene).toEqual(source.scene);
  });

  it('retains legacy bytes and root version when walls are absent or empty', () => {
    const source = createRoomDraft(createEmptyScene('scene'), 'room');
    const before = encodeSingleRoomDungeon({ key: 'walls', draft: source });
    source.room.walls = [];
    expect(encodeSingleRoomDungeon({ key: 'walls', draft: source })).toBe(
      before
    );
    expect(parse(before).version).toBe(3);
    expect(
      parseRoomDraftJson(stringifyRoomDraft(source)).room
    ).not.toHaveProperty('walls');
  });

  it('refuses walls under a falsely claimed v3 root', () => {
    const document = parse(
      encodeSingleRoomDungeon({ key: 'walls', draft: draft() })
    );
    document.version = 3;
    expect(() => decodeSingleRoomDungeon(stringify(document))).toThrow(
      /version|v4|walls/i
    );
  });

  it('does not alias caller-owned data', () => {
    const source = wall();
    const result = validate([source]);
    result[0].line.start.x = 0;
    result[0].blocker.footprint.offsetX = 99;
    result[0].openings[0].position = 4;
    expect(source).toEqual(wall());
  });

  it('preserves unsupported stored bytes and reports the load error', () => {
    const fallback = createRoomDraft(createEmptyScene('fallback'), 'fallback');
    const envelope = JSON.parse(stringifyRoomDraft(draft()));
    envelope.draft.room.walls[0].mystery = true;
    const bytes = JSON.stringify(envelope);
    const storage = {
      getItem: (key: string) => (key === ROOM_DRAFT_STORAGE_KEY ? bytes : null),
      setItem: () => {
        throw new Error('must not overwrite');
      },
    };
    const result = loadRoomDraft(storage, fallback);
    expect(result.value).toEqual(fallback);
    expect(result.error).toMatch(/walls.*mystery/);
    expect(storage.getItem(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
  });

  it('refuses unknown nested fields instead of losing them', () => {
    expect(() => validate([{ ...wall(), mystery: true }])).toThrow(
      /walls.*mystery/
    );
    expect(() =>
      validate([
        { ...wall(), appearance: { ...wall().appearance, mystery: true } },
      ])
    ).toThrow(/appearance.*mystery/);
    expect(() =>
      validate([
        {
          ...wall(),
          blocker: {
            ...wall().blocker,
            footprint: { ...wall().blocker.footprint, mystery: true },
          },
        },
      ])
    ).toThrow(/footprint.*mystery/);
  });

  it('refuses unknown asset refs and malformed containers', () => {
    expect(() =>
      validate([
        {
          ...wall(),
          appearance: {
            ...wall().appearance,
            assetRef: 'https://unknown/model.glb',
          },
        },
      ])
    ).toThrow(/assetRef/);
    for (const value of [null, {}, true, 'walls'])
      expect(() => validate(value)).toThrow(/walls/);
  });

  it('refuses identity collisions across walls, openings and scene items', () => {
    expect(() => validate([wall(), wall()])).toThrow(/id/);
    expect(() => validate([wall(), { ...wall(), id: 'wall-2' }])).toThrow(/id/);
    expect(() =>
      validate([
        { ...wall(), openings: [{ id: 'wall-1', position: 7, width: 2 }] },
      ])
    ).toThrow(/id/);
    expect(() =>
      validateStructuralWalls({
        value: [wall()],
        horizontalLimit: 12,
        itemIds: new Set(['wall-1']),
      })
    ).toThrow(/id/);
    expect(() =>
      validateStructuralWalls({
        value: [wall()],
        horizontalLimit: 12,
        itemIds: new Set(['opening-1']),
      })
    ).toThrow(/id/);
  });

  it('refuses geometry outside the workspace and overlapping openings', () => {
    const outside = wall();
    outside.line.start.x = -13;
    expect(() => validate([outside])).toThrow(/start.x/);
    const overlap = wall();
    overlap.openings = [
      { id: 'a', position: 7, width: 4 },
      { id: 'b', position: 8, width: 2 },
    ];
    expect(() => validate([overlap])).toThrow(/walls.*overlap/);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])(
    'refuses invalid dimensions %s',
    (dimension) => {
      const source = wall();
      source.blocker.footprint.width = dimension;
      expect(() => validate([source])).toThrow(/footprint.width/);
      source.blocker.footprint.width = 22;
      source.appearance.height = dimension;
      expect(() => validate([source])).toThrow(/appearance.height/);
    }
  );

  it('refuses nonfinite offsets, elevation and nonboolean flags', () => {
    const source = wall();
    source.blocker.footprint.offsetZ = Infinity;
    expect(() => validate([source])).toThrow(/offsetZ/);
    source.blocker.footprint.offsetZ = 0;
    source.appearance.elevation = NaN;
    expect(() => validate([source])).toThrow(/elevation/);
    expect(() =>
      validate([
        { ...wall(), blocker: { ...wall().blocker, blocksMovement: 'yes' } },
      ])
    ).toThrow(/blocksMovement/);
  });

  it('round trips an attached door with no stored pose and no scene item, through JSON and YAML', () => {
    const source = draftWithDoor();
    const parsed = parseRoomDraftJson(stringifyRoomDraft(source));
    expect(parsed).toEqual(source);
    expect(parsed.room.walls?.[0]?.openings[0]).toEqual({
      id: 'opening-1',
      position: 7,
      width: 2,
      door: {
        id: 'door-1',
        assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      },
    });
    // The bound door is never duplicated as a scene prop.
    expect(parsed.scene.items.some((item) => item.id === 'door-1')).toBe(false);

    const yaml = encodeSingleRoomDungeon({ key: 'doors', draft: source });
    const decoded = decodeSingleRoomDungeon(yaml).draft;
    expect(decoded).toEqual(source);
    expect(decoded.room.doorBindings).toEqual({ 'door-1': {} });
  });

  it('refuses unknown, non-leaf and malformed attached doors by path', () => {
    const nonLeaf = wallWithDoor();
    nonLeaf.openings = [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: { id: 'door-1', assetRef: 'dnd5e:env:dark-fortress:45_wall_01' },
      },
    ];
    expect(() => validate([nonLeaf])).toThrow(/door\.assetRef/);

    const unknown = wallWithDoor();
    unknown.openings = [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: { id: 'door-1', assetRef: 'https://unknown/model.glb' },
      },
    ];
    expect(() => validate([unknown])).toThrow(/door\.assetRef/);

    const extraKey = wallWithDoor();
    extraKey.openings = [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: {
          id: 'door-1',
          assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
          mystery: true,
        } as never,
      },
    ];
    expect(() => validate([extraKey])).toThrow(/door.*mystery/);
  });

  it('refuses door ids colliding with walls, openings, scene items or each other', () => {
    const collidingOpening = wallWithDoor();
    collidingOpening.openings = [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: {
          id: 'opening-1',
          assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
        },
      },
    ];
    expect(() => validate([collidingOpening])).toThrow(/id/);

    const other = { ...wallWithDoor(), id: 'wall-2' };
    expect(() => validate([wallWithDoor(), other])).toThrow(/door\.id|id/);

    expect(() =>
      validateStructuralWalls({
        value: [wallWithDoor()],
        horizontalLimit: 12,
        itemIds: new Set(['door-1']),
      })
    ).toThrow(/id/);
  });

  it('refuses an attached door with no doorBindings entry by path', () => {
    const envelope = JSON.parse(stringifyRoomDraft(draftWithDoor()));
    delete envelope.draft.room.doorBindings;
    expect(() => parseRoomDraftJson(JSON.stringify(envelope))).toThrow(
      /openings\[0\]\.door.*doorBindings entry/
    );
  });
});

describe('wall appearance independence', () => {
  it('never lets a blocker extent change the visible layout', () => {
    const first = draft().room.walls![0]!;
    const second: StructuralWall = {
      ...first,
      // Same visual line/appearance, a completely different blocking shape.
      blocker: {
        footprint: { width: 2, depth: 9, offsetX: -4, offsetZ: 6 },
        blocksMovement: true,
        blocksLineOfSight: false,
      },
    };
    const bounds = [2.7868884801864624, 2.258652985095978, 0.2477882355451584];
    const layout = (value: StructuralWall) =>
      layoutWallPieces({
        wall: value,
        sourceWidthMeters: bounds[0]!,
        sourceHeightMeters: bounds[1]!,
        sourceDepthMeters: bounds[2]!,
      });
    expect(layout(second)).toEqual(layout(first));
  });
});
