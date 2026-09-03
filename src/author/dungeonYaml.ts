/**
 * dungeonYaml — the builder's in-memory model of a `dungeonspec`
 * version-2 file, its parser and its emitter (rpg-project#256, design §2).
 *
 * The YAML is the artifact; the canvas is a view of it. Everything in the
 * model is AXIAL (`hexOffset.ts`'s `Axial`); the file's `[col,row]` pairs
 * exist only inside `parseDungeon` (in) and `emitDungeon` (out), through
 * `fromOffset` / `toOffset` under the document's own `orientation`.
 *
 * The emitter is deterministic and hand-written rather than a generic
 * YAML dump: cells sorted, one ROW per line (so a repaint diffs as a line
 * change — the convention design §2 names), walls sorted, flow-style
 * placements. `emitDungeon(parseDungeon(emitDungeon(doc)))` is
 * byte-identical to `emitDungeon(doc)` (`dungeonYaml.test.ts`), which is
 * what makes `GetDungeon`'s verbatim bytes and the builder's own output
 * the same text.
 *
 * Validation is the SERVER's job (`PutDungeon{validate_only}` answers
 * with path-addressed `FieldError`s); this module only refuses what it
 * cannot represent (wrong version, unknown keys, non-numeric cells).
 */

import { parse as parseYamlText } from 'yaml';
import {
  isPositionOffset,
  latticeKey,
  latticeOf,
  latticeWalk,
  positionCrossing,
  positionKey,
  sealedBy,
  wallCrossings,
  wallDirection,
  wallFootprint,
  type Lattice,
  type Offset,
  type PositionRef,
} from './hexGeometry';
import {
  axialKey,
  axialNeighbors,
  compareAxial,
  edgeKey,
  fromOffset,
  toOffset,
  type Axial,
  type Edge,
  type OffsetPair,
  type Orientation,
} from './hexOffset';

export type { PositionRef } from './hexGeometry';

export type VoidKind = 'opaque' | 'transparent';

export interface RegionDoc {
  id: string;
  name: string;
  /** Presentation ref the assets resolve (`crypt`…). Never mechanics. */
  archetype: string;
  lighting: { intensity: number };
  cells: Axial[];
  /** Hidden space — "the room hides with its door" (rpg-project#351).
   * DECLARED HERE, NEVER CASCADED from a concealed door: the room and its
   * door are separate authored facts (dungeonspec.RegionSpec.Concealed).
   * Server-validated coherence (a walk-in room cannot be a secret; a room
   * only reachable through a concealed door must be concealed too) is not
   * repeated client-side — this module only refuses what it cannot
   * represent. Omitted means not concealed; only ever written `true`. */
  concealed?: boolean;
}

/** One authored check's approach: an ability or skill, an optional tool,
 * and the DC that route must beat — mirrors dungeonspec's `ApproachSpec`
 * (rpg-project#350). Every field is opaque; this module never interprets
 * `ability` or `tool`. */
export interface ApproachDoc {
  ability: string;
  tool?: string;
  dc: number;
}

/** A door's lock or its find check: the accepted approaches through it,
 * success by any listed one, each priced with its own DC. Mirrors
 * dungeonspec's `CheckSpec` — a bare list, not a wrapping object, because
 * the builder authors a check as approach rows and the file reads as the
 * rows it is. */
export type CheckDoc = ApproachDoc[];

export interface DoorDoc {
  id: string;
  /** The position the door stands on — a side midpoint of some wall
   * (design §3.4, F10/F11). The door IS that side's crossing: one door,
   * one crossing, and a wider doorway is two doors. `edges` is retired
   * with the pair form. */
  at: PositionRef;
  /** Omitted = open doorway; `closed` = shut, not locked; `locked` wins. */
  closed?: boolean;
  /** NIL, NOT LEN 0, IS "NOT LOCKED" (dungeonspec.DoorSpec.Locked's law):
   * an authored-but-empty list is a lock with no way through it, refused
   * server-side by name — this module still represents it (round-trips
   * unchanged) rather than silently reading it as open. */
  locked?: CheckDoc;
  /** The find check that hides this door — COMPOSES with plain, closed,
   * or locked underneath; whether a door is shut and whether anyone knows
   * it is there are separate authored facts (rpg-project#350). Same
   * nil-vs-empty law as `locked`. */
  concealed?: CheckDoc;
}

/** A placement's authored offset: `[x, y]` or `[x, y, height]`
 * (rpg-project#272 — the third component raises the prop off the
 * floor). */
export type PlacementOffset = [number, number] | [number, number, number];

export interface PlacementDoc {
  ref: string;
  at: Axial;
  /** REQUIRED on props, REFUSED on monsters (server rule). Written
   * explicitly whenever present — never defaulted. */
  blocksMovement?: boolean;
  blocksLos?: boolean;
  /** Props only, REFUSED on monsters (server rule, rpg-project#261).
   * The authored word verbatim — one of the EIGHT true-compass names,
   * the same eight under both orientations (rpg-project#272;
   * `facingYaw.ts`'s `FACING_NAMES`). Omitted means the asset's own
   * default orientation. This module only checks the SHAPE (a string);
   * whether it's a compass name is the server's call, surfaced as a
   * `place[i].facing` `FieldError` like any other field. */
  facing?: string;
  /** Props only, REFUSED on monsters. A within-cell visual nudge, each
   * component a fraction of the cell size in `[-0.5, 0.5]` — VISUAL
   * ONLY (design's "presentation never decides mechanics" law: the
   * prop still occupies its whole cell for movement and LOS). Omitted
   * means centered; `[0, 0]` means the same thing but stays written if
   * the caller wrote it (no silent collapsing). An OPTIONAL third
   * component is height above the floor in the same cell-size unit,
   * `[0, 3]` — deliberately not bound to the planar clamp
   * (rpg-project#272). Bounds are the server's call, surfaced the same
   * way as `facing`'s.
   */
  offset?: PlacementOffset;
  /** Monsters only; opaque to the builder. */
  targeting?: string;
  boss?: boolean;
}

/** One authored wall: a STRAIGHT LINE between two positions, and the
 * file holds nothing else (rpg-project#360 slice 2, design §1.5, §3.2).
 *
 * The pair form — a wall as the list of hex-to-hex crossings it blocks —
 * is DELETED, not deprecated. It could not say what the author drew: on
 * a hex grid every degree-2 corner turns 60°, so a room corner and a
 * zigzag step were the same angle and the client had to guess the line
 * back out of the crossings with a tolerance. A wall now IS its line,
 * and the crossings it blocks, the cells it passes through and the cells
 * it seals are all derived from these two points — by the compiler for
 * the record, by `hexGeometry.ts` for the picker's preview.
 *
 * `start` and `end` are two of the seven positions (§3.3). A CORNER is
 * two walls carrying the same position at an end (F5) — the designer
 * writes a join by copying the position, and neither this module nor the
 * compiler has a corner concept. */
export interface WallDoc {
  start: PositionRef;
  end: PositionRef;
  /** The wall's display name, for the human reading the file and the
   * errors about it — "north wall" beats `walls[7]` for the streamers
   * who author these. Carried, never interpreted. */
  name?: string;
  /** Raise-only MULTIPLIER of the standard rendered wall height, in
   * `[1, 3]` (rpg-project#273's ruling: walls raise, they never lower).
   * Omitted means standard — exactly what writing `1` means. Bounds are
   * the server's call, surfaced as a `walls[i].height` `FieldError` like
   * any other field; this module only checks the SHAPE (a finite
   * number). VISUAL ONLY: a wall blocks movement and sight identically —
   * and cannot be seen past — at every height. */
  height?: number;
}

/** A wall's two ends on the lattice — the form every derivation takes
 * them in. */
export const wallLattice = (
  o: Orientation,
  wall: WallDoc
): { a: Lattice; b: Lattice } => ({
  a: latticeOf(o, wall.start),
  b: latticeOf(o, wall.end),
});

/** Every crossing the document's walls block, derived (C7) — the
 * client's mirror of what the compiler computes, and the ONLY way the
 * builder learns which hex-to-hex steps a wall stops now that the file
 * no longer lists them. A door's own crossing is NOT subtracted here: a
 * door stands IN a wall, and the compiler is what hands the crossing
 * back to the door (rpg-project#355, unchanged by the line form). */
export function wallCrossingKeys(doc: DungeonDoc): Set<string> {
  // FLOOR TO FLOOR ONLY, matching C2: a wall's ends stick out past the
  // room it caps, and the crossings out there run into void, which is
  // impassable already. Reporting them would put a wall where the
  // compiler puts nothing.
  const floor = floorKeys(doc);
  const keys = new Set<string>();
  for (const wall of doc.walls) {
    const { a, b } = wallLattice(doc.orientation, wall);
    for (const edge of wallCrossings(doc.orientation, a, b)) {
      if (!floor.has(axialKey(edge[0])) || !floor.has(axialKey(edge[1]))) {
        continue;
      }
      keys.add(edgeKey(edge));
    }
  }
  return keys;
}

