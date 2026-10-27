// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { groupRecord } from './recordActs';
import type { RecordRow } from './recordFeed';

function row(
  id: string,
  at: number,
  act: string,
  beat: string,
  fields: Record<string, unknown> = {}
): RecordRow {
  return { id, at: BigInt(at), act, beat, fields: { beat, ...fields } };
}

const HERO = 'char_hero';
const DASH = 'encounter:table:dash';

// A reserve's driven turn as the encounter writes it (clocks.go): the pick
// is its own `time` act, then one act for the intent the pick chose.
const steps = Array.from({ length: 12 }, (_, i) =>
  row(`01B${String(i).padStart(2, '0')}`, 1, 'move:01B', 'moved', {
    member: 'reserve-1',
    cause: DASH,
  })
);
const record: RecordRow[] = [
  row('00A01', 0, '', 'scene-opened'),
  row('00A02', 0, '', 'sighted', { member: HERO }),
  row('01A01', 1, 'time:01A', 'table', { creature: 'reserve-1', key: 'time' }),
  row('01A02', 1, 'time:01A', 'answered', {
    creature: 'reserve-1',
    key: 'time',
    word: 'dash',
    selector: 'enemy',
    target: HERO,
  }),
  ...steps,
  row('01B99', 1, 'move:01B', 'heard', { member: HERO }),
  // A hold drives no act: the next act is the hero's, never joined to it.
  row('01C01', 1, 'time:01C', 'answered', {
    creature: 'gate-1',
    key: 'time',
    word: 'hold',
  }),
  row('01D01', 1, 'speak:01D', 'spoke', { actor: HERO }),
  row('01E01', 1, '', 'sighted', { member: 'reserve-1' }),
];

describe('groupRecord (rpg-dnd5e-web#1345)', () => {
  it('joins a pick to the act it drove: its table, its answer and its beats', () => {
    const run = groupRecord(record).find((a) => a.key === 'time:01A')!;
    expect(run.acts).toEqual(['time:01A', 'move:01B']);
    expect(run.actor).toBe('reserve-1');
    expect(run.round).toBe(1n);
    expect(run.beats.map((b) => b.beat)).toEqual([
      'table',
      'answered',
      ...Array(12).fill('moved'),
      'heard',
    ]);
  });

  it('reads a dash as `dash enemy · 12 cells`', () => {
    const run = groupRecord(record).find((a) => a.key === 'time:01A')!;
    expect(`${run.word} · ${run.followed}`).toBe(
      'dash enemy · 12 cells, 1 heard'
    );
  });

  it('does not join a pick that drove nothing to someone else’s act', () => {
    const acts = groupRecord(record);
    expect(acts.find((a) => a.key === 'time:01C')!.acts).toEqual(['time:01C']);
    const spoke = acts.find((a) => a.key === 'speak:01D')!;
    expect([spoke.actor, spoke.word, spoke.followed]).toEqual([
      HERO,
      'speak',
      '1 spoke',
    ]);
  });

  it('puts beats with no act under one world row per round', () => {
    const world = groupRecord(record).filter((a) => a.world);
    expect(
      world.map((w) => [w.key, w.round, w.beats.map((b) => b.id)])
    ).toEqual([
      ['world:1', 1n, ['01E01']],
      ['world:0', 0n, ['00A01', '00A02']],
    ]);
  });

  it('lists acts newest first by when each began', () => {
    expect(groupRecord(record).map((a) => a.key)).toEqual([
      'world:1',
      'speak:01D',
      'time:01C',
      'time:01A',
      'world:0',
    ]);
  });
});
