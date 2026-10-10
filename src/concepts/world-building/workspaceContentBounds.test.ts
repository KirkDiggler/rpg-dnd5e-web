import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  resizeRoomWorkspace,
  validateRoomDocument,
  type RoomDraft,
  type RoomDraftDocument,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
import { validateWorkspaceContent } from './workspaceContentBounds';
import {
  centeredRoomWorkspace,
  containsWorkspacePoint,
} from './workspaceGeometry';

function draft(): RoomDraft {
  return {
    ...createRoomDraft(createEmptyScene('scene'), 'room'),
    workspace: centeredRoomWorkspace(1, 1),
    scene: { ...createEmptyScene('scene'), version: 2 },
  };
}
function prop(
  x = 0,
  z = 0,
  rotationY = 0
): RoomDraft['scene']['items'][number] {
  return {
    id: 'prop',
    kind: 'prop',
    assetRef: 'dnd5e:props:torture-table',
    label: 'table',
    transform: { x, y: 0, z, rotationY },
  };
}
function wall(): StructuralWall {
  return {
    id: 'wall',
    label: 'Wall',
    line: { start: { x: -0.3, z: 0 }, end: { x: 0.3, z: 0 } },
    appearance: {
      assetRef: 'dnd5e:props:torture-table',
      height: 2,
      thickness: 0.1,
      elevation: 0,
    },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: { width: 0.6, depth: 0.1, offsetX: 0, offsetZ: 0 },
    },
    openings: [],
  };
}
const outside = { x: 0.8, z: 0.8 };
describe('protected explicit workspace conversion', () => {
  it.each([
    'floor',
    'actor',
    'start',
    'prop',
    'group',
    'label',
    'exit',
    'concealment',
  ])('refuses %s with an offending path/identity', (category) => {
    const value = createRoomDraft(createEmptyScene('scene'), 'room'),
      scope: RoomDraftDocument['scope'] = {};
    value.scene.version = 2;
    let path = '';
    if (category === 'floor') {
      value.room.walkableHexes = [{ q: 1, r: 0 }];
      path = 'walkableHexes';
    }
    if (category === 'actor') {
      value.room.monsterDeclarations = [
        {
          id: 'actor',
          ref: 'dnd5e:monsters:skeleton',
          startingCell: { location: { q: 1, r: 0 } },
        },
      ];
      path = 'actor';
    }
    if (category === 'start') {
      value.room.partyStart = { q: 1, r: 0 };
      path = 'partyStart';
    }
    if (category === 'prop') {
      value.scene.items = [prop(outside.x, outside.z)];
      path = 'prop';
    }
    if (category === 'group') {
      value.scene.groups = [
        {
          id: 'group',
          kind: 'group',
          label: 'group',
          transform: { ...outside, y: 0, rotationY: 0 },
        },
      ];
      path = 'group';
    }
    if (category === 'label') {
      value.scene.mapLabels = [
        { id: 'label', text: 'Kitchen', location: outside },
      ];
      path = 'label';
    }
    if (category === 'exit') {
      scope.exits = [{ id: 'exit', cell: { q: 1, r: 0 } }];
      path = 'exit';
    }
    if (category === 'concealment') {
      scope.concealments = {
        secret: {
          checks: [{ ability: 'wis', dc: 10 }],
          cells: [{ q: 1, r: 0 }],
        },
      };
      path = 'secret';
    }
    const before = structuredClone({ draft: value, scope });
    expect(() => validateRoomDocument({ draft: value, scope })).not.toThrow();
    expect(() =>
      validateWorkspaceContent(
        { ...value, workspace: centeredRoomWorkspace(1, 1) },
        scope
      )
    ).toThrow(new RegExp(path));
    expect(() => resizeRoomWorkspace({ draft: value, scope }, 1, 1)).toThrow();
    expect({ draft: value, scope }).toEqual(before);
  });
  it('protects authored transformed footprints regardless of flags, using world poses only', () => {
    const value = draft();
    value.scene.items = [prop(0, 0, Math.PI / 4)];
    value.room.propDeclarations.prop = {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 1.72, depth: 0.1, offsetX: 0, offsetZ: 0 },
    };
    for (const x of [-0.86, 0.86])
      for (const z of [-0.05, 0.05])
        expect(
          containsWorkspacePoint(value.workspace, {
            x: (x + z) / Math.sqrt(2),
            z: (-x + z) / Math.sqrt(2),
          })
        ).toBe(true);
    // The exact rotated narrow shape fits, but its AABB corners do not: approved conservatism.
    expect(() => validateWorkspaceContent(value, {})).toThrow(
      /prop.*footprint.*conservative AABB/
    );
    value.room.propDeclarations.prop.footprint = {
      width: 0.2,
      depth: 0.2,
      offsetX: 0,
      offsetZ: 0,
    };
    value.scene.groups = [
      {
        id: 'parent',
        kind: 'group',
        label: 'parent',
        transform: { x: 0.7, y: 0, z: 0, rotationY: Math.PI / 2 },
      },
    ];
    value.scene.items[0].parentId = 'parent';
    value.scene.items.push({ ...prop(0.7), id: 'support' });
    value.scene.items[0].supportId = 'support';
    expect(() =>
      validateRoomDocument({ draft: value, scope: {} })
    ).not.toThrow();
    value.room.propDeclarations.prop.footprint.offsetZ = 2;
    expect(() => validateWorkspaceContent(value, {})).toThrow(
      /prop.*footprint/
    );
  });
  it('protects wall line, thickness, blocker and opening-owned door extents without mesh lookup', () => {
    const value = draft();
    const authored = wall();
    value.room.walls = [authored];
    expect(() => validateWorkspaceContent(value, {})).not.toThrow();
    authored.line = { start: { x: -0.8, z: 0.8 }, end: { x: 0.8, z: 0.8 } };
    expect(() => validateWorkspaceContent(value, {})).toThrow(/wall.*line/);
    authored.line = wall().line;
    authored.appearance.thickness = 3;
    expect(() => validateWorkspaceContent(value, {})).toThrow(
      /wall.*appearance.thickness/
    );
    authored.appearance.thickness = 0.1;
    authored.blocker.footprint.offsetX = 2;
    expect(() => validateWorkspaceContent(value, {})).toThrow(
      /wall.*blocker.footprint/
    );
    authored.blocker = wall().blocker;
    // Direct primitive test isolates derived extents: canonical wall schema independently refuses oversized cuts.
    authored.openings = [
      {
        id: 'opening',
        position: 0.3,
        width: 2,
        door: { id: 'door', assetRef: 'irrelevant-no-model-loaded' },
      },
    ];
    expect(() => validateWorkspaceContent(value, {})).toThrow(
      /opening|fit within/
    );
    authored.openings = [
      {
        id: 'opening',
        position: 0.3,
        width: 0.2,
        door: { id: 'door', assetRef: 'irrelevant-no-model-loaded' },
      },
    ];
    expect(() => validateWorkspaceContent(value, {})).not.toThrow();
  });
  it.each(['line', 'thickness', 'blocker'])(
    'refuses legacy wall %s conversion atomically with identity',
    (category) => {
      const value = createRoomDraft(createEmptyScene('scene'), 'room'),
        authored = wall();
      value.room.walls = [authored];
      if (category === 'line')
        authored.line = { start: { x: -0.8, z: 0.8 }, end: { x: 0.8, z: 0.8 } };
      if (category === 'thickness') authored.appearance.thickness = 3;
      if (category === 'blocker') authored.blocker.footprint.offsetX = 2;
      expect(() =>
        validateRoomDocument({ draft: value, scope: {} })
      ).not.toThrow();
      const before = structuredClone(value);
      expect(() =>
        resizeRoomWorkspace({ draft: value, scope: {} }, 1, 1)
      ).toThrow(
        new RegExp(
          `wall.*${category === 'blocker' ? 'blocker.footprint' : category}`
        )
      );
      expect(value).toEqual(before);
    }
  );
  it('permits boundary contact, pure visual overhang and unplaced templates', () => {
    const value = draft();
    value.scene.items = [prop(0.7)];
    value.room.arrangementDeclarations.template = {
      unplaced: {
        blocksMovement: true,
        blocksLineOfSight: true,
        footprint: { width: 12, depth: 12, offsetX: 12, offsetZ: 12 },
      },
    };
    expect(() =>
      validateRoomDocument({ draft: value, scope: {} })
    ).not.toThrow();
    value.scene.items = [prop()];
    value.room.propDeclarations.prop = {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: { width: Math.sqrt(3), depth: 1, offsetX: 0, offsetZ: 0 },
    };
    expect(() => validateWorkspaceContent(value, {})).not.toThrow();
  });
  it('retains legacy extent allowances until explicit conversion and never moves world content', () => {
    const legacy = createRoomDraft(createEmptyScene('scene'), 'room');
    legacy.scene.items = [prop(0.8, 0.8)];
    legacy.room.propDeclarations.prop = {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 12, depth: 12, offsetX: 12, offsetZ: 12 },
    };
    const document = { draft: legacy, scope: {} };
    const before = structuredClone(document);
    expect(() => validateRoomDocument(document)).not.toThrow();
    expect(() => resizeRoomWorkspace(document, 1, 1)).toThrow(/prop/);
    expect(document).toEqual(before);
    const expanded = resizeRoomWorkspace(document, 73, 48);
    expect(expanded.draft.scene.items).toEqual(before.draft.scene.items);
    expect(expanded.draft.room).toEqual(before.draft.room);
    expect(expanded.draft.scene.version).toBe(2);
  });
});

