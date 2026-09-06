import type { WorldScene } from '@/concepts/world-building/types';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { decodeCompositionScene } from './compositionScene';

export type CompositionMetadata =
  | { status: 'ready'; name: string; scene: WorldScene }
  | { status: 'error'; message: string };

/** Safely exposes the authored scene name without treating an opaque ID as UI copy. */
export function compositionMetadata(
  composition: Composition
): CompositionMetadata {
  try {
    const scene = decodeCompositionScene(composition);
    return { status: 'ready', name: scene.name, scene };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
