// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  placeRoomMonster,
  setRoomPartyStart,
  type RoomDraft,
} from '../world-building/roomDraft';
import {
  addProp,
  createEmptyScene,
  groupSelection,
} from '../world-building/sceneState';
import {
  projectStudioArrange,
  type StudioArrangeSelection,
  type StudioArrangeTarget,
} from '../world-building/studioArrange';
import { studioInspectionOf } from './studioSession';

function fixture(): RoomDraft {
  let scene = addProp(
    createEmptyScene('scene'),
    'dnd5e:props:books',
    { x: 1, y: 0, z: 1, rotationY: 0 },
    'books'
  );
  scene = addProp(
    scene,
    'dnd5e:props:candle',
    { x: 2, y: 0, z: 1, rotationY: 0 },
    'candle'
  );
  scene = addProp(
    scene,
    'dnd5e:props:barrel',
    { x: 3, y: 0, z: 1, rotationY: 0 },
    'barrel'
  );
  scene = groupSelection(scene, ['books', 'candle'], 'shelf', 'Shelf');
  scene.version = 2;
  scene.mapLabels = [{ id: 'note', text: 'Note', location: { x: 0, z: 0 } }];
  const placed = placeRoomMonster(createRoomDraft(scene, 'room'), {
    id: 'guard',
    ref: 'dnd5e:monsters:skeleton',
    startingCell: { location: { q: 0, r: 0 } },
  });
  return setRoomPartyStart(placed, { q: 1, r: 0 });
}
function inspect(target: StudioArrangeTarget | null) {
  const draft = fixture();
  return studioInspectionOf(
    projectStudioArrange({ draft, target, selectionRevision: 1 }),
    draft.scene
  );
}

describe('studioInspectionOf', () => {
  it('no target maps to nothing', () => {
    expect(inspect(null)).toEqual({
      selection: { kind: 'nothing' },
      pick: null,
    });
  });
  it('an item root maps to prop', () => {
    expect(inspect({ kind: 'scene', ids: ['barrel'] })).toEqual({
      selection: { kind: 'prop', id: 'barrel' },
      pick: null,
    });
  });
  it('a group root maps to group', () => {
    expect(inspect({ kind: 'scene', ids: ['shelf'] })).toEqual({
      selection: { kind: 'group', id: 'shelf' },
      pick: null,
    });
  });
  it('two scene roots map to a pick with nothing selected', () => {
    expect(inspect({ kind: 'scene', ids: ['shelf', 'barrel'] })).toEqual({
      selection: { kind: 'nothing' },
      pick: ['barrel', 'shelf'],
    });
  });
  it('actor maps to creature', () => {
    expect(inspect({ kind: 'actor', id: 'guard' }).selection).toEqual({
      kind: 'creature',
      id: 'guard',
    });
  });
  it('start maps to partyStart', () => {
    expect(inspect({ kind: 'start' }).selection).toEqual({
      kind: 'partyStart',
    });
  });
  it('label maps to label', () => {
    expect(inspect({ kind: 'label', id: 'note' }).selection).toEqual({
      kind: 'label',
      id: 'note',
    });
  });
  it('hex maps to hex', () => {
    expect(inspect({ kind: 'hex', cell: { q: 0, r: 1 } })).toEqual({
      selection: { kind: 'hex', cell: { q: 0, r: 1 } },
      pick: null,
    });
  });
  it('wall maps to wall and door maps to door', () => {
    const scene = fixture().scene;
    const wall = {
      kind: 'wall',
      wall: { id: 'w1' },
    } as unknown as StudioArrangeSelection;
    expect(studioInspectionOf(wall, scene).selection).toEqual({
      kind: 'wall',
      id: 'w1',
    });
    const target = {
      kind: 'door',
      wallId: 'w1',
      openingId: 'o1',
      doorId: 'd1',
    } as const;
    const door = { kind: 'door', target } as unknown as StudioArrangeSelection;
    expect(studioInspectionOf(door, scene)).toEqual({
      selection: { kind: 'door', target },
      pick: null,
    });
  });
});
