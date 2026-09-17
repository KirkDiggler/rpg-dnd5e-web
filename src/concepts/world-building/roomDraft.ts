import {
  cubeToWorld,
  HEX_SIZE,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { MAX_JSON_LENGTH, validateScene } from './serialization';
import type { KeyValueStorage, WorldScene } from './types';

export const ROOM_DRAFT_STORAGE_KEY =
  'rpg.concepts.world-building.room-draft.v3';
export const LEGACY_ROOM_DRAFT_STORAGE_KEY =
  'rpg.concepts.world-building.room-draft.v2';
export const LEGACY_V1_ROOM_DRAFT_STORAGE_KEY =
  'rpg.concepts.world-building.room-draft.v1';
export const ROOM_DRAFT_KIND = 'rpg-room-authoring-draft' as const;
export const ROOM_WORKSPACE_STEPS = [
  { hexRadius: 6, horizontalLimit: 12 },
  { hexRadius: 10, horizontalLimit: 20 },
  { hexRadius: 14, horizontalLimit: 28 },
] as const;
export const MAX_ROOM_WORKSPACE_HEXES = 631;
export interface RoomWorkspace {
  hexRadius: number;
  horizontalLimit: number;
}

export interface RoomHexCell {
  q: number;
  r: number;
}
export interface RoomFootprint {
  /** Rectangle dimensions in WorldScene coordinate units, local to owner. */
  width: number;
  depth: number;
  offsetX: number;
  offsetZ: number;
}
export interface RoomPropDeclaration {
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
  footprint: RoomFootprint;
}
/** One authored monster actor. `ref` uses the existing monster reference
 * grammar; an unknown-but-syntactically-valid monster id stays editable and
 * is reported as an unavailable model, never dropped or substituted. */
export interface RoomMonsterPlacement {
  id: string;
  ref: string;
  cell: RoomHexCell;
}
export interface RoomGameplayData {
  implicitRegionId: string;
  /** Pointy-top axial q/r cells using shared HEX_SIZE=1 scene units. */
  walkableHexes: RoomHexCell[];
  /** Stable WorldProp id -> authored declaration. */
  propDeclarations: Record<string, RoomPropDeclaration>;
  /** Arrangement id -> template prop id declarations, remapped on each stamp. */
  arrangementDeclarations: Record<string, Record<string, RoomPropDeclaration>>;
  /** Optional authoring metadata; a missing start is never invented. */
  partyStart?: RoomHexCell;
  /** Authoring actor markers only; the encounter owns legality at Play. */
  monsters: RoomMonsterPlacement[];
}
export interface RoomDraft {
  version: 3;
  id: string;
  name: string;
  coordinateFrame: {
    horizontalPlane: 'world-xz';
    verticalAxis: 'world-y-up';
    distanceUnit: 'world-scene-unit';
    hexRadius: 1;
    footprintFrame: 'owner-local-xz';
  };
  workspace: RoomWorkspace;
  scene: WorldScene;
  room: RoomGameplayData;
}
interface RoomDraftEnvelope {
  kind: typeof ROOM_DRAFT_KIND;
  version: 3;
  draft: RoomDraft;
}

const cellKey = (cell: RoomHexCell) => `${cell.q},${cell.r}`;
const defaultRoom = (id: string): RoomGameplayData => ({
  implicitRegionId: `${id}-region`,
  walkableHexes: [],
  propDeclarations: {},
  arrangementDeclarations: {},
  monsters: [],
});

export function createRoomDraft(scene: WorldScene, id: string): RoomDraft {
  return {
    version: 3,
    id,
    name: 'Untitled room',
    coordinateFrame: {
      horizontalPlane: 'world-xz',
      verticalAxis: 'world-y-up',
      distanceUnit: 'world-scene-unit',
      hexRadius: 1,
      footprintFrame: 'owner-local-xz',
    },
    workspace: { ...ROOM_WORKSPACE_STEPS[0] },
    scene: structuredClone(scene),
    room: defaultRoom(id),
  };
}

/** Select complete cells whose shared-hex world centres fall inside an X/Z box. */
export function walkableCellsInWorldRectangle(
  start: WorldPos,
  end: WorldPos,
  hexRadius: number = ROOM_WORKSPACE_STEPS[0].hexRadius
): RoomHexCell[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);
  const cells: Array<RoomHexCell & { worldX: number; worldZ: number }> = [];
  for (let q = -hexRadius; q <= hexRadius; q += 1) {
    for (let r = -hexRadius; r <= hexRadius; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) > hexRadius)
        continue;
      const center = cubeToWorld({ x: q, y: -q - r, z: r }, HEX_SIZE);
      if (
        center.x >= minX &&
        center.x <= maxX &&
        center.z >= minZ &&
        center.z <= maxZ
      ) {
        cells.push({ q, r, worldX: center.x, worldZ: center.z });
      }
    }
  }
  return cells
    .sort((a, b) => a.worldZ - b.worldZ || a.worldX - b.worldX)
    .map(({ q, r }) => ({ q, r }));
}

