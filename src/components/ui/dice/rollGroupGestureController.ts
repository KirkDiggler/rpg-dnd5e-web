import {
  createVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export interface ClientBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface RollGroupPointerSample {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly timeMs: number;
}

export interface PointerCaptureOwner {
  setPointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
}

export interface HeldRollGroupState {
  readonly normalizedPosition: readonly [number, number];
  readonly normalizedTilt: readonly [number, number];
  readonly shakeEnergy: number;
  readonly wobblePhase: number;
}

export interface RollGroupGestureStart {
  readonly sample: RollGroupPointerSample;
  readonly captureTarget: PointerCaptureOwner;
  readonly trayBounds: ClientBounds;
  readonly hitBounds: ClientBounds;
  readonly hitPaddingPx: number;
  readonly motionSeed: number;
}

export interface RollGroupGestureController {
  begin(input: RollGroupGestureStart): HeldRollGroupState | undefined;
  move(sample: RollGroupPointerSample): HeldRollGroupState | undefined;
  release(sample: RollGroupPointerSample): VisualThrowProfileV1 | undefined;
  cancel(pointerId: number): boolean;
  reset(): void;
  held(): HeldRollGroupState | undefined;
}

type Tuple2 = readonly [number, number];

interface ActiveGesture {
  readonly pointerId: number;
  readonly captureTarget: PointerCaptureOwner;
  readonly trayBounds: ClientBounds;
  readonly motionSeed: number;
  previousSample: RollGroupPointerSample;
  previousPosition: Tuple2;
  previousVelocity: Tuple2;
  previousDelta: Tuple2 | undefined;
  accumulatedTurn: number;
  heldState: HeldRollGroupState;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function frozenTuple(first: number, second: number): Tuple2 {
  return Object.freeze([first, second] as [number, number]);
}

function frozenHeldState(
  normalizedPosition: Tuple2,
  normalizedTilt: Tuple2,
  shakeEnergy: number,
  wobblePhase: number
): HeldRollGroupState {
  return Object.freeze({
    normalizedPosition,
    normalizedTilt,
    shakeEnergy,
    wobblePhase,
  });
}

function copySample(sample: RollGroupPointerSample): RollGroupPointerSample {
  return {
    pointerId: sample.pointerId,
    clientX: sample.clientX,
    clientY: sample.clientY,
    timeMs: sample.timeMs,
  };
}

function copyBounds(bounds: ClientBounds): ClientBounds {
  return {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
}

function isFiniteSample(sample: RollGroupPointerSample): boolean {
  return (
    Number.isFinite(sample.pointerId) &&
    Number.isFinite(sample.clientX) &&
    Number.isFinite(sample.clientY) &&
    Number.isFinite(sample.timeMs)
  );
}

function isValidBounds(bounds: ClientBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function isValidStart(input: RollGroupGestureStart): boolean {
  return (
    isFiniteSample(input.sample) &&
    isValidBounds(input.trayBounds) &&
    isValidBounds(input.hitBounds) &&
    Number.isFinite(input.hitPaddingPx) &&
    input.hitPaddingPx >= 0 &&
    Number.isInteger(input.motionSeed)
  );
}

function containsExpandedPoint(
  bounds: ClientBounds,
  padding: number,
  clientX: number,
  clientY: number
): boolean {
  return (
    clientX >= bounds.left - padding &&
    clientX <= bounds.left + bounds.width + padding &&
    clientY >= bounds.top - padding &&
    clientY <= bounds.top + bounds.height + padding
  );
}

function normalizedPoint(
  sample: RollGroupPointerSample,
  bounds: ClientBounds
): Tuple2 {
  return frozenTuple(
    clamp((sample.clientX - bounds.left) / bounds.width, 0, 1),
    clamp((sample.clientY - bounds.top) / bounds.height, 0, 1)
  );
}

function updateMotion(
  gesture: ActiveGesture,
  nextSample: RollGroupPointerSample
): void {
  const nextPosition = normalizedPoint(nextSample, gesture.trayBounds);
  const dtSeconds = clamp(
    (nextSample.timeMs - gesture.previousSample.timeMs) / 1000,
    1 / 240,
    0.1
  );
  const delta = frozenTuple(
    nextPosition[0] - gesture.previousPosition[0],
    nextPosition[1] - gesture.previousPosition[1]
  );
  const instantVelocity = frozenTuple(
    clamp(delta[0] / dtSeconds, -3, 3),
    clamp(delta[1] / dtSeconds, -3, 3)
  );
  const filteredVelocity = frozenTuple(
    gesture.previousVelocity[0] * 0.65 + instantVelocity[0] * 0.35,
    gesture.previousVelocity[1] * 0.65 + instantVelocity[1] * 0.35
  );
  const segmentDistance = Math.hypot(...delta);
  const shakeEnergy = clamp(
    gesture.heldState.shakeEnergy + segmentDistance * 0.9,
    0,
    1
  );
  const normalizedTilt = frozenTuple(
    clamp(-filteredVelocity[1] / 2.4, -1, 1),
    clamp(filteredVelocity[0] / 2.4, -1, 1)
  );
  const wobblePhase = (gesture.heldState.wobblePhase + segmentDistance * 3) % 1;

  if (gesture.previousDelta) {
    gesture.accumulatedTurn +=
      gesture.previousDelta[0] * delta[1] - gesture.previousDelta[1] * delta[0];
  }

  gesture.previousSample = copySample(nextSample);
  gesture.previousPosition = nextPosition;
  gesture.previousVelocity = filteredVelocity;
  gesture.previousDelta = delta;
  gesture.heldState = frozenHeldState(
    nextPosition,
    normalizedTilt,
    shakeEnergy,
    wobblePhase
  );
}

export function createRollGroupGestureController(): RollGroupGestureController {
  let active: ActiveGesture | undefined;

  function safelyReleaseCapture(gesture: ActiveGesture): void {
    try {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId);
    } catch {
      // Capture cleanup is best-effort and must never escape the controller.
    }
  }

  function clearAndRelease(gesture: ActiveGesture): void {
    active = undefined;
    safelyReleaseCapture(gesture);
  }

  function stillOwnsCapture(gesture: ActiveGesture): boolean {
    try {
      if (gesture.captureTarget.hasPointerCapture(gesture.pointerId)) {
        return true;
      }
      active = undefined;
      return false;
    } catch {
      clearAndRelease(gesture);
      return false;
    }
  }

  return {
    begin(input) {
      if (active || !isValidStart(input)) return undefined;
      if (
        !containsExpandedPoint(
          input.hitBounds,
          input.hitPaddingPx,
          input.sample.clientX,
          input.sample.clientY
        )
      ) {
        return undefined;
      }

      try {
        input.captureTarget.setPointerCapture(input.sample.pointerId);
        if (!input.captureTarget.hasPointerCapture(input.sample.pointerId)) {
          return undefined;
        }
      } catch {
        try {
          input.captureTarget.releasePointerCapture(input.sample.pointerId);
        } catch {
          // A failed capture request has no controller state to preserve.
        }
        return undefined;
      }

      const trayBounds = copyBounds(input.trayBounds);
      const sample = copySample(input.sample);
      const position = normalizedPoint(sample, trayBounds);
      const heldState = frozenHeldState(position, frozenTuple(0, 0), 0, 0);
      active = {
        pointerId: sample.pointerId,
        captureTarget: input.captureTarget,
        trayBounds,
        motionSeed: input.motionSeed,
        previousSample: sample,
        previousPosition: position,
        previousVelocity: frozenTuple(0, 0),
        previousDelta: undefined,
        accumulatedTurn: 0,
        heldState,
      };
      return heldState;
    },

    move(sample) {
      const gesture = active;
      if (!gesture || sample.pointerId !== gesture.pointerId) return undefined;
      if (!isFiniteSample(sample)) {
        clearAndRelease(gesture);
        return undefined;
      }
      if (!stillOwnsCapture(gesture)) return undefined;

      updateMotion(gesture, sample);
      return gesture.heldState;
    },

    release(sample) {
      const gesture = active;
      if (!gesture || sample.pointerId !== gesture.pointerId) return undefined;
      if (!isFiniteSample(sample)) {
        clearAndRelease(gesture);
        return undefined;
      }
      if (!stillOwnsCapture(gesture)) return undefined;

      try {
        updateMotion(gesture, sample);
        const speed = Math.hypot(...gesture.previousVelocity);
        const releaseDirection =
          speed < 0.02
            ? frozenTuple(0, 0)
            : frozenTuple(
                gesture.previousVelocity[0] / speed,
                gesture.previousVelocity[1] / speed
              );
        return createVisualThrowProfile({
          releasePosition: gesture.previousPosition,
          releaseDirection,
          releaseSpeed: clamp(speed / 2.4, 0, 1),
          shakeEnergy: gesture.heldState.shakeEnergy,
          spinBias: clamp(
            gesture.accumulatedTurn * 6 + releaseDirection[0] * 0.2,
            -1,
            1
          ),
          motionSeed: gesture.motionSeed,
        });
      } finally {
        clearAndRelease(gesture);
      }
    },

    cancel(pointerId) {
      const gesture = active;
      if (!gesture || pointerId !== gesture.pointerId) return false;
      clearAndRelease(gesture);
      return true;
    },

    reset() {
      const gesture = active;
      if (gesture) clearAndRelease(gesture);
    },

    held() {
      return active?.heldState;
    },
  };
}
