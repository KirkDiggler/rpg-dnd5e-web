import type { MessageInitShape } from '@bufbuild/protobuf';
import { create } from '@bufbuild/protobuf';
import {
  GetKnowledgeResponseSchema,
  GetViewResponseSchema,
  type GetKnowledgeResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  PropPresentationSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type {
  CellsLearnedSchema,
  SecretRevealedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
  Sense,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionKnowledge } from './useSessionKnowledge';

const client = vi.hoisted(() => ({
  getKnowledge: vi.fn(),
  getView: vi.fn(),
  getWhere: vi.fn(),
  getRoster: vi.fn(),
  getAtlas: vi.fn(),
  getDoors: vi.fn(),
}));
vi.mock('./client', () => ({ sessionClient: client }));

function snapshot(seq = 10n) {
  return create(GetKnowledgeResponseSchema, {
    seq,
    atlas: {
      cells: [{ x: 0, y: 0 }],
      regions: [{ id: 'entry', cells: [{ x: 0, y: 0 }] }],
    },
    view: {},
    where: { position: { x: 0, y: 0 } },
    roster: { members: [{ id: 'a' }] },
    holding: ['vase'],
  });
}

const wallRecord = (id: string, openingIds: string[]) =>
  create(AtlasStructuralWallSchema, {
    id,
    ref: `ref:${id}`,
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 3,
    thickness: 0.3,
    elevation: 0,
    openings: openingIds.map((openingId, index) => ({
      id: openingId,
      position: index + 1,
      width: 0.5,
    })),
  });
const doorRecord = (id: string) =>
  create(AtlasStructuralDoorSchema, {
    id,
    ref: `ref:${id}`,
    from: { x: 0, y: 0 },
    to: { x: 2, y: 0 },
    height: 3,
    thickness: 0.3,
    elevation: 0,
  });

function structuralSnapshot(
  seq: bigint,
  walls: ReturnType<typeof wallRecord>[],
  doors: ReturnType<typeof doorRecord>[] = []
) {
  return create(GetKnowledgeResponseSchema, {
    seq,
    atlas: {
      cells: [{ x: 0, y: 0 }],
      regions: [{ id: 'entry', cells: [{ x: 0, y: 0 }] }],
      structuralWalls: walls,
      structuralDoors: doors,
    },
    view: {},
    where: { position: { x: 0, y: 0 } },
    roster: { members: [{ id: 'a' }] },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const observer = { kind: PartyKind.MEMBER, id: 'a' };
let nextActId = 100;

/**
 * The act fixtures take their rows loosely: the walls, doors and
 * presentations here are the snapshot's v1alpha1 records, and an act's
 * geometry names the same rows field for field (`actGeometry.ts`).
 */
type Rows = Record<string, unknown>;

/** A perception act: cells this member newly learned. */
function cellsAct(cells: Rows) {
  return create(ActSchema, {
    session: 'run',
    id: `id-${++nextActId}`,
    family: Family.PERCEPTION,
    body: {
      case: 'perception',
      value: {
        observer,
        sense: Sense.CELLS,
        cells: cells as MessageInitShape<typeof CellsLearnedSchema>,
      },
    },
  });
}

/** A perception act: a secret this member found. */
function revealAct(revealed: Rows) {
  return create(ActSchema, {
    session: 'run',
    id: `id-${++nextActId}`,
    family: Family.PERCEPTION,
    body: {
      case: 'perception',
      value: {
        observer,
        sense: Sense.REVEAL,
        revealed: revealed as MessageInitShape<typeof SecretRevealedSchema>,
      },
    },
  });
}

/** A revealed secret that replaces one wall's openings, with its doors. */
function openingPatch(
  ids: string[],
  wallId = 'w',
  doors: ReturnType<typeof doorRecord>[] = []
) {
  return revealAct({
    concealment: 'secret',
    structuralDoors: doors,
    structuralWallOpeningsReplacements: [
      { wallId, openings: wallRecord(wallId, ids).openings },
    ],
  });
}

beforeEach(() => {
  for (const fn of Object.values(client)) fn.mockReset();
  client.getKnowledge.mockResolvedValue(snapshot());
  client.getView.mockResolvedValue(create(GetViewResponseSchema));
});

describe('supplied prop presentation', () => {
  const presentation = (id: string) =>
    create(PropPresentationSchema, {
      id,
      ref: 'dnd5e:props:books',
      origin: { x: 1, y: 2 },
      heightScale: 1,
    });
  it('recovers a presentations-only reveal without an atlas baseline', async () => {
    const absent = snapshot();
    absent.atlas = undefined;
    const restored = snapshot(11n);
    restored.atlas!.propPresentations = [presentation('p')];
    client.getKnowledge
      .mockResolvedValueOnce(absent)
      .mockResolvedValueOnce(restored);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() =>
      result.current.acceptAct(
        cellsAct({
          regions: [{ id: 'r' }],
          propPresentations: [presentation('p')],
        })
      )
    );
    await waitFor(() =>
      expect(result.current.atlas?.propPresentations[0]?.id).toBe('p')
    );
    expect(client.getKnowledge).toHaveBeenCalledTimes(2);
  });
  it('refuses malformed snapshot and view presentations without installing partial data', async () => {
    const initial = snapshot();
    initial.atlas!.propPresentations = [presentation('fixed')];
    client.getKnowledge.mockResolvedValue(initial);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    client.getView.mockResolvedValue(
      create(GetViewResponseSchema, {
        props: [
          {
            observedEmpty: true,
            presentation: presentation('bad'),
            shape: { case: 'prop', value: { id: 'bad' } },
          },
        ],
      })
    );
    await act(async () => {
      await result.current.refetchView();
    });
    expect(result.current.error?.message).toMatch(/conflicting/);
    expect(result.current.atlas?.propPresentations.map((p) => p.id)).toEqual([
      'fixed',
    ]);
    const malformed = snapshot(12n);
    malformed.atlas!.propPresentations = [presentation('bad')];
    malformed.atlas!.propPresentations[0]!.heightScale = 0;
    client.getKnowledge.mockResolvedValue(malformed);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error?.message).toMatch(/height scale/);
    expect(result.current.atlas?.propPresentations.map((p) => p.id)).toEqual([
      'fixed',
    ]);
  });
  it('merges captured render input only into the render projection and clears observed-empty', async () => {
    const initial = snapshot();
    initial.atlas!.propPresentations = [presentation('fixed')];
    initial.view = create(GetViewResponseSchema, {
      props: [
        {
          presentation: presentation('seen'),
          shape: { case: 'prop', value: { id: 'seen', at: { x: 0, y: 0 } } },
          currentVia: [],
        },
      ],
    });
    client.getKnowledge.mockResolvedValue(initial);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.atlas?.propPresentations.map((p) => p.id)).toEqual([
      'fixed',
      'seen',
    ]);
    expect(
      result.current.snapshot?.atlas?.propPresentations.map((p) => p.id)
    ).toEqual(['fixed']);
    client.getView.mockResolvedValue(
      create(GetViewResponseSchema, {
        props: [
          {
            observedEmpty: true,
            shape: { case: 'prop', value: { id: 'seen' } },
          },
        ],
      })
    );
    await act(async () => {
      await result.current.refetchView();
    });
    expect(result.current.atlas?.propPresentations.map((p) => p.id)).toEqual([
      'fixed',
    ]);
  });
});

describe('supplied structural layout', () => {
  it('carries the snapshot’s permitted walls and independent doors', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(7n, [wallRecord('w', ['cut-1'])], [doorRecord('d')])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.atlas?.structuralWalls.map((w) => w.id)).toEqual([
      'w',
    ]);
    expect(
      result.current.atlas?.structuralWalls[0]!.openings.map((o) => o.id)
    ).toEqual(['cut-1']);
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'd',
    ]);
  });

  it('upserts a CHANGED wall on cells learned — the known cut is updated, not appended', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', ['cut-1'])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptAct(
        cellsAct({
          regions: [{ id: 'crypt', cells: [{ x: 1, y: 0 }] }],
          structuralWalls: [wallRecord('w', ['cut-1', 'cut-2'])],
        })
      );
    });
    expect(result.current.atlas?.structuralWalls).toHaveLength(1);
    expect(
      result.current.atlas?.structuralWalls[0]!.openings.map((o) => o.id)
    ).toEqual(['cut-1', 'cut-2']);
  });

  it('upserts an independent door on concealment reveal without a parent wall', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('parent', ['cut-1'])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptAct(
        revealAct({
          concealment: 'hidden',
          cells: [{ x: 1, y: 0 }],
          structuralDoors: [doorRecord('hidden-door')],
        })
      );
    });
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'hidden-door',
    ]);
  });

  it('duplicate application is idempotent', async () => {
    client.getKnowledge.mockResolvedValue(structuralSnapshot(10n, []));
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const learned = cellsAct({
      regions: [{ id: 'crypt', cells: [{ x: 1, y: 0 }] }],
      structuralWalls: [wallRecord('w', ['cut-1'])],
    });
    act(() => {
      result.current.acceptAct(learned);
      result.current.acceptAct(learned);
    });
    expect(result.current.atlas?.structuralWalls).toHaveLength(1);
  });

  it('act-applied state equals a fresh reload of the same world', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', ['cut-1'])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptAct(
        cellsAct({
          regions: [{ id: 'crypt', cells: [{ x: 1, y: 0 }] }],
          structuralWalls: [wallRecord('w', ['cut-1', 'cut-2'])],
          structuralDoors: [doorRecord('d')],
        })
      );
    });
    const applied = result.current.atlas;
    // The server's fresh answer for the same world carries the same records.
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(
        11n,
        [wallRecord('w', ['cut-1', 'cut-2'])],
        [doorRecord('d')]
      )
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.atlas?.structuralWalls).toEqual(
      applied?.structuralWalls
    );
    expect(result.current.atlas?.structuralDoors).toEqual(
      applied?.structuralDoors
    );
  });
});

