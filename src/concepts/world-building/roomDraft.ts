import { ANSWER_TEMPER, unknownTemperRefusal } from '@/author/answerVocabulary';
import {
  cubeToWorld,
  HEX_SIZE,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { validateAnswerTable, type AnswerTableShape } from './answerTableShape';
import { MAX_JSON_LENGTH, validateScene } from './serialization';
import { validateSiteScope, type SiteScope } from './siteScope';
import { objectShape, rejectUnknownKeys } from './strictShape';
import type { KeyValueStorage, WorldScene } from './types';

// Re-exported so every sibling strict decoder keeps importing them from here
// (rpg-dnd5e-web#1136 moved the definitions to `strictShape.ts` so the
// answer-table adapter is not an import cycle; the words are unchanged).
export { objectShape, rejectUnknownKeys } from './strictShape';

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
/** The authored footprint's limits, in owner-local scene units. ONE home: the
 * validator below and the seeded default (`declarationFootprint.ts`) both read
 * these, so a footprint the builder seeds for an author can never be refused
 * by the rule it was built against. */
export const FOOTPRINT_MINIMUM_EXTENT = 0.1;
export const FOOTPRINT_MAXIMUM_EXTENT = 12;
export const FOOTPRINT_MAXIMUM_OFFSET = 12;
export interface RoomPropDeclaration {
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
  footprint: RoomFootprint;
}
/** One authored monster actor. `ref` uses the existing monster reference
 * grammar; an unknown-but-syntactically-valid monster id stays editable and
 * is reported as an unavailable model, never dropped or substituted.
 *
 * `faction` is the site-scope membership and is OPTIONAL, ABSENT WHEN
 * UNAUTHORED (rpg-project#477 Decision 4). It is never written out as
 * `faction: monsters`: `factionOf` (`encounter/field.go`) stores it "as given,
 * never resolved here, so a member in the default faction persists
 * byte-identically to one from before factions existed" and resolves the
 * kind's default on every read. Membership sits on the ACTOR because it is
 * what SELECTS the defaults, while everything a faction supplies (`on`,
 * `actions`) is overridable and therefore lives in the orders block below. */
export interface RoomMonsterPlacement {
  id: string;
  ref: string;
  cell: RoomHexCell;
  faction?: string;
}
/** The orders block for one creature, under its stable id — the THIRD
 * declaration kind on a placed thing, after `propDeclarations` and the
 * proposed `doorBindings` (rpg-project#477 Decision 4).
 *
 * It carries the authored facts the FACTION would otherwise supply, because
 * being supplied by the faction is exactly what makes them overridable:
 * `FactionSpec.On` is "LAYERED, NEAREST KEY WINS WHOLESALE" and `TemperSpec`
 * says "A PLACEMENT'S OWN WORD WINS". `faction` is deliberately NOT here —
 * nothing overrides it.
 *
 * `on`, `temper` and `actions` are all here, because the engine carries all
 * three on a binding (`RoomMonsterBinding`, `dungeonspec/single_room.go`).
 * `intimidate`, `persuade` and `arrives` are its own `PlaceSpec` fields and
 * have a home here when a use case brings them. NOTHING READS ANY OF THEM YET
 * (slice 1, shape only).
 *
 * `temper` is ONE WORD here and a word or a MIX on a faction, and that
 * asymmetry is the engine's rather than a preference: `RoomMonsterBinding.Temper`
 * is a plain `string` where `FactionSpec.Temper` is a `TemperSpec` — "ONE WORD,
 * and it WINS over its faction's word or mix". A placement names one creature,
 * so dealing a spread for it would be an author rolling for a goblin they have
 * already described.
 *
 * `actions` mirrors `dungeonspec.RoomMonsterBinding.Actions`: full
 * `dnd5e:weapons:<id>` refs, monsters only, "CARRIED, NOT INTERPRETED", and
 * THE ORDER IS THE POINT — both drivers take the first action whose target is
 * in reach. */
export interface RoomMonsterBinding {
  on?: AnswerTableShape;
  temper?: string;
  actions?: string[];
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
  /** Stable monster id -> its authored orders. ABSENT when nothing has any,
   * so a room with no orders emits the bytes it always did. */
  monsterBindings?: Record<string, RoomMonsterBinding>;
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
/**
 * What a renderer needs to draw an authored room, and nothing else: the
 * frame its transforms are expressed in, the workspace extent that sizes
 * the floor, and the scene graph itself.
 *
 * It is a `Pick` of `RoomDraft` deliberately — ONE type, never a second
 * copy of the shape. Both producers hand over a `RoomDraft`: the editor
 * its live draft, and the play view the draft `decodeSingleRoomDungeon`
 * read out of the authored file the session was launched from. A field
 * that moves here moves for both of them or for neither, so the picture
 * the author places and the picture the player sees cannot drift apart
 * through a hand-maintained mirror.
 */
export type RoomScenePresentation = Pick<
  RoomDraft,
  'coordinateFrame' | 'workspace' | 'scene'
>;

/** The local-storage envelope. `version` is the ENVELOPE version, separate
 * from the draft's own `version: 3`: v3 carries only the draft (the bytes
 * every document wrote before policies could be authored), and v4 carries the
 * site scope beside it (rpg-dnd5e-web#1160). A document with no scope keeps
 * emitting v3 byte-identically. */
interface RoomDraftEnvelope {
  kind: typeof ROOM_DRAFT_KIND;
  version: 3 | 4;
  draft: RoomDraft;
  scope?: SiteScope;
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

/** Removing the creature removes its orders. A binding can never outlive the
 * creature it names (rpg-project#477, "a declaration can never outlive the
 * creature it names") — the decoder refuses an orphan, and this helper must
 * not be the thing that creates one. */
export function removeRoomMonster(draft: RoomDraft, id: string): RoomDraft {
  const monsters = draft.room.monsters.filter((monster) => monster.id !== id);
  if (monsters.length === draft.room.monsters.length) return draft;
  const room: RoomGameplayData = { ...draft.room, monsters };
  if (room.monsterBindings?.[id]) {
    const bindings = { ...room.monsterBindings };
    delete bindings[id];
    if (Object.keys(bindings).length === 0) delete room.monsterBindings;
    else room.monsterBindings = bindings;
  }
  return { ...draft, room };
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

// `rejectUnknownKeys` / `objectShape` live in `strictShape.ts` and are
// re-exported at the top of this module — one home, the same words.

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
      ((field === 'width' || field === 'depth') &&
        (n < FOOTPRINT_MINIMUM_EXTENT || n > FOOTPRINT_MAXIMUM_EXTENT)) ||
      ((field === 'offsetX' || field === 'offsetZ') &&
        Math.abs(n) > FOOTPRINT_MAXIMUM_OFFSET)
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
/** A faction id has the same grammar as the room key: lower-case, digits,
 * dashes. Membership itself is the engine's to confirm against the declared
 * factions — the room draft is decoded before the site root's `factions` are
 * known, and guessing here would refuse a file the server reads. */
const FACTION_ID_RE = /^[-a-z0-9]+$/;
/** `PlaceSpec.Actions` is "FULL REFS, like every other ref in this file:
 * `dnd5e:weapons:shortbow`, never `shortbow`." Weapons are the only action
 * type the engine accepts today, and refusing the rest here is what makes a
 * typo'd `dnd5e:weapon:shortbow` a field error rather than a boot surprise. */
const WEAPON_REF_RE = /^dnd5e:weapons:[-a-z0-9]+$/;
const MONSTER_KEYS = ['id', 'ref', 'cell', 'faction'] as const;
const BINDING_KEYS = ['on', 'temper', 'actions'] as const;

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
    const monster: RoomMonsterPlacement = {
      id: source.id,
      ref: source.ref,
      cell: validateCell(source.cell, `Monster ${source.id} cell`),
    };
    // ABSENT WHEN UNAUTHORED: the key is added only when the file wrote one,
    // so an unauthored creature stays byte-identical to one from before
    // factions existed.
    if (source.faction !== undefined && source.faction !== null) {
      if (
        typeof source.faction !== 'string' ||
        !FACTION_ID_RE.test(source.faction)
      )
        throw new Error(
          `Monster ${source.id} faction must be a faction id such as goblins.`
        );
      monster.faction = source.faction;
    }
    monsters.push(monster);
  }
  return monsters;
}

/** A binding's `temper:` — ONE SEALED WORD, never a mix.
 *
 * The declaration already carries both shapes (`ANSWER_TEMPER.placementShape`
 * is `'word'` and `.factionShape` is `'word-or-mix'`), so this asks the one
 * grammar instead of keeping a second copy of the rule. The sentence for a mix
 * matches `dungeonYaml.ts`'s v2 placement refusal, because it is the same
 * mistake in the same place. */
function validateBindingTemper(value: unknown, path: string): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    // A NON-STRING SCALAR reaches the engine as a scalar node, so it is read
    // as a word and refused BY NAME — `temper: 5` reports `"5" is not a
    // temperament this build ships`. Same value, same sentence.
    const word = String(value);
    if (!ANSWER_TEMPER.words.includes(word))
      throw new Error(`${path} ${unknownTemperRefusal(word)}`);
    return word;
  }
  throw new Error(
    `${path} is a placement, and a placement names one creature — a temper mix belongs on the faction`
  );
}