describe('authoring region workspace coverage', () => {
  it('protects explicit area and linked anchors on shrink without floor ownership or a saved automatic polygon', () => {
    const value = draft();
    value.workspace = centeredRoomWorkspace(7, 7);
    value.scene.version = 3;
    value.scene.mapLabels = [
      { id: 'label', text: 'Forest', location: { x: 0, z: 0 } },
    ];
    value.scene.authoringRegions = [
      {
        id: 'region',
        labelId: 'label',
        boundary: { kind: 'explicit', cells: [{ q: 2, r: 0 }] },
      },
    ];
    expect(value.room.walkableHexes).toEqual([]);
    const document = validateRoomDocument({ draft: value, scope: {} });
    const before = JSON.stringify(document);
    expect(resizeRoomWorkspace(document, 7, 7)).toBe(document);
    expect(() => resizeRoomWorkspace(document, 1, 1)).toThrow(
      /authoringRegions.*workspace/
    );
    expect(JSON.stringify(document)).toBe(before);
    const tiny = { ...value, workspace: centeredRoomWorkspace(1, 1) };
    expect(() => validateWorkspaceContent(tiny, {})).toThrow(
      /authoringRegions/
    );
    value.scene.authoringRegions[0].boundary = { kind: 'automatic' };
    expect(
      resizeRoomWorkspace({ draft: value, scope: {} }, 1, 1).draft.scene.version
    ).toBe(3);
    value.scene.mapLabels[0].location = { x: 3, z: 0 };
    expect(() =>
      resizeRoomWorkspace({ draft: value, scope: {} }, 1, 1)
    ).toThrow(/location.*workspace/);
  });
});