describe('component patch ordering and recovery', () => {
  it('buffers component patches during initial hydration and replays them', async () => {
    const hydration = deferred<GetKnowledgeResponse>();
    client.getKnowledge.mockReturnValueOnce(hydration.promise);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledOnce());
    act(() =>
      result.current.acceptAct(openingPatch(['one'], 'w', [doorRecord('d')]))
    );
    await act(async () =>
      hydration.resolve(structuralSnapshot(10n, [wallRecord('w', [])]))
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      result.current.atlas?.structuralWalls[0].openings.map((o) => o.id)
    ).toEqual(['one']);
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'd',
    ]);
  });

  it('coalesces missing-baseline recovery and atomically preserves subsequent acts', async () => {
    const recovery = deferred<GetKnowledgeResponse>();
    client.getKnowledge
      .mockResolvedValueOnce(structuralSnapshot(10n, []))
      .mockReturnValueOnce(recovery.promise);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() =>
      result.current.acceptAct(openingPatch(['one'], 'w', [doorRecord('d1')]))
    );
    expect(result.current.atlas?.structuralWalls).toEqual([]);
    expect(result.current.atlas?.structuralDoors).toEqual([]);
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledTimes(2));
    act(() => {
      result.current.acceptAct(
        openingPatch(['one', 'two'], 'w', [doorRecord('d2')])
      );
      void result.current.refetch();
      void result.current.refetch();
    });
    expect(client.getKnowledge).toHaveBeenCalledTimes(2);
    await act(async () =>
      recovery.resolve(
        structuralSnapshot(11n, [wallRecord('w', ['one'])], [doorRecord('d1')])
      )
    );
    await waitFor(() =>
      expect(
        result.current.atlas?.structuralWalls[0]?.openings.map((o) => o.id)
      ).toEqual(['one', 'two'])
    );
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'd1',
      'd2',
    ]);
    expect(result.current.error).toBeNull();
  });

  it('keeps failed recovery visible without automatic retry loops, then permits explicit retry', async () => {
    client.getKnowledge
      .mockResolvedValueOnce(structuralSnapshot(10n, []))
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() =>
      result.current.acceptAct(openingPatch(['one'], 'w', [doorRecord('d')]))
    );
    await waitFor(() =>
      expect(result.current.error?.message).toContain('offline')
    );
    act(() => result.current.acceptAct(openingPatch(['one', 'two'])));
    await act(async () => {
      await result.current.refetchView();
    });
    expect(result.current.error?.message).toContain('offline');
    expect(result.current.atlas?.structuralDoors).toEqual([]);
    expect(client.getKnowledge).toHaveBeenCalledTimes(2);
    client.getKnowledge.mockResolvedValueOnce(
      structuralSnapshot(
        12n,
        [wallRecord('w', ['one', 'two'])],
        [doorRecord('d')]
      )
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'd',
    ]);
  });

  it('rejects malformed geometry atomically and does not erase its error on a mutable refresh', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', [])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const bad = openingPatch(['bad'], 'w', [doorRecord('d')]);
    if (bad.body.case !== 'perception') throw new Error('fixture');
    bad.body.value.revealed!.structuralWallOpeningsReplacements[0]!.openings[0]!.width =
      -1;
    act(() => result.current.acceptAct(bad));
    expect(result.current.error).not.toBeNull();
    expect(result.current.atlas?.structuralDoors).toEqual([]);
    await act(async () => {
      await result.current.refetchView();
    });
    expect(result.current.error).not.toBeNull();
    expect(client.getKnowledge).toHaveBeenCalledTimes(1);
  });

  it('reports a recovery snapshot that still lacks the baseline without looping', async () => {
    client.getKnowledge.mockResolvedValue(structuralSnapshot(10n, []));
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.acceptAct(openingPatch(['one'])));
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.error?.message).toContain('missing baseline wall')
    );
    expect(result.current.atlas?.structuralWalls).toEqual([]);
  });

  it('fences a late snapshot from the previous member without blocking the new scope', async () => {
    const old = deferred<GetKnowledgeResponse>();
    client.getKnowledge
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(
        structuralSnapshot(50n, [wallRecord('b-wall', [])])
      );
    const { result, rerender } = renderHook(
      ({ member }) => useSessionKnowledge('run', member),
      { initialProps: { member: 'a' } }
    );
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledTimes(1));
    rerender({ member: 'b' });
    await waitFor(() => expect(result.current.snapshot?.seq).toBe(50n));
    await act(async () =>
      old.resolve(structuralSnapshot(100n, [wallRecord('a-wall', [])]))
    );
    expect(result.current.snapshot?.seq).toBe(50n);
    expect(result.current.atlas?.structuralWalls.map((w) => w.id)).toEqual([
      'b-wall',
    ]);
    expect(client.getKnowledge).toHaveBeenCalledTimes(2);
  });
});

