/**
 * WATCH A RUN's fold (rpg-project#1004) over a REAL captured run: the
 * engine's own record of a patrol and an investigation
 * (`machine-investigation-capture.jsonl`, api stdout capture), plus
 * hand-built `state` beats in the toolkit's wire shape
 * (`machine.go`: {beat, member, from, to, reason}), since the capture
 * predates the `state` beat.
 */
import investigation from '@/components/session/fixtures/machine-investigation-capture.jsonl?raw';
import { positionToCube } from '@/components/session/positionBridge';
import { parseRecordCapture } from '@/components/session/recordCapture';
import type { RecordRow } from '@/components/session/recordFeed';
import { describe, expect, it } from 'vitest';
import {
  foldRun,
  rowsAbout,
  stepsOf,
  studioCellOf,
  type RunStart,
} from './runView';

const SELF = 'char_be7b4d7d-b149-4ed0-bad9-ba4ab47fd796';
const rows = parseRecordCapture(investigation).feed.rows;
const start: RunStart = {
  creatures: [
    { id: 'court', cell: { q: 12, r: 0 } },
    { id: 'west', cell: { q: 2, r: 0 } },
    { id: 'dummy', cell: { q: 9, r: 1 } },
  ],
  partyStart: { q: 0, r: 2 },
  self: SELF,
};

let next = 0;
const row = (
  beat: string,
  fields: Record<string, unknown>,
  act = ''
): RecordRow => ({
  id: `T${String(next++).padStart(6, '0')}`,
  at: 1n,
  act,
  beat,
  fields: { beat, ...fields },
});

/** The index just past the first row matching `pick`. */
const after = (pick: (r: RecordRow) => boolean): number =>
  rows.findIndex(pick) + 1;

describe('studioCellOf', () => {
  it('reads an engine cell the way the game reads a wire position', () => {
    for (const position of [
      { x: 3, y: 11 },
      { x: -2, y: 5 },
      { x: 0, y: 0 },
    ]) {
      const cube = positionToCube(position);
      expect(studioCellOf(position)).toEqual({ q: cube.x, r: cube.z });
    }
    expect(studioCellOf({ x: 3, y: 11 })).toEqual({ q: 3, r: 11 });
  });

  it('names no cell for what is not a position', () => {
    expect(studioCellOf(undefined)).toBeNull();
    expect(studioCellOf({ x: '3', y: 1 })).toBeNull();
  });
});

describe('foldRun over a captured run', () => {
  it('before any beat, everyone stands where the draft put them', () => {
    const view = foldRun(start, rows, 0);
    expect(view.members.court!.cell).toEqual({ q: 12, r: 0 });
    expect(view.members[SELF]!.cell).toEqual({ q: 0, r: 2 });
    expect(view.members[SELF]!.party).toBe(true);
    expect(view.members.court!.party).toBe(false);
  });

  it('after N beats, each mover stands on the cell its last moved beat named', () => {
    // Through the party's first walk: six steps east along row 2.
    const walked = after(
      (r) =>
        r.beat === 'moved' &&
        r.fields?.member === SELF &&
        (r.fields.position as { x: number }).x === 6
    );
    const view = foldRun(start, rows, walked);
    expect(view.members[SELF]!.cell).toEqual({ q: 6, r: 2 });
    // The patrol has not stepped yet at that moment.
    expect(view.members.court!.cell).toEqual({ q: 12, r: 0 });

    // Through the patrol's first two steps.
    const patrolled = after(
      (r) =>
        r.beat === 'moved' &&
        r.fields?.member === 'court' &&
        (r.fields.position as { x: number }).x === 14
    );
    expect(foldRun(start, rows, patrolled).members.court!.cell).toEqual({
      q: 14,
      r: 0,
    });
  });

  it('a creature the draft does not place appears where the record first puts it', () => {
    const view = foldRun({ creatures: [], self: SELF }, rows);
    expect(view.members.west).toBeDefined();
    expect(view.members.west!.cell).not.toBeNull();
  });

  it('a decision labels each creature with its roles’ states', () => {
    const decided = after(
      (r) => r.beat === 'behavior_decision' && r.fields?.member === 'court'
    );
    const court = foldRun(start, rows, decided).members.court!;
    expect(court.roles).toMatchObject({
      investigate: 'idle',
      duty: 'item/0/walk',
    });
    expect(court.state).toContain('duty: item/0/walk');
  });

  it('upTo rewinds: an earlier moment shows the earlier cell', () => {
    const later = after(
      (r) =>
        r.beat === 'moved' &&
        r.fields?.member === 'court' &&
        (r.fields.position as { x: number }).x === 14
    );
    expect(foldRun(start, rows, later).members.court!.cell).toEqual({
      q: 14,
      r: 0,
    });
    const early = foldRun(start, rows, 1);
    expect(early.members.court!.cell).toEqual({ q: 12, r: 0 });
    expect(early.members.court!.state).toBeUndefined();
  });
});

