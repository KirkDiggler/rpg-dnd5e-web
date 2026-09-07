import { parseSceneJson } from '@/concepts/world-building/serialization';
import type { WorldScene } from '@/concepts/world-building/types';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';

/**
 * Decode the authored snapshot with the existing World Building parser. The
 * composition envelope stays byte-for-byte in Composition.json; this helper
 * does not introduce a second scene dialect or rewrite authored transforms.
 */
export function decodeCompositionScene(composition: Composition): WorldScene {
  return parseSceneJson(composition.json);
}
