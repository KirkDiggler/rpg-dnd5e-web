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

export function decodeSingleRoomDungeon(
  source: string
): DecodeSingleRoomDungeonResult {
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
  const root = value;
  for (const key of Object.keys(root)) {
    if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number]))
      throw new Error(`Unsupported single-room field: ${key}.`);
  }
  if (root.version !== 3 || typeof root.key !== 'string' || !root.key)
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
  const draftJson = JSON.stringify({
    kind: 'rpg-room-authoring-draft',
    version: 3,
    draft: root.room,
  });
  return { key: root.key, draft: parseRoomDraftJson(draftJson) };
}
