/**
 * Fog of War viewer knowledge (rpg-dnd5e-web#605).
 *
 * Design: rpg-project/ideas/fog-of-war/design.md §"The event layer".
 *
 * Knowledge is a map from hex coordinate to this viewer's memory of that
 * coordinate. An event carries records; each record replaces its entry. That
 * is the entire behavior — there is no freeze step, no delete step, and no
 * derivation.
 *
 * Events are this module's only input. It never reads world truth, never
 * computes line of sight, and never infers. Staleness is not implemented: a
 * hex the viewer cannot see produces no record, so its entry simply is not
 * touched.
 */

import type { FogEntity, HexKnowledgeChanged, HexRecord } from './events';
import { hexKey } from './events';

export interface FogKnowledge {
  /** Keyed by `hexKey(position)` — what this viewer knows about that hex. */
  hexes: ReadonlyMap<string, HexRecord>;
  /** Keyed by entity id — what this viewer has been told each thing is.
   * Entries are never removed: they are the vocabulary that remembered
   * placements resolve against, and a memory outlives current disclosure. */
  entities: ReadonlyMap<string, FogEntity>;
}

export const emptyKnowledge = (): FogKnowledge => ({
  hexes: new Map(),
  entities: new Map(),
});

export function fogReducer(
  state: FogKnowledge,
  event: HexKnowledgeChanged
): FogKnowledge {
  // An event with nothing in it must change nothing — including identity.
  // "Preserve stale memory" is the absence of a message, and a hidden mutation
  // produces exactly this event; allocating fresh Maps for it would churn
  // referential equality and re-render every consumer for no reason.
  if (!event.hexes?.length && !event.entities?.length) return state;

  const entities = new Map(state.entities);
  for (const entity of event.entities ?? []) {
    entities.set(entity.entityId, entity);
  }

  const hexes = new Map(state.hexes);
  for (const record of event.hexes ?? []) {
    // Replace wholesale — never a field-level merge. A VISIBLE record is
    // total, so this is what deletes a remembered occupant when the viewer
    // walks up and finds the hex empty.
    //
    // Placements referencing an entity this viewer has not been told about
    // are dropped: fail closed, never render something undisclosed.
    hexes.set(hexKey(record.position), {
      ...record,
      contents: record.contents.filter((placement) =>
        entities.has(placement.entityId)
      ),
    });
  }

  return { hexes, entities };
}
