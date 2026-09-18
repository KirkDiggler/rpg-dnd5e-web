import { parse, stringify } from 'yaml';
import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import {
  validateSiteDispositions,
  validateSiteFactions,
  type SiteDisposition,
  type SiteFaction,
  type SiteScope,
} from './siteScope';

export interface EncodeSingleRoomDungeonInput {
  key: string;
  draft: RoomDraft;
  /** The site scope (rpg-dnd5e-web#1136, rpg-project#477): identity and policy
   * that belong to the place rather than to a selection. Omitted means the
   * document does not carry it, which is what keeps a room with no scope
   * emitting v3 exactly as it always did. */
  factions?: SiteFaction[];
  dispositions?: SiteDisposition[];
}
export interface DecodeSingleRoomDungeonResult {
  key: string;
  draft: RoomDraft;
  /** Present only when the file carried at least one; absence is the authored
   * state "no factions", never an empty list. */
  factions?: SiteFaction[];
  dispositions?: SiteDisposition[];
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
/** Every root key this build reads. `factions` and `dispositions` are the site
 * scope (rpg-project#477); there is deliberately no `sites` layer, no `kind`
 * and no root `name` in this slice — `rooms[]` stays flat and the room's own
 * name lives in the embedded draft. */
const ROOT_KEYS = [
  'version',
  'key',
  'play',
  'room',
  'factions',
  'dispositions',
] as const;

/**
 * The versions this decoder accepts. **4 is the seam, and this slice lands its
 * first keys inside it.**
 *
 * Two waves want v4 — the authored-door contract (rpg-project#468, consumer
 * rpg-dnd5e-web#1117) and the site scope plus `monsterBindings`
 * (rpg-project#477, this slice). The bump landed once, ahead of either key
 * (rpg-dnd5e-web#1140), so each key then arrives *inside* a version rather
 * than behind a second one. A `doorBindings` wave adds a key here, not a
 * version.
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

/** Whether the document carries any key v3 has no place for: a site scope
 * entry, a creature's `faction`, or an orders block. A version is a statement
 * about what a file MAY contain, so this is exactly the set of authored facts
 * that need one.
 *
 * The embedded ROOM draft's own version is a separate artifact and stays 3:
 * root 4 with room 3 is the only combination this build produces, and the Go
 * decoder's half of the seam says the same (`acceptedRootVersions`). */
function carriesV4Keys(draft: RoomDraft, scope: SiteScope): boolean {
  if ((scope.factions?.length ?? 0) > 0) return true;
  if ((scope.dispositions?.length ?? 0) > 0) return true;
  if (
    draft.room.monsterBindings &&
    Object.keys(draft.room.monsterBindings).length > 0
  )
    return true;
  return draft.room.monsters.some((monster) => monster.faction !== undefined);
}

export function encodeSingleRoomDungeon(
  input: EncodeSingleRoomDungeonInput
): string {
  if (!input.key || typeof input.key !== 'string')
    throw new Error('Dungeon key must be non-empty.');
  const draft = JSON.parse(stringifyRoomDraft(input.draft)) as {
    draft: RoomDraft;
  };
  // The scope is validated on the way OUT as the draft is, so an encoder can
  // never write a site block the strict decoder would refuse to read back.
  const factions = input.factions
    ? validateSiteFactions(input.factions)
    : undefined;
  const dispositions = input.dispositions
    ? validateSiteDispositions(input.dispositions)
    : undefined;
  const scope: SiteScope = {
    ...(factions && factions.length > 0 ? { factions } : {}),
    ...(dispositions && dispositions.length > 0 ? { dispositions } : {}),
  };
  return stringify({
    version: carriesV4Keys(draft.draft, scope) ? 4 : 3,
    key: input.key,
    play: { ...PLAY_CONTRACT },
    // ABSENT, NOT EMPTY: a document with no site scope emits the bytes it
    // emitted before these keys existed. Key order stays version, key, play,
    // room when they are absent, which is what makes the bytes identical.
    ...(scope.factions ? { factions: scope.factions } : {}),
    ...(scope.dispositions ? { dispositions: scope.dispositions } : {}),
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
  // The site scope is validated BEFORE the room, so a typo in a faction is
  // reported as the typo it is rather than as a room problem.
  const factions = Object.hasOwn(root, 'factions')
    ? validateSiteFactions(root.factions)
    : [];
  const dispositions = Object.hasOwn(root, 'dispositions')
    ? validateSiteDispositions(root.dispositions)
    : [];
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
  return {
    key: root.key,
    draft: parseRoomDraftJson(draftJson),
    ...(factions.length > 0 ? { factions } : {}),
    ...(dispositions.length > 0 ? { dispositions } : {}),
  };
}
