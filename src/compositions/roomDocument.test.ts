import {
  createRoomDraft,
  type RoomDraft,
  type RoomPropDeclaration,
} from '@/concepts/world-building/roomDraft';
import { createEmptyScene } from '@/concepts/world-building/sceneState';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { compositionMetadata } from './compositionMetadata';
import {
  decodeRoomDocumentJson,
  encodeRoomDocument,
  isRoomDocument,
  isRoomDocumentJson,
} from './roomDocument';

const tableDeclaration: RoomPropDeclaration = {
  blocksMovement: true,
  blocksLineOfSight: true,
  footprint: { width: 2.4, depth: 1.2, offsetX: 0.1, offsetZ: -0.05 },
};

/** One complete, valid room fixture: props with non-cardinal yaw and unequal
 * Y, nested groups, a support link, an enabled point light, an expanded
 * workspace, walkable cells, and both declaration maps. */
function richRoomDraft(): RoomDraft {
  const draft = createRoomDraft(createEmptyScene('scene-rich'), 'room-rich');
  draft.name = 'Room metadata 1090';
  draft.scene.name = 'Rich room';
  draft.workspace = { hexRadius: 14, horizontalLimit: 28 };
  draft.scene.groups = [
    {
      id: 'group-corner',
      kind: 'group',
      label: 'Reading corner',
      transform: { x: 1.5, y: 0, z: -2.5, rotationY: 0.4 },
    },
    {
      id: 'group-cluster',
      kind: 'group',
      label: 'Table cluster',
      transform: { x: 1.5, y: 0, z: -2.5, rotationY: 0.4 },
      parentId: 'group-corner',
    },
  ];
  draft.scene.items = [
    {
      id: 'prop-table',
      kind: 'prop',
      assetRef: 'dnd5e:props:torture-table',
      label: 'Long table',
      transform: { x: 1.5, y: 0.35, z: -2.5, rotationY: 0.4 },
      parentId: 'group-cluster',
      pointLight: {
        enabled: true,
        offset: { x: 0, y: 1.4, z: 0 },
        color: '#ff9d52',
        intensity: 1.1,
        range: 2.6,
      },
    },
    {
      id: 'prop-books',
      kind: 'prop',
      assetRef: 'dnd5e:props:books',
      label: 'Stacked books',
      transform: { x: 1.8, y: 0.95, z: -2.3, rotationY: -0.65 },
      parentId: 'group-cluster',
      supportId: 'prop-table',
    },
  ];
  draft.room.walkableHexes = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -2, r: 2 },
    { q: 14, r: 0 },
  ];
  draft.room.propDeclarations = {
    'prop-table': tableDeclaration,
    'prop-books': {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 0.6, depth: 0.5, offsetX: 0, offsetZ: 0 },
    },
  };
  draft.room.arrangementDeclarations = {
    'arrangement-camp': { 'prop-table': structuredClone(tableDeclaration) },
  };
  return draft;
}

describe('room snapshot document', () => {
  it('round-trips a fully populated typed room draft and opens with production metadata', () => {
    const draft = richRoomDraft();
    const json = encodeRoomDocument(draft);
    expect(isRoomDocumentJson(json)).toBe(true);
    expect(JSON.parse(json)).toMatchObject({
      kind: 'room-authoring-draft',
      version: 1,
    });
    // Both stored name fields survive the envelope untouched.
    expect(JSON.parse(json).draft.name).toBe('Room metadata 1090');
    expect(JSON.parse(json).draft.scene.name).toBe('Rich room');
    expect(decodeRoomDocumentJson(json)).toEqual(draft);

    const composition = create(CompositionSchema, {
      id: 'composition-rich',
      worldId: 'test-world',
      json,
    });
    expect(isRoomDocument(composition)).toBe(true);
    const metadata = compositionMetadata(composition);
    if (metadata.status !== 'room') {
      throw new Error(
        `Expected a room document, got status ${metadata.status}.`
      );
    }
    // Library/open labels come from the authored visible scene name.
    expect(metadata.name).toBe('Rich room');
    expect(metadata.draft).toEqual(draft);
  });

  it('recognizes unsupported room versions without classifying them as scenes', () => {
    expect(
      isRoomDocumentJson(
        JSON.stringify({ kind: 'room-authoring-draft', version: 99 })
      )
    ).toBe(true);
    expect(() =>
      decodeRoomDocumentJson(
        JSON.stringify({ kind: 'room-authoring-draft', version: 99 })
      )
    ).toThrow('Unsupported room snapshot version');
  });
});
