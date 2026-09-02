/**
 * atlasRegion — which AtlasRegion a cell belongs to, on the session wire's
 * atlas.
 *
 * A PURE MEMBERSHIP LOOKUP, not a rule: `AtlasRegion.cells` already lists
 * exactly the cells a member's own atlas answer carries them in, so
 * resolving "which of MY atlas's regions am I standing in" reads only
 * data the member already legitimately sees — it decides nothing about
 * visibility and infers no concealed structure (mirrors `dungeonYaml.ts`'s
 * `floorOwners` on the builder side). The one caller today is the search
 * verb's region target (rpg-project#350): "the region the player stands
 * in," resolved from the searcher's own known `wherePosition`, never
 * chosen or guessed.
 */
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

/** Every cell key in the atlas to the id of the region that owns it. A
 * cell belongs to exactly one region on the wire (the same one-owner
 * invariant `dungeonspec` enforces at authoring time), so the first
 * region to claim a key wins — there is nothing to reconcile. */
export function atlasRegionOwners(
  atlas: Pick<GetAtlasResponse, 'regions'>
): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const region of atlas.regions) {
    for (const cell of region.cells) {
      const key = positionKey(cell);
      if (!owners.has(key)) owners.set(key, region.id);
    }
  }
  return owners;
}

/** The id of the region `position` sits in, per this atlas — `undefined`
 * when the atlas has no matching cell (not yet loaded, or a position
 * this member's atlas withholds). */
export function regionAt(
  atlas: Pick<GetAtlasResponse, 'regions'> | null | undefined,
  position: Position | null | undefined
): string | undefined {
  if (!atlas || !position) return undefined;
  return atlasRegionOwners(atlas).get(positionKey(position));
}
