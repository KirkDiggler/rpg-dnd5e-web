// @vitest-environment node
/**
 * roomSceneJson tests — the strict decode boundary for the atlas's
 * optional canonical room presentation. The contract under test:
 *
 * - undefined and the empty string mean ABSENT (proto3 default/legacy
 *   atlas) — the one case that answers null;
 * - any PRESENT nonempty payload either decodes to the exact structural
 *   shape (doubles, empty arrays, optional values preserved) or refuses
 *   by name — whitespace, JSON null, malformed JSON, unsupported
 *   version/frame/workspace and malformed scene graphs all fail closed,
 *   never into a legacy fallback;
 * - the source input is never mutated and the decode never widens the
 *   scene contract beyond the existing World Building scene validator.
 */
import { describe, expect, it } from 'vitest';
import { decodeRoomSceneJSON } from './roomSceneJson';

const validPresentation = {
  version: 1,
  coordinateFrame: {
    horizontalPlane: 'world-xz',
    verticalAxis: 'world-y-up',
    distanceUnit: 'world-scene-unit',
    hexRadius: 1,
    footprintFrame: 'owner-local-xz',
  },
  workspace: { hexRadius: 6, horizontalLimit: 12 },
  scene: {
    version: 1,
    id: 'scene-1',
    name: 'Workshop',
    items: [
      {
        id: 'table',
        kind: 'prop',
        assetRef: 'dnd5e:props:torture-table',
        label: 'Table',
        transform: { x: -2.25, y: 0, z: 1.3, rotationY: 0.37 },
        heightScale: 1.5,
        parentId: 'furniture',
      },
      {
        id: 'candles',
        kind: 'prop',
        assetRef: 'dnd5e:props:candles',
        label: 'Candles',
        transform: { x: -2.1, y: 1.2, z: 1.25, rotationY: 0.37 },
        parentId: 'furniture',
        supportId: 'table',
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
        id: 'furniture',
        kind: 'group',
        label: 'Furniture',
        transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
      },
    ],
  },
};

const presentationWith = (overrides: {
  [key: string]: unknown;
}): Record<string, unknown> => ({
  ...validPresentation,
  ...overrides,
});

