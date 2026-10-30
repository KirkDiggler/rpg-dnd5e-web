import {
  Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Scalar,
} from 'yaml';
import { documentRowLists, groupRefusals } from './bundles';
import {
  validateMonsterTemplates,
  type SiteTemplates,
} from './monsterTemplates';
import {
  ROOM_DRAFT_ENVELOPE_VERSION,
  parseRoomDocumentJson,
  validateRoomDocument,
  type RoomDraft,
} from './roomDraft';
import {
  renderScope,
  scopeFrom,
  validateIntel,
  validateSiteBundles,
  validateSiteConcealments,
  validateSiteDispositions,
  validateSiteEndings,
  validateSiteExits,
  validateSiteFactions,
  validateSiteScenarios,
  validateSiteTables,
  type SiteBundles,
  type SiteConcealments,
  type SiteDisposition,
  type SiteEnding,
  type SiteExit,
  type SiteFaction,
  type SiteIntelRecord,
  type SiteScenarios,
  type SiteTables,
} from './siteScope';

export interface EncodeSingleRoomDungeonInput {
  templates?: SiteTemplates;
  /** The named groups of rows a `use:` row resolves to (rpg-project#670). */
  bundles?: SiteBundles;
  key: string;
  draft: RoomDraft;
  /** The site scope (rpg-dnd5e-web#1136, rpg-project#477): identity and policy
   * that belong to the place rather than to a selection. Omitted means the
   * document does not carry it, which is what keeps a room with no scope
   * emitting exactly what it emitted before these keys existed. */
  /* Carried, never interpreted: the site's intel records (web#933's section
   * ported to the site root). Omitted means the document does not carry them. */
  /** The answer tables this site declares, keyed by id — the shared thing a
   * faction or a binding NAMES rather than copies (rpg-toolkit#1897). */
  tables?: SiteTables;
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
  templates?: SiteTemplates;
  bundles?: SiteBundles;
  key: string;
  draft: RoomDraft;
  /** Present only when the file carried at least one; absence is the authored
   * state "no tables", never an empty map. */
  tables?: SiteTables;
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
export const PLAY_CONTRACT = {
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
  'templates',
  // `bundles` sits between `templates` and `tables` in `SingleRoomSpec`
  // (rpg-project#670).
  'bundles',
  // The engine's own root order: `tables` sits before `factions` in
  // `SingleRoomSpec`, and this list mirrors it so a file the engine writes
  // reads here in the order it was authored (rpg-toolkit#1897).
  'tables',
  'factions',
  'dispositions',
  'intel',
  'exits',
  'endings',
  'scenarios',
  'concealments',
] as const;

/**
 * THE VERSION THIS DECODER ACCEPTS: 5, regions are the floor (rpg-project#725).
 *
 * A version-5 file lists `room.room.regions` — each region's cells as row runs
 * — and no `walkableHexes` and no `room.workspace`. Versions 3 and 4 are
 * RETIRED, refused by name in the engine's own sentence, never read: the
 * content converts once by script (R6) and there is no dual-dialect period.
 * The encoder always writes 5, so `carriesV4Keys`' lowest-version rule retired
 * with the versions it chose between.
 */
const SUPPORTED_VERSIONS = [5] as const;
type SupportedVersion = (typeof SUPPORTED_VERSIONS)[number];
/** The engine's sentence for a retired root version (`dungeonspec`). */
export const RETIRED_VERSIONS_REFUSAL =
  'versions 3 and 4 are retired; regions are the floor (rpg-project#725)';
/** Below this the file speaks the multi-room dialect, which this codec does
 * not read; 3 and 4 still claim to be a single room and are refused. */
const FIRST_SINGLE_ROOM_VERSION = 3;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date);

/**
 * A REGION'S ROWS READ AS ROWS. Each region's `lighting` and each row's `q`
 * spans are written in flow style — `lighting: {intensity: 1}`,
 * `q: [[-2, 2], [6, 9]]` — so a row is one line and the file grows by runs,
 * not by cells (design R1's file budget). Everything else stays block style,
 * byte for byte what the encoder wrote before.
 */
function flowRegionRows(document: Document): void {
  const regions = document.getIn(['room', 'room', 'regions'], true);
  if (!isSeq(regions)) return;
  for (const region of regions.items) {
    if (!isMap(region)) continue;
    const lighting = region.get('lighting', true);
    if (isMap(lighting)) lighting.flow = true;
    const cells = region.get('cells', true);
    if (!isSeq(cells)) continue;
    // An unpainted region writes `cells: []`.
    cells.flow = cells.items.length === 0;
    for (const row of cells.items) {
      if (!isMap(row)) continue;
      const q = row.get('q', true);
      if (isSeq(q)) q.flow = true;
    }
  }
}

