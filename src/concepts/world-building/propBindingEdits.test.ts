import { describe, expect, it } from 'vitest';
import {
  addPropHold,
  normalizePropBinding,
  propBindingCandidateIds,
  removePropHold,
  setPropArrives,
  setPropHoldable,
  withPropBinding,
} from './propBindingEdits';

const items = [{ id: 'heirloom' }, { id: 'scroll' }, { id: 'vault-door' }];
const declared = new Set(['heirloom', 'scroll', 'vault-door']);
const doors = new Set(['vault-door']);

describe('a placed prop’s orders (rpg-project#488 R1, rpg-toolkit#1855)', () => {
  it('drops an empty holds and an empty block — the encoder refuses both', () => {
    expect(normalizePropBinding({ holds: [] })).toBeUndefined();
    expect(normalizePropBinding({})).toBeUndefined();
    // `holdable: false` is normalized away rather than written: the engine's
    // field is a plain bool, and an absent key is what "nobody declared it
    // holdable" means.
    expect(normalizePropBinding({ holdable: false })).toBeUndefined();
    expect(normalizePropBinding({ holdable: true })).toEqual({
      holdable: true,
    });
  });

  it('offers only declared, non-door props — plus anything already bound', () => {
    // A door may not carry orders ("a door somebody picks up"), and an
    // undeclared prop has no footprint to bind.
    expect(propBindingCandidateIds(items, undefined, declared, doors)).toEqual([
      'heirloom',
      'scroll',
    ]);
    // An authored binding stays listed whatever else changed, so a block can
    // never become unreachable.
    expect(
      propBindingCandidateIds(
        items,
        { 'vault-door': { holdable: true } },
        declared,
        doors
      )
    ).toEqual(['heirloom', 'scroll', 'vault-door']);
    expect(
      propBindingCandidateIds(items, undefined, new Set(['scroll']), doors)
    ).toEqual(['scroll']);
  });

  it('sets holdable on and off, deleting the block when nothing is left', () => {
    const binding = setPropHoldable(undefined, true);
    expect(binding).toEqual({ holdable: true });
    // Turning it back off leaves an empty block, which is absence.
    expect(setPropHoldable(binding, false)).toBeUndefined();
  });

  it('adds and removes carried records without duplicating one', () => {
    let binding = addPropHold(undefined, 'wisemans-letter');
    binding = addPropHold(binding, 'hall-notes');
    expect(binding?.holds).toEqual(['wisemans-letter', 'hall-notes']);
    expect(addPropHold(binding, 'wisemans-letter')).toBe(binding);
    binding = removePropHold(binding, 'wisemans-letter');
    expect(binding?.holds).toEqual(['hall-notes']);
    // The last one goes: the key is deleted, not written as an empty list.
    expect(removePropHold(binding, 'hall-notes')).toBeUndefined();
  });

  it('sets and clears an arrival, keeping what else the block said', () => {
    const withOrders = { holdable: true, holds: ['wisemans-letter'] };
    const arriving = setPropArrives(withOrders, { round: 6 });
    expect(arriving).toEqual({ ...withOrders, arrives: { round: 6 } });
    expect(setPropArrives(arriving, undefined)).toEqual(withOrders);
  });

  it('deletes the map entry when a prop is emptied, and the map when it empties', () => {
    const one = withPropBinding(undefined, 'heirloom', { holdable: true });
    expect(one).toEqual({ heirloom: { holdable: true } });
    const two = withPropBinding(one, 'scroll', { holds: ['hall-notes'] });
    expect(Object.keys(two ?? {})).toEqual(['heirloom', 'scroll']);
    // Emptied back to nothing: the entry goes, and the last entry takes the
    // map with it so the document omits the key entirely.
    const reverted = withPropBinding(two, 'heirloom', undefined);
    expect(Object.keys(reverted ?? {})).toEqual(['scroll']);
    expect(withPropBinding(reverted, 'scroll', undefined)).toBeUndefined();
  });
});
