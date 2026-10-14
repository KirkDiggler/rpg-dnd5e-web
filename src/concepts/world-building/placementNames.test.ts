import { describe, expect, it } from 'vitest';
import { placementDisplayNames } from './placementNames';
import type { RoomMonsterPlacement } from './roomDraft';

const at = (id: string, ref: string): RoomMonsterPlacement => ({
  id,
  ref,
  startingCell: { location: { q: 0, r: 0 } },
});
const castName = (ref: string): string =>
  ({
    'dnd5e:monsters:guard': 'Guard',
    'dnd5e:monsters:skeleton': 'Skeleton',
  })[ref] ?? ref;

describe('placementDisplayNames', () => {
  it('a map name wins over the kind name', () => {
    const names = placementDisplayNames({
      declarations: [at('a', 'dnd5e:monsters:skeleton')],
      actorNames: { a: 'Gatekeeper' },
      castName,
    });
    expect(names.get('a')).toBe('Gatekeeper');
  });

  it('two equal names get (2) in document order', () => {
    const names = placementDisplayNames({
      declarations: [
        at('b', 'dnd5e:monsters:guard'),
        at('c', 'dnd5e:monsters:skeleton'),
        at('a', 'dnd5e:monsters:guard'),
        at('d', 'dnd5e:monsters:skeleton'),
      ],
      actorNames: { c: 'Guard' },
      castName,
    });
    expect([...names.entries()]).toEqual([
      ['b', 'Guard'],
      ['c', 'Guard (2)'],
      ['a', 'Guard (3)'],
      ['d', 'Skeleton'],
    ]);
  });

  it('an unnamed placement shows its kind name', () => {
    const names = placementDisplayNames({
      declarations: [at('4cbfe6a7-d24c', 'dnd5e:monsters:guard')],
      castName,
    });
    expect(names.get('4cbfe6a7-d24c')).toBe('Guard');
  });

  it('an authored name that looks like a suffix never repeats', () => {
    const guards = ['a', 'b', 'c'].map((id) => at(id, 'dnd5e:monsters:guard'));
    const shown = (actorNames: Record<string, string>): string[] => [
      ...placementDisplayNames({
        declarations: guards,
        actorNames,
        castName,
      }).values(),
    ];
    expect(shown({ a: 'Guard', b: 'Guard', c: 'Guard (2)' })).toEqual([
      'Guard',
      'Guard (2)',
      'Guard (2) (2)',
    ]);
    expect(shown({ a: 'Guard', b: 'Guard (2)', c: 'Guard' })).toEqual([
      'Guard',
      'Guard (2)',
      'Guard (3)',
    ]);
  });
});