describe('decodeRoomSceneJSON', () => {
  it('answers null for undefined and the empty string — absent/legacy', () => {
    expect(decodeRoomSceneJSON(undefined)).toBeNull();
    expect(decodeRoomSceneJSON('')).toBeNull();
  });

  it('decodes a full presentation to the exact graph, poses, light and workspace', () => {
    const decoded = decodeRoomSceneJSON(JSON.stringify(validPresentation));
    expect(decoded).not.toBeNull();
    expect(decoded!.version).toBe(1);
    expect(decoded!.coordinateFrame).toEqual({
      horizontalPlane: 'world-xz',
      verticalAxis: 'world-y-up',
      distanceUnit: 'world-scene-unit',
      hexRadius: 1,
      footprintFrame: 'owner-local-xz',
    });
    expect(decoded!.workspace).toEqual({ hexRadius: 6, horizontalLimit: 12 });
    expect(decoded!.scene.version).toBe(1);
    expect(decoded!.scene.id).toBe('scene-1');
    expect(decoded!.scene.name).toBe('Workshop');
    const [table, candles] = decoded!.scene.items;
    expect(table!.transform).toEqual({
      x: -2.25,
      y: 0,
      z: 1.3,
      rotationY: 0.37,
    });
    expect(table!.heightScale).toBe(1.5);
    expect(table!.parentId).toBe('furniture');
    expect(candles!.transform).toEqual({
      x: -2.1,
      y: 1.2,
      z: 1.25,
      rotationY: 0.37,
    });
    expect(candles!.supportId).toBe('table');
    expect(candles!.pointLight).toEqual({
      enabled: true,
      offset: { x: 0, y: 0.5, z: 0 },
      color: '#ff9d52',
      intensity: 1.1,
      range: 2.6,
    });
    expect(decoded!.scene.groups).toHaveLength(1);
    expect(decoded!.scene.groups[0]).toEqual({
      id: 'furniture',
      kind: 'group',
      label: 'Furniture',
      transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
      parentId: undefined,
    });
  });

  it('preserves empty arrays and absent optional values as absent', () => {
    const decoded = decodeRoomSceneJSON(
      JSON.stringify(
        presentationWith({
          scene: {
            version: 1,
            id: 'scene-1',
            name: 'Workshop',
            items: [],
            groups: [],
          },
        })
      )
    );
    expect(decoded!.scene.items).toEqual([]);
    expect(decoded!.scene.groups).toEqual([]);
    // heightScale is genuinely OPTIONAL: absent stays absent (no invented
    // default key), while relation fields keep their declared undefined.
    const bare = decodeRoomSceneJSON(
      JSON.stringify({
        ...validPresentation,
        scene: {
          version: 1,
          id: 'scene-1',
          name: 'Workshop',
          items: [
            {
              id: 'table',
              kind: 'prop',
              assetRef: 'dnd5e:props:torture-table',
              label: 'Table',
              transform: { x: 0, y: 0, z: 0, rotationY: 0 },
            },
          ],
          groups: [],
        },
      })
    );
    const bareItem = bare!.scene.items[0]!;
    expect(Object.hasOwn(bareItem, 'heightScale')).toBe(false);
    expect(bareItem.parentId).toBeUndefined();
    expect(bareItem.supportId).toBeUndefined();
  });

  it('refuses objects at the string wire boundary and returns independent decoded graphs', () => {
    expect(() => decodeRoomSceneJSON(validPresentation)).toThrow(/JSON string/);
    const source = JSON.stringify(validPresentation);
    const decoded = decodeRoomSceneJSON(source);
    const independent = decodeRoomSceneJSON(source);
    const before = structuredClone(independent);
    expect(decoded).not.toBeNull();
    // Mutating one decoded output cannot change another read of the payload.
    decoded!.scene.items.push({
      id: 'extra',
      kind: 'prop',
      assetRef: 'dnd5e:props:candles',
      label: 'Extra',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    } as never);
    expect(independent).toEqual(before);
  });

  it('refuses an unsupported version, frame, workspace and unknown root fields', () => {
    expect(() =>
      decodeRoomSceneJSON(JSON.stringify(presentationWith({ version: 2 })))
    ).toThrow(/version must be 1/);
    expect(() =>
      decodeRoomSceneJSON(
        JSON.stringify(
          presentationWith({
            coordinateFrame: {
              horizontalPlane: 'world-xz',
              verticalAxis: 'world-y-up',
              distanceUnit: 'world-scene-unit',
              hexRadius: 0.5,
              footprintFrame: 'owner-local-xz',
            },
          })
        )
      )
    ).toThrow(/Unsupported room scene coordinate frame/);
    expect(() =>
      decodeRoomSceneJSON(
        JSON.stringify(
          presentationWith({ workspace: { hexRadius: 9, horizontalLimit: 18 } })
        )
      )
    ).toThrow(/Unsupported room scene workspace extent/);
    expect(() =>
      decodeRoomSceneJSON(JSON.stringify(presentationWith({ monsters: [] })))
    ).toThrow(/unsupported field: monsters/);
  });

  it('refuses malformed scene graphs at the declared workspace limit', () => {
    expect(() =>
      decodeRoomSceneJSON(
        JSON.stringify(
          presentationWith({
            scene: {
              ...validPresentation.scene,
              items: [
                {
                  id: 'table',
                  kind: 'prop',
                  assetRef: 'dnd5e:props:torture-table',
                  label: 'Table',
                  transform: { x: 13, y: 0, z: 0, rotationY: 0 },
                },
              ],
            },
          })
        )
      )
    ).toThrow(/must be a finite number/);
    expect(() =>
      decodeRoomSceneJSON(
        JSON.stringify(
          presentationWith({
            scene: {
              ...validPresentation.scene,
              items: [
                {
                  id: 'ghost',
                  kind: 'prop',
                  assetRef: 'dnd5e:props:not-a-real-prop',
                  label: 'Ghost',
                  transform: { x: 0, y: 0, z: 0, rotationY: 0 },
                },
              ],
            },
          })
        )
      )
    ).toThrow(/not in the local prop catalog/);
  });

  it('fails closed on whitespace, JSON null, malformed JSON and non-string payloads', () => {
    expect(() => decodeRoomSceneJSON('   ')).toThrow(/could not be parsed/);
    expect(() => decodeRoomSceneJSON('null')).toThrow(
      /Room scene presentation must be an object/
    );
    expect(() => decodeRoomSceneJSON('{')).toThrow(/could not be parsed/);
    expect(() => decodeRoomSceneJSON(null)).toThrow(
      /must be a JSON string or absent/
    );
    expect(() => decodeRoomSceneJSON(42)).toThrow(
      /must be a JSON string or absent/
    );
    expect(() => decodeRoomSceneJSON(['version'])).toThrow(
      /must be a JSON string or absent/
    );
  });
});
