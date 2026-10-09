// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  placeRoomMonster,
  setRoomPartyStart,
  type RoomDraft,
} from './roomDraft';
import {
  addProp,
  createEmptyScene,
  groupSelection,
  moveSelection,
} from './sceneState';
import {
  previewWallTransform,
  wallDirectionYaw,
  wallLength,
  wallMidpoint,
} from './structuralWallEditing';
import { wallOpeningPoint } from './structuralWallGeometry';
import type { StructuralWall } from './structuralWalls';
import {
  applyStudioActorArrange,
  applyStudioSceneArrange,
  applyStudioWallArrange,
  projectStudioArrange,
  type StudioArrangeSelection,
  type StudioArrangeTarget,
} from './studioArrange';

const WALL_ASSET = 'dnd5e:env:dark-fortress:45_wall_01';
function wall(): StructuralWall {
  return {
    id: 'wall',
    label: 'Diagonal',
    line: { start: { x: 0.17, z: -0.38 }, end: { x: 8.31, z: 6.27 } },
    openings: [
      {
        id: 'cut',
        position: 3,
        width: 1,
        door: { id: 'door', assetRef: 'imported-door' },
      },
    ],
    appearance: {
      assetRef: WALL_ASSET,
      height: 3,
      thickness: 0.3,
      elevation: 0.1,
    },
    blocker: {
      footprint: { width: 12, depth: 0.5, offsetX: 1, offsetZ: -0.2 },
      blocksMovement: false,
      blocksLineOfSight: true,
    },
  };
}
function draft(): RoomDraft {
  let scene = addProp(
    createEmptyScene('scene'),
    'dnd5e:props:torture-table',
    { x: 2, y: 1, z: 3, rotationY: 0.7 },
    'table'
  );
  scene = addProp(
    scene,
    'dnd5e:props:books',
    { x: 4, y: 2, z: 3, rotationY: 0.9 },
    'books'
  );
  scene = groupSelection(scene, ['table', 'books'], 'group', 'Group');
  scene.groups[0]!.transform.rotationY = 0.3;
  scene = addProp(
    scene,
    'dnd5e:props:candle',
    { x: 2, y: 3, z: 3, rotationY: 1.1 },
    'candle',
    { parentId: 'group', supportId: 'table' }
  );
  scene = addProp(
    scene,
    'dnd5e:props:candle',
    { x: 2, y: 4, z: 3, rotationY: 1.2 },
    'support-only',
    { supportId: 'table' }
  );
  const result = placeRoomMonster(createRoomDraft(scene, 'room'), {
    id: 'start',
    ref: 'dnd5e:monsters:skeleton',
    startingCell: { location: { q: 0, r: 0 }, facing: 'nw' },
  });
  result.room.walls = [wall()];
  result.room.doorBindings = { door: { locked: [{ ability: 'str', dc: 12 }] } };
  result.room.monsterBindings = {
    start: { faction: 'guards', holds: ['intel'] },
  };
  result.scene.version = 2;
  result.scene.mapLabels = [
    { id: 'label', text: 'Entry', location: { x: 1.2, z: -3.4 } },
  ];
  return setRoomPartyStart(result, { q: 1, r: 0 });
}
function project(
  value: RoomDraft,
  target: StudioArrangeTarget | null
): StudioArrangeSelection | null {
  return projectStudioArrange({ draft: value, target, selectionRevision: 7 });
}

