/**
 * The door-state editor's own laws, and the one place it is NOT
 * `monsterOrderEdits`: emptying a door is a state, never a deletion.
 */
import { describe, expect, it } from 'vitest';
import {
  addDoorApproach,
  defaultDoorApproach,
  doorBindingState,
  doorCandidateIds,
  isDoorAsset,
  normalizeDoorBinding,
  patchDoorApproach,
  removeDoorApproach,
  setDoorBindingState,
  withDoorBinding,
} from './doorBindingEdits';
import type { RoomDoorBinding } from './roomDraft';

/** The one asset the catalog declares leaves for. */
const DOUBLE_DOOR = 'dnd5e:env:dark-fortress:wall_door_double_01';
/** A promoted env asset that declares no roles at all. */
const PILLAR = 'dnd5e:env:dark-fantasy:pillar_01';

describe('normalizeDoorBinding — what the engine cannot read is dropped', () => {
  it('keeps an EMPTY binding, because an empty binding is a door at rest open', () => {
    // The whole file turns on this: `closed: false` is not writable (the
    // engine's `Closed` is omitempty), so `{}` is the only way to say "a door,
    // open". Answering `undefined` here would turn every unlocked door in a
    // published site into a wall.
    expect(normalizeDoorBinding({})).toEqual({});
    expect(normalizeDoorBinding({ closed: false })).toEqual({});
  });

  it('drops an empty approach list rather than writing the lock the engine refuses', () => {
    expect(normalizeDoorBinding({ locked: [] })).toEqual({});
  });

  it('drops an empty tool and keeps a named one', () => {
    expect(
      normalizeDoorBinding({ locked: [{ ability: 'dex', dc: 12, tool: '' }] })
    ).toEqual({ locked: [{ ability: 'dex', dc: 12 }] });
    expect(
      normalizeDoorBinding({
        locked: [{ ability: 'dex', dc: 15, tool: 'dnd5e:item:thieves-tools' }],
      })
    ).toEqual({
      locked: [{ ability: 'dex', dc: 15, tool: 'dnd5e:item:thieves-tools' }],
    });
  });

  it('carries an ability or a DC this module would rather not see', () => {
    // CARRIED, NOT GRADED. The engine refuses these at their own paths with
    // its own sentences ("the approach does not say which ability it rolls",
    // "an approach with dc 0 has nothing to beat"). Normalizing them away
    // here would be a second grammar, and dropping the key would turn a named
    // refusal into an unnamed one.
    expect(normalizeDoorBinding({ locked: [{ ability: '', dc: 0 }] })).toEqual({
      locked: [{ ability: '', dc: 0 }],
    });
  });

  it('keeps closed true and keeps the authored order of the approaches', () => {
    expect(
      normalizeDoorBinding({
        closed: true,
        locked: [
          { ability: 'str', dc: 20 },
          { ability: 'dex', dc: 12 },
        ],
      })
    ).toEqual({
      closed: true,
      locked: [
        { ability: 'str', dc: 20 },
        { ability: 'dex', dc: 12 },
      ],
    });
  });
});

describe('withDoorBinding — the map, and the only deletion', () => {
  it('writes an entry for an empty binding instead of deleting one', () => {
    expect(withDoorBinding(undefined, 'gate', {})).toEqual({ gate: {} });
  });

  it('deletes only on an explicit undefined, and omits the emptied map', () => {
    const bindings = withDoorBinding(undefined, 'gate', { closed: true });
    expect(withDoorBinding(bindings, 'gate', undefined)).toBeUndefined();
  });

  it('leaves the other doors alone', () => {
    const bindings = withDoorBinding({ west: {} }, 'east', { closed: true });
    expect(bindings).toEqual({ west: {}, east: { closed: true } });
  });
});

describe('doorBindingState — the engine four states, one option each', () => {
  it('reads absence as not a door, and an empty binding as open', () => {
    expect(doorBindingState(undefined)).toBe('none');
    expect(doorBindingState({})).toBe('open');
    expect(doorBindingState({ closed: true })).toBe('closed');
  });

  it('reports locked however closed reads, because locked outranks it', () => {
    const binding: RoomDoorBinding = {
      closed: true,
      locked: [{ ability: 'str', dc: 20 }],
    };
    expect(doorBindingState(binding)).toBe('locked');
  });

  it('writes the three authored states and deletes on none', () => {
    expect(setDoorBindingState(undefined, 'none')).toBeUndefined();
    expect(setDoorBindingState(undefined, 'open')).toEqual({});
    expect(setDoorBindingState(undefined, 'closed')).toEqual({ closed: true });
    expect(setDoorBindingState(undefined, 'locked')).toEqual({
      locked: [defaultDoorApproach()],
    });
  });

  it('drops closed when locking, because the engine ignores it there', () => {
    // Publishing a key the engine reads as nothing is a lie in the document;
    // the v2 door inspector drops it the same way.
    expect(setDoorBindingState({ closed: true }, 'locked')).toEqual({
      locked: [defaultDoorApproach()],
    });
  });

  it('carries the approaches the author typed through a round of the control', () => {
    const authored: RoomDoorBinding = {
      locked: [{ ability: 'perception', dc: 18, tool: 'dnd5e:item:crowbar' }],
    };
    expect(setDoorBindingState(authored, 'closed')).toEqual({ closed: true });
    // Back to locked: the rows the author wrote are still there.
    const relocked = setDoorBindingState(authored, 'locked');
    expect(relocked).toEqual(authored);
  });
});

