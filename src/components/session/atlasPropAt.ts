/**
 * atlasPropAt — which prop a floor click names, and where a prop stands, as
 * this viewer's atlas knows it (rpg-project#959).
 *
 * A prop is in one of TWO lists, keyed together (one id space):
 *
 * - `props`: cell scenery, each standing on one cell (`at`);
 * - `placed`: the World Builder's placed footprints, each standing on every
 *   cell in its `cells` (the engine's answer, never re-derived from the
 *   rectangle). The kitchen's grate is one of these.
 *
 * Reading only `props` made every placed prop invisible to a click: a click
 * on the grate was a plain floor walk, and standing on it, a click did
 * nothing. A creature on the cell still wins: its click never reaches the
 * floor.
 */
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { coordToKey, type CubeCoord } from '../hex-grid/hexMath';
import { positionToCube } from './positionBridge';

/** The prop standing on `coord`, or undefined. Two props on one cell
 * resolve to the first in atlas order, cell scenery before placements. */
export function atlasPropAt(
  atlas: GetAtlasResponse | null | undefined,
  coord: CubeCoord
): string | undefined {
  if (!atlas) return undefined;
  const key = coordToKey(coord);
  const scenery = atlas.props.find(
    (prop) =>
      prop.id.length > 0 &&
      prop.at !== undefined &&
      coordToKey(positionToCube(prop.at)) === key
  );
  if (scenery) return scenery.id;
  return (atlas.placed ?? []).find(
    (placed) =>
      placed.id.length > 0 &&
      (placed.cells ?? []).some(
        (cell) => coordToKey(positionToCube(cell)) === key
      )
  )?.id;
}

/** A cell the prop stands on, for a walk toward it, or undefined. A
 * placement's first listed cell (its centre is always listed). */
export function atlasPropCell(
  atlas: GetAtlasResponse | null | undefined,
  prop: string
): CubeCoord | undefined {
  if (!atlas || !prop) return undefined;
  const at = atlas.props.find((candidate) => candidate.id === prop)?.at;
  if (at) return positionToCube(at);
  const cell = (atlas.placed ?? []).find((placed) => placed.id === prop)
    ?.cells[0];
  return cell ? positionToCube(cell) : undefined;
}
