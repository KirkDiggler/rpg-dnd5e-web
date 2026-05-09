import { create } from '@bufbuild/protobuf';
import type { SubmitCheckResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { SubmitCheckRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useCallback, useState } from 'react';
import { encounterClientV2 } from './client';

export interface UseSubmitCheckV2Result {
  /**
   * Calls the v1alpha2 SubmitCheck unary RPC. Resolves the caller's currently-pending
   * InputRequired prompt (skill check). The server tracks the pending prompt as
   * encounter state — no correlation id required. Returns FailedPrecondition if no
   * prompt is pending.
   *
   * `lastResponse` is populated on success so the harness can render
   * the outcome (rolled, total, success/fail) transiently before clearing the prompt.
   */
  submitCheck: (input: {
    encounterId: string;
    entityId: string;
    roll: number;
  }) => Promise<SubmitCheckResponse>;
  loading: boolean;
  error: Error | null;
  lastResponse: SubmitCheckResponse | null;
}

/**
 * Thin wrapper around the v1alpha2 SubmitCheck unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - lastResponse holds the most recent successful response for transient display
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useInteractV2 — one file per v1alpha2 verb under src/api/.
 */
export function useSubmitCheckV2(): UseSubmitCheckV2Result {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResponse, setLastResponse] = useState<SubmitCheckResponse | null>(
    null
  );

  const submitCheck = useCallback(
    async (input: {
      encounterId: string;
      entityId: string;
      roll: number;
    }): Promise<SubmitCheckResponse> => {
      setLoading(true);
      setError(null);

      const request = create(SubmitCheckRequestSchema, {
        encounterId: input.encounterId,
        entityId: input.entityId,
        roll: input.roll,
      });

      try {
        const response = await encounterClientV2.submitCheck(request);
        setLastResponse(response);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('SubmitCheck RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { submitCheck, loading, error, lastResponse };
}