/** The orders blocks, keyed by the creature's stable id. A binding whose
 * creature is gone is REFUSED, not silently dropped — the same discipline
 * `propDeclarations` already keeps ("Declaration owner does not exist"). */
function validateMonsterBindings(
  value: unknown,
  monsters: readonly RoomMonsterPlacement[]
): Record<string, RoomMonsterBinding> {
  const source = objectShape(value, 'Monster bindings');
  const ids = new Set(monsters.map((monster) => monster.id));
  const bindings: Record<string, RoomMonsterBinding> = {};
  for (const [id, binding] of Object.entries(source)) {
    if (!ids.has(id))
      throw new Error(`Monster binding owner does not exist: ${id}`);
    const block = objectShape(binding, `Monster binding for ${id}`);
    rejectUnknownKeys(block, BINDING_KEYS, `Monster binding for ${id}`);
    const parsed: RoomMonsterBinding = {};
    if (Object.hasOwn(block, 'on'))
      parsed.on = validateAnswerTable(block.on, `Monster binding for ${id} on`);
    if (Object.hasOwn(block, 'temper'))
      parsed.temper = validateBindingTemper(
        block.temper,
        `Monster binding for ${id} temper`
      );
    if (Object.hasOwn(block, 'actions')) {
      const actions = block.actions;
      if (!Array.isArray(actions))
        throw new Error(`Monster binding for ${id} actions must be a list.`);
      if (actions.length === 0)
        throw new Error(
          `Monster binding for ${id} actions is empty; omit the key instead.`
        );
      parsed.actions = actions.map((action, index) => {
        if (typeof action !== 'string' || !WEAPON_REF_RE.test(action))
          throw new Error(
            `Monster binding for ${id} action ${index} must be a weapon reference such as dnd5e:weapons:shortbow.`
          );
        return action;
      });
    }
    // A block that says nothing is a key the file did not need: absence is
    // the authored state, exactly as it is for the faction it overrides.
    if (
      parsed.on === undefined &&
      parsed.temper === undefined &&
      parsed.actions === undefined
    )
      throw new Error(
        `Monster binding for ${id} declares no orders; omit the binding instead.`
      );
    bindings[id] = parsed;
  }
  return bindings;
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
      'monsterBindings',
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
  // The bindings are validated AFTER the monsters, because a binding names a
  // creature: an orphan can only be detected once the roster is known.
  const monsterBindings = Object.hasOwn(room, 'monsterBindings')
    ? validateMonsterBindings(room.monsterBindings, monsters)
    : undefined;
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
      // ABSENT, NOT EMPTY: a room with no orders must emit the bytes it
      // emitted before `monsterBindings` existed.
      ...(monsterBindings && Object.keys(monsterBindings).length > 0
        ? { monsterBindings }
        : {}),
    },
  } as RoomDraft;
  return draft;
}

