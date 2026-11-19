/**
 * A RUN NAMES ITS ENCOUNTER AND ITS STARTING CELLS, FROM ITS OWN RECORD
 * (rpg-project#1017). The beats are in the engine's wire shape
 * (rpg-toolkit origin/main, rulebooks/dnd5e/encounter/encounter.go:
 * `scene_content` {key, site_hash, content_hash, engine} in NewEncounter;
 * `joined_at` {member, cell} after it for each seated member, and right
 * after a later `joined`), as the hand-off on rpg-project#1001 quotes them.
 */
import type { RecordRow } from '@/components/session/recordFeed';
import { create } from '@bufbuild/protobuf';
import { GetMachineWordsResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { RecordEventSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/record_pb';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomDraft, type RoomDraft } from '../world-building/roomDraft';
import {
  compareRun,
  comparisonLine,
  runIdentityOf,
  type RunIdentity,
} from './runIdentity';
import { timelineOf } from './runTimeline';
import { foldRun, studioCellOf, type RunStart } from './runView';
import { useRunFold, type WatchedRun } from './runWatch';
import {
  identityOfEvents,
  openSavedRun,
  SAVED_RUN_FORMAT,
  savedRunText,
  snapshotOf,
} from './savedRun';
import { StudioWatch } from './StudioWatch';
import type { EngineVersionClient } from './useEngineVersion';
import { useSavedRunReplay, useWatchIdentity } from './useSavedRun';

afterEach(cleanup);

const ENGINE = 'v0.228.0';
const HASH = '85c5404b0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6781d';
const OTHER_HASH =
  '909d362e0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6fa43';

let next = 0;
const row = (
  beat: string,
  fields: Record<string, unknown>,
  act = ''
): RecordRow => ({
  id: `R${String(next++).padStart(6, '0')}`,
  at: 1n,
  act,
  beat,
  fields: { beat, ...fields },
});

/** The setup beats in the order NewEncounter writes them. */
const SCENE_CONTENT = {
  key: 'the-patrol',
  site_hash: '7b03acb6aa',
  content_hash: HASH,
  engine: ENGINE,
};
const setup = (): RecordRow[] => [
  row('scene-opened', {}),
  row('scene_content', SCENE_CONTENT),
  row('joined_at', { member: 'west', cell: { x: 2, y: 0 } }),
  row('joined_at', { member: 'hero', cell: { x: 0, y: 3 } }),
];

/** The draft's placements, deliberately elsewhere. */
const start: RunStart = {
  creatures: [
    { id: 'west', cell: { q: 9, r: 9 } },
    { id: 'east', cell: { q: 5, r: 5 } },
    { id: 'late', cell: { q: 7, r: 7 } },
  ],
  partyStart: { q: 8, r: 8 },
  self: 'hero',
};

describe('start cells from the record (joined_at)', () => {
  const rows = [
    ...setup(),
    row('joined', { member: 'hero', kind: 'player' }),
    row('moved', { member: 'hero', position: { x: 1, y: 3 } }, 'move:1'),
    // a late joiner: `joined`, then right after it `joined_at`
    row('joined', { member: 'late', kind: 'monster' }, 'move:1'),
    row('joined_at', { member: 'late', cell: { x: 4, y: 1 } }, 'move:1'),
  ];

  it('places each member at its joined_at cell, read as a moved position is read, not at the draft', () => {
    const view = foldRun(start, rows, 4);
    expect(view.members.west?.cell).toEqual(studioCellOf({ x: 2, y: 0 }));
    expect(view.members.hero?.cell).toEqual(studioCellOf({ x: 0, y: 3 }));
  });

  it('a member with no joined_at begins at the draft cell, as before', () => {
    expect(foldRun(start, rows, 4).members.east?.cell).toEqual({
      q: 5,
      r: 5,
    });
  });

  it('a late joiner is not drawn before it joins, and appears at its joined_at cell', () => {
    expect(foldRun(start, rows, 4).members.late).toBeUndefined();
    expect(foldRun(start, rows).members.late?.cell).toEqual(
      studioCellOf({ x: 4, y: 1 })
    );
  });

  it('a record with no joined_at (an older engine, a capture from mid-run) uses the draft and party start exactly as before', () => {
    const old = [
      row('joined', { member: 'hero', kind: 'player' }),
      row('moved', { member: 'west', position: { x: 3, y: 0 } }),
    ];
    const view = foldRun(start, old, 1);
    expect(view.members.west?.cell).toEqual({ q: 9, r: 9 });
    expect(view.members.hero?.cell).toEqual({ q: 8, r: 8 });
    expect(view.members.late?.cell).toEqual({ q: 7, r: 7 });
  });

  it('the timeline reads the same starts', () => {
    const timeline = timelineOf(start, rows);
    expect(timeline.rows.some((r) => r.id === 'west')).toBe(true);
  });
});

describe('the run identity (scene_content)', () => {
  it('is read from the record', () => {
    expect(runIdentityOf(setup())).toEqual({
      key: 'the-patrol',
      siteHash: '7b03acb6aa',
      contentHash: HASH,
      engine: ENGINE,
    });
    expect(runIdentityOf([row('joined', { member: 'a' })])).toBeNull();
  });

  it('shows in the watch’s Run details: key, engine, short hash', () => {
    const watch: WatchedRun = { session: 's', member: 'hero' };
    function Panel(): React.JSX.Element {
      const run = useRunFold(
        watch,
        { room: { monsterDeclarations: [] } },
        {
          rows: setup(),
          notice: undefined,
        }
      );
      return (
        <StudioWatch
          watch={watch}
          run={run}
          readBack={null}
          onStop={() => {}}
          identity={{
            run: runIdentityOf(setup()),
            line: 'a line',
            notable: false,
          }}
        />
      );
    }
    render(<Panel />);
    const details = screen.getByTestId('watch-run-identity');
    expect(details.textContent).toContain('the-patrol');
    expect(details.textContent).toContain(ENGINE);
    expect(details.textContent).toContain('85c5404b');
    expect(details.textContent).not.toContain(HASH);
    expect(screen.getAllByTestId('watch-identity-line')).toHaveLength(1);
  });
});

const ID: RunIdentity = {
  key: 'the-patrol',
  siteHash: 'x',
  contentHash: HASH,
  engine: ENGINE,
};
const SERVER = { engine: ENGINE, unreachable: false };

describe('has the encounter changed since this run (one rule each)', () => {
  it('unchanged: same key, same engine, same hash', () => {
    expect(
      compareRun(ID, { key: 'the-patrol', contentHash: HASH }, SERVER).kind
    ).toBe('unchanged');
  });
  it('changed: same key, same engine, another hash', () => {
    expect(
      compareRun(ID, { key: 'the-patrol', contentHash: OTHER_HASH }, SERVER)
        .kind
    ).toBe('changed');
  });
  it('another key: names the key, whatever the hash', () => {
    const c = compareRun(ID, { key: 'castle', contentHash: HASH }, SERVER);
    expect(comparisonLine(c)).toBe(
      'This run was saved from the-patrol, not the open encounter.'
    );
  });
  it('another engine: no claim of changed or unchanged', () => {
    const c = compareRun(
      { ...ID, engine: 'v0.227.0' },
      { key: 'the-patrol', contentHash: HASH },
      SERVER
    );
    expect(c.kind).toBe('other-engine');
    expect(comparisonLine(c)).toContain('another engine version');
    expect(comparisonLine(c)).not.toMatch(/unchanged|has changed/);
  });
  it('no identity', () => {
    expect(
      compareRun(null, { key: 'the-patrol', contentHash: HASH }, SERVER).kind
    ).toBe('no-identity');
  });
  it('offline: not compared', () => {
    expect(
      compareRun(
        ID,
        { key: 'the-patrol', contentHash: HASH },
        { engine: null, unreachable: true }
      ).kind
    ).toBe('not-compared');
  });
});

// ---- a saved run opened later, through the replay hook ----

const encoder = new TextEncoder();
const event = (n: number, beat: string, fields: Record<string, unknown>) =>
  create(RecordEventSchema, {
    id: String(n).padStart(4, '0'),
    at: BigInt(n),
    act: '',
    beat,
    fieldsJson: encoder.encode(JSON.stringify({ beat, ...fields })),
  });
const NEW_EVENTS = [
  event(1, 'scene-opened', {}),
  event(2, 'scene_content', SCENE_CONTENT),
  event(3, 'joined_at', { member: 'gate-1', cell: { x: 1, y: 1 } }),
  event(4, 'joined', { kind: 'player', member: 'hero' }),
];
const OLD_EVENTS = [event(1, 'joined', { kind: 'player', member: 'hero' })];

function draftWith(cell: { q: number; r: number }): RoomDraft {
  const draft = createRoomDraft(
    { version: 1, id: 'scene', name: 'Patrol', items: [], groups: [] },
    'room'
  );
  return {
    ...draft,
    room: {
      ...draft.room,
      monsterDeclarations: [
        {
          id: 'gate-1',
          ref: 'monster:guard',
          startingCell: { location: cell },
        },
      ],
    },
  };
}
const DRAFT = draftWith({ q: 4, r: 2 });

const fileOf = (events: typeof NEW_EVENTS): string =>
  savedRunText(
    {
      format: SAVED_RUN_FORMAT,
      savedAt: '2026-11-19T14:00:00.000Z',
      session: 'run-1',
      member: 'hero',
      dungeon: { key: 'the-patrol', name: 'Patrol' },
      snapshot: snapshotOf({ draft: DRAFT, names: new Map(), readBack: null }),
      ...(identityOfEvents(events) ? { run: identityOfEvents(events) } : {}),
    },
    { events, complete: true }
  );

const engineClient = (engine: string | Error): EngineVersionClient => ({
  getMachineWords: vi.fn(async () => {
    if (engine instanceof Error) throw engine;
    return create(GetMachineWordsResponseSchema, { encounterVersion: engine });
  }) as never,
});

async function notesOf(input: {
  events: typeof NEW_EVENTS;
  open: { key: string; contentHash: string | null };
  engine: string | Error;
  openUnreachable?: boolean;
  draft?: RoomDraft;
}): Promise<string[]> {
  const client = engineClient(input.engine);
  const { result } = renderHook(() =>
    useSavedRunReplay({
      draft: input.draft ?? DRAFT,
      dungeonKey: input.open.key,
      names: new Map(),
      readBack: null,
      open: input.open,
      openUnreachable: input.openUnreachable,
      engineClient: client,
    })
  );
  act(() => void result.current.openText('run.jsonl', fileOf(input.events)));
  if (identityOfEvents(input.events))
    await waitFor(() => expect(client.getMachineWords).toHaveBeenCalled());
  await act(async () => {});
  return result.current.panel!.notes;
}

describe('a saved run says one line about the open encounter', () => {
  it('saves its identity in the header, and reads it back', () => {
    const opened = openSavedRun('f', fileOf(NEW_EVENTS));
    expect(opened.header?.run).toEqual({
      key: 'the-patrol',
      siteHash: '7b03acb6aa',
      contentHash: HASH,
      engine: ENGINE,
    });
    const header = JSON.parse(fileOf(NEW_EVENTS).split('\n')[0]!);
    expect(header.scene_content).toEqual(SCENE_CONTENT);
    expect(header.format).toBe(1);
  });

  it('an old file (no scene_content) opens exactly as before, with no identity in its header', () => {
    const opened = openSavedRun('f', fileOf(OLD_EVENTS));
    expect(opened.header?.run).toBeUndefined();
    expect(opened.header?.snapshot.creatures.map((c) => c.id)).toEqual([
      'gate-1',
    ]);
  });

  it('unchanged', async () => {
    expect(
      await notesOf({
        events: NEW_EVENTS,
        open: { key: 'the-patrol', contentHash: HASH },
        engine: ENGINE,
      })
    ).toEqual([
      'The encounter is unchanged since this run: its content hash matches the open encounter’s.',
    ]);
  });

  it('changed', async () => {
    expect(
      await notesOf({
        events: NEW_EVENTS,
        open: { key: 'the-patrol', contentHash: OTHER_HASH },
        engine: ENGINE,
      })
    ).toEqual([
      'The encounter has changed since this run: its content hash differs from the open encounter’s.',
    ]);
  });

  it('another key', async () => {
    expect(
      await notesOf({
        events: NEW_EVENTS,
        open: { key: 'the-mad-king', contentHash: HASH },
        engine: ENGINE,
      })
    ).toEqual(['This run was saved from the-patrol, not the open encounter.']);
  });

  it('another engine', async () => {
    const notes = await notesOf({
      events: NEW_EVENTS,
      open: { key: 'the-patrol', contentHash: HASH },
      engine: 'v0.229.0',
    });
    expect(notes).toEqual([
      'This run was saved under another engine version (v0.228.0; the server runs v0.229.0), so whether the encounter changed since cannot be said.',
    ]);
  });

  it('no identity: says so, then the snapshot comparison', async () => {
    const notes = await notesOf({
      events: OLD_EVENTS,
      open: { key: 'the-patrol', contentHash: HASH },
      engine: ENGINE,
      draft: draftWith({ q: 0, r: 0 }),
    });
    expect(notes).toEqual([
      'This run carries no encounter identity (it was recorded before runs named their encounter). The encounter has changed since this run was saved (where its creatures start). The creatures, where they start and their machines are drawn as saved; the map is the open draft’s.',
    ]);
  });

  it('offline: could not be checked, then the snapshot comparison', async () => {
    const notes = await notesOf({
      events: NEW_EVENTS,
      open: { key: 'the-patrol', contentHash: null },
      engine: new Error('unreachable'),
      openUnreachable: true,
    });
    expect(notes).toEqual([
      'Whether the encounter changed since this run could not be checked: the server could not be reached. Its snapshot matches the open draft.',
    ]);
  });

  it('the saved run’s start cells come from its record', () => {
    const client = engineClient(ENGINE);
    const { result } = renderHook(() =>
      useSavedRunReplay({
        draft: DRAFT,
        names: new Map(),
        readBack: null,
        engineClient: client,
      })
    );
    act(() => void result.current.openText('run.jsonl', fileOf(NEW_EVENTS)));
    expect(result.current.run.view.members['gate-1']?.cell).toEqual(
      studioCellOf({ x: 1, y: 1 })
    );
  });
});

describe('a live watch when the author edits mid-run', () => {
  it('says changed once the check of the edit answers with another hash', async () => {
    const rows = setup();
    const client = engineClient(ENGINE);
    const { result, rerender } = renderHook(
      ({ hash }: { hash: string }) =>
        useWatchIdentity({
          rows,
          watching: true,
          open: { key: 'the-patrol', contentHash: hash },
          engineClient: client,
        }),
      { initialProps: { hash: HASH } }
    );
    await waitFor(() =>
      expect(result.current?.line).toBe(
        'The encounter is unchanged since this run: its content hash matches the open encounter’s.'
      )
    );
    rerender({ hash: OTHER_HASH });
    expect(result.current?.line).toBe(
      'The encounter has changed since this run: its content hash differs from the open encounter’s.'
    );
    expect(result.current?.notable).toBe(true);
  });
});