/** Every cell one wall on its own seals — the cells its line halves
 * (design §4.3). What walls seal in COMBINATION is the compiler's answer
 * and arrives as `sealed` off the wire; this is the closed-form preview
 * the picker shows before the author commits. Floor only: a wall through
 * void seals nothing, there being nothing there to stand on. */
export function sealedKeys(doc: DungeonDoc): Set<string> {
  const floor = floorKeys(doc);
  const keys = new Set<string>();
  for (const wall of doc.walls) {
    const { a, b } = wallLattice(doc.orientation, wall);
    for (const cell of sealedBy(doc.orientation, a, b)) {
      const key = axialKey(cell);
      if (floor.has(key)) keys.add(key);
    }
  }
  return keys;
}

export interface DungeonDoc {
  version: 2;
  key: string;
  name: string;
  orientation: Orientation;
  void: VoidKind;
  regions: RegionDoc[];
  /** Floor nobody stands on — the cells belonging to no region at all
   * (rpg-project#360 slice 1, design §1.4/§3.1).
   *
   * A cell carries two facts, an OWNER and whether it is STANDABLE, and
   * scenery is the second without the first: floor for a wall to stand on
   * and a prop to sit on, never floor for feet. A cell is in exactly one
   * of a region, `scenery`, or void — the brush enforces that here
   * (`paintScenery`/`paintCell`) so the file can never carry the overlap
   * F1 refuses.
   *
   * ALWAYS PRESENT IN THE MODEL, WRITTEN ONLY WHEN IT HAS CELLS. The
   * field is optional in the file ("omitted = none", §3.1), which is what
   * keeps a dungeon that uses no scenery emitting the same bytes it
   * always did — and keeps it compiling on a server whose decoder does
   * not know the key yet. An empty list here is that absence, not a
   * different state. */
  scenery: Axial[];
  start: Axial | null;
  walls: WallDoc[];
  doors: DoorDoc[];
  place: PlacementDoc[];
}

export const MONSTER_REF_PREFIX = 'dnd5e:monsters:';
export const isMonsterRef = (ref: string): boolean =>
  ref.startsWith(MONSTER_REF_PREFIX);

export class DungeonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DungeonParseError';
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function expectKeys(obj: Raw, allowed: string[], path: string): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      throw new DungeonParseError(`${path}: unknown key "${k}"`);
    }
  }
}

function str(obj: Raw, key: string, path: string, fallback?: string): string {
  const v = obj[key];
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw new DungeonParseError(`${path}.${key}: required`);
  }
  if (typeof v !== 'string') {
    throw new DungeonParseError(`${path}.${key}: expected a string`);
  }
  return v;
}

function pair(v: unknown, path: string): OffsetPair {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !Number.isInteger(v[0]) ||
    !Number.isInteger(v[1])
  ) {
    throw new DungeonParseError(`${path}: expected [col,row]`);
  }
  return [v[0] as number, v[1] as number];
}

/** A within-cell offset — two numbers, unlike `pair`'s two integers.
 * Bounds (`[-0.5, 0.5]`) are the server's call, not checked here — see
 * `PlacementDoc.offset`'s own doc comment. `Number.isFinite`, not
 * `typeof === 'number'`: NaN/Infinity are still typeof "number" and
 * would otherwise pass the shape check, then break the parse/emit
 * round trip this module promises (Copilot review, PR #795). */
function offsetPair(v: unknown, path: string): PlacementOffset {
  if (
    !Array.isArray(v) ||
    (v.length !== 2 && v.length !== 3) ||
    !v.every((c) => Number.isFinite(c))
  ) {
    throw new DungeonParseError(`${path}: expected [x,y] or [x,y,height]`);
  }
  return v.length === 2
    ? [v[0] as number, v[1] as number]
    : [v[0] as number, v[1] as number, v[2] as number];
}

/** One `{ cell: [col,row], offset: [x,y] }` position (design §3.2/§3.3).
 * The offset MUST be one of the seven (F8) — an offset outside the set
 * is not a position this builder can place, name or draw, so it is
 * refused here by value rather than carried to the server as a
 * pretend one. */
function position(v: unknown, path: string, o: Orientation): PositionRef {
  if (!isRecord(v)) {
    throw new DungeonParseError(
      `${path}: expected { cell: [col,row], offset: [x,y] }`
    );
  }
  expectKeys(v, ['cell', 'offset'], path);
  const cell = fromOffset(o, pair(v.cell, `${path}.cell`));
  const raw = v.offset;
  if (
    !Array.isArray(raw) ||
    raw.length !== 2 ||
    !raw.every((c) => Number.isFinite(c))
  ) {
    throw new DungeonParseError(`${path}.offset: expected [x,y]`);
  }
  const offset: Offset = [raw[0] as number, raw[1] as number];
  if (!isPositionOffset(o, offset)) {
    throw new DungeonParseError(
      `${path}.offset: [${offset[0]},${offset[1]}] is not one of the seven ` +
        `positions of a ${o}-top hex — a wall end and a door stand on a side ` +
        `midpoint or the centre, nowhere else (${POSITION_HELP[o]})`
    );
  }
  return { cell, offset };
}

/** The seven, spelled for a refusal a streamer can act on. */
const POSITION_HELP: Record<Orientation, string> = {
  pointy:
    '[0,0], [0.5,0], [-0.5,0], [0.25,-0.375], [-0.25,-0.375], ' +
    '[0.25,0.375], [-0.25,0.375]',
  flat:
    '[0,0], [0,0.5], [0,-0.5], [0.375,0.25], [0.375,-0.25], ' +
    '[-0.375,0.25], [-0.375,-0.25]',
};

/** The pair form, refused at the header (F4). A `walls[]` entry written
 * as a bare `[[col,row],[col,row]]` or carrying `between`/`edges`, or a
 * `doors[]` entry carrying `edges`, is version 2's DELETED wall form —
 * not a field this loader failed to learn. Refused before anything else
 * is read, so the author gets the one sentence that explains the whole
 * file rather than a per-entry shape complaint. */
function refusePairForm(raw: Raw): void {
  const pairShaped = (w: unknown): boolean =>
    Array.isArray(w) ||
    (isRecord(w) && (w.between !== undefined || w.edges !== undefined));
  const walls = Array.isArray(raw.walls) ? raw.walls : [];
  const doors = Array.isArray(raw.doors) ? raw.doors : [];
  const badWall = walls.findIndex(pairShaped);
  const badDoor = doors.findIndex((d) => isRecord(d) && d.edges !== undefined);
  if (badWall === -1 && badDoor === -1) return;
  const where = badWall !== -1 ? `walls[${badWall}]` : `doors[${badDoor}]`;
  throw new DungeonParseError(
    `${where}: this file is written in the PAIR FORM — a wall as the ` +
      'crossings it blocks. That form is deleted. A wall is now a line: ' +
      '`start` and `end`, each `{ cell: [col,row], offset: [x,y] }`, and a ' +
      'door is `at:` one position on it. Rewrite the walls and doors in the ' +
      'line form; there is no converter, and nothing else in the file moves.'
  );
}

function list(v: unknown, path: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v))
    throw new DungeonParseError(`${path}: expected a list`);
  return v;
}

/** One `{ ability, tool?, dc }` row — mirrors dungeonspec's `ApproachSpec`
 * parse. `tool` is written only when present, same optional-field
 * convention as every other doc type here. */
function approach(v: unknown, path: string): ApproachDoc {
  if (!isRecord(v)) throw new DungeonParseError(`${path}: expected a map`);
  expectKeys(v, ['ability', 'tool', 'dc'], path);
  if (!Number.isInteger(v.dc)) {
    throw new DungeonParseError(`${path}.dc: expected an integer`);
  }
  const out: ApproachDoc = {
    ability: str(v, 'ability', path),
    dc: v.dc as number,
  };
  if (v.tool !== undefined && v.tool !== null) {
    out.tool = str(v, 'tool', path);
  }
  return out;
}

/** A bare list of approach rows — a door's `locked` or `concealed`. An
 * authored-but-empty list parses through unchanged (this module only
 * refuses what it cannot represent; "at least one approach" is the
 * server's refusal to make, not the loader's). */
function checkList(v: unknown, path: string): CheckDoc {
  if (!Array.isArray(v)) {
    throw new DungeonParseError(`${path}: expected a list`);
  }
  return v.map((a, i) => approach(a, `${path}[${i}]`));
}

