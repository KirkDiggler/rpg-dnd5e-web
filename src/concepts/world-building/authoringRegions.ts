import { objectShape, rejectUnknownKeys } from './strictShape';
import type { MapLabel, WorldPoint } from './types';
import {
  containsWorkspaceCell,
  MAX_ROOM_WORKSPACE_HEXES,
  type RoomHexCell,
  type RoomWorkspace,
} from './workspaceGeometry';

/** Source wall orientation, not display spans or opening/door identities. */
export type BoundaryRun = {
  wallId: string;
  direction: 'start-to-end' | 'end-to-start';
};
export type EnclosureWitness = { walk: BoundaryRun[] };
export type RegionLighting = { background: number };
export type AuthoringRegion = {
  id: string;
  labelId: string;
  lighting?: RegionLighting;
  boundary:
    | { kind: 'automatic'; witness?: EnclosureWitness }
    | { kind: 'explicit'; cells: RoomHexCell[] };
};
export type RegionResolution =
  | {
      id: string;
      status: 'resolved';
      area:
        | { kind: 'polygon'; ring: WorldPoint[] }
        | { kind: 'hex-union'; cells: RoomHexCell[] };
    }
  | {
      id: string;
      status: 'unresolved';
      reason:
        | 'unbound'
        | 'open'
        | 'seed-on-boundary'
        | 'outside-bound-enclosure'
        | 'boundary-changed'
        | 'unsupported-geometry'
        | 'uncertain-geometry'
        | 'duplicate-room-label'
        | 'overlap'
        | 'empty-explicit';
    };

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.length || value.length > 120)
    throw new Error(`${path} must be a non-empty string up to 120 characters.`);
  return value;
}
function sameRun(a: BoundaryRun, b: BoundaryRun): boolean {
  return a.wallId === b.wallId && a.direction === b.direction;
}
function compareRun(a: BoundaryRun, b: BoundaryRun): number {
  return a.wallId < b.wallId
    ? -1
    : a.wallId > b.wallId
      ? 1
      : a.direction < b.direction
        ? -1
        : a.direction > b.direction
          ? 1
          : 0;
}
/** Copies only. No reversal equivalence, locale ordering or delimiter keys.
 * Acquisition may write this word; readers must retain the authored word. */
export function canonicalizeEnclosureWitness(
  witness: Readonly<EnclosureWitness>
): EnclosureWitness {
  const walk: BoundaryRun[] = [];
  for (const run of witness.walk)
    if (!walk.length || !sameRun(walk[walk.length - 1], run))
      walk.push({ ...run });
  if (walk.length > 1 && sameRun(walk[0], walk[walk.length - 1])) walk.pop();
  // Least cyclic rotation in linear tuple comparisons (also bounded for
  // malformed repeated words before structural validation refuses them).
  let left = 0,
    right = 1,
    offset = 0;
  while (left < walk.length && right < walk.length && offset < walk.length) {
    const order = compareRun(
      walk[(left + offset) % walk.length],
      walk[(right + offset) % walk.length]
    );
    if (order === 0) {
      offset++;
      continue;
    }
    if (order > 0) {
      left += offset + 1;
      if (left <= right) left = right + 1;
    } else {
      right += offset + 1;
      if (right <= left) right = left + 1;
    }
    offset = 0;
  }
  const first = Math.min(left, right);
  return { walk: [...walk.slice(first), ...walk.slice(0, first)] };
}
export function enclosureWitnessesEqual(
  a: Readonly<EnclosureWitness>,
  b: Readonly<EnclosureWitness>
): boolean {
  const left = canonicalizeEnclosureWitness(a).walk;
  const right = canonicalizeEnclosureWitness(b).walk;
  return (
    left.length === right.length &&
    left.every((run, i) => sameRun(run, right[i]))
  );
}
export function validateEnclosureWitness(
  value: unknown,
  path = 'Enclosure witness'
): EnclosureWitness {
  const source = objectShape(value, path);
  rejectUnknownKeys(source, ['walk'], path);
  if (!Array.isArray(source.walk))
    throw new Error(`${path}.walk must be an array.`);
  const walk = source.walk.map((value, index): BoundaryRun => {
    const runPath = `${path}.walk[${index}]`;
    const run = objectShape(value, runPath);
    rejectUnknownKeys(run, ['wallId', 'direction'], runPath);
    if (run.direction !== 'start-to-end' && run.direction !== 'end-to-start')
      throw new Error(`${runPath}.direction is invalid.`);
    return {
      wallId: id(run.wallId, `${runPath}.wallId`),
      direction: run.direction,
    };
  });
  const normalized = canonicalizeEnclosureWitness({ walk }).walk;
  if (normalized.length < 3)
    throw new Error(`${path}.walk must describe at least three source runs.`);
  // Source reuse across distinct transitions is not a schema error: a straight
  // source can border separate portions of a simple concave face. The geometry
  // owner certifies the raw simple face; this gate never guesses that geometry.
  // Missing source walls are unresolved semantics, not schema corruption.
  return { walk };
}

