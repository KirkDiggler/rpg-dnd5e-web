export interface PhaseElapsedClock {
  readonly elapsed: (phaseIdentity: string, canvasElapsedMs: number) => number;
  readonly reset: () => void;
}

export function createPhaseElapsedClock(): PhaseElapsedClock {
  let activeIdentity: string | undefined;
  let startedAt: number | undefined;

  return Object.freeze({
    elapsed(phaseIdentity: string, canvasElapsedMs: number) {
      if (
        phaseIdentity.length === 0 ||
        !Number.isFinite(canvasElapsedMs) ||
        canvasElapsedMs < 0
      )
        return 0;
      if (
        activeIdentity !== phaseIdentity ||
        startedAt === undefined ||
        canvasElapsedMs < startedAt
      ) {
        activeIdentity = phaseIdentity;
        startedAt = canvasElapsedMs;
        return 0;
      }
      return canvasElapsedMs - startedAt;
    },
    reset() {
      activeIdentity = undefined;
      startedAt = undefined;
    },
  });
}