export function parseDungeon(text: string): DungeonDoc {
  let raw: unknown;
  try {
    raw = parseYamlText(text);
  } catch (err) {
    throw new DungeonParseError(
      err instanceof Error ? err.message : 'YAML did not parse'
    );
  }
  if (!isRecord(raw)) throw new DungeonParseError('document: expected a map');
  expectKeys(
    raw,
    [
      'version',
      'key',
      'name',
      'orientation',
      'void',
      'regions',
      'scenery',
      'start',
      'walls',
      'doors',
      'place',
    ],
    'document'
  );
  if (raw.version !== 2) {
    throw new DungeonParseError(
      `version: this builder writes dungeonspec version 2; got ${JSON.stringify(raw.version)} (version 1 is deleted, not supported)`
    );
  }
  refusePairForm(raw);
  const orientation = str(raw, 'orientation', 'document');
  if (orientation !== 'pointy' && orientation !== 'flat') {
    throw new DungeonParseError('orientation: expected pointy | flat');
  }
  const voidKind = str(raw, 'void', 'document');
  if (voidKind !== 'opaque' && voidKind !== 'transparent') {
    throw new DungeonParseError('void: expected opaque | transparent');
  }

  const regions = list(raw.regions, 'regions').map((r, i): RegionDoc => {
    const path = `regions[${i}]`;
    if (!isRecord(r)) throw new DungeonParseError(`${path}: expected a map`);
    expectKeys(
      r,
      ['id', 'name', 'archetype', 'lighting', 'cells', 'concealed'],
      path
    );
    const lighting = r.lighting;
    let intensity = 0;
    if (lighting !== undefined && lighting !== null) {
      if (!isRecord(lighting)) {
        throw new DungeonParseError(`${path}.lighting: expected a map`);
      }
      expectKeys(lighting, ['intensity'], `${path}.lighting`);
      if (typeof lighting.intensity !== 'number') {
        throw new DungeonParseError(
          `${path}.lighting.intensity: expected a number`
        );
      }
      intensity = lighting.intensity;
    }
    const cells: Axial[] = [];
    for (const [ri, row] of list(r.cells, `${path}.cells`).entries()) {
      for (const [ci, c] of list(row, `${path}.cells[${ri}]`).entries()) {
        cells.push(
          fromOffset(orientation, pair(c, `${path}.cells[${ri}][${ci}]`))
        );
      }
    }
    const region: RegionDoc = {
      id: str(r, 'id', path),
      name: str(r, 'name', path, ''),
      archetype: str(r, 'archetype', path, ''),
      lighting: { intensity },
      cells,
    };
    if (r.concealed !== undefined && r.concealed !== null) {
      if (typeof r.concealed !== 'boolean') {
        throw new DungeonParseError(`${path}.concealed: expected a boolean`);
      }
      if (r.concealed) region.concealed = true;
    }
    return region;
  });

  // Same row encoding as `regions[].cells` — rows of `[col,row]` — so the
  // author reads one shape for floor whoever owns it. Absent is empty.
  const scenery: Axial[] = [];
  for (const [ri, row] of list(raw.scenery, 'scenery').entries()) {
    for (const [ci, c] of list(row, `scenery[${ri}]`).entries()) {
      scenery.push(fromOffset(orientation, pair(c, `scenery[${ri}][${ci}]`)));
    }
  }

  const start =
    raw.start === undefined || raw.start === null
      ? null
      : fromOffset(orientation, pair(raw.start, 'start'));

  const walls = list(raw.walls, 'walls').map((w, i): WallDoc => {
    const path = `walls[${i}]`;
    if (!isRecord(w)) {
      throw new DungeonParseError(
        `${path}: expected { start, end, height?, name? }`
      );
    }
    expectKeys(w, ['start', 'end', 'height', 'name'], path);
    const wall: WallDoc = {
      start: position(w.start, `${path}.start`, orientation),
      end: position(w.end, `${path}.end`, orientation),
    };
    if (w.name !== undefined && w.name !== null) {
      if (typeof w.name !== 'string') {
        throw new DungeonParseError(`${path}.name: expected a string`);
      }
      wall.name = w.name;
    }
    if (w.height !== undefined && w.height !== null) {
      if (!Number.isFinite(w.height)) {
        throw new DungeonParseError(`${path}.height: expected a number`);
      }
      wall.height = w.height as number;
    }
    return wall;
  });

  const doors = list(raw.doors, 'doors').map((d, i): DoorDoc => {
    const path = `doors[${i}]`;
    if (!isRecord(d)) throw new DungeonParseError(`${path}: expected a map`);
    expectKeys(d, ['id', 'at', 'closed', 'locked', 'concealed'], path);
    const door: DoorDoc = {
      id: str(d, 'id', path),
      at: position(d.at, `${path}.at`, orientation),
    };
    if (d.closed !== undefined && d.closed !== null) {
      if (typeof d.closed !== 'boolean') {
        throw new DungeonParseError(`${path}.closed: expected a boolean`);
      }
      if (d.closed) door.closed = true;
    }
    if (d.locked !== undefined && d.locked !== null) {
      door.locked = checkList(d.locked, `${path}.locked`);
    }
    if (d.concealed !== undefined && d.concealed !== null) {
      door.concealed = checkList(d.concealed, `${path}.concealed`);
    }
    return door;
  });

  const place = list(raw.place, 'place').map((p, i): PlacementDoc => {
    const path = `place[${i}]`;
    if (!isRecord(p)) throw new DungeonParseError(`${path}: expected a map`);
    expectKeys(
      p,
      [
        'ref',
        'at',
        'blocks_movement',
        'blocks_los',
        'facing',
        'offset',
        'targeting',
        'boss',
      ],
      path
    );
    const placement: PlacementDoc = {
      ref: str(p, 'ref', path),
      at: fromOffset(orientation, pair(p.at, `${path}.at`)),
    };
    for (const [yamlKey, docKey] of [
      ['blocks_movement', 'blocksMovement'],
      ['blocks_los', 'blocksLos'],
      ['boss', 'boss'],
    ] as const) {
      const v = p[yamlKey];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'boolean') {
        throw new DungeonParseError(`${path}.${yamlKey}: expected a boolean`);
      }
      placement[docKey] = v;
    }
    if (p.facing !== undefined && p.facing !== null) {
      placement.facing = str(p, 'facing', path);
    }
    if (p.offset !== undefined && p.offset !== null) {
      placement.offset = offsetPair(p.offset, `${path}.offset`);
    }
    if (p.targeting !== undefined && p.targeting !== null) {
      placement.targeting = str(p, 'targeting', path);
    }
    return placement;
  });

  return {
    version: 2,
    key: str(raw, 'key', 'document', ''),
    name: str(raw, 'name', 'document', ''),
    orientation,
    void: voidKind,
    regions,
    scenery,
    start,
    walls,
    doors,
    place,
  };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/** A YAML plain scalar is safe when it cannot be read as anything but a
 * string and carries no indicator characters; everything else is
 * double-quoted (JSON quoting is valid YAML). Deterministic either way. */
