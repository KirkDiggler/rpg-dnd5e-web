import { carryUnknownKeys, objectShape } from './strictShape';
import {
  wallSolidIntervals,
  type WallInterval,
} from './structuralWallGeometry';
import type { StructuralWallSurface } from './structuralWalls';

/** A visual span owned by one wall. No world pose, blocker, opening or door state. */
export interface WallSection {
  id: string;
  assetRef: string;
  position: number;
  width: number;
}

/** Document decoding preserves opaque references and unknown author fields. */
export function copyWallSections(
  value: unknown,
  path = 'wall sections'
): WallSection[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw Error(`${path}: sections must be an array.`);
  const ids = new Set<string>();
  return value.map((item, index) => {
    const at = `${path}[${index}]`,
      row = objectShape(item, at);
    for (const key of ['id', 'assetRef'] as const)
      if (typeof row[key] !== 'string' || !row[key].trim())
        throw Error(`${at}.${key}: section requires a nonblank string.`);
    const id = row.id as string,
      assetRef = row.assetRef as string;
    if (ids.has(id)) throw Error(`${at}.id: duplicate section ${id}.`);
    ids.add(id);
    const { position, width } = row;
    if (
      typeof position !== 'number' ||
      !Number.isFinite(position) ||
      typeof width !== 'number' ||
      !Number.isFinite(width) ||
      width <= 0
    )
      throw Error(
        `${at}: section position/width must be finite and width positive.`
      );
    return carryUnknownKeys(row, ['id', 'assetRef', 'position', 'width'], {
      id,
      assetRef,
      position,
      width,
    });
  });
}

/** Temporary exclusion operands for visual layout only. Never saved as openings. */
export function wallSectionSolidIntervals(
  wall: StructuralWallSurface
): WallInterval[] {
  const sections = copyWallSections(wall.appearance.sections) ?? [];
  const openings = wall.openings.map((opening) => {
    const span = opening.frameSpan ?? opening.door?.framePresentation?.span;
    return span
      ? {
          position: opening.position + (span.after - span.before) / 2,
          width: span.before + span.after,
        }
      : opening;
  });
  const exclusions = [...openings, ...sections].map((item, index) => ({
    id: `visual-${index}`,
    position: item.position,
    width: item.width,
  }));
  const length = Math.hypot(
    wall.line.end.x - wall.line.start.x,
    wall.line.end.z - wall.line.start.z
  );
  try {
    return wallSolidIntervals({
      wall: { line: wall.line, openings: exclusions },
      extent: { start: 0, end: length },
    });
  } catch (error) {
    throw Error(
      `Wall sections: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function assertWallSections(wall: StructuralWallSurface): void {
  wallSectionSolidIntervals(wall);
}

/** Resize constraints only; these spans never become mechanical cuts. */
export function wallSectionExtents(
  wall: StructuralWallSurface
): WallInterval[] {
  return (wall.appearance.sections ?? []).map((section) => ({
    start: section.position - section.width / 2,
    end: section.position + section.width / 2,
  }));
}
