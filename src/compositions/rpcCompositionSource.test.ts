import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { describe, expect, it, vi } from 'vitest';
import {
  createRpcCompositionSource,
  RpcCompositionAdapter,
} from './rpcCompositionSource';

const snapshot = (id: string, worldId = 'test-world', json = '{"ok":true}') =>
  create(CompositionSchema, { id, worldId, json });

type FakeClient = ConstructorParameters<typeof RpcCompositionAdapter>[0];

function client(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    createComposition: vi.fn(async ({ worldId, json }) => ({
      composition: snapshot('composition-new', worldId, json),
    })),
    getComposition: vi.fn(async ({ worldId, id }) => ({
      composition: snapshot(id, worldId),
    })),
    listCompositions: vi.fn(async ({ worldId }) => ({
      compositions: [snapshot('composition-one', worldId)],
    })),
    deleteComposition: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe('RpcCompositionAdapter', () => {
  it('routes typed Create/Get/List/Delete through the generated client and preserves snapshot JSON', async () => {
    const rpc = client();
    const adapter = new RpcCompositionAdapter(rpc);
    const json = '{"kind":"rpg-world-building-scene"}';

    const created = await adapter.createComposition('test-world', json);
    const fetched = await adapter.getComposition('test-world', created.id);
    const listed = await adapter.listCompositions('test-world');
    await adapter.deleteComposition('test-world', 'composition-new');

    expect(rpc.createComposition).toHaveBeenCalledWith({
      worldId: 'test-world',
      json,
    });
    expect(rpc.getComposition).toHaveBeenCalledWith({
      worldId: 'test-world',
      id: 'composition-new',
    });
    expect(rpc.listCompositions).toHaveBeenCalledWith({
      worldId: 'test-world',
    });
    expect(rpc.deleteComposition).toHaveBeenCalledWith({
      worldId: 'test-world',
      id: 'composition-new',
    });
    expect(created.json).toBe(json);
    expect(fetched?.id).toBe('composition-new');
    expect(listed.map((entry) => entry.id)).toEqual(['composition-one']);
  });

  it('accepts semantically unchanged JSON normalized by the service', async () => {
    const normalized = snapshot('composition-new', 'test-world', '{"ok":true}');
    const adapter = new RpcCompositionAdapter(
      client({
        createComposition: vi.fn(async () => ({ composition: normalized })),
      })
    );
    expect(
      (await adapter.createComposition('test-world', '{\n  "ok": true\n}')).json
    ).toBe('{"ok":true}');
  });

  it('maps an actual NotFound status to a missing snapshot without hiding other failures', async () => {
    const missing = new RpcCompositionAdapter(
      client({
        getComposition: vi.fn(async () => {
          throw new ConnectError('gone', Code.NotFound);
        }),
      })
    );
    expect(await missing.getComposition('test-world', 'gone')).toBeNull();

    const failed = new RpcCompositionAdapter(
      client({
        getComposition: vi.fn(async () => {
          throw new ConnectError('offline', Code.Unavailable);
        }),
      })
    );
    await expect(failed.getComposition('test-world', 'id')).rejects.toThrow(
      'offline'
    );
  });

  it.each([
    [undefined, 'no composition'],
    [snapshot('', 'test-world'), 'empty composition ID'],
    [snapshot('id', 'other-world'), 'returned world'],
  ] as const)(
    'rejects malformed Create responses (%s)',
    async (value, match) => {
      const adapter = new RpcCompositionAdapter(
        client({
          createComposition: vi.fn(async () => ({ composition: value })),
        })
      );
      await expect(
        adapter.createComposition('test-world', '{"ok":true}')
      ).rejects.toThrow(match);
    }
  );
});

describe('createRpcCompositionSource', () => {
  const input = (
    auth:
      | {
          kind: 'discord';
          playerId: string | null;
          guildId: string | null;
        }
      | { kind: 'dev'; playerId: string }
      | { kind: 'unauthenticated' },
    overrides: Partial<Parameters<typeof createRpcCompositionSource>[0]> = {}
  ): Parameters<typeof createRpcCompositionSource>[0] => ({
    mode: 'development',
    devWorldId: undefined,
    authSessionId: 7,
    auth,
    onUnauthenticated: vi.fn(),
    isAuthSessionCurrent: () => true,
    client: client(),
    ...overrides,
  });

  it('uses Discord in every build and binds its canonical SDK guild as WorldID', () => {
    const auth = {
      kind: 'discord' as const,
      playerId: 'player-1',
      guildId: '123456789012345678',
    };
    const development = createRpcCompositionSource(input(auth));
    const production = createRpcCompositionSource(
      input(auth, { mode: 'production', devWorldId: 'test-world' })
    );

    expect(development?.worldId).toBe('123456789012345678');
    expect(production?.worldId).toBe('123456789012345678');
    expect(development?.writer).toBe(development?.reader);
  });

  it('creates no Discord source without a canonical guild', () => {
    for (const guildId of [null, '', '01', 'not-a-guild']) {
      expect(
        createRpcCompositionSource(
          input({ kind: 'discord', playerId: 'player-1', guildId })
        )
      ).toBeUndefined();
    }
  });

  it('uses the configured/default Dev world only for actual Dev auth in development', () => {
    const auth = { kind: 'dev' as const, playerId: 'dev-player' };
    expect(createRpcCompositionSource(input(auth))?.worldId).toBe('test-world');
    expect(
      createRpcCompositionSource(
        input(auth, { devWorldId: ' authored-world ' })
      )?.worldId
    ).toBe('authored-world');
    expect(
      createRpcCompositionSource(input(auth, { mode: 'production' }))
    ).toBeUndefined();
    expect(
      createRpcCompositionSource(input({ kind: 'unauthenticated' }))
    ).toBeUndefined();
  });

  it('reports Unauthenticated with the captured session while preserving the error', async () => {
    const onUnauthenticated = vi.fn();
    const rpc = client({
      listCompositions: vi.fn(async () => {
        throw new ConnectError('expired', Code.Unauthenticated);
      }),
    });
    const source = createRpcCompositionSource(
      input(
        {
          kind: 'discord',
          playerId: 'player-1',
          guildId: '123456789012345678',
        },
        { client: rpc, authSessionId: 42, onUnauthenticated }
      )
    );

    await expect(
      source!.reader.listCompositions(source!.worldId)
    ).rejects.toThrow('expired');
    expect(onUnauthenticated).toHaveBeenCalledWith(42);
  });

  it('preserves session B on a late A 401 and clears B on its current 401', async () => {
    let rejectA!: (reason: Error) => void;
    const pendingA = new Promise<{ compositions: Composition[] }>(
      (_resolve, reject) => {
        rejectA = reject;
      }
    );
    let currentSession = 1;
    const ui = {
      auth: 'A',
      error: 'A error',
      palette: ['A palette'],
      resolutions: ['A resolution'],
    };
    const guardedClear = (expected: number) => {
      if (expected !== currentSession) return;
      ui.auth = 'cleared';
      ui.error = 'reconnect';
      ui.palette = [];
      ui.resolutions = [];
    };
    const sourceA = createRpcCompositionSource(
      input(
        {
          kind: 'discord',
          playerId: 'player-a',
          guildId: '123456789012345678',
        },
        {
          authSessionId: 1,
          client: client({ listCompositions: vi.fn(() => pendingA) }),
          onUnauthenticated: guardedClear,
          isAuthSessionCurrent: (expected) => expected === currentSession,
        }
      )
    )!;
    const requestA = sourceA.reader.listCompositions(sourceA.worldId);

    currentSession = 2;
    Object.assign(ui, {
      auth: 'B',
      error: 'B error',
      palette: ['B palette'],
      resolutions: ['B resolution'],
    });
    rejectA(new ConnectError('A expired', Code.Unauthenticated));
    await expect(requestA).rejects.toThrow('A expired');
    expect(ui).toEqual({
      auth: 'B',
      error: 'B error',
      palette: ['B palette'],
      resolutions: ['B resolution'],
    });

    const sourceB = createRpcCompositionSource(
      input(
        {
          kind: 'discord',
          playerId: 'player-b',
          guildId: '123456789012345678',
        },
        {
          authSessionId: 2,
          client: client({
            listCompositions: vi.fn(async () => {
              throw new ConnectError('B expired', Code.Unauthenticated);
            }),
          }),
          onUnauthenticated: guardedClear,
          isAuthSessionCurrent: (expected) => expected === currentSession,
        }
      )
    )!;
    await expect(
      sourceB.reader.listCompositions(sourceB.worldId)
    ).rejects.toThrow('B expired');
    expect(ui).toEqual({
      auth: 'cleared',
      error: 'reconnect',
      palette: [],
      resolutions: [],
    });
  });

  it('refuses stale-source writes before the global transport can use a newer session credential', async () => {
    const rpc = client();
    const source = createRpcCompositionSource(
      input(
        {
          kind: 'discord',
          playerId: 'player-1',
          guildId: '123456789012345678',
        },
        { client: rpc, isAuthSessionCurrent: () => false }
      )
    );

    await expect(
      source!.writer!.createComposition(source!.worldId, '{}')
    ).rejects.toThrow('no longer active');
    expect(rpc.createComposition).not.toHaveBeenCalled();
  });
});