describe('Arrange canonical projections', () => {
  it('reads the group origin and real yaw; multiple roots expose their pivot without absolute yaw', () => {
    const value = draft();
    const group = project(value, {
      kind: 'scene',
      ids: ['table', 'group', 'candle'],
    });
    expect(group).toMatchObject({
      kind: 'scene',
      rootIds: ['group'],
      rootCount: 1,
      position: { x: 3, y: 1.5, z: 3 },
      yaw: 0.3,
      height: { kind: 'value', scale: 1 },
      selectionRevision: 7,
    });
    const multiple = project(value, { kind: 'scene', ids: ['table', 'books'] });
    expect(multiple).toMatchObject({
      position: { x: 3, y: 1.5, z: 3 },
      rootCount: 2,
    });
    expect(multiple).not.toHaveProperty('yaw');
    expect(
      project(value, { kind: 'scene', ids: ['books', 'table', 'books'] })
        ?.selectionKey
    ).toBe(multiple?.selectionKey);
  });
  it('projects wall units, label XZ, explicit actor and start identities without sentinel ambiguity', () => {
    const value = draft();
    expect(project(value, { kind: 'wall', id: 'wall' })).toMatchObject({
      kind: 'wall',
      wall: wall(),
      midpoint: wallMidpoint(wall()),
      length: wallLength(wall()),
      yaw: wallDirectionYaw(wall()),
    });
    expect(project(value, { kind: 'label', id: 'label' })).toMatchObject({
      kind: 'label',
      label: value.scene.mapLabels![0],
    });
    expect(project(value, { kind: 'actor', id: 'start' })).toMatchObject({
      kind: 'actor',
      startingCell: { location: { q: 0, r: 0 }, facing: 'nw' },
    });
    expect(project(value, { kind: 'start' })).toMatchObject({
      kind: 'start',
      cell: { q: 1, r: 0 },
    });
  });
  it('returns null for absent/retired targets, including a partially missing scene selection', () => {
    const value = draft();
    for (const target of [
      null,
      { kind: 'scene', ids: [] },
      { kind: 'scene', ids: ['table', 'gone'] },
      { kind: 'wall', id: 'gone' },
      { kind: 'label', id: 'gone' },
      { kind: 'actor', id: 'gone' },
    ] as (StudioArrangeTarget | null)[])
      expect(project(value, target)).toBeNull();
    delete value.room.partyStart;
    expect(project(value, { kind: 'start' })).toBeNull();
  });
  it('keeps preview values separate and ignores unrelated wall previews', () => {
    const value = draft();
    const scenePreview = moveSelection(value.scene, ['group'], {
      x: 5,
      y: 0,
      z: 0,
    });
    expect(
      projectStudioArrange({
        draft: value,
        target: { kind: 'scene', ids: ['group'] },
        selectionRevision: 7,
        previewScene: scenePreview,
      })
    ).toMatchObject({
      position: { x: 3 },
      preview: { position: { x: 8 }, yaw: 0.3 },
    });
    const wallPreview = previewWallTransform({
      wall: wall(),
      mode: 'move',
      change: { x: 5, z: 0, rotationY: 0 },
    });
    expect(
      projectStudioArrange({
        draft: value,
        target: { kind: 'wall', id: 'wall' },
        selectionRevision: 7,
        previewWall: wallPreview,
      })
    ).toMatchObject({
      midpoint: wallMidpoint(wall()),
      preview: { midpoint: wallMidpoint(wallPreview) },
    });
    expect(
      projectStudioArrange({
        draft: value,
        target: { kind: 'wall', id: 'wall' },
        selectionRevision: 7,
        previewWall: { ...wallPreview, id: 'other' },
      })
    ).not.toHaveProperty('preview');
  });
  it('reports mixed height, absence for empty groups, and preserves unavailable appearances in projection', () => {
    const value = draft();
    value.scene.items[0]!.heightScale = 1.23456789;
    expect(project(value, { kind: 'scene', ids: ['group'] })).toMatchObject({
      height: { kind: 'mixed' },
    });
    value.scene.groups.push({
      id: 'empty',
      kind: 'group',
      label: 'Empty',
      transform: { x: 8, y: 3, z: -1, rotationY: 0.6 },
    });
    expect(project(value, { kind: 'scene', ids: ['empty'] })).toMatchObject({
      height: { kind: 'absent' },
      position: { x: 8, y: 3, z: -1 },
      yaw: 0.6,
    });
    value.room.walls![0]!.appearance.assetRef = 'unavailable-import';
    expect(project(value, { kind: 'wall', id: 'wall' })).toMatchObject({
      appearance: { assetRef: 'unavailable-import' },
    });
  });
});

