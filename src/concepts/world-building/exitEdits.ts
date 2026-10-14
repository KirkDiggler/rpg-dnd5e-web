/**
 * One floor hex's exit (rpg-project#578, H3): add one with an id, rename it,
 * remove it. Exits are the root `exits: [{ id, cell }]`, in authored order.
 *
 * THE VALIDATOR IS THE GATE. Every result is read back through
 * `validateSiteExits`, so a duplicate or malformed id is refused with the
 * validator's own sentence, the one a decode of the file would give.
 * Whether the cell is standable is the toolkit's question at compile
 * (`exits[i].cell: … is not standable`); nothing here asks it.
 */
import type { RoomHexCell } from './roomDraft';
import { validateSiteExits, type SiteExit } from './siteScope';

const sameCell = (a: RoomHexCell, b: RoomHexCell) => a.q === b.q && a.r === b.r;

/** The exit standing on this hex, if any. */
export function exitAt(
  exits: readonly SiteExit[] | undefined,
  cell: RoomHexCell
): SiteExit | undefined {
  return exits?.find((exit) => sameCell(exit.cell, cell));
}

/** Set the hex's exit: `null` removes it; an id renames the exit already
 * there, in place, or appends a new one. Throws the validator's sentence
 * for an id the file would refuse. */
export function setExitAt(
  exits: readonly SiteExit[] | undefined,
  cell: RoomHexCell,
  id: string | null
): SiteExit[] {
  const list = [...(exits ?? [])];
  const index = list.findIndex((exit) => sameCell(exit.cell, cell));
  if (id === null) {
    if (index >= 0) list.splice(index, 1);
  } else if (index >= 0) list[index] = { ...list[index]!, id };
  else list.push({ id, cell: { q: cell.q, r: cell.r } });
  return validateSiteExits(list);
}