describe('the approach rows', () => {
  it('appends a row from the engine’s own example', () => {
    const binding = addDoorApproach({});
    expect(binding).toEqual({ locked: [{ ability: 'str', dc: 15 }] });
    expect(addDoorApproach(binding).locked).toHaveLength(2);
  });

  it('patches one field without disturbing the others', () => {
    const binding: RoomDoorBinding = { locked: [{ ability: 'str', dc: 15 }] };
    expect(patchDoorApproach(binding, 0, { ability: 'athletics' })).toEqual({
      locked: [{ ability: 'athletics', dc: 15 }],
    });
    expect(
      patchDoorApproach(binding, 0, { tool: 'dnd5e:item:crowbar' })
    ).toEqual({
      locked: [{ ability: 'str', dc: 15, tool: 'dnd5e:item:crowbar' }],
    });
  });

  it('clears the tool when the patch says undefined', () => {
    const binding: RoomDoorBinding = {
      locked: [{ ability: 'str', dc: 15, tool: 'dnd5e:item:crowbar' }],
    };
    expect(patchDoorApproach(binding, 0, { tool: undefined })).toEqual({
      locked: [{ ability: 'str', dc: 15 }],
    });
  });

  it('returns the binding unchanged for an index that is not there', () => {
    const binding: RoomDoorBinding = { locked: [{ ability: 'str', dc: 15 }] };
    expect(patchDoorApproach(binding, 4, { dc: 30 })).toEqual(binding);
    expect(removeDoorApproach(binding, 4)).toEqual(binding);
  });

  it('removing the last approach removes the LOCK, not the door', () => {
    // THE PLACE THIS FILE IS NOT `monsterOrderEdits`. There, emptying the last
    // weapon deletes the binding, because the creature exists without it. A
    // door does not: the binding IS the door, so the door has to survive its
    // own lock coming off.
    const locked: RoomDoorBinding = { locked: [{ ability: 'str', dc: 15 }] };
    const unlocked = removeDoorApproach(locked, 0);
    expect(unlocked).toEqual({});
    expect(doorBindingState(unlocked)).toBe('open');
  });

  it('removing one of several keeps the rest in order', () => {
    const binding: RoomDoorBinding = {
      locked: [
        { ability: 'str', dc: 20 },
        { ability: 'dex', dc: 12 },
      ],
    };
    expect(removeDoorApproach(binding, 0)).toEqual({
      locked: [{ ability: 'dex', dc: 12 }],
    });
  });
});

describe('which placed items the panel offers', () => {
  it('knows a door asset by its leaf and a plain prop by its absence', () => {
    expect(isDoorAsset(DOUBLE_DOOR)).toBe(true);
    expect(isDoorAsset(PILLAR)).toBe(false);
    // An exact ref the catalog does not carry is not a door — and is not a
    // throw, because a stale ref is a diagnostic the renderer already reports.
    expect(isDoorAsset('dnd5e:env:nope:not_here')).toBe(false);
  });

  it('offers door assets, and an authored door whatever its asset says', () => {
    const items = [
      { id: 'gate', assetRef: DOUBLE_DOOR },
      { id: 'pillar', assetRef: PILLAR },
      { id: 'switch', assetRef: PILLAR },
    ];
    expect(doorCandidateIds(items, undefined)).toEqual(['gate']);
    // A binding on an asset that declares no leaf is still the author's, so it
    // stays visible and removable rather than being published invisibly.
    expect(doorCandidateIds(items, { switch: { closed: true } })).toEqual([
      'gate',
      'switch',
    ]);
  });

  it('offers nothing when the scene holds nothing a door could be', () => {
    expect(
      doorCandidateIds([{ id: 'pillar', assetRef: PILLAR }], undefined)
    ).toEqual([]);
  });
});
