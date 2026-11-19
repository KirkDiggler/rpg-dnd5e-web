/**
 * WATCH A RUN S4 (rpg-project#1011): a timeline of what each creature was
 * doing across the run, folded from the same RECORD the watch draws.
 *
 * TWO THINGS PER STEP, because in the castle most guards have one machine
 * state (`ready`) and "walking the patrol", "going toward a sound" and
 * "chasing" are which table row the guard acted on, not a state:
 *
 * - THE STATE in force when the step ends: `foldRun` at the step's last row,
 *   the exact reading the map and the creature section give that step.
 * - WHAT IT DID in the step, in the record's own words: each `answered`
 *   beat it wrote (the pick: its `word` — toward, hold, attack, … — its
 *   `selector` — path, at, attacker, … — and its table `key`), or the same
 *   body inline on a `behavior_decision` (`selection`, written when the
 *   story suppressed a repeated empty hold); each `speech` it spoke; each
 *   `behavior_work` result (completed, partial: goal_not_reached …); and,
 *   when it wrote no pick, a `moved`. A party member's own act is its verb.
 *   A step where it wrote none of these shows nothing: nothing is inferred.
 *
 * Nothing here evaluates a guard or guesses an intent (machine-inspection:
 * the reader never fills a missing trace).
 */
import type { RecordRow } from '@/components/session/recordFeed';
import {
  foldRun,
  speechOf,
  stepStartOf,
  type RunStart,
  type RunStep,
} from './runView';

/** What a member did in one step, as the record says it. */
export interface TimelineDid {
  /** What a boundary compares: each distinct `word selector` of the step,
   * in order (`toward path`, `say`, `moved`). */
  kind: string;
  /** The short mark drawn in the cell. */
  mark: string;
  /** Every recorded thing, in full, for the title and the aria label. */
  text: string;
}

export interface TimelineCell {
  /** Index into the timeline's steps. */
  step: number;
  /** The state in force when the step ended; absent when nothing says. */
  state?: string;
  did?: TimelineDid;
  /** The state differs from the previous step's. */
  stateChanged: boolean;
  /** What it did differs in kind from the last step it did something. */
  didChanged: boolean;
}

export interface TimelineRow {
  id: string;
  party: boolean;
  cells: readonly TimelineCell[];
  /** Its state or what it did changed kind at least once in the run. */
  changed: boolean;
}

