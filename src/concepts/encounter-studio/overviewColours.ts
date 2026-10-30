import type { RegionResolution } from '../world-building/authoringRegions';
import { regionSize, type RegionSize } from '../world-building/regionSize';
import type { RoomDraft, RoomHexCell } from '../world-building/roomDraft';

/** Twelve region hues, legible as translucent fills on the dark floor.
 * Presentation only: no colour is ever stored in the document. */
export const REGION_PALETTE = [
  '#f28e8e',
  '#f2b45a',
  '#e8e06a',
  '#9fdc6a',
  '#5cc98a',
  '#4fc9c0',
  '#5aaee8',
  '#7d8cf0',
  '#b07df0',
  '#e47ad8',
  '#c99a6e',
  '#8fb0a8',
] as const;

/** Cast members' own palette, so a ring never reads as a region. */
export const CAST_PALETTE = [
  '#ff6b6b',
  '#ffa94d',
  '#ffd43b',
  '#69db7c',
  '#38d9a9',
  '#3bc9db',
  '#4dabf7',
  '#748ffc',
  '#9775fa',
  '#da77f2',
  '#f783ac',
  '#e9ecef',
] as const;

/** FNV-1a, 32-bit: a stable slot for an id on every machine. */
function hash(id: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    value ^= id.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

const key = (cell: RoomHexCell): string => `${cell.q},${cell.r}`;
const AROUND = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

/** One colour per region, derived and never stored (S3-Q1). Each region's
 * slot starts at a stable hash of its id; walking the regions in authored
 * order, a region whose slot an already-assigned neighbour holds steps to the
 * next free slot. Neighbours are regions whose counted cells touch or
 * overlap. A delete changes no other colour unless it removes a collision
 * another region had stepped around. */
export function regionColours(input: {
  regions: readonly { readonly id: string }[];
  cellsOf(regionId: string): readonly RoomHexCell[];
}): ReadonlyMap<string, string> {
  const owners = new Map<string, number[]>();
  const cells = input.regions.map((region) => input.cellsOf(region.id));
  cells.forEach((list, index) => {
    for (const cell of list) {
      const at = owners.get(key(cell));
      if (at) {
        if (!at.includes(index)) at.push(index);
      } else owners.set(key(cell), [index]);
    }
  });
  const slots: number[] = [];
  const colours = new Map<string, string>();
  input.regions.forEach((region, index) => {
    const neighbours = new Set<number>();
    for (const cell of cells[index])
      for (const [dq, dr] of [[0, 0] as const, ...AROUND])
        for (const other of owners.get(
          key({ q: cell.q + dq, r: cell.r + dr })
        ) ?? [])
          if (other < index) neighbours.add(other);
    const taken = new Set([...neighbours].map((other) => slots[other]));
    const start = hash(region.id) % REGION_PALETTE.length;
    let slot = start;
    for (let step = 0; step < REGION_PALETTE.length; step++) {
      const candidate = (start + step) % REGION_PALETTE.length;
      if (!taken.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    slots.push(slot);
    colours.set(region.id, REGION_PALETTE[slot]);
  });
  return colours;
}

/** A cast member's ring colour: a stable hash of its ref, with no step. */
export function castColour(ref: string): string {
  return CAST_PALETTE[hash(ref) % CAST_PALETTE.length];
}

export interface RegionOverview {
  readonly sizes: ReadonlyMap<string, RegionSize | null>;
  readonly colours: ReadonlyMap<string, string>;
}

/** Sizes and colours for every authored region, from the resolutions. */
export function regionOverview(
  draft: Readonly<RoomDraft>,
  resolutions: readonly RegionResolution[]
): RegionOverview {
  const regions = draft.room.regions;
  const byId = new Map(resolutions.map((r) => [r.id, r]));
  const sizes = new Map<string, RegionSize | null>();
  for (const region of regions) {
    const resolution = byId.get(region.id);
    sizes.set(region.id, resolution ? regionSize(resolution) : null);
  }
  return {
    sizes,
    colours: regionColours({
      regions,
      cellsOf: (id) => sizes.get(id)?.cells ?? [],
    }),
  };
}
