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
  axialKey,
  axialNeighbors,
  compareAxial,
  edgeKey,
  fromOffset,
  normalizeEdge,
  toOffset,
  type Axial,
  type Edge,
  type OffsetPair,
  type Orientation,
} from './hexOffset';

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
  edges: Edge[];
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

/** One authored wall entry: a RUN — the edges of one drawn stroke, in the
 * order they were drawn, with the height they share (rpg-project#355).
 *
 * The run is STORED rather than derived because it cannot be derived.
 * Measured on a real dungeon: all 134 of its degree-2 corners turn 60°, so
 * on a hex grid a room corner and a zigzag step are the same angle and no
 * local rule separates them. The only thing that can is `authoredWallRuns`'
 * non-local `CHAIN_TOLERANCE`, which exists to tile wall meshes — and a
 * rendering constant must never decide how files on disk are grouped.
 *
 * A GROUP HAS NO MECHANICAL CONSEQUENCE. The server flattens it, the same
 * edges grouped differently compile identically, and `computeAuthoredWallRuns`
 * still derives its own runs from flattened edges without ever seeing one.
 * That inertness is what keeps rpg-project#273's order-invariance intact
 * while its "runs are DERIVED" ruling narrows to the renderer's run.
 *
 * In the file a run of one still writes as the bare pair (or `{ between,
 * height }`), so a flat dungeon re-emits byte-identically and nothing on
 * disk has to migrate. */
export interface WallDoc {
  /** The crossings this run passes through, in author order. NEVER empty —
   * a run of nothing stands nowhere, and the emitter drops one rather than
   * write it. Contiguity is deliberately NOT a rule (rpg-project#355): a
   * group the author finds useful can never be wrong, so erasing an edge
   * out of the middle leaves a run with a hole rather than a refusal. */
  edges: Edge[];
  /** The run's display name, for the human reading the file and the errors
   * about it — "north wall" beats `walls[7]` for the streamers who author
   * these. Carried, never interpreted. */
  name?: string;
  /** Raise-only MULTIPLIER of the standard rendered wall height, in
   * `[1, 3]` (rpg-project#273's ruling: walls raise, they never
   * lower). Omitted means standard — exactly what writing `1` means.
   * Bounds are the server's call, surfaced as a `walls[i].height`
   * `FieldError` like any other field; this module only checks the
   * SHAPE (a finite number). It applies to EVERY edge of the run, which
   * is why stamping a height on part of one SPLITS it. VISUAL ONLY: a wall
   * blocks movement and sight identically — and cannot be seen past — at
   * every height. */
  height?: number;
}

/** Every wall edge in the doc, flattened — for the readers that care about
 * crossings rather than about how the author grouped them. */
export function wallEdges(doc: DungeonDoc): Edge[] {
  return doc.walls.flatMap((w) => w.edges);
}

/** Every wall edge that reaches the ATLAS, carrying the height of the run it
 * came from — the client's mirror of the server's `wallsOf`: runs flattened,
 * and the crossings a door stands in SUBTRACTED (rpg-project#355).
 *
 * Anything building a preview atlas out of a doc must use this rather than
 * `wallEdges`, or it draws a wall straight across a doorway: a run is now
 * allowed to keep the edge its door sits in, and the compiler is what hands
 * that edge back to the door. */
export function compiledWalls(
  doc: DungeonDoc
): { edge: Edge; height?: number }[] {
  const doors = doorEdgeOwners(doc);
  const out: { edge: Edge; height?: number }[] = [];
  for (const run of doc.walls) {
    for (const edge of run.edges) {
      if (doors.has(edgeKey(edge))) continue;
      out.push(
        run.height === undefined ? { edge } : { edge, height: run.height }
      );
    }
  }
  return out;
}

/** Each wall edge mapped to the height of the run holding it — the readers
 * that ask "what height is this crossing drawn at" want the RUN's answer,
 * since height belongs to the run and every edge in one shares it. An edge
 * with no authored height maps to `undefined`, exactly as before. */
export function wallHeightByEdge(
  doc: DungeonDoc
): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  for (const run of doc.walls) {
    for (const edge of run.edges) out.set(edgeKey(edge), run.height);
  }
  return out;
}

/** A run carrying exactly `edges`, with `from`'s attributes — the one place
 * a rebuilt run is minted, so `height`/`name` are never half-copied. */
