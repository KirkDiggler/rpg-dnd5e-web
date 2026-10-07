import { create } from '@bufbuild/protobuf';
import { DeclarationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  hotbarColumns,
  hotbarPage,
  hotbarRows,
  moveHotbarOffer,
  orderHotbarOffers,
} from './desktopHotbarLayout';

describe('desktop hotbar layout', () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [4, 4],
    [5, 4],
    [2.9, 2],
    [NaN, 1],
    [Infinity, 1],
  ])('bounds row value %s to %s', (input, expected) => {
    expect(hotbarRows(input)).toBe(expected);
  });
  it.each([
    [0, 1],
    [35, 1],
    [36, 1],
    [75, 1],
    [76, 2],
    [116, 3],
  ])('measures %s pixels as %s columns', (width, expected) => {
    expect(hotbarColumns(width)).toBe(expected);
  });
  it('orders only current section members, ignores duplicate/unknown hints, and appends new members', () => {
    const offers = ['a', 'b', 'c'].map((id) =>
      create(DeclarationSchema, { id, available: id !== 'b' })
    );
    const result = orderHotbarOffers(offers, ['b', 'b', 'withdrawn', 'a']);
    expect(result.map((offer) => offer.id)).toEqual(['b', 'a', 'c']);
    expect(result[0]).toBe(offers[1]);
    expect(result[0]!.available).toBe(false);
    expect(orderHotbarOffers([], ['b'])).toEqual([]);
  });
  it('moves to a current slot, never pulls a foreign or withdrawn action into a section', () => {
    expect(moveHotbarOffer(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(moveHotbarOffer(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(moveHotbarOffer(['a', 'b'], 'foreign', 'a')).toEqual(['a', 'b']);
    expect(moveHotbarOffer(['a', 'b'], 'a', 'withdrawn')).toEqual(['a', 'b']);
    expect(moveHotbarOffer(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });
  it('bounds independent pages after changes in membership or capacity', () => {
    expect(hotbarPage(12, 4, 1, 2)).toEqual({
      page: 2,
      pages: 3,
      capacity: 4,
      start: 8,
    });
    expect(hotbarPage(12, 4, 4, 2)).toEqual({
      page: 0,
      pages: 1,
      capacity: 16,
      start: 0,
    });
    expect(hotbarPage(5, 4, 1, 2)).toEqual({
      page: 1,
      pages: 2,
      capacity: 4,
      start: 4,
    });
    expect(hotbarPage(0, 0, 1, -1)).toEqual({
      page: 0,
      pages: 1,
      capacity: 1,
      start: 0,
    });
  });
});
