import { describe, expect, it } from 'vitest';
import type { SiteScope } from '../world-building/siteScope';
import { setStatus } from './statusEdit';

const scope = {
  unread: {
    before: { keep: 1 },
    statuses: { one: { name: 'One' }, two: { name: 'Two' } },
    after: [1, 2],
  },
} as unknown as SiteScope;

describe('setStatus', () => {
  // catches: siblings dropped, order lost, another root key rewritten
  it('replaces one status and keeps the other, the order and every other root key', () => {
    const next = setStatus(scope, 'one', { name: 'Changed' });
    expect(next.unread?.statuses).toEqual({
      one: { name: 'Changed' },
      two: { name: 'Two' },
    });
    expect(Object.keys(next.unread!.statuses as object)).toEqual([
      'one',
      'two',
    ]);
    expect(Object.keys(next.unread!)).toEqual(['before', 'statuses', 'after']);
    expect(next.unread?.before).toBe(scope.unread?.before);
    expect(next.unread?.after).toBe(scope.unread?.after);
    // the scope it was given is not changed
    expect((scope.unread?.statuses as { one: unknown }).one).toEqual({
      name: 'One',
    });
  });

  // catches: an edit that invents a status the file does not author
  it('throws for an id the file does not author', () => {
    expect(() => setStatus(scope, 'nope', {})).toThrow(
      'statuses.nope: this site authors no such status'
    );
  });

  // catches: writing into a statuses key that is text or a list
  it('throws when statuses is not a mapping', () => {
    for (const statuses of ['welcomed', ['one'], null, undefined])
      expect(() =>
        setStatus({ unread: { statuses } } as unknown as SiteScope, 'one', {})
      ).toThrow('statuses: is not written as a set of statuses');
    expect(() => setStatus({} as unknown as SiteScope, 'one', {})).toThrow(
      'statuses: is not written as a set of statuses'
    );
  });

  // catches: replacing a status written as text with a block
  it('throws when the status is not written as a block', () => {
    for (const written of ['stunned', ['x'], null, 3])
      expect(() =>
        setStatus(
          { unread: { statuses: { one: written } } } as unknown as SiteScope,
          'one',
          {}
        )
      ).toThrow('statuses.one: is not written as a set of words');
  });
});