describe('session knowledge delivery', () => {
  it('hydrates geometry, identity, position and own carriage from one request', async () => {
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getKnowledge).toHaveBeenCalledWith({
      session: 'run',
      member: 'a',
    });
    expect(result.current.roster.has('a')).toBe(true);
    expect(result.current.holding).toEqual(['vase']);
    expect(result.current.snapshot?.seq).toBe(10n);
    expect(client.getView).not.toHaveBeenCalled();
    expect(client.getAtlas).not.toHaveBeenCalled();
    expect(client.getDoors).not.toHaveBeenCalled();
    expect(client.getRoster).not.toHaveBeenCalled();
  });

  it('buffers cells learned during hydration and holds view reads behind it', async () => {
    let finish!: (value: GetKnowledgeResponse) => void;
    client.getKnowledge.mockReturnValue(
      new Promise<GetKnowledgeResponse>((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledOnce());
    act(() => {
      result.current.acceptAct(
        cellsAct({
          regions: [{ id: 'room', cells: [{ x: 1, y: 0 }] }],
          scenery: [{ x: 1, y: 1 }],
        })
      );
    });
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refetchView();
    });
    expect(client.getView).not.toHaveBeenCalled();
    await act(async () => {
      finish(snapshot());
      await refresh;
    });
    expect(result.current.atlas?.regions.map((r) => r.id)).toEqual([
      'entry',
      'room',
    ]);
    expect(result.current.atlas?.cells).toHaveLength(3);
    expect(result.current.atlas?.regions[1].cells).toHaveLength(1);
    expect(result.current.holding).toEqual(['vase']);
    expect(client.getKnowledge).toHaveBeenCalledOnce();
    expect(client.getView).toHaveBeenCalledOnce();
  });

  it('renders remembered props without live interaction or collision authority', async () => {
    const response = snapshot();
    response.view = create(GetViewResponseSchema, {
      props: [
        {
          shape: {
            case: 'prop',
            value: {
              id: 'remembered',
              at: { x: 2, y: 0 },
              holdable: true,
              blocksMovement: true,
            },
          },
          status: 'held',
        },
        {
          shape: { case: 'prop', value: { id: 'empty', at: { x: 3, y: 0 } } },
          observedEmpty: true,
        },
      ],
    });
    client.getKnowledge.mockResolvedValue(response);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.atlas?.props).toHaveLength(1);
    expect(result.current.atlas?.props[0]).toMatchObject({
      id: 'remembered',
      holdable: false,
      blocksMovement: false,
    });
    expect(response.view.props[0].shape.value?.holdable).toBe(true);
    expect(response.atlas?.props).toHaveLength(0);
  });
});

