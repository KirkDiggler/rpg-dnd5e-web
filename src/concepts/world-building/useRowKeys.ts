import { useRef } from 'react';

/**
 * React keys that FOLLOW each row of a list the studio re-sorts (R12,
 * rpg-project#576).
 *
 * A weight edit moves its row, so an index key would hand the open editor
 * — and the input being typed in — to whichever row slid into its place.
 *
 * A ROW IS KNOWN BY ITS CONTENT, NOT ITS OBJECT: the document owner clones
 * the whole draft on every commit, so no row object survives one. An edit
 * changes one row's content and leaves the others' alone, so a row whose
 * content was seen before keeps its key, and a row with new content takes
 * the key of the row whose content vanished — the row it replaced. A row
 * added with nothing vanished gets a fresh key. Equal rows are matched to
 * the nearest previous position.
 */
export function useRowKeys(rows: readonly unknown[]): string[] {
  const state = useRef<{
    previous: ReadonlyArray<{ content: string; key: string }>;
    next: number;
  }>({ previous: [], next: 0 });
  const s = state.current;
  const contents = rows.map((row) => JSON.stringify(row));
  const used = new Set<number>();
  // AMONG EQUAL ROWS, THE NEAREST POSITION WINS: editing one of two
  // identical rows must leave its twin's key where the twin is.
  const keys: (string | undefined)[] = contents.map((content, position) => {
    let at = -1;
    s.previous.forEach((entry, index) => {
      if (used.has(index) || entry.content !== content) return;
      if (at < 0 || Math.abs(index - position) < Math.abs(at - position))
        at = index;
    });
    if (at < 0) return undefined;
    used.add(at);
    return s.previous[at]!.key;
  });
  const freed = s.previous
    .filter((_, index) => !used.has(index))
    .map((entry) => entry.key);
  const out = keys.map(
    (key) => key ?? freed.shift() ?? `row-${(s.next += 1).toString(36)}`
  );
  s.previous = contents.map((content, index) => ({
    content,
    key: out[index]!,
  }));
  return out;
}
