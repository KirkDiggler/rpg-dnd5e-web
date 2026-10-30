/**
 * The engine's refusals, at the row they name (rpg-project#720, R17).
 *
 * The validate-only `PutDungeon` answers with `FieldError{path, message}`
 * addressed to the file as written: a root table's row is
 * `tables.<id>.on.time[9]…` (or `tables.<id>.time[9]…`), a bundle's row
 * `bundles.<id>.rows[2]…`. A row knows its own path, so it shows every
 * refusal under it in the engine's own sentence, and opens when a refusal's
 * jump lands on it. The form judges nothing here: it only places the
 * server's words.
 */
import { createContext, useContext, useEffect, useRef } from 'react';

export interface RowRefusal {
  path: string;
  message: string;
}

export interface RowRefusals {
  refusals: readonly RowRefusal[];
  /** The row a jump asked for, by its path; a new nonce is a new jump. */
  focus: { path: string; nonce: number } | null;
}

export const RowRefusalsContext = createContext<RowRefusals>({
  refusals: [],
  focus: null,
});

export function useRowRefusals(): RowRefusals {
  return useContext(RowRefusalsContext);
}

/** Whether `path` is `row` or under it: `tables.t.on.time[1].toward.path`
 * is under `tables.t.on.time[1]`, and `…time[10]` is not under `…time[1]`. */
export function isUnder(path: string, row: string): boolean {
  if (!path.startsWith(row)) return false;
  const rest = path.slice(row.length);
  return rest === '' || rest.startsWith('.') || rest.startsWith('[');
}

/** A root table row's paths, both spellings the engine uses. */
export function tableRowPaths(
  table: string,
  trigger: string,
  index: number
): string[] {
  return [
    `tables.${table}.on.${trigger}[${index}]`,
    `tables.${table}.${trigger}[${index}]`,
  ];
}

/** A bundle row's path. */
export function bundleRowPaths(bundle: string, index: number): string[] {
  return [`bundles.${bundle}.rows[${index}]`];
}

/** The refusals under any of a row's paths, in the server's order. */
export function refusalsAtRow(
  refusals: readonly RowRefusal[],
  rows: readonly string[]
): RowRefusal[] {
  return refusals.filter((r) => rows.some((row) => isUnder(r.path, row)));
}

/** The row a refusal names, by its path, or undefined for a path deeper or
 * shallower than a table or bundle row. */
export function rowOfPath(path: string): string | undefined {
  return (
    /^(tables\.[^.[]+\.(?:on\.)?[^.[]+\[\d+\])/.exec(path)?.[1] ??
    /^(bundles\.[^.[]+\.rows\[\d+\])/.exec(path)?.[1]
  );
}

/** The refusals under a row's paths, whether a jump has landed on it, and a
 * ref for the row's element, which is scrolled into view when one does. */
export function useRowRefusalsAt(at: readonly string[] | undefined) {
  const { refusals, focus } = useRowRefusals();
  const rowRef = useRef<HTMLLIElement>(null);
  const mine = at ? refusalsAtRow(refusals, at) : [];
  const focused =
    focus !== null && at !== undefined && at.includes(focus.path)
      ? focus.nonce
      : 0;
  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView?.({ block: 'center' });
  }, [focused]);
  return { refusals: mine, focused, rowRef };
}

/** A row's name in words, from its path: `tables.hall-patrol.time[4]` is
 * "hall-patrol time entry 5", `bundles.patrol.rows[0]` "patrol row 1". */
export function rowPathLabel(
  at: readonly string[] | undefined
): string | undefined {
  const path = at?.[at.length - 1];
  if (!path) return undefined;
  const table = /^tables\.([^.[]+)\.(?:on\.)?([^.[]+)\[(\d+)\]$/.exec(path);
  if (table) return `${table[1]} ${table[2]} entry ${Number(table[3]) + 1}`;
  const bundle = /^bundles\.([^.[]+)\.rows\[(\d+)\]$/.exec(path);
  if (bundle) return `${bundle[1]} row ${Number(bundle[2]) + 1}`;
  return undefined;
}