describe('Arrange atomic scenery candidates', () => {
  it('composes position, yaw and height once across group/descendant/support overlap', () => {
    const value = draft();
    const before = structuredClone(value.scene);
    const next = applyStudioSceneArrange(value.scene, {
      kind: 'scene-edit',
      target: {
        kind: 'scene',
        ids: ['group', 'table', 'candle', 'support-only'],
      },
      position: { x: 8, y: 2.5 },
      rotation: { kind: 'absolute', radians: 0.3 + Math.PI / 2 },
      heightScale: 2,
    });
    expect(next.groups[0]!.transform).toMatchObject({
      x: 8,
      y: 2.5,
      z: 3,
      rotationY: 0.3 + Math.PI / 2,
    });
    for (const [index, item] of before.items.entries()) {
      expect(next.items[index]!.transform.rotationY).toBe(
        item.transform.rotationY + Math.PI / 2
      );
      expect(next.items[index]!.transform.y).toBe(item.transform.y + 1);
    }
    expect(next.items[0]!.transform.x).toBeCloseTo(8);
    expect(next.items[0]!.transform.z).toBeCloseTo(4);
    expect(next.items.map((item) => item.heightScale)).toEqual([2, 2, 2, 2]); // support-only is also explicitly selected here
    expect(value.scene).toEqual(before);
  });
  it('translates a true multi-root pivot and rotates relatively preserving spacing and relative yaw', () => {
    const scene = draft().scene;
    const next = applyStudioSceneArrange(scene, {
      kind: 'scene-edit',
      target: { kind: 'scene', ids: ['table', 'books'] },
      position: { x: 10, z: -2 },
      rotation: { kind: 'relative', radians: Math.PI / 2 },
    });
    expect(
      project(
        { ...draft(), scene: next },
        { kind: 'scene', ids: ['table', 'books'] }
      )
    ).toMatchObject({ position: { x: 10, y: 1.5, z: -2 } });
    expect(next.items[0]!.transform.z).toBeCloseTo(-1);
    expect(next.items[1]!.transform.z).toBeCloseTo(-3);
    expect(
      next.items[1]!.transform.rotationY - next.items[0]!.transform.rotationY
    ).toBeCloseTo(0.2);
    expect(next.items[2]!.transform.rotationY).toBe(
      scene.items[2]!.transform.rotationY + Math.PI / 2
    );
  });
  it('skips canonical equal/zero operations, preserves default absence, and accepts tiny real edits', () => {
    const scene = draft().scene;
    const target = { kind: 'scene' as const, ids: ['table'] };
    const original = scene.items[0]!.transform;
    expect(
      applyStudioSceneArrange(scene, {
        kind: 'scene-edit',
        target,
        position: { x: original.x, y: original.y, z: original.z },
        rotation: { kind: 'absolute', radians: original.rotationY },
        heightScale: 1,
      })
    ).toBe(scene);
    expect(scene.items[0]).not.toHaveProperty('heightScale');
    const next = applyStudioSceneArrange(scene, {
      kind: 'scene-edit',
      target,
      position: { x: original.x + 1e-12 },
      rotation: { kind: 'absolute', radians: original.rotationY + 1e-12 },
      heightScale: 1 + 1e-12,
    });
    expect(next.items[0]!.transform.x).toBe(original.x + 1e-12);
    expect(next.items[0]!.transform.rotationY).toBe(original.rotationY + 1e-12);
    expect(next.items[0]!.heightScale).toBe(1 + 1e-12);
    expect(
      applyStudioSceneArrange(scene, {
        kind: 'scene-edit',
        target: { kind: 'scene', ids: ['table', 'books'] },
        rotation: { kind: 'relative', radians: 0 },
      })
    ).toBe(scene);
  });
  it('treats requested zero position/yaw as real canonical values, not missing fields', () => {
    const scene = draft().scene;
    const target = { kind: 'scene' as const, ids: ['table'] };
    const next = applyStudioSceneArrange(scene, {
      kind: 'scene-edit',
      target,
      position: { x: 0, y: 0, z: 0 },
      rotation: { kind: 'absolute', radians: 0 },
    });
    expect(next.items[0]!.transform).toEqual({
      x: 0,
      y: 0,
      z: 0,
      rotationY: 0,
    });
    expect(
      applyStudioSceneArrange(next, {
        kind: 'scene-edit',
        target,
        position: { x: 0, y: 0, z: 0 },
        rotation: { kind: 'absolute', radians: 0 },
      })
    ).toBe(next);
  });
  it('clamps only resolved props and preserves unchanged absence in mixed height edits', () => {
    const scene = draft().scene;
    scene.items[0]!.heightScale = 2;
    const target = { kind: 'scene' as const, ids: ['group'] };
    const reset = applyStudioSceneArrange(scene, {
      kind: 'scene-edit',
      target,
      heightScale: 1,
    });
    expect(reset.items[0]!.heightScale).toBe(1);
    expect(reset.items[1]).toBe(scene.items[1]);
    expect(reset.items[1]).not.toHaveProperty('heightScale');
    for (const [input, expected] of [
      [0.24, 0.25],
      [4.01, 4],
    ]) {
      const next = applyStudioSceneArrange(scene, {
        kind: 'scene-edit',
        target,
        heightScale: input,
      });
      expect(next.items.slice(0, 3).map((item) => item.heightScale)).toEqual([
        expected,
        expected,
        expected,
      ]);
      expect(next.items[3]).not.toHaveProperty('heightScale');
    }
  });
  it('refuses unknown targets, invalid/nonfinite fields and unsupported rotation atomically', () => {
    const scene = draft().scene;
    const before = structuredClone(scene);
    expect(() =>
      applyStudioSceneArrange(scene, {
        kind: 'scene-edit',
        target: { kind: 'scene', ids: ['table', 'gone'] },
        position: { x: 8 },
      })
    ).toThrow(/target/);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() =>
        applyStudioSceneArrange(scene, {
          kind: 'scene-edit',
          target: { kind: 'scene', ids: ['group'] },
          position: { x: 8 },
          rotation: { kind: 'absolute', radians: 1 },
          heightScale: invalid,
        })
      ).toThrow(/finite/);
      expect(() =>
        applyStudioSceneArrange(scene, {
          kind: 'scene-edit',
          target: { kind: 'scene', ids: ['table'] },
          position: { y: invalid },
        })
      ).toThrow(/finite/);
      expect(() =>
        applyStudioSceneArrange(scene, {
          kind: 'scene-edit',
          target: { kind: 'scene', ids: ['table'] },
          rotation: { kind: 'absolute', radians: invalid },
        })
      ).toThrow(/finite/);
    }
    expect(() =>
      applyStudioSceneArrange(scene, {
        kind: 'scene-edit',
        target: { kind: 'scene', ids: ['table', 'books'] },
        position: { x: 8 },
        rotation: { kind: 'absolute', radians: 1 },
      })
    ).toThrow(/relative/);
    expect(scene).toEqual(before);
  });
});

