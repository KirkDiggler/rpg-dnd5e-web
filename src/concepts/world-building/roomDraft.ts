import {
  cubeToWorld,
  HEX_SIZE,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { validateScene } from './serialization';
import type { KeyValueStorage, WorldScene } from './types';

export const ROOM_DRAFT_STORAGE_KEY =
  'rpg.concepts.world-building.room-draft.v2';
export const LEGACY_ROOM_DRAFT_STORAGE_KEY =
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
export interface RoomGameplayData {
  implicitRegionId: string;
  /** Pointy-top axial q/r cells using shared HEX_SIZE=1 scene units. */
  walkableHexes: RoomHexCell[];
  /** Stable WorldProp id -> authored declaration. */
  propDeclarations: Record<string, RoomPropDeclaration>;
  /** Arrangement id -> template prop id declarations, remapped on each stamp. */
  arrangementDeclarations: Record<string, Record<string, RoomPropDeclaration>>;
}
export interface RoomDraft {
  version: 2;
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
  version: 2;
  draft: RoomDraft;
}

export function createRoomDraft(scene: WorldScene, id: string): RoomDraft {
  return {
    version: 2,
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
    room: {
      implicitRegionId: `${id}-region`,
      walkableHexes: [],
      propDeclarations: {},
      arrangementDeclarations: {},
    },
  };
}

const cellKey = (cell: RoomHexCell) => `${cell.q},${cell.r}`;

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
    if (
      !Number.isInteger(cell.q) ||
      !Number.isInteger(cell.r) ||
      Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r)) >
        draft.workspace.hexRadius
    )
      return;
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

function validateDraft(value: unknown): RoomDraft {
  if (!value || typeof value !== 'object')
    throw new Error('Room draft must be an object.');
  const input = value as Partial<RoomDraft>;
  if (
    input.version !== 2 ||
    typeof input.id !== 'string' ||
    typeof input.name !== 'string' ||
    !input.coordinateFrame ||
    !input.workspace ||
    !input.room
  )
    throw new Error('Unsupported room draft.');
  const frame = input.coordinateFrame;
  if (
    frame.horizontalPlane !== 'world-xz' ||
    frame.verticalAxis !== 'world-y-up' ||
    frame.distanceUnit !== 'world-scene-unit' ||
    frame.hexRadius !== 1 ||
    frame.footprintFrame !== 'owner-local-xz'
  )
    throw new Error('Unsupported room coordinate frame.');
  const workspace = ROOM_WORKSPACE_STEPS.find(
    (step) =>
      step.hexRadius === input.workspace!.hexRadius &&
      step.horizontalLimit === input.workspace!.horizontalLimit
  );
  if (!workspace) throw new Error('Unsupported room workspace extent.');
  const cellBudget = 1 + 3 * workspace.hexRadius * (workspace.hexRadius + 1);
  if (cellBudget > MAX_ROOM_WORKSPACE_HEXES)
    throw new Error('Room workspace exceeds the cell allocation budget.');
  const room = input.room;
  if (
    typeof room.implicitRegionId !== 'string' ||
    !Array.isArray(room.walkableHexes) ||
    !room.propDeclarations ||
    typeof room.propDeclarations !== 'object' ||
    !room.arrangementDeclarations ||
    typeof room.arrangementDeclarations !== 'object'
  )
    throw new Error('Invalid room gameplay data.');
  const draft: RoomDraft = {
    ...input,
    version: 2,
    workspace: { ...workspace },
    scene: validateScene(input.scene, {
      horizontalLimit: workspace.horizontalLimit,
    }),
    room: structuredClone(room),
  } as RoomDraft;
  draft.room.walkableHexes.forEach((cell) => {
    if (
      !Number.isInteger(cell.q) ||
      !Number.isInteger(cell.r) ||
      Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r)) >
        draft.workspace.hexRadius
    )
      throw new Error('Walkable cell is outside the authoring floor.');
  });
  const ids = new Set(draft.scene.items.map((item) => item.id));
  for (const [id, declaration] of Object.entries(draft.room.propDeclarations)) {
    if (!ids.has(id))
      throw new Error(`Declaration owner does not exist: ${id}`);
    if (
      typeof declaration.blocksMovement !== 'boolean' ||
      typeof declaration.blocksLineOfSight !== 'boolean'
    )
      throw new Error('Prop flags must be boolean.');
    for (const [field, n] of Object.entries(declaration.footprint))
      if (
        typeof n !== 'number' ||
        !Number.isFinite(n) ||
        ((field === 'width' || field === 'depth') && (n < 0.1 || n > 12)) ||
        ((field === 'offsetX' || field === 'offsetZ') && Math.abs(n) > 12)
      )
        throw new Error(`Invalid footprint ${field}.`);
  }
  return draft;
}

export function stringifyRoomDraft(draft: RoomDraft): string {
  return JSON.stringify(
    {
      kind: ROOM_DRAFT_KIND,
      version: 2,
      draft: validateDraft(draft),
    } satisfies RoomDraftEnvelope,
    null,
    2
  );
}
export function parseRoomDraftJson(json: string): RoomDraft {
  if (json.length > 500_000) throw new Error('Room draft is too large.');
  const envelope = JSON.parse(json) as {
    kind?: unknown;
    version?: unknown;
    draft?: Record<string, unknown>;
  };
  if (envelope.kind !== ROOM_DRAFT_KIND)
    throw new Error('Expected a room authoring draft.');
  if (envelope.version === 1 && envelope.draft?.version === 1) {
    return validateDraft({
      ...envelope.draft,
      version: 2,
      workspace: { ...ROOM_WORKSPACE_STEPS[0] },
    });
  }
  if (envelope.version !== 2)
    throw new Error('Expected a version 1 or 2 room authoring draft.');
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
  let current: string | null = null;
  let legacy: string | null = null;
  try {
    current = storage.getItem(ROOM_DRAFT_STORAGE_KEY);
    legacy = storage.getItem(LEGACY_ROOM_DRAFT_STORAGE_KEY);
    if (current) return { value: parseRoomDraftJson(current) };
    if (legacy) return { value: parseRoomDraftJson(legacy) };
    return { value: fallback };
  } catch (error) {
    if (current && legacy) {
      try {
        return {
          value: parseRoomDraftJson(legacy),
          error:
            'Current room draft was invalid; recovered the prior version 1 draft.',
        };
      } catch {
        // Keep the caller's known-good in-memory fallback below.
      }
    }
    return {
      value: fallback,
      error: `Room draft load failed; prior data was kept. ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