function scalar(s: string): string {
  const plain =
    /^[A-Za-z][A-Za-z0-9 _.'()/-]*$/.test(s) &&
    !/\s$/.test(s) &&
    !/^(true|false|null|yes|no|on|off|y|n)$/i.test(s);
  return plain ? s : JSON.stringify(s);
}

const fmtPair = ([c, r]: OffsetPair): string => `[${c},${r}]`;

/** One `{ ability, tool?, dc }` row, key order matching
 * dungeonspec.ApproachSpec's own field order (ability, tool, dc). */
function fmtApproach(a: ApproachDoc): string {
  const fields = [`ability: ${scalar(a.ability)}`];
  if (a.tool !== undefined) fields.push(`tool: ${scalar(a.tool)}`);
  fields.push(`dc: ${a.dc}`);
  return `{ ${fields.join(', ')} }`;
}

function compareOffset(a: OffsetPair, b: OffsetPair): number {
  return a[1] - b[1] || a[0] - b[0];
}

/**
 * The file's ORDER, computed once: cells sorted by row then column and
 * grouped one row per line, walls sorted, door edges sorted. `emitDungeon`
 * writes this and `resolveErrorPath` reads it, so a server path like
 * `regions[1].cells[0][3]` names the same cell the emitter put there.
 */
export interface EmittedLayout {
  regions: { region: RegionDoc; rows: Axial[][] }[];
  /** `scenery`'s rows, in the emitted order — the same row-per-line shape
   * a region's cells take, so `scenery[i][j]` in a compiler path names
   * the cell the emitter put there. */
  scenery: Axial[][];
  walls: WallDoc[];
  doors: DoorDoc[];
}

/** Cells sorted by row then column and grouped one ROW per entry — the
 * file's cell shape, shared by a region's `cells` and by `scenery` so
 * both read and diff the same way. */
function cellRows(o: Orientation, cells: Axial[]): Axial[][] {
  const sorted = [...cells].sort((a, b) =>
    compareOffset(toOffset(o, a), toOffset(o, b))
  );
  const rows: Axial[][] = [];
  for (const cell of sorted) {
    const last = rows[rows.length - 1];
    if (last && toOffset(o, last[0])[1] === toOffset(o, cell)[1]) {
      last.push(cell);
    } else rows.push([cell]);
  }
  return rows;
}

export function emittedLayout(doc: DungeonDoc): EmittedLayout {
  const o = doc.orientation;
  return {
    regions: doc.regions.map((region) => ({
      region,
      rows: cellRows(o, region.cells),
    })),
    scenery: cellRows(o, doc.scenery),
    walls: sortedWalls(o, doc.walls),
    doors: doc.doors,
  };
}

/** A number as the file writes it — plain decimal, never exponential
 * and never a trailing `.0`, so `0.25` and `-0.375` read back as the
 * same dyadic values the position set is made of. */
const fmtNum = (n: number): string => String(n);

function fmtPosition(o: Orientation, p: PositionRef): string {
  return `{ cell: ${fmtPair(toOffset(o, p.cell))}, offset: [${fmtNum(
    p.offset[0]
  )}, ${fmtNum(p.offset[1])}] }`;
}

/** Walls in a stable order: by their start position, then their end —
 * so `walls[i]` in the emitted file and in a compiler error path name
 * the same wall, and re-emitting a parsed file is byte-identical.
 * Compared on the LATTICE, not on the `{cell, offset}` spelling, so two
 * walls that meet at a corner sort by where they actually are. */
function sortedWalls(o: Orientation, walls: WallDoc[]): WallDoc[] {
  const rank = (p: PositionRef): [number, number] => {
    const l = latticeOf(o, p);
    return [l.v, l.u];
  };
  return [...walls].sort((x, y) => {
    const [xv, xu] = rank(x.start);
    const [yv, yu] = rank(y.start);
    if (xv !== yv || xu !== yu) return xv - yv || xu - yu;
    const [xev, xeu] = rank(x.end);
    const [yev, yeu] = rank(y.end);
    return xev - yev || xeu - yeu;
  });
}

export function emitDungeon(doc: DungeonDoc): string {
  const o = doc.orientation;
  const layout = emittedLayout(doc);
  const out: string[] = [];
  out.push('version: 2');
  out.push(`key: ${scalar(doc.key)}`);
  out.push(`name: ${scalar(doc.name)}`);
  out.push(`orientation: ${o}`);
  out.push(`void: ${doc.void}`);

  if (doc.regions.length === 0) {
    out.push('regions: []');
  } else {
    out.push('regions:');
    for (const { region, rows } of layout.regions) {
      out.push(`  - id: ${scalar(region.id)}`);
      out.push(`    name: ${scalar(region.name)}`);
      out.push(`    archetype: ${scalar(region.archetype)}`);
      out.push(`    lighting: { intensity: ${region.lighting.intensity} }`);
      if (rows.length === 0) {
        out.push('    cells: []');
      } else {
        out.push('    cells:');
        for (const row of rows) {
          out.push(
            `      - [${row.map((c) => fmtPair(toOffset(o, c))).join(',')}]`
          );
        }
      }
      if (region.concealed) {
        out.push('    concealed: true');
      }
    }
  }

  // Written ONLY when it has cells (design §3.1: "optional; omitted =
  // none"). A dungeon with no scenery emits exactly the bytes it always
  // did — which is what keeps every existing file byte-identical and
  // keeps it compiling on a server that has not learned the key yet.
  if (layout.scenery.length > 0) {
    out.push('scenery:');
    for (const row of layout.scenery) {
      out.push(
        `      - [${row.map((c) => fmtPair(toOffset(o, c))).join(',')}]`
      );
    }
  }

  if (doc.start) {
    const [c, r] = toOffset(o, doc.start);
    out.push(`start: [${c}, ${r}]`);
  }

  if (doc.walls.length === 0) {
    out.push('walls: []');
  } else {
    out.push('walls:');
    for (const w of layout.walls) {
      // One line per end, `start` above `end`, so a wall that moves
      // diffs as the end that moved (design §3.2's own shape).
      out.push(`  - start: ${fmtPosition(o, w.start)}`);
      out.push(`    end: ${fmtPosition(o, w.end)}`);
      if (w.name !== undefined) out.push(`    name: ${scalar(w.name)}`);
      if (w.height !== undefined) out.push(`    height: ${w.height}`);
    }
  }

  if (doc.doors.length === 0) {
    out.push('doors: []');
  } else {
    out.push('doors:');
    for (const d of layout.doors) {
      out.push(`  - id: ${scalar(d.id)}`);
      out.push(`    at: ${fmtPosition(o, d.at)}`);
      if (d.locked !== undefined) {
        out.push(`    locked: [${d.locked.map(fmtApproach).join(', ')}]`);
      } else if (d.closed) {
        out.push('    closed: true');
      }
      if (d.concealed !== undefined) {
        out.push(`    concealed: [${d.concealed.map(fmtApproach).join(', ')}]`);
      }
    }
  }

  if (doc.place.length === 0) {
    out.push('place: []');
  } else {
    out.push('place:');
    for (const p of doc.place) {
      const fields = [`ref: ${JSON.stringify(p.ref)}`];
      fields.push(`at: ${fmtPair(toOffset(o, p.at))}`);
      if (p.blocksMovement !== undefined) {
        fields.push(`blocks_movement: ${p.blocksMovement}`);
      }
      if (p.blocksLos !== undefined) fields.push(`blocks_los: ${p.blocksLos}`);
      if (p.facing !== undefined) fields.push(`facing: ${scalar(p.facing)}`);
      if (p.offset !== undefined) {
        fields.push(`offset: [${p.offset.join(', ')}]`);
      }
      if (p.targeting !== undefined) {
        fields.push(`targeting: ${scalar(p.targeting)}`);
      }
      if (p.boss) fields.push('boss: true');
      out.push(`  - { ${fields.join(', ')} }`);
    }
  }

  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every floor cell → the id of the region that owns it. A cell painted
 * into two regions (a file the server will refuse) keeps the FIRST
 * owner here; the brush never produces one (`paintCell`). */
export function floorOwners(doc: DungeonDoc): Map<string, string> {
  const owners = new Map<string, string>();
  for (const region of doc.regions) {
    for (const cell of region.cells) {
      const key = axialKey(cell);
      if (!owners.has(key)) owners.set(key, region.id);
    }
  }
  return owners;
}

/** The scenery cells as keys — floor with no owner. */
export function sceneryKeys(doc: DungeonDoc): Set<string> {
  return new Set(doc.scenery.map(axialKey));
}

export const isScenery = (doc: DungeonDoc, cell: Axial): boolean =>
  sceneryKeys(doc).has(axialKey(cell));

/** Every FLOOR cell — owned or scenery (design §1.1: "Floor is any cell
 * with an owner or a scenery mark"). What a wall may stand on, what a
 * door may cross, what a prop may sit on. */
export function floorKeys(doc: DungeonDoc): Set<string> {
  const keys = sceneryKeys(doc);
  for (const key of floorOwners(doc).keys()) keys.add(key);
  return keys;
}

export const isFloor = (doc: DungeonDoc, cell: Axial): boolean =>
  floorKeys(doc).has(axialKey(cell));

/** Whether FEET may be here. Owned floor only: scenery is floor nobody
 * stands on (design §1.3), so the start and every monster need this and
 * a prop needs only `isFloor`. Slice 1's whole difference between the
 * two predicates; slice 2 subtracts the cells walls seal as well. */
export const isStandable = (doc: DungeonDoc, cell: Axial): boolean =>
  floorOwners(doc).has(axialKey(cell));

/** Crossing key → door id, for every door. A door IS one crossing
 * (F11): the one across the side its position is the midpoint of. A
 * door parked on a centre — a position that is the midpoint of no side —
 * opens nothing and is listed nowhere here; the server refuses it by
 * name. */
export function doorEdgeOwners(doc: DungeonDoc): Map<string, string> {
  const owners = new Map<string, string>();
  for (const door of doc.doors) {
    const edge = positionCrossing(
      doc.orientation,
      latticeOf(doc.orientation, door.at)
    );
    if (edge) owners.set(edgeKey(edge), door.id);
  }
  return owners;
}

/** The crossing a door opens, or null for one standing on a centre. */
export const doorCrossing = (doc: DungeonDoc, door: DoorDoc): Edge | null =>
  positionCrossing(doc.orientation, latticeOf(doc.orientation, door.at));

/** Whether a wall passes through a position — F10's test, and what the
 * door tool offers on. Exact: the position is on the wall's own lattice
 * walk, not near it. */
export function wallsThrough(doc: DungeonDoc, at: PositionRef): number[] {
  const o = doc.orientation;
  const target = positionKey(o, at);
  const out: number[] = [];
  doc.walls.forEach((wall, i) => {
    const { a, b } = wallLattice(o, wall);
    const walk = latticeWalk(a, b);
    if (walk?.some((l) => latticeKey(l) === target)) out.push(i);
  });
  return out;
}

export function placementAt(
  doc: DungeonDoc,
  cell: Axial
): { index: number; placement: PlacementDoc } | null {
  const key = axialKey(cell);
  const index = doc.place.findIndex((p) => axialKey(p.at) === key);
  return index === -1 ? null : { index, placement: doc.place[index] };
}

// ---------------------------------------------------------------------------
// Concealment derivation (rpg-dnd5e-web#893) — "concealment links to the
// door": a region's hidden status is DERIVED from which doors are marked
// concealed, rather than declared a second time by hand for every room
// behind one. This walks the SAME "ways" the toolkit's own coherence check
// does (dungeonspec/validate.go's `concealment()`), so a document this
// module derives satisfies that check without repeating it (this module
// still "only refuses what it cannot represent", per the header comment;
// the server stays the validator of record).
//
// A WAY IS A FLOOD, NOT A CROSSING (rpg-project#360 slice 1, design C4).
// It used to be one step between two regions' cells, because that was the
// only way space could join. Scenery adds floor that belongs to no room,
// so a way is now "a wall-free path from a cell of A to a cell of B whose
// INTERIOR cells are all scenery" — never through a third region's cells,
// which is what keeps the flood from tunnelling one room into the next.
//
// TWO REGIONS ARE JOINED IN `open` IFF SOME WAY BETWEEN THEM HAS NO
// CONCEALED DOOR ON ANY CROSSING — not "iff the first crossing out is
// clear". The toolkit builder found that first-crossing depends on which
// end you start from: visible room, bare crossing, scenery, then the
// secret room's own concealed door reads as open from the visible side
// and closed from the secret side. The flood crosses bare crossings and
// ordinary doors, passes through scenery, and stops at walls and
// concealed doors, so both ends agree.
// ---------------------------------------------------------------------------

/** The region graph `deriveConcealment` walks. `open` carries every way
 * that needs no search to use — an unwalled crossing, or a door that is
 * NOT concealed — so reachability over `open` alone is what a party can
 * walk to from the start without finding anything. `full` adds every
 * concealed door's own crossing on top: the dungeon's actual physical
 * connectivity, secrets included. `concealedDoorCrossings` is kept
 * separately, per door, for leak detection and provenance — which region
 * pairs each concealed door itself joins. */
interface RegionGraph {
  open: Map<string, Set<string>>;
  full: Map<string, Set<string>>;
  concealedDoorCrossings: Map<string, [string, string][]>;
}

function addRegionEdge(
  graph: Map<string, Set<string>>,
  a: string,
  b: string
): void {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

/** What one crossing does to a way through it. */
type CrossingKind = 'wall' | 'plain' | 'concealed';

function buildRegionGraph(doc: DungeonDoc): RegionGraph {
  const owners = floorOwners(doc);
  const scenery = sceneryKeys(doc);
  // The crossings the walls block, DERIVED (C7) — the file no longer
  // lists them. A door's own crossing is subtracted, exactly as the
  // compiler subtracts it: a door stands IN a wall, and the wall hands
  // that one crossing back (rpg-project#355, unchanged by the line
  // form). That one substitution is what makes a door drawn inside a
  // wall a door here rather than a wall.
  const doorEdges = doorEdgeOwners(doc);
  const walls = new Set(
    [...wallCrossingKeys(doc)].filter((k) => !doorEdges.has(k))
  );
  const doorById = new Map(doc.doors.map((d) => [d.id, d] as const));
  const open: Map<string, Set<string>> = new Map();
  const full: Map<string, Set<string>> = new Map();
  const concealedDoorCrossings = new Map<string, [string, string][]>();

  const kindOf = (ek: string): CrossingKind => {
    // `walls` is the COMPILED set, so the crossing a door stands in has
    // already been subtracted from it (rpg-project#355 — a run keeps that
    // crossing and the compiler hands the edge back to the door), exactly
    // as the server subtracts it. That one substitution is what makes a
    // door drawn inside a wall run a door here rather than a wall; asking
    // about the door first as well would only hide which fact carries it.
    if (walls.has(ek)) return 'wall';
    const doorId = doorEdges.get(ek);
    const door = doorId ? doorById.get(doorId) : undefined;
    return door && door.concealed !== undefined ? 'concealed' : 'plain';
  };

  /** Every region a way from `seeds` leads to.
   *
   * The flood leaves the seeds, walks SCENERY ONLY, and stops the moment
   * it lands on any region's cell — that cell is where the way ends, so a
   * third room is a destination and never a corridor (design C4). Walls
   * always stop it; a concealed door stops it unless `allowConcealed`,
   * which is the whole difference between the `open` graph and the
   * `full` one. `originId` is the region the seeds belong to, so a way
   * back into its own cells is not reported as joining anything. */
  const waysFrom = (
    seeds: readonly Axial[],
    originId: string | null,
    allowConcealed: boolean
  ): Set<string> => {
    const reached = new Set<string>();
    const seen = new Set(seeds.map(axialKey));
    const queue = [...seeds];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of axialNeighbors(cur)) {
        const kind = kindOf(edgeKey([cur, n]));
        if (kind === 'wall') continue;
        if (kind === 'concealed' && !allowConcealed) continue;
        const nk = axialKey(n);
        const there = owners.get(nk);
        if (there !== undefined) {
          if (there !== originId) reached.add(there);
          continue;
        }
        if (!scenery.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        queue.push(n);
      }
    }
    return reached;
  };

  for (const region of doc.regions) {
    for (const there of waysFrom(region.cells, region.id, false)) {
      addRegionEdge(open, region.id, there);
    }
    // Every open way is a way, and the permissive flood explores a
    // superset of the strict one's crossings, so `full` needs only this.
    for (const there of waysFrom(region.cells, region.id, true)) {
      addRegionEdge(full, region.id, there);
    }
  }

  /** The regions one side of a concealed door's crossing opens onto,
   * without passing another concealed door — the door's own side of the
   * pair it joins. An owned cell IS its region; a scenery cell floods
   * until it finds one. */
  const regionsTouching = (cell: Axial): Set<string> => {
    const owner = owners.get(axialKey(cell));
    if (owner !== undefined) return new Set([owner]);
    if (!scenery.has(axialKey(cell))) return new Set();
    return waysFrom([cell], null, false);
  };

  for (const door of doc.doors) {
    if (door.concealed === undefined) continue;
    const pairs: [string, string][] = [];
    const crossing = doorCrossing(doc, door);
    for (const [near, far] of crossing ? [crossing] : []) {
      for (const a of regionsTouching(near)) {
        for (const b of regionsTouching(far)) {
          if (a === b) continue;
          const [x, y] = a <= b ? [a, b] : [b, a];
          if (!pairs.some(([px, py]) => px === x && py === y)) {
            pairs.push([x, y]);
          }
        }
      }
    }
    if (pairs.length > 0) concealedDoorCrossings.set(door.id, pairs);
  }

  return { open, full, concealedDoorCrossings };
}

/** The region graph as two questions, for the tests that must agree with
 * the toolkit's own walk (design C4, acceptance A3). The derivation below
 * rests entirely on these two facts, and "separated" and "joined only
 * through a secret" are different answers that `deriveConcealment` alone
 * cannot tell apart — both leave a region unmarked. */
export interface RegionWays {
  /** Some way joins these two regions. Crossings may include concealed
   * doors; walls always stop a way. */
  joined(a: string, b: string): boolean;
  /** Some way joins them with NO concealed door on ANY of its crossings —
   * what a party can walk without finding anything first. */
  openly(a: string, b: string): boolean;
}

export function regionWays(doc: DungeonDoc): RegionWays {
  const { open, full } = buildRegionGraph(doc);
  return {
    joined: (a, b) => full.get(a)?.has(b) ?? false,
    openly: (a, b) => open.get(a)?.has(b) ?? false,
  };
}

function startRegionId(doc: DungeonDoc): string | null {
  if (!doc.start) return null;
  return floorOwners(doc).get(axialKey(doc.start)) ?? null;
}

interface RegionBfs {
  visited: Set<string>;
  parent: Map<string, string>;
  depth: Map<string, number>;
}

function bfsRegions(start: string, graph: Map<string, Set<string>>): RegionBfs {
  const visited = new Set([start]);
  const parent = new Map<string, string>();
  const depth = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of graph.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, cur);
      depth.set(next, (depth.get(cur) ?? 0) + 1);
      queue.push(next);
    }
  }
  return { visited, parent, depth };
}

