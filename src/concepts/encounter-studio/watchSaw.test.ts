/**
 * WATCH A RUN S6 (rpg-project#1016): what each creature saw, and a second
 * role's state, from the record's `sighted` and `role_state` beats.
 *
 * THE WIRE SHAPES are the engine's (rpg-toolkit origin/main 91b0f987,
 * encounter v0.225.0):
 * - `sighted` (sightedbeat.go appendSightedBeats): `observer`, and only the
 *   parts that happened: `gained` (came into view), `lost` (left it),
 *   `changed` (visible members whose own state was declared changed),
 *   `knowledge_changed`.
 * - `role_state` (machine.go appendRoleStateBeat): `member`, `role` (the
 *   behavior instance id), `recipe`, `from`, `to`, `reason`.
 * The two example lines are the engine hand-off's, verbatim.
 */
import investigation from '@/components/session/fixtures/machine-investigation-capture.jsonl?raw';
import { parseRecordCapture } from '@/components/session/recordCapture';
import type { RecordRow } from '@/components/session/recordFeed';
import { create } from '@bufbuild/protobuf';
import { RecordEventSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import { describe, expect, it } from 'vitest';
import {
  instanceOfKey,
  roleSegments,
  shownTimelineRows,
  timelineOf,
} from './runTimeline';
import {
  foldRun,
  runStateLabel,
  sightingsOf,
  stepSightOf,
  type RunStart,
} from './runView';
import { openSavedRun, SAVED_RUN_FORMAT, savedRunFile } from './savedRun';
import { sightLinesOf, sightTextOf } from './watchSight';

/** The hand-off's two lines (rpg-project#1001 comment 7003637122). */
const HANDOFF_SIGHTED = JSON.parse(
  '{"beat":"sighted","changed":["dummy"],"observer":"west"}'
) as Record<string, unknown>;
const HANDOFF_ROLE_STATE = JSON.parse(
  '{"beat":"role_state","member":"west","role":"investigate","recipe":"example:behaviors:investigate","from":"idle","to":"active","reason":""}'
) as Record<string, unknown>;

let next = 0;
const row = (
  act: string,
  fields: Record<string, unknown>,
  beat = String(fields.beat)
): RecordRow => ({
  id: `S${String(next++).padStart(6, '0')}`,
  at: 1n,
  act,
  beat,
  fields: { beat, ...fields },
});

const start: RunStart = {
  creatures: [
    { id: 'west', cell: { q: 8, r: 0 } },
    { id: 'gate-1', cell: { q: 4, r: 0 } },
    { id: 'quiet', cell: { q: 9, r: 2 } },
  ],
  partyStart: { q: 0, r: 0 },
  self: 'hero',
};
const heroMoves = (act: string, x: number) =>
  row(act, { beat: 'moved', member: 'hero', position: { x, y: 0 } });

/** Step 0, then three party moves. `west` runs patrol (its body) and
 * investigate; `gate-1` sees the hero come and go. */
const rows: RecordRow[] = [
  row('', { beat: 'joined', member: 'hero', kind: 'player' }),
  row('', { beat: 'sighted', observer: 'gate-1', gained: ['west'] }),
  row('', {
    beat: 'state',
    member: 'west',
    from: '',
    to: 'ready',
    reason: '',
  }),
  // step 1: gate-1 sees the hero; west's investigate goes active.
  heroMoves('move:1', 1),
  row('move:1', {
    beat: 'sighted',
    observer: 'gate-1',
    gained: ['hero'],
  }),
  row('time:1', HANDOFF_ROLE_STATE),
  row('time:1', {
    beat: 'behavior_decision',
    member: 'west',
    operation: 'decide',
    on: 'time',
    pick_record: 'x',
    outcomes: [
      { id: 'patrol', before: 'ready', after: 'ready' },
      { id: 'investigate', before: 'idle', after: 'active' },
    ],
  }),
  row('time:1', {
    beat: 'answered',
    creature: 'west',
    word: 'toward',
    selector: 'at',
    key: 'behavior/11:investigate/look',
    target: '',
  }),
  // step 2: a change gate-1 can see, and nothing of sight.
  heroMoves('move:2', 2),
  row('move:2', HANDOFF_SIGHTED),
  // step 3: gate-1 loses the hero; west's investigate goes idle.
  heroMoves('move:3', 3),
  row('move:3', {
    beat: 'sighted',
    observer: 'gate-1',
    lost: ['hero'],
    knowledge_changed: true,
  }),
  row('time:3', {
    beat: 'role_state',
    member: 'west',
    role: 'investigate',
    recipe: 'example:behaviors:investigate',
    from: 'active',
    to: 'idle',
    reason: 'nothing found',
  }),
];

const through = (step: number) => foldRun(start, rows).steps[step]!.through;

describe('the fold reads sight (sighted.observer)', () => {
  it('gained adds to who the observer sees, lost takes away, per step', () => {
    expect(foldRun(start, rows, through(0)).members['gate-1']!.sees).toEqual([
      'west',
    ]);
    expect(foldRun(start, rows, through(1)).members['gate-1']!.sees).toEqual([
      'hero',
      'west',
    ]);
    expect(foldRun(start, rows).members['gate-1']!.sees).toEqual(['west']);
  });

  it('changed is not sight: the hand-off line moves no one into view', () => {
    const view = foldRun(start, rows, through(2));
    expect(view.members.west!.sees).toBeUndefined();
    expect(view.members['gate-1']!.sees).toEqual(['hero', 'west']);
    const [s] = sightingsOf([row('', HANDOFF_SIGHTED)]);
    expect(s).toEqual({
      index: 0,
      observer: 'west',
      gained: [],
      lost: [],
      changed: ['dummy'],
      knowledge: false,
    });
  });

  it('a sighted beat with no observer (before rpg-project#1001) is ignored', () => {
    const old = [row('', { beat: 'sighted', gained: ['west', 'hero'] })];
    expect(sightingsOf(old)).toEqual([]);
    const view = foldRun(start, old);
    for (const m of Object.values(view.members)) expect(m.sees).toBeUndefined();
  });

  it("a step's sight joins every beat of that observer in the step", () => {
    const s = stepSightOf(rows, through(3), through(2));
    expect(s).toEqual([
      {
        observer: 'gate-1',
        gained: [],
        lost: ['hero'],
        changed: [],
        knowledge: true,
      },
    ]);
  });
});

describe('what happened this step says who saw whom', () => {
  const names = new Map([
    ['gate-1', 'Guard'],
    ['hero', 'Toolkit Sandbox Bard'],
  ]);

  it('now sees, with the watch’s names', () => {
    expect(
      sightLinesOf(stepSightOf(rows, through(1), through(0)), names)
    ).toEqual(['Guard (gate-1) now sees Toolkit Sandbox Bard']);
  });

  it('no longer sees, when the record says lost', () => {
    expect(
      sightLinesOf(stepSightOf(rows, through(3), through(2)), names)
    ).toEqual(['Guard (gate-1) no longer sees Toolkit Sandbox Bard']);
  });

  it('a change it saw, or its view of doors, is no line of sight', () => {
    expect(
      sightLinesOf(stepSightOf(rows, through(2), through(1)), names)
    ).toEqual([]);
  });

  it('the full text says every part the beat carries', () => {
    const [s] = stepSightOf([row('', HANDOFF_SIGHTED)]);
    expect(sightTextOf(s!, new Map([['dummy', 'Dummy']]))).toBe(
      'saw Dummy change'
    );
    const [lost] = stepSightOf(rows, through(3), through(2));
    expect(sightTextOf(lost!, names)).toBe(
      'no longer sees Toolkit Sandbox Bard; its view of doors or objects changed'
    );
  });
});

describe('the fold reads role_state', () => {
  it('keeps a state per role beside the body’s, carried forward', () => {
    const west = (step: number) =>
      foldRun(start, rows, through(step)).members.west!;
    expect(west(0).roleStates).toBeUndefined();
    expect(west(0).state).toBe('ready');
    expect(west(1).state).toBe('ready');
    expect(west(1).roleStates).toEqual({
      investigate: {
        state: 'active',
        recipe: 'example:behaviors:investigate',
      },
    });
    // Carried through a step with no role_state.
    expect(west(2).roleStates?.investigate?.state).toBe('active');
    expect(west(3).roleStates?.investigate).toEqual({
      state: 'idle',
      recipe: 'example:behaviors:investigate',
      reason: 'nothing found',
    });
  });

  it('the label reads the body’s state, then each role’s', () => {
    expect(runStateLabel(foldRun(start, rows, through(1)).members.west!)).toBe(
      'ready · investigate: active'
    );
  });

  it('a creature with only role_state: no body state, the role still shown', () => {
    const only = [row('time:1', HANDOFF_ROLE_STATE)];
    const west = foldRun(start, only).members.west!;
    expect(west.state).toBeUndefined();
    expect(runStateLabel(west)).toBe('investigate: active');
  });

  it('with no state beat yet, a decision labels the body from its own role only', () => {
    const noBody = [
      row('time:1', HANDOFF_ROLE_STATE),
      row('time:1', {
        beat: 'behavior_decision',
        member: 'west',
        outcomes: [
          { id: 'patrol', before: 'ready', after: 'ready' },
          { id: 'investigate', before: 'idle', after: 'active' },
        ],
      }),
    ];
    expect(runStateLabel(foldRun(start, noBody).members.west!)).toBe(
      'ready · investigate: active'
    );
  });

  it('role_state.role is the instance id the decision traces name', () => {
    const view = foldRun(start, rows, through(1));
    expect(view.members.west!.roles.investigate).toBe('active');
    expect(instanceOfKey('behavior/11:investigate/look')).toBe(
      HANDOFF_ROLE_STATE.role
    );
  });
});

describe('the timeline: a band per other role, a mark for sight', () => {
  const timeline = timelineOf(start, rows);
  const rowOf = (id: string) => timeline.rows.find((r) => r.id === id)!;

  it('a creature with a second role carries it, in record order', () => {
    expect(rowOf('west').roles).toEqual(['investigate']);
    expect(rowOf('gate-1').roles).toEqual([]);
  });

  it('the role’s band changes with a solid edge where role_state moved it', () => {
    expect(
      roleSegments(rowOf('west').cells, 'investigate').map((s) => [
        s.state,
        s.from,
        s.edge,
      ])
    ).toEqual([
      [undefined, 0, false],
      ['active', 1, true],
      ['idle', 3, true],
    ]);
  });

  it('the body’s band is untouched by a role', () => {
    expect(rowOf('west').cells.map((c) => c.state)).toEqual([
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
  });

  it('a sight change marks the observer’s cell, only where it came or went', () => {
    const marked = rowOf('gate-1')
      .cells.filter((c) => c.sight)
      .map((c) => c.step);
    expect(marked).toEqual([0, 1, 3]);
  });

  it('only creatures that changed counts a role or a sight change', () => {
    const shown = shownTimelineRows(timeline, true).map((r) => r.id);
    expect(shown).toContain('west');
    expect(shown).toContain('gate-1');
    expect(shown).not.toContain('quiet');
    // A creature whose only news is a role's state, or its sight.
    const quiet = (extra: RecordRow[]) =>
      timelineOf(start, [heroMoves('move:1', 1), ...extra]).rows.find(
        (r) => r.id === 'quiet'
      )!.changed;
    expect(quiet([])).toBe(false);
    expect(
      quiet([row('time:1', { ...HANDOFF_ROLE_STATE, member: 'quiet' })])
    ).toBe(true);
    expect(
      quiet([
        row('time:1', { beat: 'sighted', observer: 'quiet', gained: ['hero'] }),
      ])
    ).toBe(true);
    expect(
      quiet([
        row('time:1', {
          beat: 'sighted',
          observer: 'quiet',
          changed: ['hero'],
        }),
      ])
    ).toBe(false);
  });
});

/** A record with each sighted beat made a beat nobody reads, so every row
 * keeps its index. */
const neutral = (source: readonly RecordRow[]) =>
  source.map((r) =>
    r.beat === 'sighted' ? { ...r, beat: 'unread', fields: {} } : r
  );

describe('a record with neither beat is as before', () => {
  const captured = parseRecordCapture(investigation).feed.rows;
  const SELF = 'char_be7b4d7d-b149-4ed0-bad9-ba4ab47fd796';
  const castle: RunStart = {
    creatures: [
      { id: 'court', cell: { q: 12, r: 0 } },
      { id: 'west', cell: { q: 2, r: 0 } },
      { id: 'dummy', cell: { q: 9, r: 1 } },
    ],
    partyStart: { q: 0, r: 2 },
    self: SELF,
  };
  const withoutSighted = neutral(captured);

  it('its observer-less sighted beats change no member and no row', () => {
    expect(captured.some((r) => r.beat === 'sighted')).toBe(true);
    expect(foldRun(castle, captured)).toEqual(foldRun(castle, withoutSighted));
    expect(timelineOf(castle, captured)).toEqual(
      timelineOf(castle, withoutSighted)
    );
  });

  it('no member grows a role band, a sight or a role label', () => {
    for (const m of Object.values(foldRun(castle, captured).members)) {
      expect(m.roleStates).toBeUndefined();
      expect(m.sees).toBeUndefined();
      expect(runStateLabel(m)).toBe(m.state ?? '');
    }
    for (const r of timelineOf(castle, captured).rows) {
      expect(r.roles).toEqual([]);
      for (const c of r.cells) {
        expect(c.sight).toBeUndefined();
        expect(c.roles).toBeUndefined();
      }
    }
  });
});

describe('saved runs carry the new beats', () => {
  const encoder = new TextEncoder();
  const asEvent = (r: RecordRow) =>
    create(RecordEventSchema, {
      id: r.id,
      at: r.at,
      act: r.act,
      beat: r.beat,
      fieldsJson: encoder.encode(JSON.stringify(r.fields)),
    });
  const header = {
    format: SAVED_RUN_FORMAT,
    savedAt: '2026-11-19T17:00:00Z',
    session: 'run-1',
    seat: 'hero',
    encounter: { key: 'scene', name: 'Scene' },
    snapshot: { creatures: [], readBack: null },
  } as unknown as Parameters<typeof savedRunFile>[0];
  const replayed = (source: readonly RecordRow[]) =>
    openSavedRun(
      'run.jsonl',
      savedRunFile(header, { events: source.map(asEvent), complete: true }).text
    ).capture.feed.rows;

  it('a new file replays its sight and roles through the same fold', () => {
    const back = replayed(rows);
    expect(foldRun(start, back).members['gate-1']!.sees).toEqual(
      foldRun(start, rows).members['gate-1']!.sees
    );
    expect(foldRun(start, back).members.west!.roleStates).toEqual(
      foldRun(start, rows).members.west!.roleStates
    );
  });

  it('a file saved before this slice replays exactly as before', () => {
    const old = replayed(
      parseRecordCapture(investigation).feed.rows.slice(0, 40)
    );
    const castle: RunStart = {
      creatures: [{ id: 'west', cell: { q: 2, r: 0 } }],
      partyStart: { q: 0, r: 2 },
    };
    expect(foldRun(castle, old)).toEqual(foldRun(castle, neutral(old)));
  });
});
