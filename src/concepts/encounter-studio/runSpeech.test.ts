/**
 * WHAT WAS SAID in a watched run (rpg-project#1006 follow-up): the record's
 * `speech` beats, one line per utterance from every version the toolkit
 * wrote (utterance.go: speaker, to, words present only for who perceived
 * them), said in the game's own words; and `barred` (barred.go: mover,
 * barrier, a step's cell or a door verb's door and verb). Rows are
 * hand-built in the toolkit's wire shape.
 */
import type { RecordRow } from '@/components/session/recordFeed';
import { describe, expect, it } from 'vitest';
import { barredLine, runSpeechLine, saidInStep } from './runSpeech';
import { barredOf, speechOf, stepsOf, stepStartOf } from './runView';

const row = (
  id: string,
  act: string,
  beat: string,
  fields: Record<string, unknown>
): RecordRow => ({ id, at: 1n, act, beat, fields: { beat, ...fields } });

const names = new Map([
  ['gate-1', 'Guard'],
  ['hero', 'Aldric'],
]);

/** The hero steps up; the guard hails him (two versions: one for those
 * who caught the words, one for a listener behind the wall); the hero
 * steps into him and is barred; the guard speaks again. */
const rows: RecordRow[] = [
  row('1', 'move:1', 'moved', { member: 'hero', position: { x: 2, y: 2 } }),
  row('2', 'move:1', 'speech', {
    utterance: 'u1',
    place: { x: 3, y: 2 },
    loudness: 'speak',
    hops: 1,
  }),
  row('3', 'move:1', 'speech', {
    utterance: 'u1',
    speaker: 'gate-1',
    to: 'hero',
    words: 'Easy there, friend.',
    loudness: 'speak',
  }),
  row('4', 'move:2', 'barred', {
    mover: 'hero',
    barrier: 'gate-1',
    cell: { x: 3, y: 2 },
  }),
  row('5', 'move:2', 'speech', {
    utterance: 'u2',
    speaker: 'gate-1',
    to: 'hero',
    words: 'Whoa there, buddy. Can I help you?',
    loudness: 'shout',
  }),
  row('6', 'move:3', 'barred', {
    mover: 'hero',
    barrier: 'gate-1',
    door: 'gate',
    verb: 'open',
  }),
];

describe('speechOf', () => {
  it('one line per utterance, the fullest version, in the run’s order', () => {
    const lines = speechOf(rows);
    expect(lines.map((l) => l.utterance)).toEqual(['u1', 'u2']);
    expect(lines[0]).toMatchObject({
      speaker: 'gate-1',
      to: 'hero',
      words: 'Easy there, friend.',
      index: 1,
    });
  });

  it('at a past step, only what had been said by then', () => {
    const steps = stepsOf(rows, 'hero');
    const firstStepEnds = steps[1]!.through;
    expect(speechOf(rows, firstStepEnds).map((l) => l.utterance)).toEqual([
      'u1',
    ]);
  });

  it('a line nobody caught the words of stays wordless; nothing is invented', () => {
    const [line] = speechOf(rows.slice(0, 2));
    expect(line!.words).toBeUndefined();
    expect(line!.speaker).toBeUndefined();
  });
});

describe('runSpeechLine', () => {
  it('says the line as the game does: speaker, loudness, to whom, words', () => {
    const [hail, shout] = speechOf(rows);
    expect(runSpeechLine(hail!, names)).toBe(
      'Guard says to Aldric: “Easy there, friend.”'
    );
    expect(runSpeechLine(shout!, names)).toBe(
      'Guard shouts to Aldric: “Whoa there, buddy. Can I help you?”'
    );
  });
});

describe('barred', () => {
  it('names the holder, the cell a step was refused into, or the door', () => {
    const [step, door] = barredOf(rows);
    expect(barredLine(step!, names)).toBe(
      'Guard (gate-1) blocks the way to 3, 2'
    );
    expect(barredLine(door!, names)).toBe(
      'Guard (gate-1) holds this door (open)'
    );
  });

  it('a step’s bumps are its own rows only', () => {
    const steps = stepsOf(rows, 'hero');
    const at = 2;
    const from = stepStartOf(steps, at);
    const bumps = barredOf(rows, steps[at]!.through, from);
    expect(bumps.map((b) => b.cell)).toEqual([{ q: 3, r: 2 }]);
  });
});

describe('saidInStep', () => {
  it('marks the speaker of this step’s line with its words', () => {
    const steps = stepsOf(rows, 'hero');
    const said = saidInStep(
      rows,
      stepStartOf(steps, 2),
      steps[2]!.through,
      names
    );
    expect(said.get('gate-1')).toEqual({
      line: 'Guard shouts to Aldric: “Whoa there, buddy. Can I help you?”',
      words: 'Whoa there, buddy. Can I help you?',
    });
    expect(said.has('hero')).toBe(false);
  });
});