export interface ConcealmentDerivation {
  /** Region ids reachable only by ALSO crossing a concealed door — the
   * space `deriveConcealment` marks concealed. `null` when there is no
   * start to derive reachability from (already its own reported defect,
   * `validation.start()`'s "the dungeon does not say where the party
   * starts" — this module has nothing to add on top of that). */
  regionIds: Set<string> | null;
  /** Region id -> a concealed door whose own crossing touches it
   * directly, for the inspector's provenance note. A region hidden only
   * by sitting past ANOTHER hidden region — no door of its own — has no
   * entry here even though it IS in `regionIds`. */
  doorByRegion: Map<string, string>;
}

/** The derivation itself (rpg-dnd5e-web#893's ruling): a region is hidden
 * space when the party can reach it crossing concealed doors but NOT
 * without them — reachable in the full graph, unreachable in the open
 * one. Concealed-to-concealed adjacency composes for free here, the same
 * way it does in the toolkit's own check: a region behind a concealed
 * door that opens onto ANOTHER hidden region through a plain, unwalled
 * gap is `full`-reachable only via the door, so it lands in the result
 * too, door of its own or not.
 *
 * A region genuinely disconnected from start — no concealed door
 * anywhere on its only paths, so it is unreachable in `full` as well —
 * is left alone: this module does not invent a secret for it. That is
 * a deliberate choice, NOT a claim the engine catches the gap some
 * other way — measured live (PR #894 review), a disconnected region
 * with no concealment authored anywhere in the file compiles with zero
 * errors today. Closing that gap is a validator question, tracked
 * separately; this module's job stays narrow: derive from what IS
 * authored, don't guess at what a silent void might mean. */