export interface RunTimeline {
  steps: readonly RunStep[];
  rows: readonly TimelineRow[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A behavior-qualified table key (`behavior/4:duty/item/0/move`, the
 * toolkit's `appendPickBeat`) as `duty/item/0/move`; any other key as is. */
export function tableKeyOf(key: string): string {
  const match = /^behavior\/(\d+):(.*)$/.exec(key);
  if (!match) return key;
  return match[2]!;
}

/** The behavior instance a qualified key names (`duty` in
 * `behavior/4:duty/item/0/move`, its length written before the colon), or
 * '' for an unqualified key. */
export function instanceOfKey(key: string): string {
  const match = /^behavior\/(\d+):(.*)$/.exec(key);
  if (!match) return '';
  return match[2]!.slice(0, Number(match[1]));
}

interface Pick {
  word: string;
  selector: string;
  key: string;
  target: string;
  path: string;
}

function pickOf(fields: Readonly<Record<string, unknown>>): Pick {
  return {
    word: str(fields.word),
    selector: str(fields.selector),
    key: str(fields.key),
    target: str(fields.target),
    path: Array.isArray(fields.path) ? `[${fields.path.join(', ')}]` : '',
  };
}

/** One pick's kind: its word and selector as the beat writes them. A pick
 * with no word is a row that only speaks (`answerWord`). */
function pickKind(pick: Pick): string {
  const word = pick.word || 'say';
  const kind = pick.selector ? `${word} ${pick.selector}` : word;
  // Two roles' rows can share a word and selector (a patrol leg and an
  // investigation's look are both `toward at`): the role tells them apart.
  const instance = instanceOfKey(pick.key);
  return instance ? `${kind} (${instance})` : kind;
}

function pickText(pick: Pick): string {
  const parts = [pickKind(pick)];
  if (pick.target) parts.push(`at ${pick.target}`);
  if (pick.key) parts.push(`row ${tableKeyOf(pick.key)}`);
  if (pick.path) parts.push(`entry ${pick.path}`);
  return parts.join(' · ');
}

/** `word selector (instance)` → its parts; the instance is '' when absent. */
function kindParts(kind: string): { base: string; instance: string }[] {
  return kind.split(' + ').map((part) => {
    const match = / \(([^()]*)\)$/.exec(part);
    return match
      ? { base: part.slice(0, match.index), instance: match[1]! }
      : { base: part, instance: '' };
  });
}

/**
 * Whether two steps' kinds are the same kind of doing: the same `word
 * selector` parts, and the same role where BOTH carry one. The toolkit
 * writes an inline `behavior_decision.selection` from the pick before it is
 * qualified (behavior_trace.go, `appendPickBeat` qualifies only its own
 * copy), so a suppressed repeat hold reads `hold` beside the `answered`
 * `hold (duty)` the step before; that is the same hold, not a change.
 */
export function sameKind(a: string, b: string): boolean {
  const left = kindParts(a);
  const right = kindParts(b);
  if (left.length !== right.length) return false;
  return left.every((part, i) => {
    const other = right[i]!;
    if (part.base !== other.base) return false;
    return (
      !part.instance || !other.instance || part.instance === other.instance
    );
  });
}

interface Gathered {
  kinds: string[];
  texts: string[];
  moved: boolean;
}

/** What each member did in rows [from, to). */
function didIn(
  rows: readonly RecordRow[],
  from: number,
  to: number,
  step: RunStep
): Map<string, TimelineDid> {
  const by = new Map<string, Gathered>();
  const of = (id: string): Gathered => {
    let g = by.get(id);
    if (!g) {
      g = { kinds: [], texts: [], moved: false };
      by.set(id, g);
    }
    return g;
  };
  const kind = (g: Gathered, k: string): void => {
    if (!g.kinds.includes(k)) g.kinds.push(k);
  };
  if (step.actor) {
    const g = of(step.actor);
    kind(g, step.verb);
    g.texts.push(`${step.verb} (${step.act})`);
  }
  for (let i = from; i < to; i++) {
    const row = rows[i]!;
    const f = row.fields;
    if (!f) continue;
    switch (row.beat) {
      case 'answered': {
        const id = str(f.creature);
        if (!id) break;
        const pick = pickOf(f);
        const g = of(id);
        kind(g, pickKind(pick));
        g.texts.push(pickText(pick));
        break;
      }
      case 'behavior_decision': {
        // The pick rides inline only when no `answered` beat was written
        // for it (`pick_record` empty): never counted twice.
        const id = str(f.member);
        const sel = f.selection;
        if (!id || str(f.pick_record) || typeof sel !== 'object' || !sel) break;
        const pick = pickOf(sel as Record<string, unknown>);
        const g = of(id);
        kind(g, pickKind(pick));
        g.texts.push(pickText(pick));
        break;
      }
      case 'behavior_work': {
        const id = str(f.member);
        const status = str(f.status);
        // `selected` repeats the pick; the result is what is new.
        if (!id || !status || status === 'selected') break;
        const reason = str(f.reason);
        of(id).texts.push(`work ${status}${reason ? `: ${reason}` : ''}`);
        break;
      }
      case 'moved': {
        const id = str(f.member);
        if (id) of(id).moved = true;
        break;
      }
      case 'stayed': {
        const id = str(f.member);
        const why = str(f.why);
        if (id && why) of(id).texts.push(`stayed: ${why}`);
        break;
      }
      default:
        break;
    }
  }
  for (const line of speechOf(rows, to, from)) {
    if (!line.speaker) continue;
    const g = of(line.speaker);
    // A party member's own line is its act (`speak`): the words go in the
    // text, not a second kind beside the verb.
    if (line.speaker !== step.actor) kind(g, 'say');
    g.texts.push(
      line.words !== undefined ? `said “${line.words}”` : 'said something'
    );
  }
  const out = new Map<string, TimelineDid>();
  for (const [id, g] of by) {
    if (g.kinds.length === 0 && g.moved) {
      g.kinds.push('moved');
      g.texts.push('moved');
    }
    if (g.kinds.length === 0) {
      // Only a work result or a stay: said in full, no kind of its own.
      if (g.texts.length > 0)
        out.set(id, { kind: '', mark: '', text: g.texts.join('; ') });
      continue;
    }
    out.set(id, {
      kind: g.kinds.join(' + '),
      mark: [...new Set(g.kinds.map((k) => k.replace(/ \(.*\)$/, '')))].join(
        '+'
      ),
      text: g.texts.join('; '),
    });
  }
  return out;
}

/** The whole run's timeline: one row per member the record or the draft
 * names, one cell per step, oldest first; party rows first. */
export function timelineOf(
  start: RunStart,
  rows: readonly RecordRow[]
): RunTimeline {
  const steps = foldRun(start, rows, 0).steps;
  const order: string[] = [];
  const party = new Set<string>();
  const cells = new Map<string, TimelineCell[]>();
  const states: Map<string, string | undefined>[] = [];
  const dids: Map<string, TimelineDid>[] = [];
  /** Members a `state` beat moved in each step: a recorded transition is a
   * change even when no earlier state was known. */
  const transitions: Set<string>[] = [];
  steps.forEach((step, index) => {
    const view = foldRun(start, rows, step.through);
    const stepStates = new Map<string, string | undefined>();
    for (const member of Object.values(view.members)) {
      if (!cells.has(member.id)) {
        cells.set(member.id, []);
        order.push(member.id);
      }
      if (member.party) party.add(member.id);
      stepStates.set(member.id, member.state);
    }
    states.push(stepStates);
    const did = didIn(rows, stepStartOf(steps, index), step.through, step);
    for (const id of did.keys())
      if (!cells.has(id)) {
        cells.set(id, []);
        order.push(id);
      }
    dids.push(did);
    const moved = new Set<string>();
    for (let i = stepStartOf(steps, index); i < step.through; i++) {
      const r = rows[i]!;
      const id = str(r.fields?.member);
      if (r.beat === 'state' && id && str(r.fields?.to)) moved.add(id);
    }
    transitions.push(moved);
  });
  const timelineRows: TimelineRow[] = order.map((id) => {
    let lastKind = '';
    let changed = false;
    const row: TimelineCell[] = steps.map((_, index) => {
      const state = states[index]!.get(id);
      const prior = index > 0 ? states[index - 1]!.get(id) : undefined;
      const transitioned = transitions[index]!.has(id);
      const stateChanged =
        transitioned || (index > 0 && state !== undefined && prior !== state);
      const did = dids[index]!.get(id);
      const didChanged =
        !!did?.kind && lastKind !== '' && !sameKind(did.kind, lastKind);
      if (did?.kind) lastKind = did.kind;
      if (didChanged || transitioned || (stateChanged && prior !== undefined))
        changed = true;
      return { step: index, state, did, stateChanged, didChanged };
    });
    return { id, party: party.has(id), cells: row, changed };
  });
  timelineRows.sort((a, b) => Number(b.party) - Number(a.party));
  return { steps, rows: timelineRows };
}

/** The rows shown: every party row, and the others (only those that changed
 * when `onlyChanged`). */
export function shownTimelineRows(
  timeline: RunTimeline,
  onlyChanged: boolean,
  selected: string | null = null
): TimelineRow[] {
  return timeline.rows.filter(
    (row) => row.party || !onlyChanged || row.changed || row.id === selected
  );
}

/** More creatures than this and "Only creatures that changed" starts on. */
export const TIMELINE_HANDFUL = 5;

/** A contiguous run of one state along a row, for the band. */
export interface StateSegment {
  state: string | undefined;
  from: number;
  length: number;
}

export function stateSegments(cells: readonly TimelineCell[]): StateSegment[] {
  const out: StateSegment[] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (last && last.state === cell.state) last.length++;
    else out.push({ state: cell.state, from: cell.step, length: 1 });
  }
  return out;
}

/** A stable band colour for a state name: the same name, the same colour. */
export const STATE_COLOURS = [
  '#2f6f8f',
  '#8a5a2b',
  '#4f7a3a',
  '#7a3f73',
  '#8f3b3b',
  '#3c6e6a',
  '#6b6b2a',
  '#4a4f8f',
] as const;

export function stateColour(state: string): string {
  let h = 0;
  for (let i = 0; i < state.length; i++)
    h = (h * 31 + state.charCodeAt(i)) >>> 0;
  return STATE_COLOURS[h % STATE_COLOURS.length]!;
}
