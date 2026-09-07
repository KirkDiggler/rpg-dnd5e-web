import { compositionClient } from '@/api/client';
import { Code, ConnectError } from '@connectrpc/connect';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import type {
  CompositionReader,
  CompositionWriter,
} from './compositionJsonAdapter';
import type { CompositionSource } from './compositionSource';

export const DEFAULT_DEV_WORLD_ID = 'test-world';

interface CompositionRpcClient {
  createComposition(request: {
    worldId: string;
    json: string;
  }): Promise<{ composition?: Composition }>;
  getComposition(request: {
    worldId: string;
    id: string;
  }): Promise<{ composition?: Composition }>;
  listCompositions(request: {
    worldId: string;
  }): Promise<{ compositions: Composition[] }>;
  deleteComposition(request: { worldId: string; id: string }): Promise<object>;
}

function requireComposition(
  composition: Composition | undefined,
  expectedWorldId: string,
  expectedId?: string
): Composition {
  if (!composition) throw new Error('Composition RPC returned no composition.');
  if (!composition.id.trim()) {
    throw new Error('Composition RPC returned an empty composition ID.');
  }
  if (composition.worldId !== expectedWorldId) {
    throw new Error(
      `Composition RPC returned world ${composition.worldId}, not ${expectedWorldId}.`
    );
  }
  if (expectedId !== undefined && composition.id !== expectedId) {
    throw new Error(
      `Composition RPC returned ID ${composition.id}, not ${expectedId}.`
    );
  }
  return composition;
}

/** Thin current-world adapter over the generated CompositionService client. */
export class RpcCompositionAdapter
  implements CompositionReader, CompositionWriter
{
  constructor(private readonly client: CompositionRpcClient) {}

  async createComposition(worldId: string, json: string): Promise<Composition> {
    const response = await this.client.createComposition({ worldId, json });
    return requireComposition(response.composition, worldId);
  }

  async getComposition(
    worldId: string,
    id: string
  ): Promise<Composition | null> {
    try {
      const response = await this.client.getComposition({ worldId, id });
      return requireComposition(response.composition, worldId, id);
    } catch (error) {
      if (ConnectError.from(error).code === Code.NotFound) return null;
      throw error;
    }
  }

  async listCompositions(worldId: string): Promise<Composition[]> {
    const response = await this.client.listCompositions({ worldId });
    return response.compositions.map((composition) =>
      requireComposition(composition, worldId)
    );
  }

  async deleteComposition(worldId: string, id: string): Promise<void> {
    await this.client.deleteComposition({ worldId, id });
  }
}

/**
 * The web has no production world-discovery claim yet. Only a Vite development
 * build receives the explicit local world, defaulting to the API's test-world.
 */
export function createRpcCompositionSource(
  mode = import.meta.env.MODE,
  configuredWorldId = import.meta.env.VITE_DEV_WORLD_ID,
  client: CompositionRpcClient = compositionClient
): CompositionSource | undefined {
  if (mode !== 'development') return undefined;
  const worldId = configuredWorldId?.trim() || DEFAULT_DEV_WORLD_ID;
  const adapter = new RpcCompositionAdapter(client);
  return { worldId, reader: adapter, writer: adapter };
}
