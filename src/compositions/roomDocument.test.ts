import {
  createRoomDraft,
  stringifyRoomDraft,
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
      heightScale: 1.8,
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
      version: 2,
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

  it('refuses an oversized encoded envelope before it can be sent', () => {
    const draft = richRoomDraft();
    draft.name = 'x'.repeat(500_000);
    expect(() => encodeRoomDocument(draft)).toThrow(
      'Room draft is too large (maximum 500000 characters).'
    );
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

  /** Hand-written historical envelope: version 1 carrying a draft version
   * 2 — fractional/negative poses, nested group/support, an explicit light,
   * nondefault height, false flags, and complete declaration shapes. */
  function legacyV1RoomDocument(): string {
    return JSON.stringify({
      kind: 'room-authoring-draft',
      version: 1,
      draft: {
        version: 2,
        id: 'legacy-room',
        name: 'Legacy cellar',
        coordinateFrame: {
          horizontalPlane: 'world-xz',
          verticalAxis: 'world-y-up',
          distanceUnit: 'world-scene-unit',
          hexRadius: 1,
          footprintFrame: 'owner-local-xz',
        },
        workspace: { hexRadius: 10, horizontalLimit: 20 },
        scene: {
          version: 1,
          id: 'legacy-scene',
          name: 'Legacy cellar scene',
          items: [
            {
              id: 'prop-table',
              kind: 'prop',
              assetRef: 'dnd5e:props:torture-table',
              label: 'Long table',
              transform: { x: -2.25, y: 1.2, z: 1.3, rotationY: 0.37 },
              heightScale: 1.5,
            },
            {
              id: 'prop-candles',
              kind: 'prop',
              assetRef: 'dnd5e:props:candles',
              label: 'Candles',
              transform: { x: -2.1, y: 1.17, z: 1.25, rotationY: -0.41 },
              parentId: 'group-1',
              supportId: 'prop-table',
              pointLight: {
                enabled: true,
                offset: { x: 0, y: 0.5, z: 0 },
                color: '#ff9d52',
                intensity: 1.1,
                range: 2.6,
              },
            },
          ],
          groups: [
            {
              id: 'group-1',
              kind: 'group',
              label: 'Cluster',
              transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
            },
          ],
        },
        room: {
          implicitRegionId: 'legacy-room-region',
          walkableHexes: [
            { q: 0, r: 0 },
            { q: 2, r: -1 },
            { q: -3, r: 1 },
          ],
          propDeclarations: {
            'prop-table': {
              blocksMovement: true,
              blocksLineOfSight: false,
              footprint: {
                width: 1.2,
                depth: 0.5,
                offsetX: 0.1,
                offsetZ: -0.2,
              },
            },
          },
          arrangementDeclarations: {
            'arrangement-1': {
              'prop-table': {
                blocksMovement: false,
                blocksLineOfSight: false,
                footprint: {
                  width: 0.6,
                  depth: 0.5,
                  offsetX: 0,
                  offsetZ: 0,
                },
              },
            },
          },
        },
      },
    });
  }

  it('upgrades only the historically written envelope 1 / draft 2 combination', () => {
    const legacyRaw = legacyV1RoomDocument();
    const migrated = decodeRoomDocumentJson(legacyRaw);

    expect(migrated.version).toBe(3);
    expect(migrated.id).toBe('legacy-room');
    expect(migrated.scene.name).toBe('Legacy cellar scene');
    expect(migrated.scene.items[0]?.transform).toEqual({
      x: -2.25,
      y: 1.2,
      z: 1.3,
      rotationY: 0.37,
    });
    expect(migrated.room.walkableHexes).toContainEqual({ q: -3, r: 1 });
    expect(migrated.room.propDeclarations['prop-table']).toEqual({
      blocksMovement: true,
      blocksLineOfSight: false,
      footprint: { width: 1.2, depth: 0.5, offsetX: 0.1, offsetZ: -0.2 },
    });
    // Lossless upgrade: no monsters are invented and no start appears.
    expect(migrated.room.monsterDeclarations).toEqual([]);
    expect('partyStart' in migrated.room).toBe(false);
  });

  it('retains authored actors through the version 2 snapshot round trip', () => {
    const draft = richRoomDraft();
    draft.room.partyStart = { q: 1, r: -1 };
    draft.room.monsterDeclarations = [
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        startingCell: { location: { q: 2, r: -1 } },
      },
      // A syntactically valid unknown monster id stays retainable.
      {
        id: 'not-yet-modeled',
        ref: 'dnd5e:monsters:unknown-thing',
        startingCell: { location: { q: -2, r: 1 } },
      },
    ];
    const json = encodeRoomDocument(draft);
    expect(JSON.parse(json).version).toBe(2);
    expect(decodeRoomDocumentJson(json)).toEqual(draft);
  });

  it('refuses mismatched, invalid and newer envelope/draft combinations', () => {
    const draft = richRoomDraft();
    const canonical = JSON.parse(stringifyRoomDraft(draft)) as {
      draft: Record<string, unknown>;
    };
    for (const { envelope, draftVersion } of [
      { envelope: 1, draftVersion: 1 },
      { envelope: 1, draftVersion: 3 },
      { envelope: 2, draftVersion: 1 },
      { envelope: 2, draftVersion: 2 },
      { envelope: 3, draftVersion: 3 },
    ]) {
      const draftBody = structuredClone(canonical.draft);
      if (draftVersion === 1) {
        draftBody.version = 1;
        delete draftBody.workspace;
        const room = draftBody.room as Record<string, unknown>;
        delete room.monsterDeclarations;
        delete room.partyStart;
      } else {
        draftBody.version = draftVersion;
      }
      expect(() =>
        decodeRoomDocumentJson(
          JSON.stringify({
            kind: 'room-authoring-draft',
            version: envelope,
            draft: draftBody,
          })
        )
      ).toThrow(
        /Expected a version .* room draft in a version .* room snapshot|Unsupported room snapshot version/
      );
    }
  });
});