describe('fog of war cell delivery (rpg-project#586)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cells learned patch the atlas by region id', async () => {
    client.getKnowledge.mockResolvedValue(snapshot(10n));
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptAct(
        cellsAct({
          regions: [
            { id: 'entry', cells: [{ x: 1, y: 0 }] },
            { id: 'cell', cells: [{ x: 2, y: 0 }] },
          ],
        })
      );
    });
    const atlas = result.current.atlas!;
    expect(atlas.cells.map((c) => `${c.x},${c.y}`).sort()).toEqual([
      '0,0',
      '1,0',
      '2,0',
    ]);
    // The partial entry region UNIONED, not replaced.
    expect(
      atlas.regions
        .find((r) => r.id === 'entry')!
        .cells.map((c) => `${c.x},${c.y}`)
    ).toEqual(['0,0', '1,0']);
    expect(atlas.regions.map((r) => r.id)).toEqual(['entry', 'cell']);
  });

  it('carries GetView’s visible_cells into the cached view on refresh', async () => {
    client.getKnowledge.mockResolvedValue(snapshot(10n));
    client.getView.mockResolvedValue(
      create(GetViewResponseSchema, { visibleCells: [{ x: 0, y: 0 }] })
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.view.visibleCells).toEqual([]);
    await act(async () => {
      await result.current.refetchView();
    });
    expect(
      result.current.view.visibleCells.map((c) => `${c.x},${c.y}`)
    ).toEqual(['0,0']);
  });
});

