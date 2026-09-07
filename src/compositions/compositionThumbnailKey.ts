import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';

/** Exact cache identity for one immutable snapshot in one supplied world.
 * Keeping the complete JSON in this bounded, palette-local key avoids hash
 * collisions accidentally reusing an older snapshot. */
export function compositionThumbnailKey(
  sourceWorldId: string,
  composition: Composition
): string {
  return JSON.stringify([
    sourceWorldId,
    composition.worldId,
    composition.id,
    composition.json,
  ]);
}