function runLike(from: WallDoc, edges: Edge[]): WallDoc {
  const next: WallDoc = { edges };
  if (from.height !== undefined) next.height = from.height;
  if (from.name !== undefined) next.name = from.name;
  return next;
}

/** Rebuild `walls` by rewriting each run's edge list, dropping runs left
 * with nothing. Returns the SAME array identity when no run changed, so
 * every caller's "did anything happen?" check stays a reference compare. */
function mapWallEdges(
  walls: WallDoc[],
  f: (edges: Edge[], run: WallDoc) => Edge[]
): WallDoc[] {
  let changed = false;
  const out: WallDoc[] = [];
  for (const run of walls) {
    const edges = f(run.edges, run);
    if (edges.length !== run.edges.length) changed = true;
    if (edges.length > 0)
      out.push(edges === run.edges ? run : runLike(run, edges));
  }
  return changed ? out : walls;
}

export interface DungeonDoc {
  version: 2;
  key: string;
  name: string;
  orientation: Orientation;
  void: VoidKind;
  regions: RegionDoc[];
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

function edge(v: unknown, path: string, o: Orientation): Edge {
  if (!Array.isArray(v) || v.length !== 2) {
    throw new DungeonParseError(`${path}: expected [[col,row],[col,row]]`);
  }
  return [
    fromOffset(o, pair(v[0], `${path}[0]`)),
    fromOffset(o, pair(v[1], `${path}[1]`)),
  ];
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

  const start =
    raw.start === undefined || raw.start === null
      ? null
      : fromOffset(orientation, pair(raw.start, 'start'));

  const walls = list(raw.walls, 'walls').map((w, i): WallDoc => {
    const path = `walls[${i}]`;
    if (Array.isArray(w)) return { edges: [edge(w, path, orientation)] };
    if (isRecord(w)) {
      expectKeys(w, ['between', 'edges', 'height', 'name'], path);
      // `between` and `edges` are the same fact at two scales, so a file
      // saying both means two things at once — refused rather than resolved
      // by precedence, matching the server's own refusal.
      const hasBetween = w.between !== undefined && w.between !== null;
      const hasEdges = w.edges !== undefined && w.edges !== null;
      if (hasBetween && hasEdges) {
        throw new DungeonParseError(
          `${path}: a wall says \`between\` for one edge or \`edges\` for a run, never both`
        );
      }
      let edges: Edge[];
      if (hasBetween) {
        edges = [edge(w.between, `${path}.between`, orientation)];
      } else if (hasEdges) {
        edges = list(w.edges, `${path}.edges`).map((e, j) =>
          edge(e, `${path}.edges[${j}]`, orientation)
        );
        if (edges.length === 0) {
          throw new DungeonParseError(
            `${path}.edges: a wall run with no edges stands nowhere`
          );
        }
      } else {
        throw new DungeonParseError(
          `${path}: a wall object must name its edge in \`between\` or its run in \`edges\``
        );
      }
      const wall: WallDoc = { edges };
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
    }
    throw new DungeonParseError(
      `${path}: expected [[col,row],[col,row]], { between, height } or { edges, height, name }`
    );
  });

  const doors = list(raw.doors, 'doors').map((d, i): DoorDoc => {
    const path = `doors[${i}]`;
    if (!isRecord(d)) throw new DungeonParseError(`${path}: expected a map`);
    expectKeys(d, ['id', 'edges', 'closed', 'locked', 'concealed'], path);
    const door: DoorDoc = {
      id: str(d, 'id', path),
      edges: list(d.edges, `${path}.edges`).map((e, j) =>
        edge(e, `${path}.edges[${j}]`, orientation)
      ),
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
  walls: WallDoc[];
  doors: { door: DoorDoc; edges: Edge[] }[];
}

export function emittedLayout(doc: DungeonDoc): EmittedLayout {
  const o = doc.orientation;
  const byOffset = (a: Axial, b: Axial) =>
    compareOffset(toOffset(o, a), toOffset(o, b));
  return {
    regions: doc.regions.map((region) => {
      const sorted = [...region.cells].sort(byOffset);
      const rows: Axial[][] = [];
      for (const cell of sorted) {
        const last = rows[rows.length - 1];
        if (last && toOffset(o, last[0])[1] === toOffset(o, cell)[1]) {
          last.push(cell);
        } else rows.push([cell]);
      }
      return { region, rows };
    }),
    walls: sortedWalls(doc.walls),
    doors: doc.doors.map((door) => ({ door, edges: sortedEdges(door.edges) })),
  };
}

function fmtEdge(o: Orientation, e: Edge): string {
  const [a, b] = normalizeEdge(e);
  return `[${fmtPair(toOffset(o, a))},${fmtPair(toOffset(o, b))}]`;
}

function sortedEdges(edges: Edge[]): Edge[] {
  return edges.map(normalizeEdge).sort((x, y) => {
    return compareAxial(x[0], y[0]) || compareAxial(x[1], y[1]);
  });
}

/** `sortedEdges` for wall RUNS: each run's edges keep the order the author
 * drew them — that order is the intent the run exists to record — and the
 * runs themselves sort by their first edge, so `walls[i]` in the emitted
 * file and in a compiler error path name the same entry.
 *
 * A document of one-edge runs sorts exactly as the flat list always did, so
 * a dungeon nobody has regrouped re-emits byte-identically. */
function sortedWalls(walls: WallDoc[]): WallDoc[] {
  return walls
    .map((w) => runLike(w, w.edges.map(normalizeEdge)))
    .sort((x, y) => {
      const [xa, xb] = x.edges[0];
      const [ya, yb] = y.edges[0];
      return compareAxial(xa, ya) || compareAxial(xb, yb);
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

  if (doc.start) {
    const [c, r] = toOffset(o, doc.start);
    out.push(`start: [${c}, ${r}]`);
  }

  if (doc.walls.length === 0) {
    out.push('walls: []');
  } else {
    out.push('walls:');
    for (const w of layout.walls) {
      // A run of one with nothing else to say stays the bare pair — the
      // common form, and what keeps an unregrouped dungeon byte-identical.
      if (w.edges.length === 1 && w.name === undefined) {
        out.push(
          w.height === undefined
            ? `  - ${fmtEdge(o, w.edges[0])}`
            : `  - { between: ${fmtEdge(o, w.edges[0])}, height: ${w.height} }`
        );
        continue;
      }
      // A real run: its name and height first, then one edge per line so a
      // diff reads as the edges that moved rather than as a reflowed blob.
      const head: string[] = [];
      if (w.name !== undefined) head.push(`name: ${scalar(w.name)}`);
      if (w.height !== undefined) head.push(`height: ${w.height}`);
      head.push('edges:');
      head.forEach((line, i) => out.push((i === 0 ? '  - ' : '    ') + line));
      for (const e of w.edges) {
        out.push(`      - ${fmtEdge(o, e)}`);
      }
    }
  }

  if (doc.doors.length === 0) {
    out.push('doors: []');
  } else {
    out.push('doors:');
    for (const { door: d, edges } of layout.doors) {
      out.push(`  - id: ${scalar(d.id)}`);
      out.push(`    edges: [${edges.map((e) => fmtEdge(o, e)).join(',')}]`);
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

export const isFloor = (doc: DungeonDoc, cell: Axial): boolean =>
  floorOwners(doc).has(axialKey(cell));

export function wallKeys(doc: DungeonDoc): Set<string> {
  return new Set(wallEdges(doc).map(edgeKey));
}

/** Edge key → door id, for every door edge. */
export function doorEdgeOwners(doc: DungeonDoc): Map<string, string> {
  const owners = new Map<string, string>();
  for (const door of doc.doors) {
    for (const e of door.edges) owners.set(edgeKey(e), door.id);
  }
  return owners;
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
// behind one. This walks the SAME region-for-region "ways" the toolkit's
// own coherence check does (dungeonspec/validate.go's `concealment()`) —
// every non-wall crossing between two DIFFERENT regions, one way per door,
// deduped — so a document this module derives satisfies that check without
// repeating it (this module still "only refuses what it cannot represent",
// per the header comment; the server stays the validator of record).
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

function buildRegionGraph(doc: DungeonDoc): RegionGraph {
  const owners = floorOwners(doc);
  const walls = wallKeys(doc);
  const doorEdges = doorEdgeOwners(doc);
  const doorById = new Map(doc.doors.map((d) => [d.id, d] as const));
  const open: Map<string, Set<string>> = new Map();
  const full: Map<string, Set<string>> = new Map();
  const concealedDoorCrossings = new Map<string, [string, string][]>();
  const seenCrossing = new Set<string>();

  for (const region of doc.regions) {
    for (const cell of region.cells) {
      for (const n of axialNeighbors(cell)) {
        const there = owners.get(axialKey(n));
        if (!there || there === region.id) continue;
        const ek = edgeKey([cell, n]);
        if (seenCrossing.has(ek)) continue;
        seenCrossing.add(ek);
        if (walls.has(ek)) continue; // a wall is not a way in

        const [a, b] =
          region.id <= there ? [region.id, there] : [there, region.id];
        const doorId = doorEdges.get(ek);
        const door = doorId ? doorById.get(doorId) : undefined;
        if (door && door.concealed !== undefined) {
          addRegionEdge(full, a, b);
          const list = concealedDoorCrossings.get(door.id) ?? [];
          if (!list.some(([x, y]) => x === a && y === b)) list.push([a, b]);
          concealedDoorCrossings.set(door.id, list);
          continue; // a concealed door's own crossing never joins `open`
        }
        addRegionEdge(open, a, b);
        addRegionEdge(full, a, b);
      }
    }
  }
  return { open, full, concealedDoorCrossings };
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

/** Paint the whole rectangle `a`..`b` into `regionId` — the room tool's
 * commit (rpg-dnd5e-web#902).
 *
 * A room drawn this way is square BY CONSTRUCTION, which is the point: no
 * gesture tuning makes a freehand drag reliably rectangular, and the author
 * wanted a room rather than eighty-four brush strokes. Cells already owned by
 * another region change hands, exactly as the brush does — the tool paints,
 * it does not negotiate. */
export function paintRect(
  doc: DungeonDoc,
  regionId: string,
  a: Axial,
  b: Axial
): DungeonDoc {
  const wanted = rectCells(doc.orientation, a, b);
  const keys = new Set(wanted.map(axialKey));
  const owners = floorOwners(doc);
  // Nothing to do when every cell is already this region's.
  if (wanted.every((c) => owners.get(axialKey(c)) === regionId)) return doc;
  return {
    ...doc,
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
  if (current === regionId) return doc;
  return {
    ...doc,
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

/** Erase `cell` from the floor entirely. Anything that stood on it —
 * walls, door edges, the start, a placement — goes with it: an edge or
 * a placement off the floor is a file the server refuses, and the
 * canvas never shows one. */
export function eraseCell(doc: DungeonDoc, cell: Axial): DungeonDoc {
  const key = axialKey(cell);
  if (!floorOwners(doc).has(key)) return doc;
  const touches = (e: Edge) => axialKey(e[0]) === key || axialKey(e[1]) === key;
  return {
    ...doc,
    regions: doc.regions.map((region) => {
      const without = region.cells.filter((c) => axialKey(c) !== key);
      return without.length === region.cells.length
        ? region
        : { ...region, cells: without };
    }),
    walls: mapWallEdges(doc.walls, (edges) => edges.filter((e) => !touches(e))),
    doors: doc.doors
      .map((d) => ({ ...d, edges: d.edges.filter((e) => !touches(e)) }))
      .filter((d) => d.edges.length > 0),
    start: doc.start && axialKey(doc.start) === key ? null : doc.start,
    place: doc.place.filter((p) => axialKey(p.at) !== key),
  };
}

/** Toggle a wall on an edge. Both endpoints must be floor and adjacent;
 * an edge that is part of a door is left alone (the server refuses an
 * edge in both lists — the tool simply does not offer it). Returns the
 * same doc for a no-op. */
export function toggleWall(doc: DungeonDoc, e: Edge): DungeonDoc {
  const key = edgeKey(e);
  // A door's crossing is NOT off limits (rpg-project#355): a wall may run
  // through it, and the server hands the edge back to the door at compile.
  if (!edgeIsOfferable(doc, e)) return doc;
  const exists = wallKeys(doc).has(key);
  return {
    ...doc,
    walls: exists
      ? mapWallEdges(doc.walls, (edges) =>
          edges.filter((x) => edgeKey(x) !== key)
        )
      : [...doc.walls, { edges: [normalizeEdge(e)] }],
  };
}

/** An edge the wall/door tools may act on: two adjacent floor cells. */
export function edgeIsOfferable(doc: DungeonDoc, edge: Edge): boolean {
  return edgeOfferableWith(floorOwners(doc), edge);
}

/** `edgeIsOfferable` against a PRECOMPUTED owner map — the batch
 * mutators below run per pointer move on the live preview, so they
 * build `floorOwners` once per call instead of once per edge (Copilot
 * review, PR #808: the per-edge rebuild made a long drag scan the
 * whole floor per candidate, O(chain × floor) instead of O(chain)). */
function edgeOfferableWith(owners: Map<string, string>, [a, b]: Edge): boolean {
  return (
    owners.has(axialKey(a)) &&
    owners.has(axialKey(b)) &&
    Math.abs(a.q - b.q) <= 1 &&
    Math.abs(a.r - b.r) <= 1 &&
    Math.abs(a.q + a.r - b.q - b.r) <= 1 &&
    !(a.q === b.q && a.r === b.r)
  );
}

/** Add the gesture's chain as ONE RUN (rpg-dnd5e-web#804, #900). The drag
 * already knows the wall the author drew; this is where that stops being
 * thrown away — the surviving edges become a single `walls[]` entry in the
 * order they were drawn, which is what makes a dungeon read as the eight
 * walls its author drew rather than as 153 loose edges.
 *
 * Drawing over an existing wall is IDEMPOTENT (the design's dedup rule): an
 * edge already present in ANY run is skipped, never removed or duplicated.
 *
 * A DOOR'S EDGE IS NO LONGER SKIPPED (rpg-project#355). The old rule — an
 * edge is a wall OR a door — is what broke one drawn wall into several
 * entries; now the run keeps the crossing, the door sits in it, and the
 * server subtracts it at compile. Returns the same doc when nothing
 * survives the filter. */
export function addWalls(
  doc: DungeonDoc,
  edges: Edge[],
  height?: number
): DungeonDoc {
  const owners = floorOwners(doc);
  const present = wallKeys(doc);
  const run: Edge[] = [];
  for (const e of edges) {
    const key = edgeKey(e);
    if (!edgeOfferableWith(owners, e) || present.has(key)) continue;
    present.add(key);
    run.push(normalizeEdge(e));
  }
  if (run.length === 0) return doc;
  const wall: WallDoc = { edges: run };
  if (height !== undefined) wall.height = height;
  return { ...doc, walls: [...doc.walls, wall] };
}

/** Stamp `height` on every wall whose edge is in `edges` — the height
 * stepper's commit (rpg-project#273). Chain-level intent: the caller
 * passes the SELECTION's edges and every one of them takes the value,
 * exactly as the door affordance treats a selection. `undefined`
 * clears back to standard. Returns the same doc for a no-op. */
export function setWallHeights(
  doc: DungeonDoc,
  edges: Edge[],
  height: number | undefined
): DungeonDoc {
  const keys = new Set(edges.map(edgeKey));
  let changed = false;
  const walls: WallDoc[] = [];
  for (const run of doc.walls) {
    const touched = run.edges.some((e) => keys.has(edgeKey(e)));
    if (!touched || run.height === height) {
      walls.push(run);
      continue;
    }
    changed = true;
    // Height belongs to the RUN, so stamping part of one splits it into the
    // stamped stretch and what is left either side — the stored form of the
    // chain-break rpg-project#273 already gave the renderer's derived runs.
    let seg: Edge[] = [];
    let segSelected = keys.has(edgeKey(run.edges[0]));
    const flush = () => {
      if (seg.length === 0) return;
      if (segSelected) {
        const next: WallDoc = { edges: seg };
        if (height !== undefined) next.height = height;
        if (run.name !== undefined) next.name = run.name;
        walls.push(next);
      } else {
        walls.push(runLike(run, seg));
      }
      seg = [];
    };
    for (const e of run.edges) {
      const selected = keys.has(edgeKey(e));
      if (selected !== segSelected) {
        flush();
        segSelected = selected;
      }
      seg.push(e);
    }
    flush();
  }
  return changed ? { ...doc, walls } : doc;
}

/** Remove every edge of `edges` from `walls[]` — the erase drag's commit
 * and the wall selection's Delete (rpg-dnd5e-web#804). Door edges are
 * untouchable by construction: they are never IN `walls[]` (an edge is a
 * wall OR a door), so filtering `walls` alone is the whole rule. */
export function removeWalls(doc: DungeonDoc, edges: Edge[]): DungeonDoc {
  const keys = new Set(edges.map(edgeKey));
  const walls = mapWallEdges(doc.walls, (edges) =>
    edges.filter((e) => !keys.has(edgeKey(e)))
  );
  return walls === doc.walls ? doc : { ...doc, walls };
}

/** One door from one drag's chain (rpg-dnd5e-web#804, design: "a door
 * drag's chain becomes ONE door's `edges[]`"). Offerable edges only;
 * edges already belonging to any door are skipped rather than stolen;
 * walls on the surviving edges are replaced, same as `toggleDoorEdge`'s
 * wall-or-door rule. Returns the same doc when no edge survives. */
export function addDoor(doc: DungeonDoc, edges: Edge[]): DungeonDoc {
  const owners = floorOwners(doc);
  const doorKeys = doorEdgeOwners(doc);
  const seen = new Set<string>();
  const clean: Edge[] = [];
  for (const e of edges) {
    const key = edgeKey(e);
    if (!edgeOfferableWith(owners, e) || doorKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    clean.push(normalizeEdge(e));
  }
  if (clean.length === 0) return doc;
  return {
    ...doc,
    doors: [...doc.doors, { id: nextDoorId(doc), edges: clean }],
  };
}

function nextDoorId(doc: DungeonDoc): string {
  const taken = new Set(doc.doors.map((d) => d.id));
  let n = doc.doors.length + 1;
  while (taken.has(`door-${n}`)) n += 1;
  return `door-${n}`;
}

/** Door tool: clicking an edge that is already a door edge removes it
 * from its door (deleting the door when empty); otherwise it joins
 * `doorId` (or a new door). A wall on that edge is replaced — an edge is
 * a wall OR a door, never both. */
export function toggleDoorEdge(
  doc: DungeonDoc,
  e: Edge,
  doorId?: string
): DungeonDoc {
  if (!edgeIsOfferable(doc, e)) return doc;
  const key = edgeKey(e);
  const owner = doorEdgeOwners(doc).get(key);
  if (owner !== undefined) {
    return {
      ...doc,
      doors: doc.doors
        .map((d) =>
          d.id === owner
            ? { ...d, edges: d.edges.filter((x) => edgeKey(x) !== key) }
            : d
        )
        .filter((d) => d.edges.length > 0),
    };
  }
  // The wall under a new door STAYS (rpg-project#355): the run keeps the
  // crossing, the server subtracts it at compile, and deleting the door
  // later restores the wall instead of leaving a hole nobody authored.
  const target = doorId && doc.doors.find((d) => d.id === doorId);
  if (target) {
    return {
      ...doc,
      doors: doc.doors.map((d) =>
        d.id === target.id ? { ...d, edges: [...d.edges, normalizeEdge(e)] } : d
      ),
    };
  }
  return {
    ...doc,
    doors: [...doc.doors, { id: nextDoorId(doc), edges: [normalizeEdge(e)] }],
  };
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

export function setStart(doc: DungeonDoc, cell: Axial | null): DungeonDoc {
  if (cell && !isFloor(doc, cell)) return doc;
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
  if (!isFloor(doc, placement.at)) return doc;
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
  | { kind: 'edge'; edge: Edge }
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
  m = /^regions\[(\d+)\]/.exec(path);
  if (m) {
    const region = layout.regions[+m[1]]?.region;
    return region
      ? { kind: 'region', regionId: region.id }
      : { kind: 'document' };
  }
  m = /^walls\[(\d+)\]\.edges\[(\d+)\]/.exec(path);
  if (m) {
    const edge = layout.walls[+m[1]]?.edges[+m[2]];
    return edge ? { kind: 'edge', edge } : { kind: 'document' };
  }
  m = /^walls\[(\d+)\]/.exec(path);
  if (m) {
    // A defect on the RUN itself (a bad height, say) names no single
    // crossing, so it draws on the run's first edge — where the wall
    // visibly starts. A defect on one edge took the branch above.
    const edge = layout.walls[+m[1]]?.edges[0];
    return edge ? { kind: 'edge', edge } : { kind: 'document' };
  }
  m = /^doors\[(\d+)\]\.edges\[(\d+)\]/.exec(path);
  if (m) {
    const edge = layout.doors[+m[1]]?.edges[+m[2]];
    return edge ? { kind: 'edge', edge } : { kind: 'document' };
  }
  m = /^doors\[(\d+)\]/.exec(path);
  if (m) {
    const door = layout.doors[+m[1]]?.door;
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
