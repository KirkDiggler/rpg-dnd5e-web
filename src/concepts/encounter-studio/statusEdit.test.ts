import { describe, expect, it } from 'vitest';
import type { SiteScope } from '../world-building/siteScope';
import { addStatus, removeStatus, setStatus, statusIdFrom } from './statusEdit';

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

describe('addStatus', () => {
  // catches: a new status put first, or siblings and other root keys dropped
  it('appends last and keeps the others and every other root key', () => {
    const next = addStatus(scope, 'three', { name: 'Three' });
    expect(Object.keys(next.unread!.statuses as object)).toEqual([
      'one',
      'two',
      'three',
    ]);
    expect(Object.keys(next.unread!)).toEqual(['before', 'statuses', 'after']);
    expect(next.unread?.before).toBe(scope.unread?.before);
  });

  // catches: a site with no statuses refusing its first one
  it('creates statuses on a site with none', () => {
    const next = addStatus({ unread: { a: 1 } } as unknown as SiteScope, 'x', {
      name: 'X',
    });
    expect(next.unread).toEqual({ a: 1, statuses: { x: { name: 'X' } } });
  });

  // catches: a taken id overwriting the status that has it
  it('throws for a taken id', () => {
    expect(() => addStatus(scope, 'one', {})).toThrow(
      'statuses.one: this site already has a status with that id'
    );
  });

  // catches: a list of statuses being replaced by a mapping
  it('throws when statuses is a list', () => {
    expect(() =>
      addStatus({ unread: { statuses: [1] } } as unknown as SiteScope, 'x', {})
    ).toThrow('statuses: is not written as a set of statuses');
  });
});

describe('removeStatus', () => {
  // catches: the wrong status removed, or the rest changed
  it('removes one and keeps the other', () => {
    const next = removeStatus(scope, 'one');
    expect(next.unread?.statuses).toEqual({ two: { name: 'Two' } });
    expect(Object.keys(next.unread!)).toEqual(['before', 'statuses', 'after']);
  });

  // catches: an empty `statuses: {}` left behind
  it('removing the last removes the key', () => {
    const next = removeStatus(
      {
        unread: { a: 1, statuses: { x: { name: 'X' } } },
      } as unknown as SiteScope,
      'x'
    );
    expect(next.unread).toEqual({ a: 1 });
  });

  // catches: a delete of a status the file does not author passing silently
  it('throws for an unknown id', () => {
    expect(() => removeStatus(scope, 'nope')).toThrow(
      'statuses.nope: this site authors no such status'
    );
  });
});

describe('statusIdFrom', () => {
  // catches: an id with capitals or spaces, a blank id, a taken id reused
  it('makes a fitting id', () => {
    expect(statusIdFrom('Warmed Up', [])).toBe('warmed-up');
    expect(statusIdFrom('  ', [])).toBe('status');
    expect(statusIdFrom('Warmed Up', ['warmed-up'])).toBe('warmed-up-2');
    expect(statusIdFrom('Warmed Up', ['warmed-up', 'warmed-up-2'])).toBe(
      'warmed-up-3'
    );
  });
});