describe('foldRun with state beats', () => {
  const run = [
    row('joined', { member: 'gate-1', kind: 'monster' }),
    row('moved', { member: SELF, position: { x: 4, y: 3 } }, 'move:A'),
    row(
      'state',
      { member: 'gate-1', from: 'posted', to: 'alert', reason: 'heard a step' },
      'move:A'
    ),
    row(
      'behavior_decision',
      {
        member: 'gate-1',
        outcomes: [{ id: 'policy', after: 'alert' }],
      },
      'time:B'
    ),
    row('moved', { member: SELF, position: { x: 9, y: 3 } }, 'move:C'),
    row(
      'state',
      {
        member: 'gate-1',
        from: 'alert',
        to: 'posted',
        reason: 'it went quiet',
      },
      'time:D'
    ),
  ];
  const gate: RunStart = {
    creatures: [{ id: 'gate-1', cell: { q: 5, r: 5 } }],
    partyStart: { q: 0, r: 3 },
    self: SELF,
  };

  it('a state beat changes the label and says the reason', () => {
    const view = foldRun(gate, run, 3);
    expect(view.members['gate-1']!.state).toBe('alert');
    expect(view.members['gate-1']!.lastReason).toBe('heard a step');
  });

  it('a later decision does not overwrite the state a state beat said', () => {
    const view = foldRun(gate, run, 4);
    expect(view.members['gate-1']!.state).toBe('alert');
    expect(view.members['gate-1']!.roles).toEqual({ policy: 'alert' });
  });

  it('the label follows the run back to posted, and rewinds with upTo', () => {
    expect(foldRun(gate, run).members['gate-1']!.state).toBe('posted');
    expect(foldRun(gate, run).members['gate-1']!.lastReason).toBe(
      'it went quiet'
    );
    expect(foldRun(gate, run, 2).members['gate-1']!.state).toBeUndefined();
  });

  it('unknown beats are ignored, never fatal', () => {
    const odd = [
      row('a-beat-from-the-future', { member: 'gate-1', position: 7 }),
      { ...row('moved', {}), fields: undefined },
      row('moved', { member: 'gate-1', position: { x: 'far' } }),
      ...run,
    ];
    const view = foldRun(gate, odd);
    expect(view.members['gate-1']!.cell).toEqual({ q: 5, r: 5 });
    expect(view.members['gate-1']!.state).toBe('posted');
  });
});

describe('stepsOf', () => {
  it('one step per party verb, after the start; NPC acts fold into the step before', () => {
    const steps = stepsOf(rows, SELF);
    expect(steps[0]!.act).toBe('');
    const verbs = steps.slice(1).map((s) => s.verb);
    expect(verbs).toEqual(['move', 'attack', 'move']);
    expect(steps.slice(1).every((s) => s.actor === SELF)).toBe(true);
    // Each step shows the record up to the next step's first row.
    for (let i = 1; i < steps.length; i++)
      expect(steps[i - 1]!.through).toBeLessThanOrEqual(steps[i]!.through);
    expect(steps.at(-1)!.through).toBe(rows.length);
    // At the first move's step, the party has walked and the patrol has
    // answered; the next party verb has not happened.
    const first = foldRun(start, rows, steps[1]!.through);
    expect(first.members[SELF]!.cell).toEqual({ q: 6, r: 2 });
  });
});

describe('rowsAbout', () => {
  it('keeps the beats that name the creature and no other', () => {
    const court = rowsAbout(rows, 'court');
    expect(court.length).toBeGreaterThan(0);
    expect(
      court.every(
        (r) => r.fields?.member === 'court' || r.fields?.creature === 'court'
      )
    ).toBe(true);
    expect(court.some((r) => r.beat === 'behavior_decision')).toBe(true);
  });
});
