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
}

export interface LockDoc {
  dc: number;
  ability: string;
}

export interface DoorDoc {
  id: string;
  edges: Edge[];
  /** Omitted = open doorway; `closed` = shut, not locked; `locked` wins. */
  closed?: boolean;
  locked?: LockDoc;
}

export interface PlacementDoc {
  ref: string;
  at: Axial;
  /** REQUIRED on props, REFUSED on monsters (server rule). Written
   * explicitly whenever present — never defaulted. */
  blocksMovement?: boolean;
  blocksLos?: boolean;
  /** Props only, REFUSED on monsters (server rule, rpg-project#261).
   * The authored word verbatim — one of the SIX names valid under the
   * dungeon's own `orientation` (`facingYaw.ts`'s `FACING_NAMES`).
   * Omitted means the asset's own default orientation. This module
   * only checks the SHAPE (a string); whether it's one of the six
   * valid names is the server's call, surfaced as a `place[i].facing`
   * `FieldError` like any other field. */
  facing?: string;
  /** Props only, REFUSED on monsters. A within-cell visual nudge, each
   * component a fraction of the cell size in `[-0.5, 0.5]` — VISUAL
   * ONLY (design's "presentation never decides mechanics" law: the
   * prop still occupies its whole cell for movement and LOS). Omitted
   * means centered; `[0, 0]` means the same thing but stays written if
   * the caller wrote it (no silent collapsing). Bounds are the
   * server's call, surfaced the same way as `facing`'s.
   */
  offset?: [number, number];
  /** Monsters only; opaque to the builder. */
  targeting?: string;
  boss?: boolean;
}

