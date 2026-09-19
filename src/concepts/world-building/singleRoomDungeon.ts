import { parse, stringify } from 'yaml';
import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';

export interface EncodeSingleRoomDungeonInput {
  key: string;
  draft: RoomDraft;
}
export interface DecodeSingleRoomDungeonResult {
  key: string;
  draft: RoomDraft;
}

/** The fixed play contract of this first playable slice. Keys and values are
 * validated structurally so an equivalent YAML mapping order never matters
 * and unknown/unsupported fields are refused instead of accepted silently. */
const PLAY_CONTRACT = {
  void: 'transparent',
  lighting: 'bright',
  standing: 'centre-covered',
} as const;
const PLAY_KEYS = Object.keys(PLAY_CONTRACT);
const ROOT_KEYS = ['version', 'key', 'play', 'room'] as const;

/**
 * The versions this decoder accepts. **4 is the seam, landed before its keys.**
 *
 * Two waves want v4 — the authored-door contract (rpg-project#468, consumer
 * rpg-dnd5e-web#1117) and the site scope plus `monsterBindings`
 * (rpg-project#477, this slice). Landing the bump once, ahead of either key,
 * is what stops them both bumping: a key then arrives *inside* a version
 * rather than behind a second one.
 *
 * v3 is not deprecated and nothing about it changes. The ENCODER emits the
 * LOWEST version that carries the document (see `encodeSingleRoomDungeon`),
 * so a document with none of the v4 keys is byte-identical to what it emitted
 * before this constant existed. A version is a statement about what a file
 * may contain, and a file that contains nothing new has no reason to claim
 * otherwise.
 */
const SUPPORTED_VERSIONS = [3, 4] as const;
type SupportedVersion = (typeof SUPPORTED_VERSIONS)[number];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date);

export function encodeSingleRoomDungeon(
  input: EncodeSingleRoomDungeonInput
): string {
  if (!input.key || typeof input.key !== 'string')
    throw new Error('Dungeon key must be non-empty.');
  const draft = JSON.parse(stringifyRoomDraft(input.draft)) as {
    draft: RoomDraft;
  };
  return stringify({
    version: 3,
    key: input.key,
    play: { ...PLAY_CONTRACT },
    room: draft.draft,
  });
}

/**
 * Which authored dialect a file speaks, read from its root `version`
 * alone — the one tag the two dialects share.
 *
 * **Below the first single-room version is the OTHER dialect** (the
 * dungeonspec document: regions, walls, doors, arrivals), which this
 * codec does not read and does not judge. It is not ours; a caller
 * draws whatever it drew before and no refusal is raised.
 *
 * **At or above it, the file claims to be a single room**, and this
 * build either reads it whole or names why it cannot. A version this
 * build has not heard of is a gap, not another dialect.
 *
 * A root that is not YAML, is not a mapping, or carries no numeric
 * version is neither answer: it is named too, because "we cannot tell
 * what this file is" must never be delivered as "this dungeon has no
 * authored room."
 */
export type SingleRoomDungeonRead =
  | ({ dialect: 'single-room' } & DecodeSingleRoomDungeonResult)
  | { dialect: 'other'; version: number };

const FIRST_SINGLE_ROOM_VERSION = SUPPORTED_VERSIONS[0];

export function readSingleRoomDungeon(source: string): SingleRoomDungeonRead {
  const root = parseSingleRoomSource(source);
  const version = root.version;
  if (typeof version !== 'number' || !Number.isFinite(version))
    throw new Error('Authored dungeon source is missing a numeric version.');
  if (version < FIRST_SINGLE_ROOM_VERSION) return { dialect: 'other', version };
  return { dialect: 'single-room', ...decodeSingleRoomRoot(root) };
}

function parseSingleRoomSource(source: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = parse(source);
  } catch (error) {
    throw new Error(
      `Invalid single-room YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isPlainObject(value))
    throw new Error('Single-room source must be an object.');
  return value;
}

export function decodeSingleRoomDungeon(
  source: string
): DecodeSingleRoomDungeonResult {
  return decodeSingleRoomRoot(parseSingleRoomSource(source));
}

function decodeSingleRoomRoot(
  root: Record<string, unknown>
): DecodeSingleRoomDungeonResult {
  for (const key of Object.keys(root)) {
    if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number]))
      throw new Error(`Unsupported single-room field: ${key}.`);
  }
  const version = root.version;
  if (
    typeof version !== 'number' ||
    !SUPPORTED_VERSIONS.includes(version as SupportedVersion) ||
    typeof root.key !== 'string' ||
    !root.key
  )
    throw new Error('Unsupported single-room source envelope.');
  const play = root.play;
  if (!isPlainObject(play))
    throw new Error('Unsupported single-room play contract.');
  for (const key of Object.keys(play)) {
    if (!PLAY_KEYS.includes(key))
      throw new Error(`Unsupported single-room play field: ${key}.`);
  }
  for (const [field, expected] of Object.entries(PLAY_CONTRACT)) {
    if (play[field] !== expected)
      throw new Error(
        `Unsupported single-room play contract: ${field} must be ${expected}.`
      );
  }
  if (!isPlainObject(root.room))
    throw new Error('Single-room source is missing a room.');
  // The embedded room draft keeps ITS OWN version, and it is passed through
  // rather than forced to 3. Forcing it would silently accept a room claiming
  // a version this build cannot read; passing it through makes the refusal name
  // the real gap instead of hiding it behind the root's version.
  const roomVersion = (root.room as { version?: unknown }).version;
  const draftJson = JSON.stringify({
    kind: 'rpg-room-authoring-draft',
    version: roomVersion ?? 3,
    draft: root.room,
  });
  return { key: root.key, draft: parseRoomDraftJson(draftJson) };
}