export function encodeSingleRoomDungeon(
  input: EncodeSingleRoomDungeonInput
): string {
  if (!input.key || typeof input.key !== 'string')
    throw new Error('Dungeon key must be non-empty.');
  const draft = validateRoomDocument({
    draft: input.draft,
    scope: scopeFrom(input),
  });
  // The scope is validated on the way OUT as the draft is, so an encoder can
  // never write a site block the strict decoder would refuse to read back.
  //
  // ONE CALL, NOT EIGHT (rpg-dnd5e-web#1201). This used to validate each field
  // by name and then re-list the survivors when building the scope — two more
  // copies of the key list that could go stale, and the reason the encoder's
  // input interface gained `tables` while both publish call sites did not.
  // `validateSiteScope` already owns the per-key validation AND the
  // "an empty value is an absent key" rule this block was open-coding.
  const scope = draft.scope;
  const document = new Document({
    version: 5,
    key: input.key,
    play: { ...PLAY_CONTRACT },
    // ABSENT, NOT EMPTY: a document with no site scope emits the bytes it
    // emitted before these keys existed. Key order stays version, key, play,
    // room when they are absent, which is what makes the bytes identical.
    // `renderScope` writes them in `SCOPE_KEYS`' order — the root's own — and
    // is the one place the list lives (rpg-dnd5e-web#1201).
    ...renderScope(scope),
    room: draft.draft,
  });
  flowRegionRows(document);
  return document.toString({ flowCollectionPadding: false });
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

export function readSingleRoomDungeon(source: string): SingleRoomDungeonRead {
  const root = parseSingleRoomSource(source);
  const version = root.version;
  if (typeof version !== 'number' || !Number.isFinite(version))
    throw new Error('Authored dungeon source is missing a numeric version.');
  if (version < FIRST_SINGLE_ROOM_VERSION) return { dialect: 'other', version };
  return { dialect: 'single-room', ...decodeSingleRoomRoot(root) };
}

/** Whether a number scalar is written as a float: the engine's yaml.v3
 * resolves `2.0` and `2e0` to `!!float`, never `!!int`. A tagged `!!float 2`
 * needs no case: yaml 2.9 loads it as the string "2", which the waypoint
 * reader already refuses, and every NUMBER under that tag has a `.` or an
 * exponent in its source. */
function isFloatWritten(node: Scalar): boolean {
  if (node.format === 'HEX') return false;
  return /[.eE]/.test(node.source ?? '');
}

/**
 * A WAYPOINT'S WAIT IS AN `!!int` (rpg-dnd5e-web#1314 review). The engine's
 * `decodeWaypoint` judges the YAML tag, so `wait: 2.0` is refused there,
 * while the parsed value 2 would pass any check on the JS number and save
 * as `wait: 2` — a file the studio opens that the engine does not play. So
 * a `wait` on a route waypoint written as a float keeps its written text,
 * and the waypoint reader refuses it, at its own path, in the engine's
 * sentence ("a waypoint's wait is a whole number of rounds").
 */
function keepFloatWaitsWritten(document: ReturnType<typeof parseDocument>) {
  visit(document, {
    Pair(_key, pair, path) {
      const [route, waypoint] = [path.at(-3), path.at(-1)];
      if (
        isScalar(pair.key) &&
        pair.key.value === 'wait' &&
        isScalar(pair.value) &&
        typeof pair.value.value === 'number' &&
        isFloatWritten(pair.value) &&
        isMap(waypoint) &&
        isSeq(path.at(-2)) &&
        isPair(route) &&
        isScalar(route.key) &&
        route.key.value === 'path'
      )
        pair.value.value = pair.value.source ?? String(pair.value.value);
    },
  });
}

function parseSingleRoomSource(source: string): Record<string, unknown> {
  let value: unknown;
  try {
    const document = parseDocument(source);
    if (document.errors.length > 0) throw document.errors[0];
    keepFloatWaitsWritten(document);
    value = document.toJS();
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
  if (version === 3 || version === 4)
    throw new Error(`version: ${RETIRED_VERSIONS_REFUSAL}`);
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
  //
  // THE TABLES FIRST, because a faction and a monster binding may each NAME
  // one and a name cannot be judged before the universe it names exists — the
  // same ordering reason `intel` is read before a `holds` that names a record.
  const templates = Object.hasOwn(root, 'templates')
    ? validateMonsterTemplates(root.templates)
    : {};
  const bundles = Object.hasOwn(root, 'bundles')
    ? validateSiteBundles(root.bundles)
    : {};
  const tables = Object.hasOwn(root, 'tables')
    ? validateSiteTables(root.tables)
    : {};
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
  // THREE VERSION AXES MEET HERE, AND THIS LINE USED TO CONFLATE TWO
  // (rpg-project#501 §6.1):
  //
  //   root `version:`       the DIALECT — 5, which keys the file may hold
  //   `room.version:`       the ROOM DRAFT's shape — stays 3, a separate
  //                         artifact
  //   the ENVELOPE version  the shape of the STORED draft this wrapper mints
  //
  // This wrote `version: roomVersion ?? 3`, borrowing the room's number for the
  // envelope. That worked only while the two happened to agree. When the
  // envelope went to 5 for `startingCell`, borrowing the room's 3 made this
  // build REJECT ITS OWN freshly-decoded document — caught by the suite, which
  // is why the wrapper no longer borrows.
  //
  // The room's own version is NOT dropped: it stays on `root.room` and
  // `validateDraft` judges it where it belongs, so a room claiming a version
  // this build cannot read is still refused by name rather than silently
  // accepted.
  const draftJson = JSON.stringify({
    kind: 'rpg-room-authoring-draft',
    version: ROOM_DRAFT_ENVELOPE_VERSION,
    draft: root.room,
    scope: {
      templates,
      bundles,
      tables,
      factions,
      dispositions,
      intel,
      exits,
      endings,
      scenarios,
      concealments,
    },
  });
  const draft = parseRoomDocumentJson(draftJson).draft;
  // EVERY `table:` NAME MUST RESOLVE, and this is the one place both halves are
  // visible (rpg-toolkit#1897): the room reader carries a name without judging
  // it, and the scope reader declares the universe. Refused here so the author
  // gets a sentence about the id they wrote rather than a compile that quietly
  // orders nothing.
  requireTableNames(draft, factions, tables);
  // AND EVERY `use:` MUST RESOLVE (rpg-project#670), for the same reason and
  // in the engine's own sentence at the engine's own path: a bundle nobody
  // declared, a parameter that does not fit, a bundle that uses itself, and a
  // `fact` pattern that matches no fact this file sets.
  const refusals = groupRefusals(
    { bundles, tables, factions, intel },
    documentRowLists({ bundles, tables, factions }, draft)
  );
  if (refusals.length > 0)
    throw new Error(`${refusals[0].path}: ${refusals[0].message}`);
  return {
    key: root.key,
    draft,
    ...(Object.keys(templates).length > 0 ? { templates } : {}),
    ...(Object.keys(bundles).length > 0 ? { bundles } : {}),
    ...(Object.keys(tables).length > 0 ? { tables } : {}),
    ...(factions.length > 0 ? { factions } : {}),
    ...(dispositions.length > 0 ? { dispositions } : {}),
    ...(intel.length > 0 ? { intel } : {}),
    ...(exits.length > 0 ? { exits } : {}),
    ...(endings.length > 0 ? { endings } : {}),
    ...(Object.keys(scenarios).length > 0 ? { scenarios } : {}),
    ...(Object.keys(concealments).length > 0 ? { concealments } : {}),
  };
}

/** Refuse a `table:` that names nothing (rpg-toolkit#1897).
 *
 * TWO PLACES MAY NAME ONE — a faction and a monster binding — and the engine
 * refuses both by name at their own paths ("faction %q names the table %q, and
 * no table in this dungeon has that id" / the binding's twin). The builder says
 * the same thing in its own words because it is judging before the server does,
 * which is the whole point of the local pass.
 *
 * A NAME IS JUDGED HERE AND NOWHERE ELSE, because nowhere else holds both the
 * name and the universe it names. */
function requireTableNames(
  draft: RoomDraft,
  factions: SiteFaction[],
  tables: SiteTables
): void {
  const declared = new Set(Object.keys(tables));
  for (const faction of factions) {
    if (faction.table !== undefined && !declared.has(faction.table))
      throw new Error(
        `Site faction ${faction.id} names the table ${faction.table}, and no table in this site has that id.`
      );
  }
  for (const [id, binding] of Object.entries(
    draft.room.monsterBindings ?? {}
  )) {
    if (binding.table !== undefined && !declared.has(binding.table))
      throw new Error(
        `Monster binding for ${id} names the table ${binding.table}, and no table in this site has that id.`
      );
  }
}
