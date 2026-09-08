import type { AuthDecision } from '@/api/auth';
import { compositionClient } from '@/api/client';
import { Code, ConnectError } from '@connectrpc/connect';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import type {
  CompositionReader,
  CompositionWriter,
} from './compositionJsonAdapter';
import type { CompositionSource } from './compositionSource';

export const DEFAULT_DEV_WORLD_ID = 'test-world';
const MAX_UINT64 = 18_446_744_073_709_551_615n;

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

export interface RpcCompositionSourceInput {
  mode: string;
  devWorldId?: string;
  authSessionId: number;
  auth: AuthDecision;
  onUnauthenticated(authSessionId: number): void;
  /** Synchronous epoch guard preventing an old source using new credentials. */
  isAuthSessionCurrent(authSessionId: number): boolean;
  client?: CompositionRpcClient;
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

/** Thin current-world adapter over a CompositionService-shaped client. */
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

class SessionBoundCompositionClient implements CompositionRpcClient {
  constructor(
    private readonly client: CompositionRpcClient,
    private readonly authSessionId: number,
    private readonly isCurrent: (authSessionId: number) => boolean,
    private readonly onUnauthenticated: (authSessionId: number) => void
  ) {}

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    // Connect's global interceptor intentionally looks up the current token at
    // dispatch time. Fence here so a stale same-guild editor cannot silently
    // perform a write with a replacement session's credential.
    if (!this.isCurrent(this.authSessionId)) {
      throw new Error('Composition source is no longer active.');
    }
    try {
      return await operation();
    } catch (error) {
      if (ConnectError.from(error).code === Code.Unauthenticated) {
        this.onUnauthenticated(this.authSessionId);
      }
      throw error;
    }
  }

  createComposition(request: { worldId: string; json: string }) {
    return this.call(() => this.client.createComposition(request));
  }

  getComposition(request: { worldId: string; id: string }) {
    return this.call(() => this.client.getComposition(request));
  }

  listCompositions(request: { worldId: string }) {
    return this.call(() => this.client.listCompositions(request));
  }

  deleteComposition(request: { worldId: string; id: string }) {
    return this.call(() => this.client.deleteComposition(request));
  }
}

function canonicalGuildId(value: string | null): string | undefined {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return undefined;
  try {
    if (BigInt(value) > MAX_UINT64) return undefined;
  } catch {
    return undefined;
  }
  return value;
}

/** Select a source from the exact same non-secret auth decision as transport. */
export function createRpcCompositionSource(
  input: RpcCompositionSourceInput
): CompositionSource | undefined {
  let worldId: string | undefined;
  if (input.auth.kind === 'discord') {
    worldId = canonicalGuildId(input.auth.guildId);
  } else if (input.auth.kind === 'dev' && input.mode === 'development') {
    worldId = input.devWorldId?.trim() || DEFAULT_DEV_WORLD_ID;
  }
  if (!worldId) return undefined;

  const sessionClient = new SessionBoundCompositionClient(
    input.client ?? compositionClient,
    input.authSessionId,
    input.isAuthSessionCurrent,
    input.onUnauthenticated
  );
  const adapter = new RpcCompositionAdapter(sessionClient);
  return { worldId, reader: adapter, writer: adapter };
}
