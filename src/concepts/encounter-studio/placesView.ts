/**
 * THE PLACES, AS THE ENGINE SAYS THEM (rpg-project#972, R30, R31).
 *
 * The engine says each join between two places as one read-back statement
 * (about `{join, id}`, kind `place.join.door|open|passage`) and each way
 * through it as another (about `{way, id}`), connected to its join by
 * `{join, id, through}` and to the bar it lifts by `{bar, lock|hold|hidden,
 * lifts}`. This module reads those connections and nothing else: a way
 * belongs to the join its `through` names, sits under each bar its `lifts`
 * names, and is set apart only when the engine's kind says it helps without
 * being enough (`place.way.partial`) or that nothing lifts its bar
 * (`place.way.none`). The studio decides no way, bar or join of its own.
 */
import { refId } from '@/utils/refs';
import type {
  ReadBack,
  ReadBackConnection,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';

export interface PlaceWay {
  statement: ReadBackStatement;
  kind: string;
  /** The bars this way says it lifts, in the engine's order. */
  bars: string[];
  /** The bars this way says nothing lifts (`place.way.none`'s
   * `{bar, id, unlifted}`). */
  unlifted: string[];
  /** Its approaches, one per `{method, <id>, by}` with the check's
   * difficulty as `value`; a `{method, <id>, with}` that follows one is a
   * part of that approach (its tool), never an alternative of its own
   * (rpg-toolkit#2444). */
  methods: WayMethod[];
  /** What carries the way (`by`, not its method): a line, a creature, a
   * prop, a door, a record, a concealment, a conversation. */
  carriers: ReadBackConnection[];
  needs: ReadBackConnection[];
  onMiss: ReadBackConnection[];
}

export interface WayMethod {
  id: string;
  value: number;
  /** The approach's further parts (`with`): its tool. */
  with: { id: string; value: number }[];
}

/** A way's approaches, in the engine's order: each `by` method opens one,
 * each `with` method joins the one before it. */
function approachesOf(statement: ReadBackStatement): WayMethod[] {
  const out: WayMethod[] = [];
  for (const c of statement.connects) {
    if (c.kind !== 'method') continue;
    if (c.role === 'by') out.push({ id: c.id, value: c.value, with: [] });
    else if (c.role === 'with')
      out.at(-1)?.with.push({ id: c.id, value: c.value });
  }
  return out;
}

export interface PlaceJoin {
  id: string;
  /** The engine's kind: `place.join.door`, `.open`, `.passage`, or one the
   * studio does not know yet. */
  kind: string;
  statement: ReadBackStatement;
  /** Regions it joins (`joins`). */
  regions: string[];
  /** A passage's ends (`from`, `to`). */
  from: string[];
  to: string | null;
  /** A door join's door (`{door, id, by}`). */
  door: string | null;
  /** What carries it (`by`, other than the door): a passage's prop,
   * creature or conversation. */
  carriers: ReadBackConnection[];
  ways: PlaceWay[];
  /** The distinct bars over its ways — those they lift and those the engine
   * says nothing lifts — in the order the ways say them. */
  bars: string[];
}

export interface Places {
  joins: PlaceJoin[];
  /** Regions the engine says are in no join (`place.region.unjoined`). */
  unjoined: { regionId: string; statement: ReadBackStatement }[];
}

const KIND_JOIN = 'join';
/** The engine's contract (rpg-project#974): a join is a statement of a
 * `place.join.` kind and a way one of a `place.way.` kind. A statement of
 * any other kind that repeats a way under a hub (`record.lift`,
 * `secret.find`) points at it and is never itself a way, whatever it
 * connects. */
const JOIN_KIND = 'place.join.';
const WAY_KIND = 'place.way.';
const ROLE_THROUGH = 'through';
const ROLE_LIFTS = 'lifts';
const ROLE_UNLIFTED = 'unlifted';
const PARTIAL = 'place.way.partial';
const NONE = 'place.way.none';
const UNJOINED = 'place.region.unjoined';

const ids = (
  statement: ReadBackStatement,
  kind: string,
  role: string
): string[] =>
  statement.connects
    .filter((c) => c.kind === kind && c.role === role)
    .map((c) => c.id);

function wayOf(statement: ReadBackStatement): PlaceWay {
  const by = statement.connects.filter((c) => c.role === 'by');
  return {
    statement,
    kind: statement.kind,
    bars: [...new Set(ids(statement, 'bar', ROLE_LIFTS))],
    unlifted: [...new Set(ids(statement, 'bar', ROLE_UNLIFTED))],
    methods: approachesOf(statement),
    carriers: by.filter((c) => c.kind !== 'method'),
    needs: statement.connects.filter((c) => c.role === 'needs'),
    onMiss: statement.connects.filter((c) => c.role === 'on-miss'),
  };
}

/** Every join and its ways, in the engine's order. */
export function placesOf(readBack: ReadBack): Places {
  const statements = readBack.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.statements)
  );
  const joins = new Map<string, PlaceJoin>();
  for (const statement of statements) {
    if (statement.about?.kind !== KIND_JOIN) continue;
    if (!statement.kind.startsWith(JOIN_KIND)) continue;
    const id = statement.about.id;
    if (joins.has(id)) continue;
    const doors = ids(statement, 'door', 'by');
    joins.set(id, {
      id,
      kind: statement.kind,
      statement,
      regions: ids(statement, 'region', 'joins'),
      from: ids(statement, 'region', 'from'),
      to: ids(statement, 'region', 'to')[0] ?? null,
      door: doors[0] ?? null,
      carriers: statement.connects.filter(
        (c) => c.role === 'by' && c.kind !== 'door'
      ),
      ways: [],
      bars: [],
    });
  }
  for (const statement of statements) {
    if (!statement.kind.startsWith(WAY_KIND)) continue;
    for (const joinId of new Set(ids(statement, KIND_JOIN, ROLE_THROUGH))) {
      const join = joins.get(joinId);
      if (!join) continue;
      const way = wayOf(statement);
      join.ways.push(way);
      for (const bar of [...way.bars, ...way.unlifted])
        if (!join.bars.includes(bar)) join.bars.push(bar);
    }
  }
  const unjoined = statements
    .filter((statement) => statement.kind === UNJOINED)
    .map((statement) => ({
      regionId:
        statement.about?.kind === 'region'
          ? statement.about.id
          : (statement.connects.find((c) => c.kind === 'region')?.id ?? ''),
      statement,
    }))
    .filter((entry) => entry.regionId !== '');
  return { joins: [...joins.values()], unjoined };
}

