/**
 * Shared types for the feel-lab dials drawer (#906 batch 2). Kirk: "as we
 * get into the polish phases we should have a debug panel we can slide out
 * to change the params there. in game we do not have access to the url."
 *
 * A leaf module — `cameraDials.ts`/`diceDials.ts` import ONLY these types to
 * declare their own specs (see `DialSpec`), and `feel/dials.ts` imports
 * their specs to aggregate. Nothing here imports either of them, so there
 * is no cycle: dials.ts -> {cameraDials.ts, diceDials.ts} -> dialTypes.ts.
 */

export type DialGroup = 'camera' | 'dice';

export interface NumberDialSpec {
  readonly key: string;
  readonly label: string;
  readonly group: DialGroup;
  readonly kind: 'number';
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Short unit suffix for the drawer's display (e.g. "°/s", "×"). Purely
   * cosmetic — never parsed. */
  readonly unit?: string;
}

export interface EnumDialSpec<T extends string = string> {
  readonly key: string;
  readonly label: string;
  readonly group: DialGroup;
  readonly kind: 'enum';
  readonly default: T;
  readonly options: readonly T[];
}

export type DialSpec = NumberDialSpec | EnumDialSpec;

/** One flat map of every registered dial's CURRENT, already-resolved value —
 * every key from every spec is always present (the store fills in defaults
 * for anything unset), so a consumer never has to null-check a dial value. */
export type DialValues = Record<string, number | string>;
