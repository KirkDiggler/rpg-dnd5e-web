import { describe, expect, it } from 'vitest';
import type { SiteScope } from '../world-building/siteScope';
import {
  addCustomItem,
  itemIdFrom,
  removeCustomItem,
  setCustomItem,
} from './itemEdit';

const scope = {
  unread: {
    before: { keep: 1 },
    customItems: { one: { name: 'One' }, two: { name: 'Two' } },
    after: [1, 2],
  },
} as unknown as SiteScope;

describe('setCustomItem', () => {
  it('replaces one item and keeps the other, the order and every other root key', () => {
    const next = setCustomItem(scope, 'one', { name: 'Changed' });
    expect(next.unread?.customItems).toEqual({
      one: { name: 'Changed' },
      two: { name: 'Two' },
    });
    expect(Object.keys(next.unread!.customItems as object)).toEqual([
      'one',
      'two',
    ]);
    expect(Object.keys(next.unread!)).toEqual([
      'before',
      'customItems',
      'after',
    ]);
    expect(next.unread?.before).toBe(scope.unread?.before);
    expect((scope.unread?.customItems as { one: unknown }).one).toEqual({
      name: 'One',
    });
  });

  it('throws for an id the file does not author and for a site with no items', () => {
    expect(() => setCustomItem(scope, 'nope', {})).toThrow(
      'customItems.nope: this site authors no such item'
    );
    expect(() =>
      setCustomItem({ unread: {} } as unknown as SiteScope, 'one', {})
    ).toThrow('this site authors no such item');
    expect(() => setCustomItem({} as unknown as SiteScope, 'one', {})).toThrow(
      'this site authors no such item'
    );
  });
});

describe('itemIdFrom', () => {
  it('makes an id of letters, digits and single dashes', () => {
    expect(itemIdFrom('Garrison Ring', [])).toBe('garrison-ring');
    expect(itemIdFrom("Lieutenant's cloak", [])).toBe('lieutenant-s-cloak');
    expect(itemIdFrom('  ', [])).toBe('item');
  });
  it('counts up past ids that are taken', () => {
    expect(
      itemIdFrom('Garrison ring', ['garrison-ring', 'garrison-ring-2'])
    ).toBe('garrison-ring-3');
  });
});

describe('addCustomItem', () => {
  it('appends last and keeps the other items and root keys', () => {
    const next = addCustomItem(scope, 'three', { name: 'Three' });
    expect(Object.keys(next.unread!.customItems as object)).toEqual([
      'one',
      'two',
      'three',
    ]);
    expect((next.unread!.customItems as { one: unknown }).one).toEqual({
      name: 'One',
    });
    expect(Object.keys(next.unread!)).toEqual([
      'before',
      'customItems',
      'after',
    ]);
    expect(Object.keys(scope.unread!.customItems as object)).toEqual([
      'one',
      'two',
    ]);
  });
  it('creates the key on a site with none', () => {
    const next = addCustomItem(
      { unread: { other: 1 } } as unknown as SiteScope,
      'a',
      { name: 'A' }
    );
    expect(next.unread).toEqual({
      other: 1,
      customItems: { a: { name: 'A' } },
    });
  });
  it('throws on a taken id and on items written as a list', () => {
    expect(() => addCustomItem(scope, 'one', {})).toThrow(
      'customItems.one: this site already has an item with that id'
    );
    expect(() =>
      addCustomItem(
        { unread: { customItems: [] } } as unknown as SiteScope,
        'a',
        {}
      )
    ).toThrow('customItems: is not written as a set of items');
  });
});

describe('removeCustomItem', () => {
  it('removes one item and keeps the other', () => {
    const next = removeCustomItem(scope, 'one');
    expect(next.unread?.customItems).toEqual({ two: { name: 'Two' } });
    expect(next.unread?.before).toBe(scope.unread?.before);
  });
  it('removes the key when the last item goes', () => {
    const one = {
      unread: { x: 1, customItems: { a: {} } },
    } as unknown as SiteScope;
    const next = removeCustomItem(one, 'a');
    expect(next.unread).toEqual({ x: 1 });
    expect(Object.hasOwn(next.unread!, 'customItems')).toBe(false);
  });
  it('throws for an unknown id', () => {
    expect(() => removeCustomItem(scope, 'nope')).toThrow(
      'customItems.nope: this site authors no such item'
    );
  });
});