/** Exact optional visual intent: absence is not an authored baseline value. */
export function validateRegionLighting(
  value: unknown,
  path = 'Region lighting'
): RegionLighting {
  const input = objectShape(value, path);
  rejectUnknownKeys(input, ['background'], path);
  if (
    typeof input.background !== 'number' ||
    !Number.isFinite(input.background) ||
    input.background < 0 ||
    input.background > 1
  )
    throw new Error(`${path}.background must be a finite number from 0 to 1.`);
  return { background: input.background };
}

/** No geometry acquisition or default fields. Workspace absence means no guessed bounds. */
export function validateAuthoringRegions(
  value: unknown,
  labels: readonly MapLabel[],
  options: {
    workspace?: RoomWorkspace;
    reservedIds?: ReadonlySet<string>;
    allowLighting?: boolean;
  } = {}
): AuthoringRegion[] {
  if (!Array.isArray(value) || value.length > labels.length)
    throw new Error(
      'scene.authoringRegions must be an array bounded by its linked labels.'
    );
  const labelIds = new Set(labels.map((label) => label.id));
  const ids = new Set(options.reservedIds);
  const links = new Set<string>();
  return value.map((value, index): AuthoringRegion => {
    const path = `scene.authoringRegions[${index}]`;
    const input = objectShape(value, path);
    rejectUnknownKeys(
      input,
      [
        'id',
        'labelId',
        'boundary',
        ...(options.allowLighting ? ['lighting'] : []),
      ],
      path
    );
    const lighting = Object.hasOwn(input, 'lighting')
      ? { lighting: validateRegionLighting(input.lighting, `${path}.lighting`) }
      : {};
    const regionId = id(input.id, `${path}.id`);
    if (ids.has(regionId) || labelIds.has(regionId))
      throw new Error(`${path}.id: duplicate region identity ${regionId}.`);
    ids.add(regionId);
    const labelId = id(input.labelId, `${path}.labelId`);
    if (!labelIds.has(labelId) || links.has(labelId))
      throw new Error(
        `${path}.labelId: missing or duplicate linked label ${labelId}.`
      );
    links.add(labelId);
    const boundary = objectShape(input.boundary, `${path}.boundary`);
    if (boundary.kind === 'automatic') {
      rejectUnknownKeys(boundary, ['kind', 'witness'], `${path}.boundary`);
      return {
        id: regionId,
        labelId,
        ...lighting,
        boundary: {
          kind: 'automatic',
          ...(Object.hasOwn(boundary, 'witness')
            ? {
                witness: validateEnclosureWitness(
                  boundary.witness,
                  `${path}.boundary.witness`
                ),
              }
            : {}),
        },
      };
    }
    if (boundary.kind !== 'explicit')
      throw new Error(`${path}.boundary.kind is invalid.`);
    rejectUnknownKeys(boundary, ['kind', 'cells'], `${path}.boundary`);
    if (
      !Array.isArray(boundary.cells) ||
      boundary.cells.length > MAX_ROOM_WORKSPACE_HEXES
    )
      throw new Error(
        `${path}.boundary.cells exceeds the workspace cell allocation budget.`
      );
    const keys = new Set<string>();
    const cells = boundary.cells.map((value, i): RoomHexCell => {
      const cellPath = `${path}.boundary.cells[${i}]`;
      const cell = objectShape(value, cellPath);
      rejectUnknownKeys(cell, ['q', 'r'], cellPath);
      if (!Number.isSafeInteger(cell.q) || !Number.isSafeInteger(cell.r))
        throw new Error(`${cellPath} must contain integral q/r coordinates.`);
      const parsed = { q: cell.q as number, r: cell.r as number };
      const key = `${parsed.q},${parsed.r}`;
      if (keys.has(key))
        throw new Error(`${cellPath}: duplicate explicit cell.`);
      keys.add(key);
      if (
        options.workspace &&
        !containsWorkspaceCell(options.workspace, parsed)
      )
        throw new Error(`${cellPath}: outside the authoring workspace.`);
      return parsed;
    });
    return {
      id: regionId,
      labelId,
      ...lighting,
      boundary: { kind: 'explicit', cells },
    };
  });
}
