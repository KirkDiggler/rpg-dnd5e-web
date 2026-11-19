/**
 * WATCH A RUN S4's fold (rpg-project#1011): per member, per step, the
 * machine state in force and what it did, from hand-built beats in the
 * toolkit's wire shape: `state` (machine.go {member, from, to, reason}),
 * `answered` (answer.go answeredBeatBody: creature, key, word, selector,
 * target), `behavior_decision` with an inline `selection`
 * (behavior_trace.go), `behavior_work` (status, reason, work{instance,
 * key, kind}), `speech` (speaker, words, utterance), `moved`.
 */
import type { RecordRow } from '@/components/session/recordFeed';
import { describe, expect, it } from 'vitest';
import {
  instanceOfKey,
  shownTimelineRows,
  stateColour,
  stateSegments,
  tableKeyOf,
  timelineOf,
} from './runTimeline';
import type { RunStart } from './runView';

let next = 0;
const row = (
  act: string,
  beat: string,
  fields: Record<string, unknown>
): RecordRow => ({
  id: `T${String(next++).padStart(6, '0')}`,
  at: 1n,
  act,
  beat,
  fields: { beat, ...fields },
});

const start: RunStart = {
  creatures: [
    { id: 'gate-1', cell: { q: 4, r: 0 } },
    { id: 'west', cell: { q: 8, r: 0 } },
    { id: 'quiet', cell: { q: 9, r: 2 } },
  ],
  partyStart: { q: 0, r: 0 },
  self: 'hero',
};

const answered = (
  creature: string,
  word: string,
  selector: string,
  key: string,
  act: string
) =>
  row(act, 'answered', {
    creature,
    word,
    selector,
    key,
    target: '',
    say: '',
    entry: 0,
    path: [0],
  });

const heroMoves = (act: string, x: number) =>
  row(act, 'moved', { member: 'hero', position: { x, y: 0 } });

/** Step 0 (the start), then three party moves. */
const rows: RecordRow[] = [
  row('', 'joined', { member: 'hero', kind: 'player' }),
  // step 1
  heroMoves('move:1', 1),
  answered('west', 'toward', 'path', 'behavior/6:patrol/item/0/move', 'time:1'),
  row('move:w1', 'behavior_work', {
    member: 'west',
    status: 'selected',
    reason: '',
    work: { instance: 'patrol', key: 'item/0/move', kind: 'arrival' },
  }),
  row('move:w1', 'moved', { member: 'west', position: { x: 7, y: 0 } }),
  row('move:w1', 'behavior_work', {
    member: 'west',
    status: 'completed',
    reason: '',
    work: { instance: 'patrol', key: 'item/0/move', kind: 'arrival' },
  }),
  row('time:2', 'behavior_decision', {
    member: 'gate-1',
    operation: 'decide',
    on: 'time',
    pick_record: '',
    outcomes: [{ id: 'post', before: 'posted', after: 'posted' }],
    selection: {
      beat: 'answered',
      creature: 'gate-1',
      word: 'hold',
      selector: '',
      key: 'time',
    },
  }),
  // step 2
  heroMoves('move:2', 2),
  row('move:2', 'state', {
    member: 'gate-1',
    from: 'posted',
    to: 'alert',
    reason: 'heard a step',
  }),
  answered(
    'west',
    'toward',
    'noise',
    'behavior/6:patrol/investigate',
    'time:3'
  ),
  row('time:4', 'speech', {
    utterance: 'u1',
    speaker: 'gate-1',
    words: 'Who goes there?',
    loudness: 'shout',
  }),
  // step 3
  heroMoves('move:3', 3),
  row('move:3', 'state', {
    member: 'gate-1',
    from: 'alert',
    to: 'posted',
    reason: 'nothing found',
  }),
  answered('west', 'toward', 'path', 'behavior/6:patrol/item/1/move', 'time:5'),
];

const timeline = timelineOf(start, rows);
const rowOf = (id: string) => timeline.rows.find((r) => r.id === id)!;

