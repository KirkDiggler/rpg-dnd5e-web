import { useRef } from 'react';

/**
 * React keys that FOLLOW each row of a list the studio re-sorts (R12,
 * rpg-project#576).
 *
 * A weight edit moves its row, so an index key would hand the open editor
 * — and the input being typed in — to whichever row slid into its place.
 * The edits replace only the edited row's object and keep every other
 * row's, so a row is known by its object: a row seen before keeps its key,
 * and a new object takes the key of the row that vanished, which is the
 * row it replaced. A row added with nothing vanished gets a fresh key.
 */
export function useRowKeys(rows: readonly object[]): string[] {
  const state = useRef<{
    keys: WeakMap<object, string>;
    previous: readonly object[];
    next: number;
  }>({ keys: new WeakMap(), previous: [], next: 0 });
  const s = state.current;
  const known = rows.map((row) => s.keys.get(row));
  const live = new Set(known.filter((key) => key !== undefined));
  const freed = s.previous
    .map((row) => s.keys.get(row))
    .filter((key): key is string => key !== undefined && !live.has(key));
  const out = rows.map((row, index) => {
    const key =
      known[index] ?? freed.shift() ?? `row-${(s.next += 1).toString(36)}`;
    s.keys.set(row, key);
    return key;
  });
  s.previous = rows;
  return out;
}
