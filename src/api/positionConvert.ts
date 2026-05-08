import { create } from '@bufbuild/protobuf';
import {
  PositionSchema,
  type Position as V1Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type { Position as V2Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

/**
 * Converts a v1alpha2 Position to a v1alpha1 Position via schema construction
 * so the resulting message has the correct $typeName branding for v1 consumers
 * (encounter state reducers, equality checks). Both shapes are {x,y,z} int32.
 */
export function v2PositionToV1(p: V2Position): V1Position {
  return create(PositionSchema, { x: p.x, y: p.y, z: p.z });
}