export function updateWalkableHexes(
  draft: RoomDraft,
  cells: readonly RoomHexCell[],
  mode: 'paint' | 'erase'
): RoomDraft {
  const byKey = new Map(
    draft.room.walkableHexes.map((cell) => [cellKey(cell), cell])
  );
  let changed = false;
  cells.forEach((cell) => {
    if (!isCellWithinWorkspace(cell, draft.workspace.hexRadius)) return;
    const key = cellKey(cell);
    if (mode === 'paint') {
      if (!byKey.has(key)) {
        byKey.set(key, { ...cell });
        changed = true;
      }
    } else if (byKey.delete(key)) {
      changed = true;
    }
  });
  if (!changed) return draft;
  return {
    ...draft,
    room: {
      ...draft.room,
      walkableHexes: [...byKey.values()].sort((a, b) => a.q - b.q || a.r - b.r),
    },
  };
}

/** Structural workspace membership for any axial cell: integral and inside
 * the authored radius. Game legality is never a client question here. */
export function isCellWithinWorkspace(
  cell: RoomHexCell,
  hexRadius: number
): boolean {
  return (
    Number.isInteger(cell.q) &&
    Number.isInteger(cell.r) &&
    Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r)) <=
      hexRadius
  );
}

/** Actor placements, moves and removals are authoring metadata only: each
 * helper shapes data for one whole-room history transaction committed by the
 * editor, and none of them rejects a structurally valid cell as game-illegal.
 * Out-of-workspace cells are refused because the draft format itself is
 * bounded, not because of encounter rules. */
export function placeRoomMonster(
  draft: RoomDraft,
  placement: RoomMonsterPlacement
): RoomDraft {
  if (!placement.id) throw new Error('Monster placement requires a stable id.');
  if (!isCellWithinWorkspace(placement.cell, draft.workspace.hexRadius))
    throw new Error('Monster placement is outside the authoring floor.');
  if (draft.room.monsters.some((monster) => monster.id === placement.id))
    throw new Error(`Monster id is already placed: ${placement.id}.`);
  return {
    ...draft,
    room: {
      ...draft.room,
      monsters: [...draft.room.monsters, structuredClone(placement)],
    },
  };
}

export function moveRoomMonster(
  draft: RoomDraft,
  id: string,
  cell: RoomHexCell
): RoomDraft {
  if (!isCellWithinWorkspace(cell, draft.workspace.hexRadius))
    throw new Error('Monster placement is outside the authoring floor.');
  if (!draft.room.monsters.some((monster) => monster.id === id)) return draft;
  const monsters = draft.room.monsters.map((monster) =>
    monster.id === id ? { ...monster, cell: { ...cell } } : monster
  );
  return { ...draft, room: { ...draft.room, monsters } };
}

export function removeRoomMonster(draft: RoomDraft, id: string): RoomDraft {
  const monsters = draft.room.monsters.filter((monster) => monster.id !== id);
  if (monsters.length === draft.room.monsters.length) return draft;
  return { ...draft, room: { ...draft.room, monsters } };
}

export function setRoomPartyStart(
  draft: RoomDraft,
  cell: RoomHexCell
): RoomDraft {
  if (!isCellWithinWorkspace(cell, draft.workspace.hexRadius))
    throw new Error('Party start is outside the authoring floor.');
  if (
    draft.room.partyStart &&
    draft.room.partyStart.q === cell.q &&
    draft.room.partyStart.r === cell.r
  )
    return draft;
  return { ...draft, room: { ...draft.room, partyStart: { ...cell } } };
}

/** Absence is the authored state: clearing deletes the key instead of
 * leaving a null or origin placeholder behind. */
export function clearRoomPartyStart(draft: RoomDraft): RoomDraft {
  if (!draft.room.partyStart) return draft;
  const room = { ...draft.room };
  delete room.partyStart;
  return { ...draft, room };
}

