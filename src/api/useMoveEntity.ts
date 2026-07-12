import { create } from '@bufbuild/protobuf';
import type { MoveEntityResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { MoveEntityRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import {
  PositionSchema,
  type Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useState } from 'react';
import { encounterClient } from './client';

/** Plain {x,y,z} accepted by useMoveEntity — hook constructs the proto Position internally. */
export interface PlainPosition {
  x: number;
  y: number;
  z: number;
}

export interface UseMoveEntityResult {
  moveEntity: (
    encounterId: string,
    entityId: string,
    path: PlainPosition[]
  ) => Promise<MoveEntityResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 MoveEntity unary RPC.
 * Accepts plain {x,y,z} objects; constructs proto Positions internally.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 */
export function useMoveEntity(): UseMoveEntityResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const moveEntity = useCallback(
    async (
      encounterId: string,
      entityId: string,
      path: PlainPosition[]
    ): Promise<MoveEntityResponse> => {
      setLoading(true);
      setError(null);

      const proposedPath: Position[] = path.map((p) =>
        create(PositionSchema, { x: p.x, y: p.y, z: p.z })
      );

      const request = create(MoveEntityRequestSchema, {
        encounterId,
        entityId,
        proposedPath,
      });

      try {
        const response = await encounterClient.moveEntity(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('MoveEntity RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { moveEntity, loading, error };
}
