import type { Edge } from './hexOffset';

/** The palette's tools (design §1, left column) plus `select`, which
 * the inspector needs: clicking a placement, a door edge or a region
 * cell with it selects that thing. */
export type BoardTool =
  | 'select'
  | 'region'
  | 'erase'
  | 'wall'
  | 'door'
  | 'start'
  | 'place';

/** What the inspector is looking at. A wall selection is the set of
 * doc edges behind a rendered run, resolved at click time from the
 * derived scene — there is no wall id in the file and none is added
 * (rpg-dnd5e-web#804). */
export type Selection =
  | { kind: 'dungeon' }
  | { kind: 'region'; id: string }
  | { kind: 'door'; id: string }
  | { kind: 'wall'; edges: Edge[] }
  | { kind: 'placement'; index: number };

/** The catalog item armed on the `place` tool. */
export interface PaletteItem {
  kind: 'prop' | 'monster';
  ref: string;
}

/** The static archetype list (plan W: "a static list in W, the catalog
 * is Not now"). A presentation ref the assets resolve; never mechanics. */
export const ARCHETYPES = ['crypt', 'cave', 'sewer', 'ruin', 'hall'] as const;

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export const TARGETINGS = [
  'closest',
  'lowest-health',
  'highest-threat',
  'random',
] as const;
