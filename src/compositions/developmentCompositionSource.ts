import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { JsonCompositionAdapter } from './compositionJsonAdapter';
import type { CompositionSource } from './compositionSource';
import decoratedTableJson from './fixtures/decorated-table.scene.json?raw';

/** Clearly named ownership context for the explicitly enabled JSON dev reader. */
export const DEVELOPMENT_COMPOSITION_WORLD_ID =
  'development-world-web951-compositions';
export const DEVELOPMENT_DECORATED_TABLE_ID = 'decorated-table';

/**
 * Fixture bootstrapping is available only in development and only when the
 * caller explicitly opts in with VITE_ENABLE_DEVELOPMENT_COMPOSITIONS=1.
 * It is never substituted after an RPC or data failure.
 */
export function createDevelopmentCompositionSource(
  mode = import.meta.env.MODE,
  enabled = import.meta.env.VITE_ENABLE_DEVELOPMENT_COMPOSITIONS
): CompositionSource | undefined {
  if (mode !== 'development' || enabled !== '1') return undefined;
  return {
    worldId: DEVELOPMENT_COMPOSITION_WORLD_ID,
    reader: new JsonCompositionAdapter([
      create(CompositionSchema, {
        id: DEVELOPMENT_DECORATED_TABLE_ID,
        worldId: DEVELOPMENT_COMPOSITION_WORLD_ID,
        json: decoratedTableJson,
      }),
    ]),
  };
}
