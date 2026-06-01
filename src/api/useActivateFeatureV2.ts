import { create } from '@bufbuild/protobuf';
import type { ActivateFeatureResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { ActivateFeatureRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useCallback, useState } from 'react';
import { encounterClientV2 } from './client';

/** Plain {module,type,id} for a feature Ref — mirrors PlainRef in useTakeActionV2. */
export interface PlainRef {
  module: string;
  type: string;
  id: string;
}

export interface ActivateFeatureParams {
  encounterId: string;
  characterId: string;
  /** e.g. {module:"dnd5e", type:"features", id:"rage"} */
  featureRef: PlainRef;
}

export interface UseActivateFeatureV2Result {
  /**
   * Calls the v1alpha2 ActivateFeature unary RPC. The world-changing effects
   * (condition applied, charges decremented, action consumed) flow back as
   * separate events on the StreamEncounter; the response itself is an empty ack.
   */
  activateFeature: (
    params: ActivateFeatureParams
  ) => Promise<ActivateFeatureResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 ActivateFeature unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useTakeActionV2 / useEndTurnV2 — one file per v1alpha2 verb under
 * src/api/.
 */
export function useActivateFeatureV2(): UseActivateFeatureV2Result {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const activateFeature = useCallback(
    async (params: ActivateFeatureParams): Promise<ActivateFeatureResponse> => {
      setLoading(true);
      setError(null);

      const request = create(ActivateFeatureRequestSchema, {
        encounterId: params.encounterId,
        characterId: params.characterId,
        featureRef: params.featureRef,
      });

      try {
        const response = await encounterClientV2.activateFeature(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('ActivateFeature RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { activateFeature, loading, error };
}