export function reconcileRoomDraft(
  draft: RoomDraft,
  scene: WorldScene
): RoomDraft {
  const ids = new Set(scene.items.map((item) => item.id));
  return {
    ...draft,
    scene,
    room: {
      ...draft.room,
      propDeclarations: Object.fromEntries(
        Object.entries(draft.room.propDeclarations).filter(([id]) =>
          ids.has(id)
        )
      ),
    },
  };
}

export function remapRoomDeclarations(
  room: RoomGameplayData,
  idMap: ReadonlyMap<string, string>
): RoomGameplayData {
  const mapped: Record<string, RoomPropDeclaration> = {};
  for (const [source, target] of idMap) {
    const declaration = room.propDeclarations[source];
    if (declaration) mapped[target] = structuredClone(declaration);
  }
  return { ...structuredClone(room), propDeclarations: mapped };
}

export function expandRoomWorkspace(draft: RoomDraft): RoomDraft {
  const index = ROOM_WORKSPACE_STEPS.findIndex(
    (step) =>
      step.hexRadius === draft.workspace.hexRadius &&
      step.horizontalLimit === draft.workspace.horizontalLimit
  );
  const next = ROOM_WORKSPACE_STEPS[index + 1];
  return next ? { ...draft, workspace: { ...next } } : draft;
}

function validateCell(cell: unknown, field: string): RoomHexCell {
  if (
    !cell ||
    typeof cell !== 'object' ||
    Array.isArray(cell) ||
    !Number.isInteger((cell as RoomHexCell).q) ||
    !Number.isInteger((cell as RoomHexCell).r)
  )
    throw new Error(`${field} must contain integral axial coordinates.`);
  return { q: (cell as RoomHexCell).q, r: (cell as RoomHexCell).r };
}

/** Structurally exact records only: unknown-invalid fields are refused, not
 * dropped or reinterpreted as valid data. Arrays are never mapping shapes.
 * Exported so sibling strict decoders (e.g. the atlas's room scene
 * presentation) refuse unknown fields by the same words, not a second
 * dialect. */
export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new Error(`${label} has an unsupported field: ${key}.`);
  }
}

export const objectShape = (
  value: unknown,
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};

const FOOTPRINT_KEYS = ['width', 'depth', 'offsetX', 'offsetZ'] as const;

function validateFootprint(value: unknown, owner: string): RoomFootprint {
  const source = objectShape(value, `${owner} footprint`);
  rejectUnknownKeys(source, FOOTPRINT_KEYS, `${owner} footprint`);
  for (const field of FOOTPRINT_KEYS) {
    const n = source[field];
    if (n === undefined || n === null)
      throw new Error(`${owner} footprint is missing ${field}.`);
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      ((field === 'width' || field === 'depth') && (n < 0.1 || n > 12)) ||
      ((field === 'offsetX' || field === 'offsetZ') && Math.abs(n) > 12)
    )
      throw new Error(`Invalid footprint ${field}.`);
  }
  return {
    width: source.width as number,
    depth: source.depth as number,
    offsetX: source.offsetX as number,
    offsetZ: source.offsetZ as number,
  };
}

function validateDeclaration(value: unknown, id: string): RoomPropDeclaration {
  const source = objectShape(value, `Prop declaration for ${id}`);
  rejectUnknownKeys(
    source,
    ['blocksMovement', 'blocksLineOfSight', 'footprint'],
    `Prop declaration for ${id}`
  );
  if (
    typeof source.blocksMovement !== 'boolean' ||
    typeof source.blocksLineOfSight !== 'boolean'
  )
    throw new Error('Prop flags must be boolean.');
  return {
    blocksMovement: source.blocksMovement,
    blocksLineOfSight: source.blocksLineOfSight,
    footprint: validateFootprint(source.footprint, `Prop ${id}`),
  };
}

function validateDeclarationMap(
  value: unknown,
  label: string
): Record<string, RoomPropDeclaration> {
  const source = objectShape(value, label);
  const mapped: Record<string, RoomPropDeclaration> = {};
  for (const [id, declaration] of Object.entries(source)) {
    mapped[id] = validateDeclaration(declaration, id);
  }
  return mapped;
}

const MONSTER_REF_RE = /^[-a-z0-9]+:monsters:[-a-z0-9]+$/;
const MONSTER_KEYS = ['id', 'ref', 'cell'] as const;