describe('seen-now across a reveal patch (fog of war walk, rpg-project#586)', () => {
  beforeEach(() => vi.clearAllMocks());
  const keysOf = (cells: readonly { x: number; y: number }[]) =>
    cells.map((c) => `${c.x},${c.y}`).sort();
  const seeingBoth = () =>
    create(GetKnowledgeResponseSchema, {
      seq: 10n,
      atlas: {
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        regions: [
          {
            id: 'hall',
            cells: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
          },
        ],
      },
      view: {
        visibleCells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    });
  const reveal = () =>
    cellsAct({ regions: [{ id: 'cell', cells: [{ x: 2, y: 0 }] }] });

  it('a reveal patch arriving before the next view never turns a seen cell remembered', async () => {
    client.getKnowledge.mockResolvedValue(seeingBoth());
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A view read already in flight (the door's refresh) answers from BEFORE
    // the patch: it no longer lists (1,0).
    const stale =
      deferred<ReturnType<typeof create<typeof GetViewResponseSchema>>>();
    client.getView.mockReturnValueOnce(stale.promise);
    let inFlight!: Promise<void>;
    act(() => {
      inFlight = result.current.refetchView();
    });
    await waitFor(() => expect(client.getView).toHaveBeenCalledTimes(1));
    act(() => result.current.acceptAct(reveal()));
    // The patch alone keeps every seen cell seen.
    expect(keysOf(result.current.view.visibleCells)).toEqual(['0,0', '1,0']);
    await act(async () => {
      stale.resolve(
        create(GetViewResponseSchema, { visibleCells: [{ x: 0, y: 0 }] })
      );
      await inFlight;
    });
    // The in-flight read was requested before the patch: (1,0) stays seen.
    expect(keysOf(result.current.view.visibleCells)).toEqual(['0,0', '1,0']);

    // A read requested AFTER the patch is the server's current answer.
    client.getView.mockResolvedValueOnce(
      create(GetViewResponseSchema, {
        visibleCells: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
      })
    );
    await act(async () => {
      await result.current.refetchView();
    });
    expect(keysOf(result.current.view.visibleCells)).toEqual(['0,0', '2,0']);
  });
});

describe('the act stream intake (rpg-project#630)', () => {
  const me = { kind: PartyKind.MEMBER, id: 'a' };

  it('perception cells merge into atlas', async () => {
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const learned = create(ActSchema, {
      session: 'run',
      id: 'id-2',
      family: Family.PERCEPTION,
      body: {
        case: 'perception',
        value: {
          observer: me,
          sense: Sense.CELLS,
          cells: {
            regions: [
              { id: 'entry', cells: [{ x: 1, y: 0 }] },
              { id: 'cell', cells: [{ x: 2, y: 0 }] },
            ],
            doorways: [
              { door: 'gate', from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
            ],
          },
        },
      },
    });
    act(() => result.current.acceptAct(learned));
    const atlas = result.current.atlas!;
    expect(atlas.cells.map((c) => `${c.x},${c.y}`).sort()).toEqual([
      '0,0',
      '1,0',
      '2,0',
    ]);
    expect(
      atlas.regions
        .find((r) => r.id === 'entry')!
        .cells.map((c) => `${c.x},${c.y}`)
    ).toEqual(['0,0', '1,0']);
    // The doorway's door id crossed under v1's name for it.
    expect(atlas.doorways.map((d) => d.connection)).toEqual(['gate']);

    // An act carries no seq, so a replay of the same act is a no-op union.
    act(() => result.current.acceptAct(learned));
    expect(result.current.atlas!.cells).toHaveLength(3);
    expect(result.current.atlas!.doorways).toHaveLength(1);
  });

  it('a revealed secret upserts its structural door', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', [])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() =>
      result.current.acceptAct(
        create(ActSchema, {
          session: 'run',
          id: 'id-3',
          family: Family.PERCEPTION,
          body: {
            case: 'perception',
            value: {
              observer: me,
              sense: Sense.REVEAL,
              revealed: {
                concealment: 'secret',
                doors: [
                  {
                    door: 'postern',
                    state: 'closed',
                    doorways: [
                      {
                        door: 'postern',
                        from: { x: 0, y: 0 },
                        to: { x: 1, y: 0 },
                      },
                    ],
                  },
                ],
                structuralDoors: [
                  {
                    id: 'postern',
                    ref: 'ref:postern',
                    from: { x: 0, y: 0 },
                    to: { x: 2, y: 0 },
                    height: 3,
                    thickness: 0.3,
                  },
                ],
              },
            },
          },
        })
      )
    );
    expect(
      result.current.snapshot?.atlas?.structuralDoors.map((d) => d.id)
    ).toEqual(['postern']);
  });

  it('a hold, a drop and a departure move the viewer’s holdings', async () => {
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.holding).toEqual(['vase']);
    act(() =>
      result.current.acceptAct(
        create(ActSchema, {
          session: 'run',
          id: 'id-4',
          family: Family.ACT,
          body: {
            case: 'hold',
            value: { by: me, prop: { kind: PartyKind.PROP, id: 'crown' } },
          },
        })
      )
    );
    expect(result.current.holding).toEqual(['vase', 'crown']);
    act(() =>
      result.current.acceptAct(
        create(ActSchema, {
          session: 'run',
          id: 'id-5',
          family: Family.ACT,
          body: {
            case: 'drop',
            value: { by: me, prop: { kind: PartyKind.PROP, id: 'vase' } },
          },
        })
      )
    );
    expect(result.current.holding).toEqual(['crown']);
    act(() =>
      result.current.acceptAct(
        create(ActSchema, {
          session: 'run',
          id: 'id-6',
          family: Family.CLOCK,
          body: {
            case: 'clock',
            value: {
              mark: ClockMark.EXITED,
              departure: { member: me, exit: 'postern', holding: ['crown'] },
            },
          },
        })
      )
    );
    expect(result.current.holding).toEqual([]);
  });

  it('buffers acts during hydration and replays them onto the snapshot', async () => {
    const pendingSnapshot = deferred<GetKnowledgeResponse>();
    client.getKnowledge.mockReturnValue(pendingSnapshot.promise);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    act(() =>
      result.current.acceptAct(
        create(ActSchema, {
          session: 'run',
          id: 'id-7',
          family: Family.PERCEPTION,
          body: {
            case: 'perception',
            value: {
              observer: me,
              sense: Sense.CELLS,
              cells: { regions: [{ id: 'cell', cells: [{ x: 5, y: 0 }] }] },
            },
          },
        })
      )
    );
    await act(async () => pendingSnapshot.resolve(snapshot()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.atlas!.regions.map((r) => r.id)).toEqual([
      'entry',
      'cell',
    ]);
  });

  it('ignores another session’s act', async () => {
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current.snapshot;
    act(() =>
      result.current.acceptAct(
        create(ActSchema, {
          session: 'other',
          id: 'id-8',
          family: Family.ACT,
          body: {
            case: 'hold',
            value: { by: me, prop: { kind: PartyKind.PROP, id: 'crown' } },
          },
        })
      )
    );
    expect(result.current.snapshot).toBe(before);
  });
});
