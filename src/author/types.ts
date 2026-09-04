/** The palette's tools (design §1, left column) plus `select`, which
 * the inspector needs: clicking a placement, a door edge or a region
 * cell with it selects that thing. */
export type BoardTool =
  | 'select'
  | 'region'
  | 'region-rect'
  | 'room'
  /** Floor belonging to no room (rpg-project#360 §2.1) — the brush beside
   * the room brush. Paints the cells a wall may stand on and a prop may
   * sit on, and nobody may stand on. */
  | 'scenery'
  | 'erase'
  | 'wall'
  | 'door'
  | 'start'
  /** A way out (rpg-project#368 §3.1) — placed like `start`, but there may
   * be several and each carries an id. Nothing is defaulted: the cell the
   * party starts on is an exit only if the author says so. */
  | 'exit'
  | 'place';

/** What the inspector is looking at. A wall selection is an INDEX into
 * `walls[]` — the file has a wall in it now (rpg-project#360 slice 2),
 * so there is one thing to name. It used to be the set of doc edges
 * behind a fitted run, because no such thing existed
 * (rpg-dnd5e-web#804). */
export type Selection =
  | { kind: 'dungeon' }
  | { kind: 'region'; id: string }
  | { kind: 'door'; id: string }
  | { kind: 'wall'; index: number }
  | { kind: 'placement'; index: number }
  /** An entry in `exits[]`, by index — the same treatment a wall gets, and
   * for the same reason: the file holds a list and the index is what a
   * compiler path names. */
  | { kind: 'exit'; index: number }
  /** One intel record, by its id — the form where a piece of intel is
   * given a target and a holder (rpg-project#372 §5). Declared on the
   * dungeon, not on any one thing in it, which is why it is selected by
   * name rather than by index into something. */
  | { kind: 'intel'; id: string }
  /** The party's entry point. One per dungeon, so it is selected by being
   * the start rather than by an id or an index (rpg-project#374 design,
   * "The walks"). */
  | { kind: 'start' };

/** The catalog item armed on the `place` tool. */
export interface PaletteItem {
  kind: 'prop' | 'monster';
  ref: string;
}

/** The static archetype list (plan W: "a static list in W, the catalog
 * is Not now"). A presentation ref the assets resolve; never mechanics. */
export const ARCHETYPES = ['crypt', 'cave', 'sewer', 'ruin', 'hall'] as const;

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** Every opaque ability-or-skill ref a check approach may roll: the six
 * raw abilities plus the standard skill list, exactly as
 * dungeonspec.ApproachSpec.Ability names them (plain lowercase words,
 * hyphenated where the skill itself is two words). Shared by a door's
 * lock rows and its find-check rows — both are the same CheckSpec shape
 * (rpg-project#350), so one dropdown vocabulary serves both. Not backed
 * by the character sheet's proto Skill enum: dungeonspec carries this
 * opaquely, same as ABILITIES already did. */
export const APPROACH_ABILITIES = [
  ...ABILITIES,
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const;

export const TARGETINGS = [
  'closest',
  'lowest-health',
  'highest-threat',
  'random',
] as const;
