/**
 * WATCH A RUN (rpg-project#1003, slice #1004): where every creature of a
 * real run stands and what state its machine is in, folded from the run's
 * RECORD.
 *
 * NOTHING HERE IS SIMULATED. The engine runs the encounter on the server,
 * exactly as it does in the game; this fold only reads what the engine
 * recorded it did (`moved`, `arrived`, `relocated`, `state`,
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
 * WHERE A CREATURE BEGINS is the draft's placement (`startingCell`), since
 * `joined` carries no cell; the party begins at the draft's party start.
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
  /** The draft's creatures and their starting cells. */
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

/** The member a beat is about, when it names one. */
export function memberOfRow(row: RecordRow): string {
  const f = row.fields;
  if (!f) return '';
  return (
    str(f.member) ||
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
          party.has(id) && start.partyStart ? { ...start.partyStart } : null,
        party: party.has(id),
        roles: {},
      };
      members.set(id, m);
    }
    return m;
  };
  for (const creature of start.creatures)
    members.set(creature.id, {
      id: creature.id,
      cell: { ...creature.cell },
      party: false,
      roles: {},
    });
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
        if (!m.fromBeat) m.state = rolesLabel(roles);
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

/** Roles' states in one label: the one state when there is one role,
 * else `role: state` each. */
function rolesLabel(roles: Readonly<Record<string, string>>): string {
  const entries = Object.entries(roles);
  if (entries.length === 1) return entries[0]![1];
  return entries.map(([role, state]) => `${role}: ${state}`).join(' · ');
}
