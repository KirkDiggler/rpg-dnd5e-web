import { describe, expect, it } from 'vitest';
import type { SiteScope } from '../world-building/siteScope';
import { setCustomItem } from './itemEdit';

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
