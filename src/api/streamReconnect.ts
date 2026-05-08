/**
 * Reconnect schedule shared by useEncounterStream (v1alpha1) and
 * useEncounterStream2 (v1alpha2). Single source of truth — preventing
 * drift between the two hooks.
 *
 * Schedule: 1s initial, 2x backoff multiplier, 30s cap, 10 max attempts.
 * Total backoff window if all attempts fail: ~5 minutes.
 */
export const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  maxAttempts: 10,
} as const;

export type ReconnectConfig = typeof RECONNECT_CONFIG;