describe('Arrange atomic wall candidates', () => {
  it('keeps exact unchanged diagonal line/openings without arithmetic reconstruction', () => {
    const value = draft();
    const original = value.room.walls![0]!;
    expect(
      applyStudioWallArrange(value, {
        kind: 'wall-edit',
        target: { kind: 'wall', id: 'wall' },
        midpoint: wallMidpoint(original),
        yaw: wallDirectionYaw(original),
        length: { value: wallLength(original), anchor: 'start' },
        appearance: { ...original.appearance },
      })
    ).toBe(original);
  });
  it('applies length, positive Y yaw, final requested midpoint and appearance in order', () => {
    const value = draft();
    const before = structuredClone(value);
    const original = value.room.walls![0]!;
    const next = applyStudioWallArrange(value, {
      kind: 'wall-edit',
      target: { kind: 'wall', id: 'wall' },
      length: { value: 14, anchor: 'start' },
      yaw: Math.PI / 2,
      midpoint: { x: 20, z: -3 },
      appearance: { height: 4.25, thickness: 0.45, elevation: 0.2 },
    });
    expect(wallLength(next)).toBeCloseTo(14);
    expect(wallDirectionYaw(next)).toBeCloseTo(Math.PI / 2);
    expect(wallMidpoint(next)).toEqual({ x: 20, z: -3 });
    expect(next.line.end.z).toBeLessThan(next.line.start.z);
    expect(next.appearance).toEqual({
      ...original.appearance,
      height: 4.25,
      thickness: 0.45,
      elevation: 0.2,
    });
    expect(next.openings).toEqual(original.openings);
    expect(next.blocker.footprint.width).toBeCloseTo(
      original.blocker.footprint.width + 14 - wallLength(original),
      12
    );
    expect({
      ...next.blocker,
      footprint: {
        ...next.blocker.footprint,
        width: original.blocker.footprint.width,
      },
    }).toEqual(original.blocker);
    expect(value).toEqual(before);
  });
  it('honors zero midpoint/yaw/elevation and skips same yaw during a real length edit', () => {
    const value = draft();
    const target = { kind: 'wall' as const, id: 'wall' };
    const original = value.room.walls![0]!;
    const resized = applyStudioWallArrange(value, {
      kind: 'wall-edit',
      target,
      length: { value: 14, anchor: 'start' },
    });
    expect(
      applyStudioWallArrange(value, {
        kind: 'wall-edit',
        target,
        length: { value: 14, anchor: 'start' },
        yaw: wallDirectionYaw(original),
      })
    ).toEqual(resized);
    const next = applyStudioWallArrange(value, {
      kind: 'wall-edit',
      target,
      midpoint: { x: 0, z: 0 },
      yaw: 0,
      appearance: { elevation: 0 },
    });
    // An actual rotation/translation has floating-point arithmetic; the
    // unchanged-diagonal test above intentionally requires exact identity.
    expect(wallMidpoint(next).x).toBeCloseTo(0, 12);
    expect(wallMidpoint(next).z).toBeCloseTo(0, 12);
    expect(wallDirectionYaw(next)).toBeCloseTo(0);
    expect(next.appearance.elevation).toBe(0);
  });
  it('keeps the opposite endpoint anchored and existing opening clamp behavior', () => {
    const value = draft();
    const original = value.room.walls![0]!;
    const opening = wallOpeningPoint({ wall: original, openingId: 'cut' });
    const fromStart = applyStudioWallArrange(value, {
      kind: 'wall-edit',
      target: { kind: 'wall', id: 'wall' },
      length: { value: 1, anchor: 'start' },
    });
    expect(fromStart.line.start).toEqual(original.line.start);
    expect(wallLength(fromStart)).toBeCloseTo(3.5);
    expect(
      wallOpeningPoint({ wall: fromStart, openingId: 'cut' })!.x
    ).toBeCloseTo(opening!.x, 12);
    expect(
      wallOpeningPoint({ wall: fromStart, openingId: 'cut' })!.z
    ).toBeCloseTo(opening!.z, 12);
    const fromEnd = applyStudioWallArrange(value, {
      kind: 'wall-edit',
      target: { kind: 'wall', id: 'wall' },
      length: { value: 14, anchor: 'end' },
    });
    expect(fromEnd.line.end).toEqual(original.line.end);
    expect(
      wallOpeningPoint({ wall: fromEnd, openingId: 'cut' })!.x
    ).toBeCloseTo(opening!.x);
    expect(
      wallOpeningPoint({ wall: fromEnd, openingId: 'cut' })!.z
    ).toBeCloseTo(opening!.z);
  });
  it('retains tiny midpoint/yaw/length edits rather than using epsilon or angle normalization', () => {
    const value = draft();
    const original = value.room.walls![0]!;
    const target = { kind: 'wall' as const, id: 'wall' };
    for (const patch of [
      { midpoint: { x: wallMidpoint(original).x + 1e-12 } },
      { yaw: wallDirectionYaw(original) + 1e-12 },
      {
        length: {
          value: wallLength(original) + 1e-12,
          anchor: 'start' as const,
        },
      },
    ])
      expect(
        applyStudioWallArrange(value, { kind: 'wall-edit', target, ...patch })
          .line
      ).not.toEqual(original.line);
    expect(
      applyStudioWallArrange(value, {
        kind: 'wall-edit',
        target,
        yaw: wallDirectionYaw(original) + Math.PI * 2,
      })
    ).not.toBe(original);
  });
  it('supports explicit appearance swaps without replacing blocker/opening/door data', () => {
    const value = draft();
    value.room.walls![0]!.appearance.assetRef = 'imported-unavailable';
    const target = { kind: 'wall' as const, id: 'wall' };
    expect(applyStudioWallArrange(value, { kind: 'wall-edit', target })).toBe(
      value.room.walls![0]
    );
    expect(() =>
      applyStudioWallArrange(value, {
        kind: 'wall-edit',
        target,
        appearance: { height: 4 },
      })
    ).toThrow(/unknown catalog/);
    const next = applyStudioWallArrange(value, {
      kind: 'wall-edit',
      target,
      appearance: { assetRef: WALL_ASSET, height: 4 },
    });
    expect(next.appearance.assetRef).toBe(WALL_ASSET);
    expect(next.openings).toEqual(value.room.walls![0]!.openings);
    expect(next.blocker).toEqual(value.room.walls![0]!.blocker);
  });
  it('refuses invalid late appearance/unknown target with no partial draft changes', () => {
    const value = draft();
    const before = structuredClone(value);
    const target = { kind: 'wall' as const, id: 'wall' };
    for (const appearance of [
      { height: 0 },
      { thickness: -1 },
      { elevation: NaN },
      { assetRef: 'missing' },
    ])
      expect(() =>
        applyStudioWallArrange(value, {
          kind: 'wall-edit',
          target,
          length: { value: 14, anchor: 'start' },
          yaw: 1,
          midpoint: { x: 8 },
          appearance,
        })
      ).toThrow();
    for (const patch of [
      { yaw: Infinity },
      { midpoint: { x: NaN } },
      { length: { value: 0, anchor: 'end' as const } },
    ])
      expect(() =>
        applyStudioWallArrange(value, { kind: 'wall-edit', target, ...patch })
      ).toThrow();
    expect(() =>
      applyStudioWallArrange(value, {
        kind: 'wall-edit',
        target: { kind: 'wall', id: 'gone' },
      })
    ).toThrow(/target/);
    expect(value).toEqual(before);
  });
});