export interface WaySections {
  /** Each bar of the join, with the ways that say they lift it. */
  bars: { bar: string; ways: PlaceWay[] }[];
  /** Ways that lift no bar (free floor, a passage's own line), and any way
   * of a kind the studio does not know that names no bar. */
  free: PlaceWay[];
  /** `place.way.partial`: helps, not enough alone. */
  partial: PlaceWay[];
  /** `place.way.none`: a bar nothing lifts. */
  none: PlaceWay[];
}

export function waySectionsOf(join: PlaceJoin): WaySections {
  const out: WaySections = { bars: [], free: [], partial: [], none: [] };
  const counted = join.ways.filter(
    (way) => way.kind !== PARTIAL && way.kind !== NONE
  );
  for (const bar of join.bars) {
    const ways = counted.filter((way) => way.bars.includes(bar));
    if (ways.length > 0) out.bars.push({ bar, ways });
  }
  out.free = counted.filter((way) => way.bars.length === 0);
  out.partial = join.ways.filter((way) => way.kind === PARTIAL);
  out.none = join.ways.filter((way) => way.kind === NONE);
  return out;
}

const ABILITIES: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const words = (text: string): string =>
  text
    .split('-')
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(' ');

/** A method chip's text: the method's name from its id, its difficulty
 * when the engine gives one (`skill:performance` 13 → "Performance 13"), and
 * the parts it is made with ("Dexterity 13 with thieves-tools"). */
export function methodLabel(method: {
  id: string;
  value: number;
  with?: readonly { id: string }[];
}): string {
  const parts = (method.with ?? []).map((part) => methodName(part.id));
  const named = method.value
    ? `${methodName(method.id)} ${method.value}`
    : methodName(method.id);
  return parts.length ? `${named} with ${parts.join(' and ')}` : named;
}

/** A method's name from its id alone: `skill:persuasion` → "Persuasion",
 * `ability:dex` → "Dexterity", a tool's ref by its id. */
export function methodName(id: string): string {
  // `<kind>:<name>`; a tool's name is a ref, taken apart by the one parser.
  const at = id.indexOf(':');
  const kind = at < 0 ? id : id.slice(0, at);
  const name = at < 0 ? '' : id.slice(at + 1);
  return kind === 'skill'
    ? words(name)
    : kind === 'ability'
      ? (ABILITIES[name] ?? name)
      : kind === 'tool'
        ? (refId(name) ?? name)
        : id;
}

/** A bar's words where the screen names it, and a join's state in its
 * accessible name. Unknown bars are named by their id. */
export const BAR_HEADINGS: Record<string, string> = {
  lock: 'To pass the lock, any of:',
  hold: 'To pass the holders, any of:',
  hidden: 'To pass the hiding, any of:',
};
export const BAR_STATES: Record<string, string> = {
  lock: 'locked',
  hold: 'held',
  hidden: 'hidden',
};

export const barHeading = (bar: string): string =>
  BAR_HEADINGS[bar] ?? `To pass the bar \`${bar}\`, any of:`;
export const barState = (bar: string): string => BAR_STATES[bar] ?? bar;

/** A join's accessible name, from its connections: "Join: Gatehouse and
 * Courtyard, by the door gate-wall-door, held". The words between the
 * engine's names are the studio's chrome. */
export function joinName(
  join: PlaceJoin,
  regionName: (id: string) => string
): string {
  const state =
    join.ways.length === 0
      ? 'no way said'
      : join.bars.length === 0
        ? 'unbarred'
        : join.bars.map(barState).join(' and ');
  const by = (c: { kind: string; id: string }) => `the ${c.kind} ${c.id}`;
  if (join.to) {
    const from = join.from.map(regionName).join(' and ');
    const carrier = join.carriers[0];
    return `Join: passage from ${from || 'somewhere'} to ${regionName(join.to)}${carrier ? `, by ${by(carrier)}` : ''}, ${state}`;
  }
  const places = join.regions.map(regionName).join(' and ');
  const how = join.door
    ? `by the door ${join.door}`
    : join.kind === 'place.join.open'
      ? 'on open floor'
      : join.carriers[0]
        ? `by ${by(join.carriers[0])}`
        : join.kind;
  return `Join: ${places}, ${how}, ${state}`;
}
