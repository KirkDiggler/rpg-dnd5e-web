import { describe, expect, it } from 'vitest';
import {
  propOptionSections,
  selectedSceneItems,
  selectionOptionSections,
} from './propOptionSections';
import type { RoomGameplayData } from './roomDraft';
import type { WorldScene } from './types';

/** The ONE asset the catalog declares leaves for, and a promoted env asset
 * that declares no roles at all — the same two `DoorStates.test.tsx` uses,
 * because "is this a door" is that module's own question and this rule mirrors
 * it rather than inventing a second answer. */
const DOOR_REF = 'dnd5e:env:dark-fortress:wall_door_double_01';
const PLAIN_REF = 'dnd5e:env:dark-fantasy:pillar_01';

function room(overrides: Partial<RoomGameplayData> = {}): RoomGameplayData {
  return {
    implicitRegionId: 'room-1-region',
    walkableHexes: [{ q: 0, r: 0 }],
    propDeclarations: {},
    arrangementDeclarations: {},
    monsters: [],
    ...overrides,
  };
}

function scene(items: Array<{ id: string; assetRef: string }>): WorldScene {
  return {
    version: 1,
    id: 'scene-1',
    name: 'Scene',
    items: items.map((item) => ({
      ...item,
      kind: 'prop' as const,
      label: item.id,
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      heightScale: 1,
    })),
    groups: [],
  };
}

describe('which option sections a prop earns (web#1178)', () => {
  it('a declared plain prop gets orders and no door state', () => {
    const sections = propOptionSections(
      { id: 'scroll', assetRef: PLAIN_REF },
      room({
        propDeclarations: {
          scroll: {
            blocksMovement: false,
            blocksLineOfSight: false,
            footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
          },
        },
      })
    );
    expect(sections).toEqual({ door: false, orders: true, single: true });
  });

  it('an UNDECLARED prop gets neither — it has no footprint to bind', () => {
    // `holdable` hangs off a declaration the engine requires, so the panel must
    // not offer orders for a prop that has none: the refusal would be the
    // server's, and the author would have no way to know why.
    const sections = propOptionSections(
      { id: 'books', assetRef: PLAIN_REF },
      room()
    );
    expect(sections).toEqual({ door: false, orders: false, single: true });
  });

  it('a door ASSET gets door state even before any binding exists', () => {
    const sections = propOptionSections(
      { id: 'gate', assetRef: DOOR_REF },
      room()
    );
    expect(sections.door).toBe(true);
    expect(sections.orders).toBe(false);
  });

  it('an authored door stays a door whatever its asset is', () => {
    // The `DoorStates` rule: a binding the author wrote must never stop being a
    // door because the asset's roles changed underneath it.
    const sections = propOptionSections(
      { id: 'old-gate', assetRef: PLAIN_REF },
      room({ doorBindings: { 'old-gate': { closed: true } } })
    );
    expect(sections.door).toBe(true);
  });

  it('a door never offers orders — the engine refuses a door somebody picks up', () => {
    const sections = propOptionSections(
      { id: 'gate', assetRef: DOOR_REF },
      room({
        propDeclarations: {
          gate: {
            blocksMovement: true,
            blocksLineOfSight: true,
            footprint: { width: 1, depth: 0.2, offsetX: 0, offsetZ: 0 },
          },
        },
      })
    );
    // Declared AND a door: door state yes, orders no. That combination is the
    // engine's refusal, mirrored so the panel cannot offer it.
    expect(sections).toEqual({ door: true, orders: false, single: true });
  });

  it('a multi-selection shows no per-prop section, and says why', () => {
    const items = [
      { id: 'a', assetRef: DOOR_REF },
      { id: 'b', assetRef: PLAIN_REF },
    ];
    const sections = selectionOptionSections(
      items,
      room({
        propDeclarations: {
          a: {
            blocksMovement: true,
            blocksLineOfSight: true,
            footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
          },
          b: {
            blocksMovement: false,
            blocksLineOfSight: false,
            footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
          },
        },
      })
    );
    // Neither section appears even though BOTH props individually earn one:
    // one control cannot mean three props' values.
    expect(sections).toEqual({
      door: false,
      orders: false,
      single: false,
      reason: 'multi-select',
    });
  });

  it('one selected prop is that prop’s sections; none selected is nothing', () => {
    const declared = room({
      propDeclarations: {
        scroll: {
          blocksMovement: false,
          blocksLineOfSight: false,
          footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
        },
      },
    });
    expect(
      selectionOptionSections([{ id: 'scroll', assetRef: PLAIN_REF }], declared)
    ).toEqual({ door: false, orders: true, single: true });
    expect(selectionOptionSections([], declared)).toEqual({
      door: false,
      orders: false,
      single: false,
    });
  });

  it('resolves the selected scene items in scene order, ignoring stale ids', () => {
    const world = scene([
      { id: 'b', assetRef: PLAIN_REF },
      { id: 'a', assetRef: DOOR_REF },
    ]);
    expect(selectedSceneItems(world, ['a', 'b'])).toEqual([
      { id: 'b', assetRef: PLAIN_REF },
      { id: 'a', assetRef: DOOR_REF },
    ]);
    // An id that is no longer in the scene is simply not one of the items.
    expect(selectedSceneItems(world, ['a', 'gone'])).toEqual([
      { id: 'a', assetRef: DOOR_REF },
    ]);
  });
});
