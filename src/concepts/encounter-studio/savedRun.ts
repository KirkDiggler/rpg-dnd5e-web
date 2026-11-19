/**
 * SAVE A RUN AND OPEN IT AGAIN (rpg-project#1013, story #1003 S5).
 *
 * A saved run is ONE file: the run's record as schema-1 JSONL, the lines
 * rpg-api's record capture writes (`record_capture.go`), so the trace
 * panel's Open capture and the documented `jq` workflow read it as they
 * read a server capture, preceded by ONE header line:
 *
 *   {"schema":1,"kind":"run","format":1,"saved_at":…,"session":…,
 *    "member":…,"member_name":…,"dungeon":{"key":…,"name":…},
 *    "snapshot":{…}}
 *
 * The SNAPSHOT is what drawing the run needs besides its beats, as the
 * draft said it when the run was saved: every creature's id, name,
 * starting cell and the routines it runs; the party start; a hash of the
 * map (rooms and walls) to say when the open draft's map differs; and the
 * excerpt of the engine's read-back the machine drawings read (each routine
 * group's head and `routine*` statements, and every creature's `creature.routine`, `creature.post`
 * and `creature.blocking` statements). The map itself is the open draft's.
 *
 * The record is read whole from the server (`GetRecord` paged from the
 * start until `more` is false), never only what the stream delivered. The
 * server serves it only while the seat is seated, so a run is saved before
 * the watch leaves it.
 */
