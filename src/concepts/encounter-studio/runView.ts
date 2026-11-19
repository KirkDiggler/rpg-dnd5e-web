/**
 * WATCH A RUN (rpg-project#1003, slice #1004): where every creature of a
 * real run stands and what state its machine is in, folded from the run's
 * RECORD.
 *
 * NOTHING HERE IS SIMULATED. The engine runs the encounter on the server,
 * exactly as it does in the game; this fold only reads what the engine
 * recorded it did (`moved`, `arrived`, `relocated`, `exited`, `state`,
 * `behavior_decision`) and draws it. It never evaluates a guard, picks a
 * row or moves a creature itself (encounter-studio R30 rejected simulating
 * play in the studio; machine-inspection: the reader never evaluates a
 * condition to fill a missing trace). A beat it does not know is ignored,
 * never fatal.
 *
 * THE RECORD, NOT THE ACT STREAM. The record is the dev-mode diagnostic
 * stream (RecordService, not per recipient), so a creature out of the
 * player's sight is still here. The filtered act stream players receive is
 * not read and not widened.
 *
 * WHERE A MEMBER BEGINS is the record's own `joined_at` beat
 * (rpg-project#1017; rpg-toolkit encounter `BeatJoinedAt`, {member, cell}):
 * one per member seated at setup, written right after `scene_content`, and
 * one right after each later `joined`, so a late joiner appears when it
 * joins. Its `cell` is the same canvas `spatial.Position` a `moved` beat's
 * `position` is. A member the record writes no `joined_at` for (a run from
 * an engine before the beat, or a capture that starts mid-run) begins where
 * the draft (or a saved run's snapshot) placed it, as before: a creature at
 * its `startingCell`, the party at the party start.
 *
 * ONE CELL CONVERSION (`studioCellOf`): the record's `{x, y}` is the
 * dungeon-absolute axial cell (the toolkit's `HexCellAt` output; the
 * single-room dialect's `{ q, r }` IS that cell), read through the game's
 * own `positionToCube` bridge, the same reading the 3D game gives a wire
 * position.
 */
import { positionToCube } from '@/components/session/positionBridge';
import type { RecordRow } from '@/components/session/recordFeed';
import type { RoomHexCell } from '../world-building/workspaceGeometry';

/** The studio cell an engine `{x, y}` names, or null when it names none. */
export function studioCellOf(position: unknown): RoomHexCell | null {
  if (typeof position !== 'object' || position === null) return null;
  const { x, y } = position as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cube = positionToCube({ x, y });
  return { q: cube.x || 0, r: cube.z || 0 };
}

export interface RunStart {
  /** The draft's creatures and their starting cells: where a creature the
   * record writes no `joined_at` for begins. */
  creatures: readonly { id: string; cell: RoomHexCell }[];
  /** The draft's party start, where a joined player begins. */
  partyStart?: RoomHexCell;
  /** The watched seat: a party member even before any beat says so. */
  self?: string;
}

export interface RunMember {
  id: string;
  /** Null when nothing yet says where it is. */
  cell: RoomHexCell | null;
  party: boolean;
  /** The body's state, from the last `state` beat; else, while no state
   * beat has come, the state the last decision left its roles in. */
  state?: string;
  /** The reason of the last `state` beat. */
  lastReason?: string;
  /** Each role instance's state after the last decision, by instance id. */
  roles: Readonly<Record<string, string>>;
  /** Each OTHER role's state (rpg-project#1016), from its last
   * `role_state` beat, by the role's instance id (the id the decision
   * traces name). Absent when the record wrote no `role_state` for it. */
  roleStates?: Readonly<Record<string, RunRoleState>>;
  /** Who it sees (rpg-project#1016): every member a `sighted` beat with it
   * as `observer` said it `gained`, less every one a later beat said it
   * `lost`, sorted. Absent when the record names it as no observer. */
  sees?: readonly string[];
}