export function deriveConcealment(doc: DungeonDoc): ConcealmentDerivation {
  const graph = buildRegionGraph(doc);
  const doorByRegion = new Map<string, string>();
  for (const [doorId, pairs] of graph.concealedDoorCrossings) {
    for (const [a, b] of pairs) {
      if (!doorByRegion.has(a)) doorByRegion.set(a, doorId);
      if (!doorByRegion.has(b)) doorByRegion.set(b, doorId);
    }
  }
  const start = startRegionId(doc);
  if (!start) return { regionIds: null, doorByRegion };
  const openReach = bfsRegions(start, graph.open).visited;
  const fullReach = bfsRegions(start, graph.full).visited;
  const regionIds = new Set<string>();
  for (const id of fullReach) {
    if (!openReach.has(id)) regionIds.add(id);
  }
  return { regionIds, doorByRegion };
}

export interface ConcealmentLeak {
  doorId: string;
  message: string;
}

/** A concealed door whose crossing isolates nothing: both regions it
 * connects are ALSO reachable without it, so marking it concealed hides
 * no space (rpg-dnd5e-web#893's leak case). This is not a defect the
 * toolkit's own compiler reports — a concealed door's crossing is never
 * itself "a walk-in", so `concealment()`'s frontier check passes it
 * whether or not the room behind it actually goes dark — so it would
 * otherwise ship silently: the checkbox reads concealed, nothing is
 * actually hidden. Reported ONCE per door, naming the region that should
 * have gone dark and where its other way in actually is, rather than
 * once per leaking edge. */
