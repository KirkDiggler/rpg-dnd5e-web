import { create } from '@bufbuild/protobuf';
import type {
  ActionTarget,
  TakeActionResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { TakeActionRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useCallback, useState } from 'react';
import { encounterClientV2 } from './client';

/** Plain {module,type,id} accepted by useTakeActionV2 — hook constructs the proto Ref via the schema internally. */
export interface PlainRef {
  module: string;
  type: string;
  id: string;
}

export interface TakeActionParams {
  encounterId: string;
  actorEntityId: string;
  /** {module:"dnd5e", type:"action", id:"attack"} for Wave 2.8's only action. */
  actionRef: PlainRef;
  /**
   * Wave 2.8 only uses `entityId` targets (single-target attacks). Other
   * variants (`position`, `area`, `self`) are accepted by the proto but not
   * exercised by this wave. Pass the proto-shaped ActionTarget directly so the
   * caller controls the oneof case.
   */
  target: ActionTarget;
}

export interface UseTakeActionV2Result {
  /**
   * Calls the v1alpha2 TakeAction unary RPC. The world-changing effects
   * (damage, conditions, mode/turn transitions) flow back as separate events
   * on the StreamEncounter — the response itself only carries caller-private
   * follow-ups (e.g. an InputRequired prompt for spell-slot choices).
   */
  takeAction: (params: TakeActionParams) => Promise<TakeActionResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 TakeAction unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useMoveEntityV2 / useInteractV2 — one file per v1alpha2 verb under
 * src/api/.
 */
export function useTakeActionV2(): UseTakeActionV2Result {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const takeAction = useCallback(
    async (params: TakeActionParams): Promise<TakeActionResponse> => {
      setLoading(true);
      setError(null);

      const request = create(TakeActionRequestSchema, {
        encounterId: params.encounterId,
        actorEntityId: params.actorEntityId,
        actionRef: params.actionRef,
        target: params.target,
      });

      try {
        const response = await encounterClientV2.takeAction(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('TakeAction RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { takeAction, loading, error };
}