function validateMonsters(value: unknown): RoomMonsterPlacement[] {
  if (!Array.isArray(value))
    throw new Error('Monster placements must be an array.');
  const monsters: RoomMonsterPlacement[] = [];
  const ids = new Set<string>();
  for (const [index, placement] of value.entries()) {
    const source = objectShape(
      placement,
      `Monster placement at index ${index}`
    );
    rejectUnknownKeys(
      source,
      MONSTER_KEYS,
      `Monster placement at index ${index}`
    );
    if (typeof source.id !== 'string' || !source.id || ids.has(source.id))
      throw new Error(
        `Invalid monster placement at index ${index}: stable nonempty unique ids are required.`
      );
    if (typeof source.ref !== 'string' || !MONSTER_REF_RE.test(source.ref))
      throw new Error(
        `Monster ${source.id ?? ''} ref must be a monster reference such as dnd5e:monsters:skeleton.`
      );
    ids.add(source.id);
    monsters.push({
      id: source.id,
      ref: source.ref,
      cell: validateCell(source.cell, `Monster ${source.id} cell`),
    });
  }
  return monsters;
}

function validateDraft(value: unknown): RoomDraft {
  if (!value || typeof value !== 'object')
    throw new Error('Room draft must be an object.');
  const input = value as Partial<RoomDraft>;
  if (
    input.version !== 3 ||
    typeof input.id !== 'string' ||
    typeof input.name !== 'string' ||
    !input.coordinateFrame ||
    !input.workspace ||
    !input.room
  )
    throw new Error('Unsupported room draft.');
  rejectUnknownKeys(
    input as Record<string, unknown>,
    ['version', 'id', 'name', 'coordinateFrame', 'workspace', 'scene', 'room'],
    'Room draft'
  );
  const frame = input.coordinateFrame;
  if (
    frame.horizontalPlane !== 'world-xz' ||
    frame.verticalAxis !== 'world-y-up' ||
    frame.distanceUnit !== 'world-scene-unit' ||
    frame.hexRadius !== 1 ||
    frame.footprintFrame !== 'owner-local-xz'
  )
    throw new Error('Unsupported room coordinate frame.');
  rejectUnknownKeys(
    frame as unknown as Record<string, unknown>,
    [
      'horizontalPlane',
      'verticalAxis',
      'distanceUnit',
      'hexRadius',
      'footprintFrame',
    ],
    'Room coordinate frame'
  );
  const workspace = ROOM_WORKSPACE_STEPS.find(
    (step) =>
      step.hexRadius === input.workspace!.hexRadius &&
      step.horizontalLimit === input.workspace!.horizontalLimit
  );
  if (!workspace) throw new Error('Unsupported room workspace extent.');
  const cellBudget = 1 + 3 * workspace.hexRadius * (workspace.hexRadius + 1);
  if (cellBudget > MAX_ROOM_WORKSPACE_HEXES)
    throw new Error('Room workspace exceeds the cell allocation budget.');
  const room = objectShape(input.room, 'Room gameplay data');
  rejectUnknownKeys(
    room,
    [
      'implicitRegionId',
      'walkableHexes',
      'propDeclarations',
      'arrangementDeclarations',
      'partyStart',
      'monsters',
    ],
    'Room gameplay data'
  );
  if (
    typeof room.implicitRegionId !== 'string' ||
    !Array.isArray(room.walkableHexes) ||
    !room.propDeclarations ||
    typeof room.propDeclarations !== 'object' ||
    Array.isArray(room.propDeclarations) ||
    !room.arrangementDeclarations ||
    typeof room.arrangementDeclarations !== 'object' ||
    Array.isArray(room.arrangementDeclarations)
  )
    throw new Error('Invalid room gameplay data.');
  const walkableHexes: RoomHexCell[] = [];
  for (const cell of room.walkableHexes) {
    const parsed = validateCell(cell, 'Walkable cell');
    if (!isCellWithinWorkspace(parsed, workspace.hexRadius))
      throw new Error('Walkable cell is outside the authoring floor.');
    walkableHexes.push(parsed);
  }
  /** Presence must mean an actual integral-cell object; absence stays
   * absent, never an invented origin or a null placeholder. */
  let partyStart: RoomHexCell | undefined;
  if (Object.hasOwn(room, 'partyStart')) {
    const start = validateCell(room.partyStart, 'Party start');
    if (!isCellWithinWorkspace(start, workspace.hexRadius))
      throw new Error('Party start is outside the authoring floor.');
    partyStart = start;
  }
  const propDeclarations: Record<string, RoomPropDeclaration> = {};
  const itemIds = new Set((input.scene?.items ?? []).map((item) => item.id));
  for (const [id, declaration] of Object.entries(room.propDeclarations)) {
    if (!itemIds.has(id))
      throw new Error(`Declaration owner does not exist: ${id}`);
    propDeclarations[id] = validateDeclaration(declaration, id);
  }
  const arrangements = objectShape(
    room.arrangementDeclarations,
    'Arrangement declarations'
  );
  const arrangementDeclarations: Record<
    string,
    Record<string, RoomPropDeclaration>
  > = {};
  for (const [arrangementId, declarations] of Object.entries(arrangements)) {
    arrangementDeclarations[arrangementId] = validateDeclarationMap(
      declarations,
      `Arrangement declarations for ${arrangementId}`
    );
  }
  const monsters = validateMonsters(room.monsters);
  for (const monster of monsters) {
    if (!isCellWithinWorkspace(monster.cell, workspace.hexRadius))
      throw new Error(
        `Monster ${monster.id} cell is outside the authoring floor.`
      );
  }
  const draft: RoomDraft = {
    ...input,
    version: 3,
    id: input.id,
    name: input.name,
    coordinateFrame: {
      horizontalPlane: 'world-xz',
      verticalAxis: 'world-y-up',
      distanceUnit: 'world-scene-unit',
      hexRadius: 1,
      footprintFrame: 'owner-local-xz',
    },
    workspace: { ...workspace },
    scene: validateScene(input.scene, {
      horizontalLimit: workspace.horizontalLimit,
    }),
    room: {
      implicitRegionId: room.implicitRegionId,
      walkableHexes,
      propDeclarations,
      arrangementDeclarations,
      monsters,
      ...(partyStart ? { partyStart } : {}),
    },
  } as RoomDraft;
  return draft;
}