export function stringifyRoomDraft(
  draft: RoomDraft,
  scope?: SiteScope
): string {
  // THE SCOPE IS VALIDATED ON THE WAY OUT, exactly as the draft is: an
  // oversize or invalid scope is refused before any caller can store it, so
  // the editor can never persist a document its own reader would refuse
  // (rpg-dnd5e-web#1160). An empty scope normalizes to no scope at all.
  const validatedScope = validateSiteScope(scope ?? {});
  const carriesScope =
    (validatedScope.factions?.length ?? 0) > 0 ||
    (validatedScope.dispositions?.length ?? 0) > 0;
  const json = JSON.stringify(
    {
      kind: ROOM_DRAFT_KIND,
      // ABSENT, NOT EMPTY: a document with no site scope keeps the v3 envelope
      // bytes it always wrote. The envelope version is what decides whether a
      // scope is read, exactly as the v1/v2 legacy paths decide whether
      // `monsters`/`workspace` are synthesized.
      version: carriesScope ? 4 : 3,
      draft: validateDraft(draft),
      ...(carriesScope ? { scope: validatedScope } : {}),
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

/**
 * The storage envelope's full contents: the room draft AND the site scope that
 * was saved beside it. The scope is absent from the returned object when the
 * envelope carried none, which is the same authored state the decoder keeps.
 */
export interface RoomDraftDocument {
  draft: RoomDraft;
  scope: SiteScope;
}

/**
 * Read the envelope, scope and all. The envelope VERSION decides whether a
 * scope is read (rpg-dnd5e-web#1160): v4 carries one, v3 and the legacy v1/v2
 * paths never do, and a scope key under a version that cannot mean it is
 * refused rather than silently dropped — losing authored policies on reload is
 * the trap this half of the slice exists to remove.
 */
export function parseRoomDocumentJson(json: string): RoomDraftDocument {
  if (json.length > MAX_JSON_LENGTH)
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  const envelope = JSON.parse(json) as {
    kind?: unknown;
    version?: unknown;
    draft?: Record<string, unknown>;
    scope?: unknown;
  };
  if (envelope.kind !== ROOM_DRAFT_KIND)
    throw new Error('Expected a room authoring draft.');
  if (envelope.version === 1) {
    if (envelope.draft?.version !== 1)
      throw new Error(
        'Expected a version 1 room authoring draft in the legacy envelope.'
      );
    if (Object.hasOwn(envelope, 'scope'))
      throw new Error(
        'A version 1 room authoring draft carries no site scope.'
      );
    return {
      draft: validateDraft({
        ...envelope.draft,
        version: 3,
        workspace: { ...ROOM_WORKSPACE_STEPS[0] },
        room: { ...(envelope.draft.room as object), monsters: [] },
      }),
      scope: {},
    };
  }
  if (envelope.version === 2) {
    if (envelope.draft?.version !== 2)
      throw new Error(
        'Expected a version 2 room authoring draft in the legacy envelope.'
      );
    if (Object.hasOwn(envelope, 'scope'))
      throw new Error(
        'A version 2 room authoring draft carries no site scope.'
      );
    return {
      draft: validateDraft({
        ...envelope.draft,
        version: 3,
        room: { ...(envelope.draft.room as object), monsters: [] },
      }),
      scope: {},
    };
  }
  if (envelope.version !== 3 && envelope.version !== 4)
    throw new Error('Expected a version 1, 2, 3 or 4 room authoring draft.');
  if (envelope.version === 3) {
    if (Object.hasOwn(envelope, 'scope'))
      throw new Error(
        'A version 3 room authoring draft carries no site scope; a scope is a version 4 envelope.'
      );
    return { draft: validateDraft(envelope.draft), scope: {} };
  }
  return {
    draft: validateDraft(envelope.draft),
    scope: validateSiteScope(envelope.scope ?? {}),
  };
}

/** The room draft alone. A DRAFT-ONLY reader deliberately refuses an envelope
 * that carries a scope rather than dropping the author's policies on the
 * floor: callers that must keep the scope read `parseRoomDocumentJson`. */
export function parseRoomDraftJson(json: string): RoomDraft {
  const document = parseRoomDocumentJson(json);
  if (
    (document.scope.factions?.length ?? 0) > 0 ||
    (document.scope.dispositions?.length ?? 0) > 0
  )
    throw new Error(
      'This room authoring draft carries a site scope; read it with parseRoomDocumentJson.'
    );
  return document.draft;
}
export function saveRoomDraft(
  storage: KeyValueStorage,
  draft: RoomDraft,
  scope?: SiteScope
): string | null {
  try {
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(draft, scope));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
export function loadRoomDraft(
  storage: KeyValueStorage,
  fallback: RoomDraft
): { value: RoomDraft; scope: SiteScope; error?: string } {
  try {
    const current = storage.getItem(ROOM_DRAFT_STORAGE_KEY);
    // A present-but-empty or malformed current draft is never "absent": it
    // must not recover older keys and must not be silently overwritten by
    // autosave. Recovery requires an explicit valid save/import action.
    if (current !== null) {
      const document = parseRoomDocumentJson(current);
      return { value: document.draft, scope: document.scope };
    }
    const legacyV2 = storage.getItem(LEGACY_ROOM_DRAFT_STORAGE_KEY);
    if (legacyV2 !== null) {
      const document = parseRoomDocumentJson(legacyV2);
      return { value: document.draft, scope: document.scope };
    }
    const legacyV1 = storage.getItem(LEGACY_V1_ROOM_DRAFT_STORAGE_KEY);
    if (legacyV1 !== null) {
      const document = parseRoomDocumentJson(legacyV1);
      return { value: document.draft, scope: document.scope };
    }
    return { value: fallback, scope: {} };
  } catch (error) {
    return {
      value: fallback,
      scope: {},
      error: `Room draft load failed; prior data was kept. ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
