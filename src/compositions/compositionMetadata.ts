import type { WorldScene } from '@/concepts/world-building/types';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import type { CompositionResolution } from './CompositionPlacementModel';
import { compositionIdFromRef } from './compositionRef';
import { decodeCompositionScene } from './compositionScene';
import type { CompositionSource } from './compositionSource';

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

export type CompositionPlacementMetadata =
  | { status: 'loading'; id: string }
  | { status: 'ready'; id: string; name: string }
  | { status: 'missing'; id: string; message: string }
  | { status: 'error'; id: string; message: string }
  | { status: 'missing-source'; id: string };

/** Turn one opaque placement ref plus its shared read state into honest UI
 * metadata. Missing records alone are called deleted/missing; source setup,
 * pending reads, transport failures, and malformed authored JSON stay distinct.
 */
export function compositionPlacementMetadata(
  ref: string,
  source: CompositionSource | undefined,
  resolutions: ReadonlyMap<string, CompositionResolution>
): CompositionPlacementMetadata | null {
  const id = compositionIdFromRef(ref);
  if (!id) return null;
  if (!source) return { status: 'missing-source', id };

  const resolution = resolutions.get(id) ?? { status: 'loading' as const };
  if (resolution.status === 'loading') return { status: 'loading', id };
  if (resolution.status === 'ready') {
    const metadata = compositionMetadata(resolution.composition);
    if (metadata.status === 'error') {
      return { status: 'error', id, message: metadata.message };
    }
    return { status: 'ready', id, name: metadata.name };
  }
  return { status: resolution.status, id, message: resolution.message };
}