/** A role's state, as its last `role_state` beat wrote it. */
export interface RunRoleState {
  state: string;
  /** The role's recipe (`example:behaviors:investigate`), when written. */
  recipe?: string;
  /** The transition's reason, when written. */
  reason?: string;
}

/** The member's states in one compact label: the body's, then each other
 * role's as `role: state` (`ready · investigate: active`). A member with no
 * `role_state` beat reads its `state` exactly as before. */
export function runStateLabel(member: RunMember): string {
  const parts = member.state ? [member.state] : [];
  for (const [role, rs] of Object.entries(member.roleStates ?? {}))
    parts.push(`${role}: ${rs.state}`);
  return parts.join(' · ');
}

/** One step of the run: a party verb and everything the world did after it,
 * up to the next party verb. Step 0 is the start, before any party verb. */
export interface RunStep {
  index: number;
  /** The party act's id (`move:01…`); '' for the start. */
  act: string;
  /** The party member who acted; '' for the start. */
  actor: string;
  /** The verb (`move`), '' for the start. */
  verb: string;
  /** The round the step began in. */
  at: bigint;
  /** The rows this step shows: the record up to the next step's first row. */
  through: number;
}

export interface RunView {
  members: Readonly<Record<string, RunMember>>;
  steps: readonly RunStep[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The member a beat is about, when it names one. `mover` is a `barred`
 * beat's: a refused step writes no `moved`, and is still the party's act
 * (rpg-project#1006). */
export function memberOfRow(row: RecordRow): string {
  const f = row.fields;
  if (!f) return '';
  return (
    str(f.member) ||
    str(f.mover) ||
    str(f.actor) ||
    str(f.creature) ||
    str(f.listener) ||
    str(f.id)
  );
}

/** The rows about one member: its moves, its states, its decisions, its
 * work, what it heard. For the selected creature's trace. */
export function rowsAbout(rows: readonly RecordRow[], id: string): RecordRow[] {
  return rows.filter((row) => memberOfRow(row) === id);
}

/** Who is in the party: joined as a player, or the watched seat. */
function partyOf(rows: readonly RecordRow[], self?: string): Set<string> {
  const party = new Set<string>(self ? [self] : []);
  for (const row of rows) {
    if (row.beat !== 'joined' || !row.fields) continue;
    if (str(row.fields.kind) === 'player') party.add(str(row.fields.member));
  }
  return party;
}

/** The steps of the run: one per party act. */
export function stepsOf(rows: readonly RecordRow[], self?: string): RunStep[] {
  const party = partyOf(rows, self);
  const steps: RunStep[] = [
    { index: 0, act: '', actor: '', verb: '', at: 0n, through: rows.length },
  ];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    // A party act starts its step at its first beat that names the party
    // member (a verb's own beat precedes its consequences).
    if (!row.act || seen.has(row.act)) return;
    const actor = memberOfRow(row);
    if (!party.has(actor)) return;
    seen.add(row.act);
    steps[steps.length - 1]!.through = i;
    const colon = row.act.indexOf(':');
    steps.push({
      index: steps.length,
      act: row.act,
      actor,
      verb: colon < 0 ? row.act : row.act.slice(0, colon),
      at: row.at,
      through: rows.length,
    });
  });
  return steps;
}

/**
 * Fold the record into each member's cell and state. `upTo` is how many
 * rows to apply (the step control's moment); absent applies them all.
 */
export function foldRun(
  start: RunStart,
  rows: readonly RecordRow[],
  upTo: number = rows.length
): RunView {
  const party = partyOf(rows, start.self);
  /** Members the record itself places (`joined_at`, anywhere in the run):
   * none of them takes the draft's cell; each appears at its own beat. */
  const placed = placedByRecord(rows);
  /** `fromBeat`: the state came from a `state` beat, which a later
   * decision's roles never overwrite. */
  type Folding = RunMember & { fromBeat?: boolean };
  const members = new Map<string, Folding>();
  const member = (id: string): Folding => {
    let m = members.get(id);
    if (!m) {
      m = {
        id,
        cell:
          party.has(id) && start.partyStart && !placed.has(id)
            ? { ...start.partyStart }
            : null,
        party: party.has(id),
        roles: {},
      };
      members.set(id, m);
    }
    return m;
  };
  for (const creature of start.creatures) {
    if (placed.has(creature.id)) continue;
    members.set(creature.id, {
      id: creature.id,
      cell: { ...creature.cell },
      party: false,
      roles: {},
    });
  }
  // The watched seat is a party member from the start; when the record
  // places it, it is drawn from its `joined_at` on.
  if (start.self) member(start.self);

  const limit = Math.max(0, Math.min(upTo, rows.length));
  for (let i = 0; i < limit; i++) {
    const row = rows[i]!;
    const f = row.fields;
    if (!f) continue;
    switch (row.beat) {
      case 'joined': {
        const id = str(f.member);
        if (id) member(id);
        break;
      }
      case 'joined_at': {
        // rpg-toolkit encounter `BeatJoinedAt`: {member, cell}, the cell in
        // the frame `moved` writes.
        const id = str(f.member);
        const cell = studioCellOf(f.cell);
        if (id && cell) member(id).cell = cell;
        break;
      }
      case 'moved': {
        const id = str(f.member);
        const cell = studioCellOf(f.position);
        if (id && cell) member(id).cell = cell;
        break;
      }
      case 'arrived': {
        const id = str(f.id);
        const cell = studioCellOf(f.cell);
        if (id && cell) member(id).cell = cell;
        break;
      }
      case 'relocated': {
        const id = str(f.member);
        const cell = studioCellOf(f.to);
        if (id && cell) member(id).cell = cell;
        break;
      }
      case 'exited': {
        // A member that left the run is no longer drawn; a later beat about
        // it (it came back) draws it again.
        const id = str(f.member);
        if (id) members.delete(id);
        break;
      }
      case 'state': {
        const id = str(f.member);
        const to = str(f.to);
        if (!id || !to) break;
        const m = member(id);
        m.state = to;
        m.lastReason = str(f.reason) || undefined;
        m.fromBeat = true;
        break;
      }
      case 'behavior_decision': {
        const id = str(f.member);
        if (!id || !Array.isArray(f.outcomes)) break;
        const m = member(id);
        const roles: Record<string, string> = { ...m.roles };
        for (const outcome of f.outcomes as unknown[]) {
          if (typeof outcome !== 'object' || outcome === null) continue;
          const o = outcome as Record<string, unknown>;
          const role = str(o.id);
          const after = str(o.after);
          if (role && after) roles[role] = after;
        }
        m.roles = roles;
        if (!m.fromBeat) m.state = bodyLabel(roles, m.roleStates);
        break;
      }
      case 'role_state': {
        // A creature's OTHER role (rpg-toolkit encounter machine.go
        // appendRoleStateBeat: member, role, recipe, from, to, reason). The
        // body's `state` is its own beat and is left alone.
        const id = str(f.member);
        const role = str(f.role);
        const to = str(f.to);
        if (!id || !role || !to) break;
        const m = member(id);
        m.roleStates = {
          ...m.roleStates,
          [role]: {
            state: to,
            ...(str(f.recipe) ? { recipe: str(f.recipe) } : {}),
            ...(str(f.reason) ? { reason: str(f.reason) } : {}),
          },
        };
        // The machine drawing finds its live box by role instance id.
        m.roles = { ...m.roles, [role]: to };
        if (!m.fromBeat) m.state = bodyLabel(m.roles, m.roleStates);
        break;
      }
      case 'sighted': {
        // rpg-toolkit encounter sightedbeat.go: `gained` came into view,
        // `lost` left it. A beat with no `observer` (written before
        // rpg-project#1001) names nobody's sight: ignored, as before.
        const id = str(f.observer);
        if (!id) break;
        const gained = strings(f.gained);
        const lost = strings(f.lost);
        if (gained.length === 0 && lost.length === 0) break;
        const m = member(id);
        const sees = new Set(m.sees ?? []);
        for (const g of gained) sees.add(g);
        for (const l of lost) sees.delete(l);
        m.sees = [...sees].sort();
        break;
      }
      default:
        // Every other beat is not about where a creature is or what state
        // its machine is in: ignored, never fatal.
        break;
    }
  }
  const out: Record<string, RunMember> = {};
  for (const [id, m] of members) {
    const { fromBeat, ...plain } = m;
    void fromBeat;
    out[id] = plain;
  }
  return { members: out, steps: stepsOf(rows, start.self) };
}

/** Every member a `joined_at` beat places. */
function placedByRecord(rows: readonly RecordRow[]): Set<string> {
  const placed = new Set<string>();
  for (const row of rows) {
    if (row.beat !== 'joined_at' || !row.fields) continue;
    const id = str(row.fields.member);
    if (id && studioCellOf(row.fields.cell)) placed.add(id);
  }
  return placed;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** The body's label from a decision's roles while no `state` beat has come:
 * every role but those a `role_state` beat speaks for (they are shown as
 * their own); undefined when none is left. */
function bodyLabel(
  roles: Readonly<Record<string, string>>,
  others: Readonly<Record<string, RunRoleState>> | undefined
): string | undefined {
  if (!others) return rolesLabel(roles);
  const body = Object.fromEntries(
    Object.entries(roles).filter(([role]) => !(role in others))
  );
  return Object.keys(body).length > 0 ? rolesLabel(body) : undefined;
}

/** Roles' states in one label: the one state when there is one role,
 * else `role: state` each. */
function rolesLabel(roles: Readonly<Record<string, string>>): string {
  const entries = Object.entries(roles);
  if (entries.length === 0) return '';
  if (entries.length === 1) return entries[0]![1];
  return entries.map(([role, state]) => `${role}: ${state}`).join(' · ');
}

/** One spoken thing in the run (rpg-project#1006 follow-up): the toolkit's
 * `speech` beat, written once per group of members who perceived the same
 * parts, every version carrying the same `utterance` id. The record is
 * unfiltered, so the fullest version (words and speaker) stands for the
 * line; the fold invents no part no version carries. */
export interface RunSpeech {
  utterance: string;
  /** The row index of the line's first version: its place in the run. */
  index: number;
  speaker?: string;
  to?: string;
  words?: string;
  /** `whisper`, `speak`, `shout` or `scream`, as the beat says it. */
  loudness: string;
  hops?: number;
}

/** Every line said in rows [from, upTo), oldest first, one per utterance. */
export function speechOf(
  rows: readonly RecordRow[],
  upTo: number = rows.length,
  from = 0
): RunSpeech[] {
  const lines = new Map<string, RunSpeech>();
  const fullness = (s: RunSpeech): number =>
    (s.words !== undefined ? 2 : 0) + (s.speaker ? 1 : 0);
  const limit = Math.max(0, Math.min(upTo, rows.length));
  for (let i = Math.max(0, from); i < limit; i++) {
    const row = rows[i]!;
    const f = row.fields;
    if (row.beat !== 'speech' || !f) continue;
    const utterance = str(f.utterance) || row.id;
    const version: RunSpeech = {
      utterance,
      index: i,
      speaker: str(f.speaker) || undefined,
      to: str(f.to) || undefined,
      words: typeof f.words === 'string' ? f.words : undefined,
      loudness: str(f.loudness),
      hops: typeof f.hops === 'number' ? f.hops : undefined,
    };
    const held = lines.get(utterance);
    if (!held) lines.set(utterance, version);
    else if (fullness(version) > fullness(held))
      lines.set(utterance, { ...version, index: held.index });
  }
  return [...lines.values()].sort((a, b) => a.index - b.index);
}

/** A player's attempt stopped by a body: the toolkit's `barred` beat. A
 * step names the cell it was refused into; a door verb its door and verb. */
export interface RunBarred {
  index: number;
  mover: string;
  barrier: string;
  cell?: RoomHexCell;
  door?: string;
  verb?: string;
}

/** Every `barred` beat in rows [from, upTo), oldest first. */
export function barredOf(
  rows: readonly RecordRow[],
  upTo: number = rows.length,
  from = 0
): RunBarred[] {
  const out: RunBarred[] = [];
  const limit = Math.max(0, Math.min(upTo, rows.length));
  for (let i = Math.max(0, from); i < limit; i++) {
    const row = rows[i]!;
    const f = row.fields;
    if (row.beat !== 'barred' || !f) continue;
    out.push({
      index: i,
      mover: str(f.mover),
      barrier: str(f.barrier),
      cell: studioCellOf(f.cell) ?? undefined,
      door: str(f.door) || undefined,
      verb: str(f.verb) || undefined,
    });
  }
  return out;
}

/** The first row of step `at`: where the step's own beats begin. */
export function stepStartOf(steps: readonly RunStep[], at: number): number {
  return at > 0 ? (steps[at - 1]?.through ?? 0) : 0;
}

/** One observer's sight changing (rpg-project#1016): the toolkit's
 * `sighted` beat (encounter sightedbeat.go), one per observer whose
 * perception changed in a pass. `gained`: came into its view (first contact
 * or back in view; the beat does not tell them apart). `lost`: left its
 * view. `changed`: members it can see whose own state the engine declared
 * changed (not a change of sight). `knowledge`: its view of doors or
 * objects changed. The beat names no position and no reason. */
export interface RunSighting {
  index: number;
  observer: string;
  gained: readonly string[];
  lost: readonly string[];
  changed: readonly string[];
  knowledge: boolean;
}

/** Every `sighted` beat that names its observer in rows [from, upTo),
 * oldest first. A beat with no `observer` is left out. */
export function sightingsOf(
  rows: readonly RecordRow[],
  upTo: number = rows.length,
  from = 0
): RunSighting[] {
  const out: RunSighting[] = [];
  const limit = Math.max(0, Math.min(upTo, rows.length));
  for (let i = Math.max(0, from); i < limit; i++) {
    const row = rows[i]!;
    const f = row.fields;
    if (row.beat !== 'sighted' || !f) continue;
    const observer = str(f.observer);
    if (!observer) continue;
    out.push({
      index: i,
      observer,
      gained: strings(f.gained),
      lost: strings(f.lost),
      changed: strings(f.changed),
      knowledge: f.knowledge_changed === true,
    });
  }
  return out;
}

/** Each observer's sight in one step: who came into and who left its view
 * across rows [from, upTo). A member seen then lost within the step (or
 * lost then seen) is said both ways, as the record has it. */
export interface StepSight {
  observer: string;
  gained: readonly string[];
  lost: readonly string[];
  changed: readonly string[];
  knowledge: boolean;
}

export function stepSightOf(
  rows: readonly RecordRow[],
  upTo: number = rows.length,
  from = 0
): StepSight[] {
  const by = new Map<
    string,
    {
      gained: Set<string>;
      lost: Set<string>;
      changed: Set<string>;
      knowledge: boolean;
    }
  >();
  for (const s of sightingsOf(rows, upTo, from)) {
    let g = by.get(s.observer);
    if (!g) {
      g = {
        gained: new Set(),
        lost: new Set(),
        changed: new Set(),
        knowledge: false,
      };
      by.set(s.observer, g);
    }
    s.gained.forEach((x) => g.gained.add(x));
    s.lost.forEach((x) => g.lost.add(x));
    s.changed.forEach((x) => g.changed.add(x));
    g.knowledge ||= s.knowledge;
  }
  return [...by].map(([observer, g]) => ({
    observer,
    gained: [...g.gained].sort(),
    lost: [...g.lost].sort(),
    changed: [...g.changed].sort(),
    knowledge: g.knowledge,
  }));
}
