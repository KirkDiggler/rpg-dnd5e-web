import { clone } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { decodeCompositionScene } from './compositionScene';

/** The read seam shared by the explicit JSON development source and Phase B. */
export interface CompositionReader {
  listCompositions(worldId: string): Promise<Composition[]>;
  getComposition(worldId: string, id: string): Promise<Composition | null>;
}

function requireIdentity(value: string, field: 'id' | 'worldId'): void {
  if (value.trim().length === 0) {
    throw new Error(`Composition ${field} must not be empty.`);
  }
}

/**
 * Explicit development-only reader for proto Composition snapshots whose
 * authored payload is JSON. It is injected by callers; it is not an RPC error
 * fallback and never substitutes fixture data for a failed server request.
 */
export class JsonCompositionAdapter implements CompositionReader {
  private readonly byWorld = new Map<string, Map<string, Composition>>();

  constructor(compositions: readonly Composition[]) {
    for (const source of compositions) {
      requireIdentity(source.worldId, 'worldId');
      requireIdentity(source.id, 'id');
      decodeCompositionScene(source);

      let world = this.byWorld.get(source.worldId);
      if (!world) {
        world = new Map();
        this.byWorld.set(source.worldId, world);
      }
      if (world.has(source.id)) {
        throw new Error(
          `Duplicate composition ${source.id} in world ${source.worldId}.`
        );
      }
      world.set(source.id, clone(CompositionSchema, source));
    }
  }

  async listCompositions(worldId: string): Promise<Composition[]> {
    return [...(this.byWorld.get(worldId)?.values() ?? [])].map((composition) =>
      clone(CompositionSchema, composition)
    );
  }

  async getComposition(
    worldId: string,
    id: string
  ): Promise<Composition | null> {
    const composition = this.byWorld.get(worldId)?.get(id);
    return composition ? clone(CompositionSchema, composition) : null;
  }
}
