import { create } from '@bufbuild/protobuf';
import type { SubmitCheckResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { SubmitCheckRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useCallback, useState } from 'react';
import { encounterClientV2 } from './client';

/**
 * Input shape for SubmitCheck. The `roll` field carries the d20 result for
 * skill-check prompts; `takeReaction` is set on reaction-prompt responses
 * (true=take, false=skip). Pass `roll: 0` (ignored) when responding to a
 * reaction prompt.
 */
export interface UseSubmitCheckV2Input {
  encounterId: string;
  entityId: string;
  /** Skill-check: required. Reaction-check: ignored (pass 0). */
  roll: number;
  /** Wave 2.11d: reaction-prompt response. true=take, false=skip. */
  takeReaction?: boolean;
}

export interface UseSubmitCheckV2Result {
  /**
   * Calls the v1alpha2 SubmitCheck unary RPC. Resolves the caller's currently-
   * pending InputRequired prompt. The server tracks the pending prompt as
   * encounter state — no correlation id required. Returns FailedPrecondition
   * if no prompt is pending.
   *
   * Wave 2.9 (skill check): pass `roll` with the d20 result. Server runs the
   * skill-check resolution and returns success/total.
   *
   * Wave 2.11d (reaction prompt): when the caller's pending prompt is a
   * ReactionPrompt, pass `takeReaction` and the server runs phase 2 of the
   * paused attack with/without the reaction modifier baked in. The `roll`
   * field is ignored. Response.Total carries 1 (took) or 0 (skipped) for
   * client telemetry.
   *
   * `lastResponse` is populated on success so the harness can render the
   * outcome transiently before clearing the prompt.
   */
  submitCheck: (input: UseSubmitCheckV2Input) => Promise<SubmitCheckResponse>;
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
    async (input: UseSubmitCheckV2Input): Promise<SubmitCheckResponse> => {
      setLoading(true);
      setError(null);

      // Build the request, conditionally setting takeReaction (proto-optional).
      // Omitting the field when undefined produces a request without the
      // field set, which the server interprets as "not a reaction response."
      const requestFields: {
        encounterId: string;
        entityId: string;
        roll: number;
        takeReaction?: boolean;
      } = {
        encounterId: input.encounterId,
        entityId: input.entityId,
        roll: input.roll,
      };
      if (input.takeReaction !== undefined) {
        requestFields.takeReaction = input.takeReaction;
      }
      const request = create(SubmitCheckRequestSchema, requestFields);

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
