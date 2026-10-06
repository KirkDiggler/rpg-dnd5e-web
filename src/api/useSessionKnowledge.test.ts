import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetKnowledgeResponseSchema,
  GetViewResponseSchema,
  type GetKnowledgeResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
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

function openingPatch(
  seq: bigint,
  ids: string[],
  wallId = 'w',
  doors: ReturnType<typeof doorRecord>[] = []
) {
  return create(EventSchema, {
    session: 'run',
    recipient: 'a',
    seq,
    kind: EventKind.CONCEALMENT_REVEALED,
    body: {
      case: 'concealmentRevealed',
      value: {
        concealment: 'secret',
        structuralDoors: doors,
        structuralWallOpeningsReplacements: [
          { wallId, openings: wallRecord(wallId, ids).openings },
        ],
      },
    },
  });
}

beforeEach(() => {
  for (const fn of Object.values(client)) fn.mockReset();
  client.getKnowledge.mockResolvedValue(snapshot());
  client.getView.mockResolvedValue(create(GetViewResponseSchema));
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

  it('upserts a CHANGED wall on room reveal — the known cut is updated, not appended', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', ['cut-1'])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptEvent(
        create(EventSchema, {
          seq: 11n,
          kind: EventKind.ROOM_REVEALED,
          body: {
            case: 'roomRevealed',
            value: {
              region: { id: 'crypt', cells: [{ x: 1, y: 0 }] },
              structuralWalls: [wallRecord('w', ['cut-1', 'cut-2'])],
            },
          },
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
      result.current.acceptEvent(
        create(EventSchema, {
          seq: 11n,
          kind: EventKind.CONCEALMENT_REVEALED,
          body: {
            case: 'concealmentRevealed',
            value: {
              concealment: 'hidden',
              cells: [{ x: 1, y: 0 }],
              structuralDoors: [doorRecord('hidden-door')],
            },
          },
        })
      );
    });
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'hidden-door',
    ]);
  });

  it('fences a REPLAYED event below the snapshot cutoff, so a known cut cannot be reverted', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', ['cut-1', 'cut-2'])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      // An old event (below the snapshot seq) that names only the earlier cut.
      result.current.acceptEvent(
        create(EventSchema, {
          seq: 9n,
          kind: EventKind.ROOM_REVEALED,
          body: {
            case: 'roomRevealed',
            value: {
              region: { id: 'crypt', cells: [{ x: 1, y: 0 }] },
              structuralWalls: [wallRecord('w', ['cut-1'])],
            },
          },
        })
      );
    });
    expect(
      result.current.atlas?.structuralWalls[0]!.openings.map((o) => o.id)
    ).toEqual(['cut-1', 'cut-2']);
  });

  it('duplicate application is idempotent', async () => {
    client.getKnowledge.mockResolvedValue(structuralSnapshot(10n, []));
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const event = create(EventSchema, {
      seq: 11n,
      kind: EventKind.ROOM_REVEALED,
      body: {
        case: 'roomRevealed',
        value: {
          region: { id: 'crypt', cells: [{ x: 1, y: 0 }] },
          structuralWalls: [wallRecord('w', ['cut-1'])],
        },
      },
    });
    act(() => {
      result.current.acceptEvent(event);
      result.current.acceptEvent(event);
    });
    expect(result.current.atlas?.structuralWalls).toHaveLength(1);
  });

  it('event-applied state equals a fresh reload of the same world', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', ['cut-1'])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptEvent(
        create(EventSchema, {
          seq: 11n,
          kind: EventKind.ROOM_REVEALED,
          body: {
            case: 'roomRevealed',
            value: {
              region: { id: 'crypt', cells: [{ x: 1, y: 0 }] },
              structuralWalls: [wallRecord('w', ['cut-1', 'cut-2'])],
              structuralDoors: [doorRecord('d')],
            },
          },
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
  it('advances the applied sequence and ignores duplicate/older replacements', async () => {
    client.getKnowledge.mockResolvedValue(
      structuralSnapshot(10n, [wallRecord('w', [])])
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.acceptEvent(openingPatch(11n, ['one']));
      result.current.acceptEvent(openingPatch(12n, ['one', 'two']));
      result.current.acceptEvent(openingPatch(11n, ['one']));
      result.current.acceptEvent(openingPatch(12n, ['one', 'two']));
    });
    expect(
      result.current.atlas?.structuralWalls[0].openings.map((o) => o.id)
    ).toEqual(['one', 'two']);
    expect(result.current.snapshot?.seq).toBe(12n);
    expect(client.getKnowledge).toHaveBeenCalledTimes(1);
  });

  it('buffers component patches during initial hydration above the snapshot cutoff', async () => {
    const hydration = deferred<GetKnowledgeResponse>();
    client.getKnowledge.mockReturnValueOnce(hydration.promise);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledOnce());
    act(() =>
      result.current.acceptEvent(
        openingPatch(11n, ['one'], 'w', [doorRecord('d')])
      )
    );
    await act(async () =>
      hydration.resolve(structuralSnapshot(10n, [wallRecord('w', [])]))
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot?.seq).toBe(11n);
    expect(
      result.current.atlas?.structuralWalls[0].openings.map((o) => o.id)
    ).toEqual(['one']);
    expect(result.current.atlas?.structuralDoors.map((d) => d.id)).toEqual([
      'd',
    ]);
  });

  it('coalesces missing-baseline recovery and atomically preserves subsequent events', async () => {
    const recovery = deferred<GetKnowledgeResponse>();
    client.getKnowledge
      .mockResolvedValueOnce(structuralSnapshot(10n, []))
      .mockReturnValueOnce(recovery.promise);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() =>
      result.current.acceptEvent(
        openingPatch(11n, ['one'], 'w', [doorRecord('d1')])
      )
    );
    expect(result.current.atlas?.structuralWalls).toEqual([]);
    expect(result.current.atlas?.structuralDoors).toEqual([]);
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledTimes(2));
    act(() => {
      result.current.acceptEvent(
        openingPatch(12n, ['one', 'two'], 'w', [doorRecord('d2')])
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
    await waitFor(() => expect(result.current.snapshot?.seq).toBe(12n));
    expect(
      result.current.atlas?.structuralWalls[0].openings.map((o) => o.id)
    ).toEqual(['one', 'two']);
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
      result.current.acceptEvent(
        openingPatch(11n, ['one'], 'w', [doorRecord('d')])
      )
    );
    await waitFor(() =>
      expect(result.current.error?.message).toContain('offline')
    );
    act(() => result.current.acceptEvent(openingPatch(12n, ['one', 'two'])));
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
    expect(result.current.snapshot?.seq).toBe(12n);
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
    const bad = openingPatch(11n, ['bad'], 'w', [doorRecord('d')]);
    if (bad.body.case !== 'concealmentRevealed') throw new Error('fixture');
    bad.body.value.structuralWallOpeningsReplacements[0].openings[0].width = -1;
    act(() => result.current.acceptEvent(bad));
    expect(result.current.error).not.toBeNull();
    expect(result.current.atlas?.structuralDoors).toEqual([]);
    expect(result.current.snapshot?.seq).toBe(10n);
    await act(async () => {
      await result.current.refetchView();
    });
    expect(result.current.error).not.toBeNull();
    expect(client.getKnowledge).toHaveBeenCalledTimes(1);
  });

  it('recovers a delivery gap through Knowledge rather than applying an incomplete event history', async () => {
    const recovery = deferred<GetKnowledgeResponse>();
    client.getKnowledge
      .mockResolvedValueOnce(structuralSnapshot(10n, [wallRecord('w', [])]))
      .mockReturnValueOnce(recovery.promise);
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.acceptEvent(openingPatch(12n, ['one', 'two'])));
    expect(result.current.snapshot?.seq).toBe(10n);
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledTimes(2));
    await act(async () =>
      recovery.resolve(
        structuralSnapshot(12n, [wallRecord('w', ['one', 'two'])])
      )
    );
    await waitFor(() => expect(result.current.snapshot?.seq).toBe(12n));
    expect(result.current.error).toBeNull();
  });

  it('reports a recovery snapshot that still lacks the baseline without looping', async () => {
    client.getKnowledge.mockResolvedValue(structuralSnapshot(10n, []));
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.acceptEvent(openingPatch(11n, ['one'])));
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.error?.message).toContain('missing baseline wall')
    );
    expect(result.current.atlas?.structuralWalls).toEqual([]);
    expect(result.current.snapshot?.seq).toBe(10n);
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
    act(() =>
      result.current.acceptEvent(openingPatch(101n, ['old'], 'a-wall'))
    );
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

  it('buffers room additions during hydration and preserves the snapshot cutoff', async () => {
    let finish!: (value: GetKnowledgeResponse) => void;
    client.getKnowledge.mockReturnValue(
      new Promise<GetKnowledgeResponse>((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useSessionKnowledge('run', 'a'));
    await waitFor(() => expect(client.getKnowledge).toHaveBeenCalledOnce());
    act(() => {
      result.current.acceptEvent(
        create(EventSchema, {
          seq: 9n,
          kind: EventKind.HELD,
          body: { case: 'held', value: { holder: 'a', prop: 'obsolete' } },
        })
      );
      result.current.acceptEvent(
        create(EventSchema, {
          seq: 11n,
          kind: EventKind.ROOM_REVEALED,
          body: {
            case: 'roomRevealed',
            value: {
              region: { id: 'room', cells: [{ x: 1, y: 0 }] },
              scenery: [{ x: 1, y: 1 }],
            },
          },
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