describe('Arrange atomic actor/start candidates', () => {
  it('moves plus faces once while preserving identity/ref/bindings, and default deletes only facing', () => {
    const value = draft();
    const before = structuredClone(value);
    const target = { kind: 'actor' as const, id: 'start' };
    const next = applyStudioActorArrange(value, {
      kind: 'actor-start',
      target,
      location: { q: 2, r: 0 },
      facing: { kind: 'compass', value: 'ne' },
    });
    expect(next.room.monsterDeclarations[0]).toEqual({
      ...value.room.monsterDeclarations[0],
      startingCell: { location: { q: 2, r: 0 }, facing: 'ne' },
    });
    expect(next.room.monsterBindings).toBe(value.room.monsterBindings);
    const defaulted = applyStudioActorArrange(next, {
      kind: 'actor-start',
      target,
      facing: { kind: 'default' },
    });
    expect(defaulted.room.monsterDeclarations[0]!.startingCell).toEqual({
      location: { q: 2, r: 0 },
    });
    expect(
      defaulted.room.monsterDeclarations[0]!.startingCell
    ).not.toHaveProperty('facing');
    expect(
      applyStudioActorArrange(defaulted, {
        kind: 'actor-start',
        target,
        facing: { kind: 'default' },
      })
    ).toBe(defaulted);
    expect(value).toEqual(before);
  });
  it('exact same actor/default/start inputs are no-ops and actor movement alone retains facing', () => {
    const value = draft();
    const target = { kind: 'actor' as const, id: 'start' };
    expect(
      applyStudioActorArrange(value, {
        kind: 'actor-start',
        target,
        location: { q: 0, r: 0 },
        facing: { kind: 'compass', value: 'nw' },
      })
    ).toBe(value);
    expect(
      applyStudioActorArrange(value, {
        kind: 'start-position',
        target: { kind: 'start' },
        location: { q: 1, r: 0 },
      })
    ).toBe(value);
    const next = applyStudioActorArrange(value, {
      kind: 'actor-start',
      target,
      location: { q: 1, r: 0 },
    });
    expect(next.room.monsterDeclarations[0]!.startingCell.facing).toBe('nw');
    const start = applyStudioActorArrange(value, {
      kind: 'start-position',
      target: { kind: 'start' },
      location: { q: 2, r: 0 },
    });
    expect(start.room.monsterDeclarations).toBe(value.room.monsterDeclarations);
    expect(start.room.partyStart).toEqual({ q: 2, r: 0 });
  });
  it('refuses invalid compass after location without partial results, bad cells and retired identities', () => {
    const value = draft();
    const before = structuredClone(value);
    const target = { kind: 'actor' as const, id: 'start' };
    expect(() =>
      applyStudioActorArrange(value, {
        kind: 'actor-start',
        target,
        location: { q: 2, r: 0 },
        facing: { kind: 'compass', value: 'north' },
      })
    ).toThrow(/facing/);
    for (const location of [
      { q: 1.5, r: 0 },
      { q: Infinity, r: 0 },
      { q: 0, r: NaN },
      { q: 999, r: 999 },
    ]) {
      expect(() =>
        applyStudioActorArrange(value, {
          kind: 'actor-start',
          target,
          location,
        })
      ).toThrow(/integral hex/);
      expect(() =>
        applyStudioActorArrange(value, {
          kind: 'start-position',
          target: { kind: 'start' },
          location,
        })
      ).toThrow(/integral hex/);
    }
    expect(() =>
      applyStudioActorArrange(value, {
        kind: 'actor-start',
        target: { kind: 'actor', id: 'gone' },
      })
    ).toThrow(/target/);
    expect(value).toEqual(before);
    delete value.room.partyStart;
    expect(() =>
      applyStudioActorArrange(value, {
        kind: 'start-position',
        target: { kind: 'start' },
        location: { q: 0, r: 0 },
      })
    ).toThrow(/no longer exists/);
  });
});
