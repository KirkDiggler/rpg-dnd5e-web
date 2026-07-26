/**
 * Fog of War event layer (rpg-dnd5e-web#605).
 *
 * Design: rpg-project/ideas/fog-of-war/design.md §"The event layer".
 *
 * These types are the draft proto contract. What the concept proves by being
 * played is what rpg-api-protos then encodes, so treat every field here as a
 * claim about the wire rather than a convenience for the renderer.
 *
 * `PositionLike` and `WallLike` match the generated v1alpha2 `Position` and
 * `Wall` messages field-for-field rather than importing the generated classes
 * — same rationale as `src/concepts/combat-pacing/fixtures.ts`: a fixture
 * should read like a captured wire event without paying for proto class
 * construction. Deliberate divergences are noted at their field.
 */

/** Matches v1alpha2 `Position` field-for-field. Hex cube coordinates with the
 * invariant x + y + z === 0. */
export interface PositionLike {
  x: number;
  y: number;
  z: number;
}

/** Matches v1alpha2 `Wall` field-for-field. Doors are walls with a `DOOR_*`
 * kind — there is no separate door collection on the wire, and opening a door
 * changes the kind rather than the wall's existence.
 *
 * Divergence: `kind` is `number` rather than the generated `WallKind` enum, so
 * a fixture can be written as a literal without importing generated code. The
 * adapter widens it back to `WallKind` at the renderer boundary. */
export interface WallLike {
  from: PositionLike;
  to: PositionLike;
  kind: number;
  id?: string;
}

/**
 * A hex is VISIBLE (current authorized truth) or REMEMBERED (a frozen last
 * observation, carried in full). UNSEEN is omission — never a value.
 *
 * There is deliberately no removal state. A witnessed removal is a VISIBLE
 * record that no longer lists the thing; a hidden removal is no record at all.
 * Deletion is the one operation a later observation cannot correct, so it does
 * not exist here. See design.md §"Nothing is ever deleted".
 */
export type HexState = 'VISIBLE' | 'REMEMBERED';

/**
 * What occupies a hex. Resolves against the event's `entities` collection.
 *
 * `facing` rides on the placement and NOT on the entity. A record is an
 * observation: a viewer who saw a goblin facing north and lost sight must keep
 * that memory after the goblin turns and another viewer sees it face south.
 * Moving `facing` onto `FogEntity` would let one viewer's sighting rewrite
 * another viewer's memory.
 */
export interface Placement {
  entityId: string;
  /** Hex-direction index 0-5. */
  facing: number;
}

/**
 * One hex's complete authorized truth for one viewer, as observed at one
 * moment.
 *
 * A VISIBLE record is TOTAL: `contents: []` is a positive claim that the hex
 * is empty, never "contents omitted". That is what allows a remembered
 * occupant to be deleted by re-sight without a forget message.
 *
 * A REMEMBERED record carries its frozen observation in full rather than
 * instructing the client to freeze what it holds, so live transitions and
 * reconnect hydration are the same code path.
 */
export interface HexRecord {
  position: PositionLike;
  state: HexState;
  /** Matches v1alpha2 `TerrainType`; `number` for the same reason as
   * `WallLike.kind`. */
  terrain: number;
  /** Optional zone membership; '' when none, matching `Hex.zone_id`. */
  zoneId: string;
  /** Walls and doors on this hex's edges. Self-contained: the client never
   * re-associates a global wall list with hexes. */
  edges: WallLike[];
  contents: Placement[];
}

/**
 * Everything the server chose to disclose about an entity to this viewer.
 *
 * Withheld fields are simply absent — disclosure is a server decision, never
 * client policy. A viewer who failed a perception check receives no entity for
 * the trap at all, and no placement referencing it.
 */
export interface FogEntity {
  entityId: string;
  name: string;
  type: 'player' | 'monster' | 'obstacle';
  classRefId?: string;
  monsterRefId?: string;
  obstacleType?: number;
  propRefId?: string;
}

/**
 * One viewer's slice of knowledge.
 *
 * Hexes say **where**; entities say **what**. They are delivered together so
 * they cannot disagree — a placement can always resolve against an entity in
 * the same message, or it fails closed.
 */
export interface HexKnowledgeChanged {
  hexes: HexRecord[];
  entities: FogEntity[];
}

/** Map key for a hex. Matches the renderer's existing `x,y,z` coord key so
 * adapter output drops straight into HexGrid's remembered key sets. */
export const hexKey = (p: PositionLike): string => `${p.x},${p.y},${p.z}`;