import {
  isRecordObject,
  parseRecordCapture,
  type ParsedRecordCapture,
} from '@/components/session/recordCapture';
import { create, fromJson, toJson, type JsonValue } from '@bufbuild/protobuf';
import {
  ReadBackGroupSchema,
  ReadBackSchema,
  ReadBackSectionSchema,
  type ReadBack,
  type ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RecordEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import type { GetRecordResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_service_pb';
import type { RoomDraft } from '../world-building/roomDraft';
import type { RoomHexCell } from '../world-building/workspaceGeometry';
import { machineOf } from './machineView';
import type { RunDraft } from './runWatch';

/** The header's own version: a reader refuses a format it does not know. */
export const SAVED_RUN_FORMAT = 1;
/** The header line's `kind`; the capture reader takes it as the header. */
export const SAVED_RUN_KIND = 'run';
/** Most events one GetRecord page holds (rpg-api `maxRecordPage`). */
export const SAVE_PAGE_LIMIT = 500;

export interface SavedRunCreature {
  id: string;
  name: string;
  cell: RoomHexCell;
  /** The routines it runs, as the engine's `creature.routine` says. */
  routines: string[];
}

export interface SavedRunSnapshot {
  creatures: SavedRunCreature[];
  partyStart?: RoomHexCell;
  /** A hash of the map's rooms and walls, to say when the open draft's map
   * differs from the one the run was played on. */
  layoutHash: string;
  /** The read-back excerpt the machine drawings read; null when the studio
   * had no read-back when the run was saved. */
  readBack: ReadBack | null;
}

export interface SavedRunHeader {
  format: number;
  savedAt: string;
  session: string;
  member: string;
  memberName?: string;
  dungeon: { key: string; name: string };
  snapshot: SavedRunSnapshot;
  /** Why the file does not hold the whole run; absent when it does. */
  incomplete?: string;
}

/** A saved run, opened: the header when the file has one (a raw server
 * capture has none), and the whole record. */
export interface OpenedRun {
  fileName: string;
  header: SavedRunHeader | null;
  capture: ParsedRecordCapture;
}

const ROUTINE = 'routine';
const KIND_CREATURE_ROUTINE = 'creature.routine';
const CREATURE_KINDS = new Set([
  KIND_CREATURE_ROUTINE,
  'creature.post',
  'creature.blocking',
]);

/** The part of a read-back the machine drawings read (`machineOf`,
 * `machinesRunBy`): each routine group's head and `routine*` statements,
 * and the creatures' routine, post and blocking statements in one group
 * about nothing. */
export function readBackExcerpt(readBack: ReadBack): ReadBack {
  const groups = readBack.sections.flatMap((s) => s.groups);
  // A routine group keeps its head (whose `runs` names who runs it) and
  // its own `routine*` statements; the hub repeats under it are dropped.
  const routines = groups
    .filter((g) => g.about?.kind === ROUTINE)
    .map((g) =>
      create(ReadBackGroupSchema, {
        ...g,
        statements: g.statements.filter(
          (st, i) => i === 0 || st.kind.startsWith(ROUTINE)
        ),
      })
    );
  const creatures = groups
    .filter((g) => g.about?.kind !== ROUTINE)
    .flatMap((g) => g.statements.filter((st) => CREATURE_KINDS.has(st.kind)));
  const groupsOut = [...routines];
  if (creatures.length)
    groupsOut.push(create(ReadBackGroupSchema, { statements: creatures }));
  return create(ReadBackSchema, {
    sections: [create(ReadBackSectionSchema, { groups: groupsOut })],
  });
}

/** The routines a creature runs, as the read-back's `creature.routine`
 * statements say. */
export function routinesOf(
  readBack: ReadBack | null,
  creature: string
): string[] {
  if (!readBack) return [];
  const out: string[] = [];
  for (const section of readBack.sections)
    for (const group of section.groups)
      for (const st of group.statements as ReadBackStatement[]) {
        if (st.kind !== KIND_CREATURE_ROUTINE || st.about?.id !== creature)
          continue;
        for (const c of st.connects)
          if (c.kind === ROUTINE && !out.includes(c.id)) out.push(c.id);
      }
  return out;
}

/** FNV-1a over the map's rooms and walls: equal maps hash equal. */
export function layoutHashOf(draft: Readonly<RoomDraft>): string {
  const text = JSON.stringify({
    regions: draft.room.regions,
    walls: draft.room.walls ?? [],
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The snapshot of the open draft a saved run is drawn from. */
export function snapshotOf(input: {
  draft: Readonly<RoomDraft>;
  names: ReadonlyMap<string, string>;
  readBack: ReadBack | null;
}): SavedRunSnapshot {
  const { draft, names, readBack } = input;
  return {
    creatures: draft.room.monsterDeclarations.map((m) => ({
      id: m.id,
      name: names.get(m.id) ?? m.id,
      cell: { q: m.startingCell.location.q, r: m.startingCell.location.r },
      routines: routinesOf(readBack, m.id),
    })),
    ...(draft.room.partyStart
      ? {
          partyStart: {
            q: draft.room.partyStart.q,
            r: draft.room.partyStart.r,
          },
        }
      : {}),
    layoutHash: layoutHashOf(draft),
    readBack: readBack ? readBackExcerpt(readBack) : null,
  };
}

/** How many times a save re-reads a record that restarted under it, and
 * how many empty `more` pages in a row it accepts, before it gives up. */
export const SAVE_READ_RETRIES = 3;

/** One read from the start; null when the server restarted the record
 * under it (the id asked after aged out). */
async function readOnce(
  get: (afterId: string) => Promise<GetRecordResponse>
): Promise<RecordEvent[] | null> {
  const events: RecordEvent[] = [];
  let after = '';
  let stalls = 0;
  for (;;) {
    const page = await get(after);
    if (page.restarted) return null;
    let advanced = false;
    for (const event of page.events) {
      if (after !== '' && event.id <= after) continue;
      events.push(event);
      after = event.id;
      advanced = true;
    }
    // `more` is the only end signal. A page that says more but brings
    // nothing new is no progress, never the end.
    if (!page.more) return events;
    if (advanced) stalls = 0;
    else if (++stalls > SAVE_READ_RETRIES)
      throw new Error(
        'the server says more of the record follows but sends none; nothing was saved.'
      );
  }
}

/** Every event of the run's record, oldest first: GetRecord paged from the
 * start until the server says there is no `more`. A record that restarts
 * under the read is read again from the start, a few times; a save is
 * never written from a read that did not reach the end. */
export async function readWholeRecord(
  get: (afterId: string) => Promise<GetRecordResponse>
): Promise<{ events: RecordEvent[]; complete: boolean }> {
  for (let attempt = 0; attempt <= SAVE_READ_RETRIES; attempt++) {
    const events = await readOnce(get);
    if (events) return { events, complete: true };
  }
  throw new Error(
    `the record restarted under the read ${SAVE_READ_RETRIES + 1} times; nothing was saved.`
  );
}

/** The file's name: `<dungeon-key>-run-<UTC timestamp>.jsonl`. */
export function savedRunFileName(key: string, savedAt: Date): string {
  const stamp = savedAt
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/[-:]/g, '');
  const safe = key.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'encounter';
  return `${safe}-run-${stamp}.jsonl`;
}

function headerJson(header: SavedRunHeader): Record<string, unknown> {
  const s = header.snapshot;
  return {
    schema: 1,
    kind: SAVED_RUN_KIND,
    format: header.format,
    saved_at: header.savedAt,
    session: header.session,
    member: header.member,
    ...(header.memberName ? { member_name: header.memberName } : {}),
    dungeon: header.dungeon,
    ...(header.incomplete ? { incomplete: header.incomplete } : {}),
    snapshot: {
      creatures: s.creatures,
      ...(s.partyStart ? { party_start: s.partyStart } : {}),
      layout_hash: s.layoutHash,
      read_back: s.readBack ? toJson(ReadBackSchema, s.readBack) : null,
    },
  };
}

/** The saved file: the header line, a `started` line, one schema-1 record
 * line per event exactly as rpg-api writes them (the event's own raw
 * fields), and a closing `drained` (or `incomplete`) line. */
export function savedRunText(
  header: SavedRunHeader,
  record: { events: readonly RecordEvent[]; complete: boolean }
): string {
  return savedRunFile(header, record).text;
}

/** The saved file, and why it does not hold the whole run (absent when it
 * does): the header says so too, so a replay can say it. */
export function savedRunFile(
  header: SavedRunHeader,
  record: { events: readonly RecordEvent[]; complete: boolean }
): { text: string; incomplete?: string } {
  const capture = `saved-${header.savedAt}`;
  const loggedAt = header.savedAt;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let missing = 0;
  const records: string[] = [];
  for (const event of record.events) {
    let fields: string;
    try {
      fields = decoder.decode(event.fieldsJson).trim();
    } catch {
      fields = '';
    }
    if (!fields) {
      missing += 1;
      continue;
    }
    // A JSON string holds no raw newline, so a newline in raw fields is
    // whitespace: one line per record, the value unchanged.
    records.push(
      `{"schema":1,"kind":"record","capture":${JSON.stringify(capture)},` +
        `"logged_at":${JSON.stringify(loggedAt)},` +
        `"session":${JSON.stringify(header.session)},` +
        `"id":${JSON.stringify(event.id)},"at":${event.at.toString()},` +
        `"act":${JSON.stringify(event.act)},"beat":${JSON.stringify(event.beat)},` +
        `"fields":${fields.replace(/\r?\n/g, ' ')}}`
    );
  }
  const complete = record.complete && missing === 0;
  const status = (status: string, reason?: string) =>
    JSON.stringify({
      schema: 1,
      kind: 'capture',
      capture,
      logged_at: loggedAt,
      status,
      history_complete: complete,
      ...(reason ? { reason } : {}),
    });
  const reasons = [
    ...(record.complete ? [] : ['the server no longer held the run’s start']),
    ...(missing
      ? [`${missing} beats had no readable fields and are left out`]
      : []),
  ];
  const incomplete = reasons.join('; ') || undefined;
  const lines = [
    JSON.stringify(
      headerJson({ ...header, ...(incomplete ? { incomplete } : {}) })
    ),
    status('started'),
    ...records,
    incomplete ? status('incomplete', incomplete) : status('drained'),
  ];
  return {
    text: `${lines.join('\n')}\n`,
    ...(incomplete ? { incomplete } : {}),
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const cellOf = (v: unknown): RoomHexCell | undefined =>
  isRecordObject(v) && typeof v.q === 'number' && typeof v.r === 'number'
    ? { q: v.q, r: v.r }
    : undefined;

/** The header the capture reader returned, read; throws on a format this
 * studio does not know. */
export function headerOf(raw: Record<string, unknown>): SavedRunHeader {
  if (raw.format !== SAVED_RUN_FORMAT)
    throw new Error(
      `This saved run is format ${String(raw.format)}; this studio reads format ${SAVED_RUN_FORMAT}.`
    );
  const snap = isRecordObject(raw.snapshot) ? raw.snapshot : {};
  const creatures = Array.isArray(snap.creatures) ? snap.creatures : [];
  const dungeon = isRecordObject(raw.dungeon) ? raw.dungeon : {};
  const partyStart = cellOf(snap.party_start);
  return {
    format: SAVED_RUN_FORMAT,
    savedAt: str(raw.saved_at),
    session: str(raw.session),
    member: str(raw.member),
    ...(str(raw.member_name) ? { memberName: str(raw.member_name) } : {}),
    dungeon: { key: str(dungeon.key), name: str(dungeon.name) },
    ...(str(raw.incomplete) ? { incomplete: str(raw.incomplete) } : {}),
    snapshot: {
      creatures: creatures.flatMap((c) => {
        if (!isRecordObject(c)) return [];
        const cell = cellOf(c.cell);
        if (!str(c.id) || !cell) return [];
        return [
          {
            id: str(c.id),
            name: str(c.name) || str(c.id),
            cell,
            routines: Array.isArray(c.routines)
              ? c.routines.filter((r): r is string => typeof r === 'string')
              : [],
          },
        ];
      }),
      ...(partyStart ? { partyStart } : {}),
      layoutHash: str(snap.layout_hash),
      readBack: isRecordObject(snap.read_back)
        ? fromJson(ReadBackSchema, snap.read_back as JsonValue, {
            ignoreUnknownFields: true,
          })
        : null,
    },
  };
}

/** Opens a saved run's text (or a raw server capture's): the whole record,
 * never cut to the trace panel's newest rows. */
export function openSavedRun(fileName: string, text: string): OpenedRun {
  const capture = parseRecordCapture(text, { limit: Infinity });
  return {
    fileName,
    header: capture.header ? headerOf(capture.header) : null,
    capture,
  };
}

/** Where the saved run's creatures and party began, as the fold reads a
 * draft: the snapshot's, never the open draft's. */
export function runDraftOfSnapshot(snapshot: SavedRunSnapshot): RunDraft {
  return {
    room: {
      monsterDeclarations: snapshot.creatures.map((c) => ({
        id: c.id,
        startingCell: { location: c.cell },
      })),
      ...(snapshot.partyStart ? { partyStart: snapshot.partyStart } : {}),
    },
  };
}

/** The names a saved run says: its creatures' and its seat's. */
export function namesOfSaved(header: SavedRunHeader): Map<string, string> {
  const names = new Map(header.snapshot.creatures.map((c) => [c.id, c.name]));
  if (header.memberName) names.set(header.member, header.memberName);
  return names;
}

function routineStates(readBack: ReadBack | null, routine: string): string {
  if (!readBack) return '';
  const machine = machineOf(readBack, routine);
  return machine
    ? machine.states
        .map((s) => s.id)
        .sort()
        .join(',')
    : '';
}

/** How the open draft differs from a saved run's snapshot, in the cheap and
 * meaningful terms: the creatures (by id), where they start, the state
 * names of the routines they run, and the map. Empty when it does not. */
export function draftDiffersFrom(
  snapshot: SavedRunSnapshot,
  draft: Readonly<RoomDraft>,
  readBack: ReadBack | null
): string[] {
  const out: string[] = [];
  const now = new Map(
    draft.room.monsterDeclarations.map((m) => [m.id, m.startingCell.location])
  );
  const then = new Map(snapshot.creatures.map((c) => [c.id, c]));
  const sameSet =
    now.size === then.size && [...now.keys()].every((id) => then.has(id));
  if (!sameSet) out.push('its creatures');
  else if (
    snapshot.creatures.some((c) => {
      const cell = now.get(c.id)!;
      return cell.q !== c.cell.q || cell.r !== c.cell.r;
    })
  )
    out.push('where its creatures start');
  if (
    readBack &&
    snapshot.creatures.some(
      (c) =>
        now.has(c.id) &&
        [...c.routines].sort().join(',') !==
          routinesOf(readBack, c.id).sort().join(',')
    )
  )
    out.push('the routines its creatures run');
  const routines = new Set(snapshot.creatures.flatMap((c) => c.routines));
  if (
    readBack &&
    [...routines].some(
      (r) => routineStates(snapshot.readBack, r) !== routineStates(readBack, r)
    )
  )
    out.push('its machines');
  if (snapshot.layoutHash && snapshot.layoutHash !== layoutHashOf(draft))
    out.push('its map');
  return out;
}

/** The name of the encounter a saved run came from when it is not the open
 * one (by key when both have one, else by name); null when it is. */
export function savedFromElsewhere(
  header: SavedRunHeader,
  open: { key: string; name: string }
): string | null {
  const saved = header.dungeon;
  const key = open.key.trim();
  const differs =
    saved.key && key
      ? saved.key !== key
      : !!saved.name && saved.name !== open.name;
  return differs ? saved.name || saved.key : null;
}