export function stringifyRoomDraft(draft: RoomDraft): string {
  const json = JSON.stringify(
    {
      kind: ROOM_DRAFT_KIND,
      version: 3,
      draft: validateDraft(draft),
    } satisfies RoomDraftEnvelope,
    null,
    2
  );
  // Write-size symmetry with the reader: an oversize draft is refused before
  // any caller can store it, so prior stored bytes are never replaced.
  if (json.length > MAX_JSON_LENGTH)
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  return json;
}
export function parseRoomDraftJson(json: string): RoomDraft {
  if (json.length > MAX_JSON_LENGTH)
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  const envelope = JSON.parse(json) as {
    kind?: unknown;
    version?: unknown;
    draft?: Record<string, unknown>;
  };
  if (envelope.kind !== ROOM_DRAFT_KIND)
    throw new Error('Expected a room authoring draft.');
  if (envelope.version === 1) {
    if (envelope.draft?.version !== 1)
      throw new Error(
        'Expected a version 1 room authoring draft in the legacy envelope.'
      );
    return validateDraft({
      ...envelope.draft,
      version: 3,
      workspace: { ...ROOM_WORKSPACE_STEPS[0] },
      room: { ...(envelope.draft.room as object), monsters: [] },
    });
  }
  if (envelope.version === 2) {
    if (envelope.draft?.version !== 2)
      throw new Error(
        'Expected a version 2 room authoring draft in the legacy envelope.'
      );
    return validateDraft({
      ...envelope.draft,
      version: 3,
      room: { ...(envelope.draft.room as object), monsters: [] },
    });
  }
  if (envelope.version !== 3)
    throw new Error('Expected a version 1, 2 or 3 room authoring draft.');
  return validateDraft(envelope.draft);
}
export function saveRoomDraft(
  storage: KeyValueStorage,
  draft: RoomDraft
): string | null {
  try {
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(draft));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
export function loadRoomDraft(
  storage: KeyValueStorage,
  fallback: RoomDraft
): { value: RoomDraft; error?: string } {
  try {
    const current = storage.getItem(ROOM_DRAFT_STORAGE_KEY);
    // A present-but-empty or malformed current draft is never "absent": it
    // must not recover older keys and must not be silently overwritten by
    // autosave. Recovery requires an explicit valid save/import action.
    if (current !== null) return { value: parseRoomDraftJson(current) };
    const legacyV2 = storage.getItem(LEGACY_ROOM_DRAFT_STORAGE_KEY);
    if (legacyV2 !== null) return { value: parseRoomDraftJson(legacyV2) };
    const legacyV1 = storage.getItem(LEGACY_V1_ROOM_DRAFT_STORAGE_KEY);
    if (legacyV1 !== null) return { value: parseRoomDraftJson(legacyV1) };
    return { value: fallback };
  } catch (error) {
    return {
      value: fallback,
      error: `Room draft load failed; prior data was kept. ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