export interface DungeonDoc {
  version: 2;
  key: string;
  name: string;
  orientation: Orientation;
  void: VoidKind;
  regions: RegionDoc[];
  start: Axial | null;
  walls: Edge[];
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
function offsetPair(v: unknown, path: string): [number, number] {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !Number.isFinite(v[0]) ||
    !Number.isFinite(v[1])
  ) {
    throw new DungeonParseError(`${path}: expected [x,y]`);
  }
  return [v[0] as number, v[1] as number];
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
    expectKeys(r, ['id', 'name', 'archetype', 'lighting', 'cells'], path);
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
    return {
      id: str(r, 'id', path),
      name: str(r, 'name', path, ''),
      archetype: str(r, 'archetype', path, ''),
      lighting: { intensity },
      cells,
    };
  });

  const start =
    raw.start === undefined || raw.start === null
      ? null
      : fromOffset(orientation, pair(raw.start, 'start'));

  const walls = list(raw.walls, 'walls').map((w, i) =>
    edge(w, `walls[${i}]`, orientation)
  );

  const doors = list(raw.doors, 'doors').map((d, i): DoorDoc => {
    const path = `doors[${i}]`;
    if (!isRecord(d)) throw new DungeonParseError(`${path}: expected a map`);
    expectKeys(d, ['id', 'edges', 'closed', 'locked'], path);
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
      if (!isRecord(d.locked)) {
        throw new DungeonParseError(`${path}.locked: expected a map`);
      }
      expectKeys(d.locked, ['dc', 'ability'], `${path}.locked`);
      if (!Number.isInteger(d.locked.dc)) {
        throw new DungeonParseError(`${path}.locked.dc: expected an integer`);
      }
      door.locked = {
        dc: d.locked.dc as number,
        ability: str(d.locked, 'ability', `${path}.locked`),
      };
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
  walls: Edge[];
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
    walls: sortedEdges(doc.walls),
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
    for (const w of layout.walls) out.push(`  - ${fmtEdge(o, w)}`);
  }

  if (doc.doors.length === 0) {
    out.push('doors: []');
  } else {
    out.push('doors:');
    for (const { door: d, edges } of layout.doors) {
      out.push(`  - id: ${scalar(d.id)}`);
      out.push(`    edges: [${edges.map((e) => fmtEdge(o, e)).join(',')}]`);
      if (d.locked) {
        out.push(
          `    locked: { dc: ${d.locked.dc}, ability: ${scalar(d.locked.ability)} }`
        );
      } else if (d.closed) {
        out.push('    closed: true');
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
        fields.push(`offset: [${p.offset[0]}, ${p.offset[1]}]`);
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
  return new Set(doc.walls.map(edgeKey));
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
    walls: doc.walls.filter((w) => !touches(w)),
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
  if (!edgeIsOfferable(doc, e) || doorEdgeOwners(doc).has(key)) return doc;
  const exists = doc.walls.some((w) => edgeKey(w) === key);
  return {
    ...doc,
    walls: exists
      ? doc.walls.filter((w) => edgeKey(w) !== key)
      : [...doc.walls, normalizeEdge(e)],
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

/** Add every offerable, non-door, not-already-present edge of `edges`
 * to `walls[]` — the wall gesture's commit (rpg-dnd5e-web#804). Unlike
 * `toggleWall`, drawing over an existing wall is IDEMPOTENT (the design's
 * dedup rule): an edge already present is skipped, never removed. Door
 * edges are skipped (an edge in both lists is a validation failure the
 * gesture never authors) and the chain simply breaks there. Returns the
 * same doc when nothing survives the filter. */
export function addWalls(doc: DungeonDoc, edges: Edge[]): DungeonDoc {
  const owners = floorOwners(doc);
  const doorKeys = doorEdgeOwners(doc);
  const present = wallKeys(doc);
  const toAdd: Edge[] = [];
  for (const e of edges) {
    const key = edgeKey(e);
    if (
      !edgeOfferableWith(owners, e) ||
      doorKeys.has(key) ||
      present.has(key)
    ) {
      continue;
    }
    present.add(key);
    toAdd.push(normalizeEdge(e));
  }
  return toAdd.length === 0 ? doc : { ...doc, walls: [...doc.walls, ...toAdd] };
}

/** Remove every edge of `edges` from `walls[]` — the erase drag's commit
 * and the wall selection's Delete (rpg-dnd5e-web#804). Door edges are
 * untouchable by construction: they are never IN `walls[]` (an edge is a
 * wall OR a door), so filtering `walls` alone is the whole rule. */
export function removeWalls(doc: DungeonDoc, edges: Edge[]): DungeonDoc {
  const keys = new Set(edges.map(edgeKey));
  const walls = doc.walls.filter((w) => !keys.has(edgeKey(w)));
  return walls.length === doc.walls.length ? doc : { ...doc, walls };
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
    walls: doc.walls.filter((w) => !seen.has(edgeKey(w))),
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
  const walls = doc.walls.filter((w) => edgeKey(w) !== key);
  const target = doorId && doc.doors.find((d) => d.id === doorId);
  if (target) {
    return {
      ...doc,
      walls,
      doors: doc.doors.map((d) =>
        d.id === target.id ? { ...d, edges: [...d.edges, normalizeEdge(e)] } : d
      ),
    };
  }
  return {
    ...doc,
    walls,
    doors: [...doc.doors, { id: nextDoorId(doc), edges: [normalizeEdge(e)] }],
  };
}

export function updateDoor(
  doc: DungeonDoc,
  doorId: string,
  patch: Partial<Pick<DoorDoc, 'id' | 'closed' | 'locked'>>
): DungeonDoc {
  return {
    ...doc,
    doors: doc.doors.map((d) => {
      if (d.id !== doorId) return d;
      const next: DoorDoc = { ...d, ...patch };
      if (!next.closed) delete next.closed;
      if (!next.locked) delete next.locked;
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
  patch: Partial<Pick<RegionDoc, 'id' | 'name' | 'archetype' | 'lighting'>>
): DungeonDoc {
  return {
    ...doc,
    regions: doc.regions.map((r) =>
      r.id === regionId ? { ...r, ...patch } : r
    ),
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
  m = /^walls\[(\d+)\]/.exec(path);
  if (m) {
    const edge = layout.walls[+m[1]];
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
