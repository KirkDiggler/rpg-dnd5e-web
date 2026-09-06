import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
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
    ...overrides,
  };
}

describe('RpcCompositionAdapter', () => {
  it('routes Create/Get/List through the generated client and preserves snapshot JSON', async () => {
    const rpc = client();
    const adapter = new RpcCompositionAdapter(rpc);
    const json = '{"kind":"rpg-world-building-scene"}';

    const created = await adapter.createComposition('test-world', json);
    const fetched = await adapter.getComposition('test-world', created.id);
    const listed = await adapter.listCompositions('test-world');

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
  it('defaults only development to test-world and exposes one reader/writer adapter', () => {
    const source = createRpcCompositionSource(
      'development',
      undefined,
      client()
    );
    expect(source?.worldId).toBe('test-world');
    expect(source?.writer).toBe(source?.reader);
  });

  it('uses the explicit dev world and refuses to fabricate a production mapping', () => {
    expect(
      createRpcCompositionSource('development', ' authored-world ', client())
        ?.worldId
    ).toBe('authored-world');
    expect(
      createRpcCompositionSource('production', 'test-world', client())
    ).toBe(undefined);
  });
});