describe('timelineOf', () => {
  it('reads each step’s state from the state beats', () => {
    const gate = rowOf('gate-1');
    expect(gate.cells.map((c) => c.state)).toEqual([
      undefined,
      'posted',
      'alert',
      'posted',
    ]);
    expect(gate.cells[2]!.stateChanged).toBe(true);
    expect(gate.cells[3]!.stateChanged).toBe(true);
    expect(gate.changed).toBe(true);
  });

  it('bands follow the state runs', () => {
    expect(stateSegments(rowOf('gate-1').cells)).toEqual([
      { state: undefined, from: 0, length: 1 },
      { state: 'posted', from: 1, length: 1 },
      { state: 'alert', from: 2, length: 1 },
      { state: 'posted', from: 3, length: 1 },
    ]);
  });

  it('says what a creature did from its picks, in the record’s words', () => {
    const west = rowOf('west');
    const [, one, two, three] = west.cells;
    expect(one!.did?.kind).toBe('toward path (patrol)');
    expect(one!.did?.mark).toBe('toward path');
    expect(one!.did?.text).toContain('entry [0]');
    expect(one!.did?.text).toContain('row patrol/item/0/move');
    expect(one!.did?.text).toContain('work completed');
    expect(two!.did?.kind).toBe('toward noise (patrol)');
    expect(two!.didChanged).toBe(true);
    expect(three!.did?.kind).toBe('toward path (patrol)');
    expect(three!.didChanged).toBe(true);
    expect(west.changed).toBe(true);
  });

  it('reads an inline selection and a spoken line', () => {
    const gate = rowOf('gate-1');
    expect(gate.cells[1]!.did?.kind).toBe('hold');
    expect(gate.cells[2]!.did?.kind).toBe('say');
    expect(gate.cells[2]!.did?.text).toContain('said “Who goes there?”');
  });

  it('carries a quiet creature’s state forward and shows no did', () => {
    const quiet = rowOf('quiet');
    expect(quiet.cells.every((c) => c.did === undefined)).toBe(true);
    expect(quiet.changed).toBe(false);
  });

  it('a state with no new beat stays in force across steps', () => {
    const more = timelineOf(start, [...rows, heroMoves('move:9', 4)]);
    const gate = more.rows.find((r) => r.id === 'gate-1')!;
    const last = gate.cells[gate.cells.length - 1]!;
    expect(last.state).toBe('posted');
    expect(last.stateChanged).toBe(false);
    expect(last.did).toBeUndefined();
  });

  it('a party member’s own line is its verb, not a second kind', () => {
    const spoke = timelineOf(start, [
      row('speak:1', 'spoke', { member: 'hero' }),
      row('speak:1', 'speech', {
        utterance: 'u9',
        speaker: 'hero',
        words: 'Hello',
        loudness: 'speak',
      }),
    ]);
    const did = spoke.rows.find((r) => r.id === 'hero')!.cells[1]!.did!;
    expect(did.mark).toBe('speak');
    expect(did.text).toContain('said “Hello”');
  });

  it('the party acts are its own did, and party rows come first', () => {
    expect(timeline.rows[0]!.id).toBe('hero');
    expect(rowOf('hero').cells[1]!.did?.kind).toBe('move');
  });

  it('covers only the steps still in the record once early rows age out', () => {
    const cut = rows.slice(rows.findIndex((r) => r.act === 'move:2'));
    const aged = timelineOf(start, cut);
    expect(aged.steps.map((s) => s.act)).toEqual(['', 'move:2', 'move:3']);
    const gate = aged.rows.find((r) => r.id === 'gate-1')!;
    expect(gate.cells[1]!.state).toBe('alert');
  });
});

describe('shownTimelineRows', () => {
  it('only creatures that changed hides the quiet ones, never the party', () => {
    const ids = shownTimelineRows(timeline, true).map((r) => r.id);
    expect(ids).toContain('hero');
    expect(ids).toContain('gate-1');
    expect(ids).toContain('west');
    expect(ids).not.toContain('quiet');
    expect(shownTimelineRows(timeline, false).map((r) => r.id)).toContain(
      'quiet'
    );
  });
});

describe('helpers', () => {
  it('reads a behavior-qualified key as its instance and key', () => {
    expect(tableKeyOf('behavior/4:duty/item/0/move')).toBe('duty/item/0/move');
    expect(tableKeyOf('time')).toBe('time');
    expect(instanceOfKey('behavior/4:duty/item/0/move')).toBe('duty');
    expect(instanceOfKey('time')).toBe('');
  });
  it('tells two roles’ rows apart when word and selector match', () => {
    const run = timelineOf(start, [
      row('move:a', 'moved', { member: 'hero', position: { x: 1, y: 0 } }),
      answered('west', 'toward', 'at', 'behavior/4:duty/item/0/move', 'time:a'),
      row('move:b', 'moved', { member: 'hero', position: { x: 2, y: 0 } }),
      answered(
        'west',
        'toward',
        'at',
        'behavior/11:investigate/look',
        'time:b'
      ),
    ]);
    const west = run.rows.find((r) => r.id === 'west')!;
    expect(west.cells[2]!.didChanged).toBe(true);
  });
  it('gives one state one colour', () => {
    expect(stateColour('alert')).toBe(stateColour('alert'));
  });
});
