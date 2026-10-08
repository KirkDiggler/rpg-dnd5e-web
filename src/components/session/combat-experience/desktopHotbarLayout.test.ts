import { describe, expect, it } from 'vitest';
import {
  currentFavorites,
  favoritePage,
  hotbarColumns,
  hotbarRows,
  minimumFavoriteColumns,
  toggleFavorite,
} from './desktopHotbarLayout';
const offers = 'ABCDEFGHIJKL'
  .split('')
  .map((id) => ({ id, available: id !== 'A' }));
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('grouped hotbar favorites', () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [4, 4],
    [5, 4],
    [2.9, 2],
    [NaN, 1],
    [Infinity, 1],
  ])('bounds row value %s to %s', (input, expected) =>
    expect(hotbarRows(input)).toBe(expected)
  );
  it.each([
    [0, 1],
    [35, 1],
    [36, 1],
    [75, 1],
    [76, 2],
    [116, 3],
    [NaN, 1],
  ])('measures %s pixels as %s columns', (width, expected) =>
    expect(hotbarColumns(width)).toBe(expected)
  );
  it('repeats favorites and overlaps the final normal window exactly as agreed', () => {
    const first = favoritePage(offers, ['A', 'B'], 4, 2, 0);
    const last = favoritePage(offers, ['A', 'B'], 4, 2, 1);
    expect(ids(first.visible)).toEqual('ABCDEFGH'.split(''));
    expect(ids(last.visible)).toEqual('ABGHIJKL'.split(''));
    expect(last.normalStart).toBe(4);
    expect(first.columns).toBe(4);
    expect(last.columns).toBe(4);
    expect(first.pages).toBe(2);
    expect(last.pages).toBe(2);
    expect(new Set(ids(last.visible)).size).toBe(8);
  });
  it('balances twelve entries into six plus six, with a decorative cell for odd totals', () => {
    const page = favoritePage(offers, [], 10, 2, 0);
    expect(page.visible).toHaveLength(12);
    expect(page.columns).toBe(6);
    expect(page.slots).toBe(12);
    const odd = favoritePage(offers.slice(0, 11), [], 10, 2, 0);
    expect(odd.visible).toHaveLength(11);
    expect(odd.columns).toBe(6);
    expect(odd.slots).toBe(12);
  });
  it('balances incomplete four-row grids rather than leaving one sparse final row', () => {
    const many = Array.from({ length: 29 }, (_, index) => ({
      id: String(index),
    }));
    const page = favoritePage(many, [], 10, 4, 0);
    expect(page.columns).toBe(8);
    expect(
      [0, 1, 2, 3].map(
        (row) => page.cells.slice(row * 8, row * 8 + 8).filter(Boolean).length
      )
    ).toEqual([8, 7, 7, 7]);
    expect(page.cells.filter(Boolean)).toEqual(many);
  });

  it('allows four favorites independently of screen capacity and leaves access to every normal offer', () => {
    const favoriteIds = ['A', 'B', 'C', 'D'];
    expect(minimumFavoriteColumns(offers, favoriteIds, 1)).toBe(5);
    const all = new Set<string>();
    const first = favoritePage(offers, favoriteIds, 1, 1, 0);
    expect(first.capacity).toBe(5);
    expect(first.columns).toBe(5);
    for (let index = 0; index < first.pages; index++) {
      const page = favoritePage(offers, favoriteIds, 1, 1, index);
      expect(ids(page.visible).slice(0, 4)).toEqual(favoriteIds);
      ids(page.visible).forEach((id) => all.add(id));
    }
    expect([...all]).toEqual(ids(offers));
    expect(favoritePage(offers, favoriteIds, 1, 4, 100).page).toBeLessThan(
      first.pages
    );
  });
  it('accepts four, refuses the fifth, and allows unstar/replacement even when unavailable', () => {
    let selected: string[] = [];
    for (const id of ['A', 'B', 'C', 'D']) {
      const next = toggleFavorite(offers, selected, id);
      expect(next.refused).toBeNull();
      selected = next.favorites;
    }
    expect(toggleFavorite(offers, selected, 'E')).toEqual({
      favorites: selected,
      refused: 'limit',
    });
    const unstar = toggleFavorite(offers, selected, 'A');
    expect(unstar.favorites).toEqual(['B', 'C', 'D']);
    expect(toggleFavorite(offers, unstar.favorites, 'E').favorites).toEqual([
      'B',
      'C',
      'D',
      'E',
    ]);
  });
  it('ignores unknown/duplicate hints without minting membership or changing availability', () => {
    expect(currentFavorites(offers, ['A', 'A', 'missing', 'C'])).toEqual([
      'A',
      'C',
    ]);
    expect(toggleFavorite(offers, ['A'], 'missing').refused).toBe('missing');
    const page = favoritePage([...offers, offers[0]!], ['A'], 20, 1, 0);
    expect(page.visible[0]).toBe(offers[0]);
    expect(page.visible[0]?.available).toBe(false);
    expect(new Set(ids(page.visible)).size).toBe(page.visible.length);
  });
  it('handles zero/all-favorite offers and clamps changed pages', () => {
    expect(favoritePage([], [], 0, 1, -1)).toMatchObject({
      visible: [],
      pages: 1,
      page: 0,
      slots: 0,
    });
    expect(
      favoritePage(offers.slice(0, 4), ['A', 'B', 'C', 'D'], 1, 1, 999)
    ).toMatchObject({ pages: 1, page: 0, columns: 4 });
    expect(
      favoritePage(offers.slice(0, 3), ['A', 'D'], 4, 1, 999).favoriteIds
    ).toEqual(['A']);
    expect(favoritePage(offers, [], 4, 4, 999).page).toBe(0);
  });
});
