import { parse, stringify } from 'yaml';
import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import {
  validateIntel,
  validateSiteConcealments,
  validateSiteDispositions,
  validateSiteEndings,
  validateSiteExits,
  validateSiteFactions,
  validateSiteScenarios,
  type SiteConcealments,
  type SiteDisposition,
  type SiteEnding,
  type SiteExit,
  type SiteFaction,
  type SiteIntelRecord,
  type SiteScenarios,
  type SiteScope,
} from './siteScope';

export interface EncodeSingleRoomDungeonInput {
  key: string;
  draft: RoomDraft;
  /** The site scope (rpg-dnd5e-web#1136, rpg-project#477): identity and policy
   * that belong to the place rather than to a selection. Omitted means the
   * document does not carry it, which is what keeps a room with no scope
   * emitting v3 exactly as it always did. */
  /* Carried, never interpreted: the site's intel records (web#933's section
   * ported to the site root). Omitted means the document does not carry them. */
  factions?: SiteFaction[];
  dispositions?: SiteDisposition[];
  intel?: SiteIntelRecord[];
  /** The way out(s) of this room, the ways it ends, its scenario bindings and
   * its secrets — carried verbatim (rpg-project#488 R2, rpg-project#490). All
   * four belong to the ROOT beside `intel`/`factions`, because none of them is
   * a thing standing on the floor. Absence is the authored state "none". */
  exits?: SiteExit[];
  endings?: SiteEnding[];
  scenarios?: SiteScenarios;
  concealments?: SiteConcealments;
}
export interface DecodeSingleRoomDungeonResult {
  key: string;
  draft: RoomDraft;
  /** Present only when the file carried at least one; absence is the authored
   * state "no factions", never an empty list. */
  factions?: SiteFaction[];
  dispositions?: SiteDisposition[];
  intel?: SiteIntelRecord[];
  exits?: SiteExit[];
  endings?: SiteEnding[];
  scenarios?: SiteScenarios;
  concealments?: SiteConcealments;
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
  'intel',
  'exits',
  'endings',
  'scenarios',
  'concealments',
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
  if ((scope.intel?.length ?? 0) > 0) return true;
  // The four root keys the engine added after intel (rpg-project#488 R1 rule 3,
  // rpg-project#490) — a room whose ONLY v4 fact is an exit, an ending, a
  // scenario binding or a concealment must still claim v4, the same argument a
  // `doorBindings`-only room makes below.
  if ((scope.exits?.length ?? 0) > 0) return true;
  if ((scope.endings?.length ?? 0) > 0) return true;
  if (scope.scenarios && Object.keys(scope.scenarios).length > 0) return true;
  if (scope.concealments && Object.keys(scope.concealments).length > 0)
    return true;
  if (
    draft.room.monsterBindings &&
    Object.keys(draft.room.monsterBindings).length > 0
  )
    return true;
  // `doorBindings` and `propBindings` are v4-only keys too. Doors were missed
  // when the door wave landed, so a room whose ONLY v4 fact was a door emitted
  // `version: 3` while carrying a key v3 has no place for — the version is a
  // statement about what a file MAY contain, and that statement was false.
  if (
    draft.room.doorBindings &&
    Object.keys(draft.room.doorBindings).length > 0
  )
    return true;
  if (
    draft.room.propBindings &&
    Object.keys(draft.room.propBindings).length > 0
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
  const intel = input.intel ? validateIntel(input.intel) : undefined;
  const exits = input.exits ? validateSiteExits(input.exits) : undefined;
  const endings = input.endings
    ? validateSiteEndings(input.endings)
    : undefined;
  const scenarios = input.scenarios
    ? validateSiteScenarios(input.scenarios)
    : undefined;
  const concealments = input.concealments
    ? validateSiteConcealments(input.concealments)
    : undefined;
  const scope: SiteScope = {
    ...(factions && factions.length > 0 ? { factions } : {}),
    ...(dispositions && dispositions.length > 0 ? { dispositions } : {}),
    ...(intel && intel.length > 0 ? { intel } : {}),
    ...(exits && exits.length > 0 ? { exits } : {}),
    ...(endings && endings.length > 0 ? { endings } : {}),
    ...(scenarios && Object.keys(scenarios).length > 0 ? { scenarios } : {}),
    ...(concealments && Object.keys(concealments).length > 0
      ? { concealments }
      : {}),
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
    ...(scope.intel ? { intel: scope.intel } : {}),
    ...(scope.exits ? { exits: scope.exits } : {}),
    ...(scope.endings ? { endings: scope.endings } : {}),
    ...(scope.scenarios ? { scenarios: scope.scenarios } : {}),
    ...(scope.concealments ? { concealments: scope.concealments } : {}),
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
  // The site scope is validated BEFORE the room, so a typo in a faction is
  // reported as the typo it is rather than as a room problem.
  const factions = Object.hasOwn(root, 'factions')
    ? validateSiteFactions(root.factions)
    : [];
  const dispositions = Object.hasOwn(root, 'dispositions')
    ? validateSiteDispositions(root.dispositions)
    : [];
  const intel = Object.hasOwn(root, 'intel') ? validateIntel(root.intel) : [];
  const exits = Object.hasOwn(root, 'exits')
    ? validateSiteExits(root.exits)
    : [];
  const endings = Object.hasOwn(root, 'endings')
    ? validateSiteEndings(root.endings)
    : [];
  const scenarios = Object.hasOwn(root, 'scenarios')
    ? validateSiteScenarios(root.scenarios)
    : {};
  const concealments = Object.hasOwn(root, 'concealments')
    ? validateSiteConcealments(root.concealments)
    : {};
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
    ...(intel.length > 0 ? { intel } : {}),
    ...(exits.length > 0 ? { exits } : {}),
    ...(endings.length > 0 ? { endings } : {}),
    ...(Object.keys(scenarios).length > 0 ? { scenarios } : {}),
    ...(Object.keys(concealments).length > 0 ? { concealments } : {}),
  };
}