export function detectConcealmentLeaks(doc: DungeonDoc): ConcealmentLeak[] {
  const graph = buildRegionGraph(doc);
  const start = startRegionId(doc);
  if (!start) return [];
  const bfs = bfsRegions(start, graph.open);
  const name = (id: string) => doc.regions.find((r) => r.id === id)?.name || id;
  const leaks: ConcealmentLeak[] = [];
  for (const door of doc.doors) {
    if (door.concealed === undefined) continue;
    const pairs = graph.concealedDoorCrossings.get(door.id) ?? [];
    const leaking = pairs.filter(
      ([a, b]) => bfs.visited.has(a) && bfs.visited.has(b)
    );
    if (leaking.length === 0) continue;
    const [a, b] = leaking[0];
    const depthA = bfs.depth.get(a) ?? 0;
    const depthB = bfs.depth.get(b) ?? 0;
    const far = depthA >= depthB ? a : b;
    const near = far === a ? b : a;
    const entry = bfs.parent.get(far);
    const source = entry && entry !== far ? entry : near;
    leaks.push({
      doorId: door.id,
      message: `${door.id} is concealed, but ${name(far)} is already reachable from ${name(source)} without passing through it`,
    });
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Mutators — every one returns a NEW doc (React state), never mutates.
// ---------------------------------------------------------------------------

export function emptyDungeon(
  orientation: Orientation = 'pointy',
  key = 'new-dungeon'
): DungeonDoc {
  return {
    version: 2,
    key,
    name: 'New Dungeon',
    orientation,
    void: 'opaque',
    regions: [
      {
        id: 'region-1',
        name: 'Region 1',
        archetype: 'crypt',
        lighting: { intensity: 0.6 },
        cells: [],
      },
    ],
    scenery: [],
    start: null,
    walls: [],
    doors: [],
    place: [],
  };
}

/** Paint `cell` into `regionId`. A cell is floor in exactly ONE region:
 * painting it moves it out of whichever region held it before, so the
 * brush can never produce the overlap the server refuses. */
/** The offset-space rectangle two cells span, as axial cells.
 *
 * A "square room" is a rectangle in OFFSET coordinates — the `[col,row]` the
 * file is written in and the shape the canvas actually draws. Doing it in
 * axial would give a rhombus, which is not the room anybody means when they
 * drag a box. */
export function rectCells(o: Orientation, a: Axial, b: Axial): Axial[] {
  const [ac, ar] = toOffset(o, a);
  const [bc, br] = toOffset(o, b);
  const cells: Axial[] = [];
  for (let r = Math.min(ar, br); r <= Math.max(ar, br); r += 1) {
    for (let c = Math.min(ac, bc); c <= Math.max(ac, bc); c += 1) {
      cells.push(fromOffset(o, [c, r]));
    }
  }
  return cells;
}

/** Paint the whole rectangle `a`..`b` into `regionId` — the region-rect
 * commit (rpg-dnd5e-web#902).
 *
 * The floor as a box instead of eighty-four brush strokes. The rectangle is
 * taken in OFFSET space because that is the shape the canvas draws; the same
 * corners in axial give a rhombus. Cells already owned by another region
 * change hands, exactly as the brush does — the tool paints, it does not
 * negotiate.
 *
 * NOTE this paints FLOOR only. Walls are not authored from a rectangle: a
 * rectangle of hex edges is a staircase, and drawing it as a square is a
 * rendering problem the edge-slice model cannot solve. Kirk's ruling for the
 * real fix (rpg-dnd5e-web#905): a wall is a line that cuts hexes wherever it
 * likes, and a hex with more than 80% of itself left is one you can stand on. */
export function paintRect(
  doc: DungeonDoc,
  regionId: string,
  a: Axial,
  b: Axial
): DungeonDoc {
  const wanted = rectCells(doc.orientation, a, b);
  const keys = new Set(wanted.map(axialKey));
  const owners = floorOwners(doc);
  const scenery = doc.scenery.filter((c) => !keys.has(axialKey(c)));
  // Nothing to do when every cell is already this region's AND none of
  // them is scenery — a rectangle over a scenery strip claims it.
  if (
    scenery.length === doc.scenery.length &&
    wanted.every((c) => owners.get(axialKey(c)) === regionId)
  ) {
    return doc;
  }
  return {
    ...doc,
    scenery,
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => !keys.has(axialKey(c)));
      if (region.id === regionId) {
        return {
          ...region,
          cells: [...without, ...wanted].sort(compareAxial),
        };
      }
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
  };
}

export function paintCell(
  doc: DungeonDoc,
  regionId: string,
  cell: Axial
): DungeonDoc {
  const key = axialKey(cell);
  const current = floorOwners(doc).get(key);
  // ONE STATE PER CELL (design §2.2): a room painted over scenery moves
  // the cell in, so the two lists can never both claim it.
  const scenery = doc.scenery.filter((c) => axialKey(c) !== key);
  if (current === regionId && scenery.length === doc.scenery.length) return doc;
  return {
    ...doc,
    scenery,
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      if (region.id === regionId) {
        return { ...region, cells: [...without, cell].sort(compareAxial) };
      }
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
  };
}

/** What stands on `cell` and could not stand on scenery — the start, or
 * a monster. `null` when the cell is free to become scenery.
 *
 * Named, not boolean, because the caller's job is to say WHICH thing is
 * in the way (design §2.5: errors point at the thing). Props are never
 * in the way: they sit on scenery quite legally, which is most of why
 * the brush exists. */
export type SceneryBlocker = 'start' | 'monster';

export function sceneryBlockedBy(
  doc: DungeonDoc,
  cell: Axial
): SceneryBlocker | null {
  const key = axialKey(cell);
  if (doc.start && axialKey(doc.start) === key) return 'start';
  const standing = doc.place.find(
    (pl) => axialKey(pl.at) === key && isMonsterRef(pl.ref)
  );
  return standing ? 'monster' : null;
}

/** Paint `cell` as SCENERY — floor belonging to no room (design §2.1).
 *
 * The mirror of `paintCell`: one state per cell, so a room cell painted
 * scenery moves OUT of its region rather than joining a second list.
 *
 * REFUSED IN PLACE when the start or a monster stands there. The design
 * cascades placements under ERASE and only under erase (§2.2, which names
 * erase as the thing that takes walls, doors and placements with it);
 * the monster-meets-scenery collision it rules on is a REFUSAL with a
 * reason (§2.4). This is that same collision from the other side, so it
 * gets the same answer rather than silently deleting something the
 * author placed — there is no undo in this builder. */
export function paintScenery(doc: DungeonDoc, cell: Axial): DungeonDoc {
  const key = axialKey(cell);
  if (sceneryKeys(doc).has(key)) return doc;
  if (sceneryBlockedBy(doc, cell) !== null) return doc;
  return {
    ...doc,
    scenery: [...doc.scenery, cell].sort(compareAxial),
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
  };
}

/** Erase `cell` from the floor entirely. Anything that stood on it —
 * walls, door edges, the start, a placement — goes with it: an edge or
 * a placement off the floor is a file the server refuses, and the
 * canvas never shows one. */
export function eraseCell(doc: DungeonDoc, cell: Axial): DungeonDoc {
  const key = axialKey(cell);
  if (!floorKeys(doc).has(key)) return doc;
  const touches = (e: Edge) => axialKey(e[0]) === key || axialKey(e[1]) === key;
  return {
    ...doc,
    scenery: doc.scenery.filter((c) => axialKey(c) !== key),
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
    // A wall goes with the cell only when the cell is one of its OWN
    // footprint (design §2.2's cascade): a line whose footprint the
    // erase empties stands nowhere, and one that merely passed nearby
    // is left alone. A door goes when its crossing touched the cell.
    walls: doc.walls.filter((w) => {
      const { a, b } = wallLattice(doc.orientation, w);
      const footprint = wallFootprint(doc.orientation, a, b);
      return footprint.some(
        (c) => axialKey(c) !== key && floorKeys(doc).has(axialKey(c))
      );
    }),
    doors: doc.doors.filter((d) => {
      const crossing = doorCrossing(doc, d);
      return crossing !== null && !touches(crossing);
    }),
    start: doc.start && axialKey(doc.start) === key ? null : doc.start,
    place: doc.place.filter((p) => axialKey(p.at) !== key),
  };
}

/** Add one wall: the line between two picked positions (design §2.6).
 *
 * IDEMPOTENT AND UNDIRECTED: a line already in `walls[]` — either way
 * round, since a wall has no direction — is not added twice. The two
 * ends are stored exactly as picked, which is how a corner is written:
 * picking a position another wall already ends at copies that position,
 * and the two entries then carry the same `{cell, offset}` (F5).
 *
 * REFUSED IN PLACE, returning the same doc, when the line is not one of
 * the twelve directions (F13) or when its footprint holds no floor at
 * all (C2 — a wall standing in nothing). The picker only ever offers
 * legal ends, so these are the guards for a caller that did not go
 * through it, not the author's normal path. */
export function addWall(
  doc: DungeonDoc,
  start: PositionRef,
  end: PositionRef,
  height?: number
): DungeonDoc {
  const o = doc.orientation;
  const a = latticeOf(o, start);
  const b = latticeOf(o, end);
  if (wallDirection(a, b) === null) return doc;
  const floor = floorKeys(doc);
  if (!wallFootprint(o, a, b).some((c) => floor.has(axialKey(c)))) return doc;
  const key = wallKey(o, { start, end });
  if (doc.walls.some((w) => wallKey(o, w) === key)) return doc;
  const wall: WallDoc = { start, end };
  if (height !== undefined) wall.height = height;
  return { ...doc, walls: [...doc.walls, wall] };
}

/** A wall's identity: its two ends on the lattice, unordered — a wall
 * drawn from either end is the same wall. */
export function wallKey(o: Orientation, wall: WallDoc): string {
  const a = latticeKey(latticeOf(o, wall.start));
  const b = latticeKey(latticeOf(o, wall.end));
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** Remove walls by index — the wall selection's Delete. */
export function removeWalls(doc: DungeonDoc, indexes: number[]): DungeonDoc {
  const drop = new Set(indexes);
  if (drop.size === 0) return doc;
  const walls = doc.walls.filter((_, i) => !drop.has(i));
  return walls.length === doc.walls.length ? doc : { ...doc, walls };
}

/** Stamp `height` on the selected walls — the height stepper's commit
 * (rpg-project#273). `undefined` clears back to standard. Height belongs
 * to the WALL now, so nothing splits: a wall is one line and one height
 * by construction, which is what the run's chain-level stamp was
 * approximating. */
export function setWallHeights(
  doc: DungeonDoc,
  indexes: number[],
  height: number | undefined
): DungeonDoc {
  const chosen = new Set(indexes);
  let changed = false;
  const walls = doc.walls.map((wall, i) => {
    if (!chosen.has(i) || wall.height === height) return wall;
    changed = true;
    const next: WallDoc = { start: wall.start, end: wall.end };
    if (wall.name !== undefined) next.name = wall.name;
    if (height !== undefined) next.height = height;
    return next;
  });
  return changed ? { ...doc, walls } : doc;
}

/** Name a wall — "north wall" beats `walls[7]` for the streamer reading
 * the file and the errors about it. An empty name clears the field. */
export function setWallName(
  doc: DungeonDoc,
  index: number,
  name: string
): DungeonDoc {
  const wall = doc.walls[index];
  if (!wall) return doc;
  const next: WallDoc = { start: wall.start, end: wall.end };
  if (name.trim() !== '') next.name = name;
  if (wall.height !== undefined) next.height = wall.height;
  return { ...doc, walls: doc.walls.map((w, i) => (i === index ? next : w)) };
}

/** Door tool: a click on a position a wall passes through (design §2.8).
 * Clicking a position that already carries a door removes it; otherwise
 * a new door stands there.
 *
 * REFUSED IN PLACE when no wall passes through the position (F10) or
 * when the position is a centre, which is the midpoint of no side and so
 * opens no crossing. A door in a wall that seals both its cells IS legal
 * (F11a — nobody passes it, sight does; the designer labels it), so
 * nothing about standability is checked here. */
export function toggleDoorAt(doc: DungeonDoc, at: PositionRef): DungeonDoc {
  const o = doc.orientation;
  const key = positionKey(o, at);
  const existing = doc.doors.findIndex((d) => positionKey(o, d.at) === key);
  if (existing !== -1) {
    return { ...doc, doors: doc.doors.filter((_, i) => i !== existing) };
  }
  if (positionCrossing(o, latticeOf(o, at)) === null) return doc;
  if (wallsThrough(doc, at).length === 0) return doc;
  return { ...doc, doors: [...doc.doors, { id: nextDoorId(doc), at }] };
}

function nextDoorId(doc: DungeonDoc): string {
  const taken = new Set(doc.doors.map((d) => d.id));
  let n = doc.doors.length + 1;
  while (taken.has(`door-${n}`)) n += 1;
  return `door-${n}`;
}

export function updateDoor(
  doc: DungeonDoc,
  doorId: string,
  patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked' | 'concealed'>>
): DungeonDoc {
  return {
    ...doc,
    doors: doc.doors.map((d) => {
      if (d.id !== doorId) return d;
      const next: DoorDoc = { ...d, ...patch };
      if (!next.closed) delete next.closed;
      if (!next.locked) delete next.locked;
      if (!next.concealed) delete next.concealed;
      return next;
    }),
  };
}

/** The party's entry cell. STANDABLE floor only (design §2.4/F2): the
 * start on scenery is a file the server refuses, and refusing it here in
 * place — the same doc back — is what lets the caller say why. */
export function setStart(doc: DungeonDoc, cell: Axial | null): DungeonDoc {
  if (cell && !isStandable(doc, cell)) return doc;
  return { ...doc, start: cell };
}

/** Drop a placement on a floor cell; one placement per cell — a drop
 * on an occupied cell replaces it. `blocks_*` are written explicitly for
 * props (prefilled by the caller from the catalog) and never for
 * monsters. `facing`/`offset` are copied through when the caller
 * supplies them (Copilot review, PR #795: silently dropping them here
 * would strand a caller that prefills a facing/offset at drop time),
 * REFUSED on monsters same as `blocks_*`. */
export function placeAt(doc: DungeonDoc, placement: PlacementDoc): DungeonDoc {
  // A PROP DROPS ON SCENERY, A MONSTER DOES NOT (design §2.4, F2): props
  // want floor, feet want standable floor. Refused in place — the same
  // doc back — so the caller shows the reason rather than the drop just
  // not happening.
  const room = isMonsterRef(placement.ref)
    ? isStandable(doc, placement.at)
    : isFloor(doc, placement.at);
  if (!room) return doc;
  const key = axialKey(placement.at);
  const clean: PlacementDoc = { ref: placement.ref, at: placement.at };
  if (isMonsterRef(placement.ref)) {
    if (placement.targeting) clean.targeting = placement.targeting;
    if (placement.boss) clean.boss = true;
  } else {
    clean.blocksMovement = placement.blocksMovement ?? false;
    clean.blocksLos = placement.blocksLos ?? false;
    if (placement.facing !== undefined) clean.facing = placement.facing;
    if (placement.offset !== undefined) clean.offset = placement.offset;
  }
  return {
    ...doc,
    place: [...doc.place.filter((p) => axialKey(p.at) !== key), clean],
  };
}

export function removePlacement(doc: DungeonDoc, index: number): DungeonDoc {
  return { ...doc, place: doc.place.filter((_, i) => i !== index) };
}

export function updatePlacement(
  doc: DungeonDoc,
  index: number,
  patch: Partial<Omit<PlacementDoc, 'ref' | 'at'>>
): DungeonDoc {
  return {
    ...doc,
    place: doc.place.map((p, i) => {
      if (i !== index) return p;
      const next: PlacementDoc = { ...p, ...patch };
      if (next.boss === false) delete next.boss;
      if (next.targeting === '') delete next.targeting;
      if (next.facing === undefined) delete next.facing;
      if (next.offset === undefined) delete next.offset;
      // Same REFUSED-on-monsters rule placeAt enforces at creation
      // (Copilot review, PR #795): updatePlacement is the OTHER way a
      // facing/offset patch reaches a placement, so it needs the same
      // guard or a monster could pick one up post-creation.
      if (isMonsterRef(next.ref)) {
        delete next.facing;
        delete next.offset;
      }
      return next;
    }),
  };
}

export function addRegion(doc: DungeonDoc): DungeonDoc {
  const taken = new Set(doc.regions.map((r) => r.id));
  let n = doc.regions.length + 1;
  while (taken.has(`region-${n}`)) n += 1;
  return {
    ...doc,
    regions: [
      ...doc.regions,
      {
        id: `region-${n}`,
        name: `Region ${n}`,
        archetype: 'crypt',
        lighting: { intensity: 0.6 },
        cells: [],
      },
    ],
  };
}

export function removeRegion(doc: DungeonDoc, regionId: string): DungeonDoc {
  const region = doc.regions.find((r) => r.id === regionId);
  if (!region) return doc;
  let next = doc;
  for (const cell of region.cells) next = eraseCell(next, cell);
  return { ...next, regions: next.regions.filter((r) => r.id !== regionId) };
}

export function updateRegion(
  doc: DungeonDoc,
  regionId: string,
  patch: Partial<
    Pick<RegionDoc, 'id' | 'name' | 'archetype' | 'lighting' | 'concealed'>
  >
): DungeonDoc {
  return {
    ...doc,
    regions: doc.regions.map((r) => {
      if (r.id !== regionId) return r;
      const next: RegionDoc = { ...r, ...patch };
      if (!next.concealed) delete next.concealed;
      return next;
    }),
  };
}

/** Apply `deriveConcealment` to `doc`, ratcheted against `priorDerivedIds`
 * — the region ids THIS function itself set concealed last time it ran
 * (rpg-dnd5e-web#893). A region newly required goes to `concealed: true`;
 * a region no longer required comes back off ONLY when it is in
 * `priorDerivedIds` — concealment a person set by hand (never in that
 * set, because this function never put it there) is never touched, so
 * unmarking a door cannot silently strip a hand-authored secret. Returns
 * the SAME doc when nothing changed, same convention as every mutator
 * here. */
export function applyDerivedConcealment(
  doc: DungeonDoc,
  priorDerivedIds: ReadonlySet<string>
): { doc: DungeonDoc; derivedIds: Set<string> } {
  const { regionIds } = deriveConcealment(doc);
  if (regionIds === null) {
    return { doc, derivedIds: new Set(priorDerivedIds) };
  }
  let changed = false;
  const regions = doc.regions.map((r): RegionDoc => {
    if (regionIds.has(r.id)) {
      if (r.concealed) return r;
      changed = true;
      return { ...r, concealed: true };
    }
    if (r.concealed && priorDerivedIds.has(r.id)) {
      changed = true;
      const next: RegionDoc = { ...r };
      delete next.concealed;
      return next;
    }
    return r;
  });
  return {
    doc: changed ? { ...doc, regions } : doc,
    derivedIds: regionIds,
  };
}

export function updateDungeon(
  doc: DungeonDoc,
  patch: Partial<Pick<DungeonDoc, 'key' | 'name' | 'void'>>
): DungeonDoc {
  return { ...doc, ...patch };
}

// ---------------------------------------------------------------------------
// Server error paths → the thing on the canvas
// ---------------------------------------------------------------------------

/** What a `FieldError.path` points at, resolved against the emitted
 * order. `kind: 'document'` is a path the canvas has nothing to show for
 * (`key`, `version`, an unparseable path) — it is listed, not drawn. */
export type ErrorTarget =
  | { kind: 'cell'; cell: Axial }
  | { kind: 'wall'; index: number }
  | { kind: 'placement'; index: number; cell: Axial }
  | { kind: 'region'; regionId: string }
  | { kind: 'door'; doorId: string }
  | { kind: 'start' }
  | { kind: 'document' };

export function resolveErrorPath(doc: DungeonDoc, path: string): ErrorTarget {
  const layout = emittedLayout(doc);
  if (path === 'start' || path.startsWith('start.')) return { kind: 'start' };

  let m = /^regions\[(\d+)\]\.cells\[(\d+)\]\[(\d+)\]/.exec(path);
  if (m) {
    const cell = layout.regions[+m[1]]?.rows[+m[2]]?.[+m[3]];
    return cell ? { kind: 'cell', cell } : { kind: 'document' };
  }
  // Scenery rows are addressed exactly like a region's cells — the whole
  // reason both use the same encoding — so a refusal naming a scenery
  // cell (design §2.5, and the C4 walk's own message) lands on the cell.
  m = /^scenery\[(\d+)\]\[(\d+)\]/.exec(path);
  if (m) {
    const cell = layout.scenery[+m[1]]?.[+m[2]];
    return cell ? { kind: 'cell', cell } : { kind: 'document' };
  }

  m = /^regions\[(\d+)\]/.exec(path);
  if (m) {
    const region = layout.regions[+m[1]]?.region;
    return region
      ? { kind: 'region', regionId: region.id }
      : { kind: 'document' };
  }
  // A wall's defect names the WALL, whichever field of it the compiler
  // faulted (`walls[3].start.offset`, `walls[3].height`) — a wall is one
  // line, so there is no smaller thing on the canvas to point at. The
  // path resolves to the wall's index in the EMITTED order, which is the
  // order the compiler read.
  m = /^walls\[(\d+)\]/.exec(path);
  if (m) {
    const index = doc.walls.indexOf(layout.walls[+m[1]]);
    return index === -1 ? { kind: 'document' } : { kind: 'wall', index };
  }
  m = /^doors\[(\d+)\]/.exec(path);
  if (m) {
    const door = layout.doors[+m[1]];
    return door ? { kind: 'door', doorId: door.id } : { kind: 'document' };
  }
  m = /^place\[(\d+)\]/.exec(path);
  if (m) {
    const placement = doc.place[+m[1]];
    return placement
      ? { kind: 'placement', index: +m[1], cell: placement.at }
      : { kind: 'document' };
  }
  return { kind: 'document' };
}

/** Resolve the compiler's paths ONCE, so the board and the error list are
 * handed the same targets. */
export function resolveErrorTargets(
  doc: DungeonDoc,
  paths: string[]
): ErrorTarget[] {
  return paths.map((p) => resolveErrorPath(doc, p));
}
