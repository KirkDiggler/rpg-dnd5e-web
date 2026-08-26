import type {
  ClientBounds,
  PointerCaptureOwner,
  RollGroupPointerSample,
} from './rollGroupGestureController';
import type {
  TrayPlanePoint,
  TrayPlaneProjection,
} from './trayPlaneProjection';
import {
  createVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export interface AnchoredHeldRollGroupState {
  readonly anchor: TrayPlanePoint;
  readonly normalizedPosition: readonly [number, number];
  readonly normalizedTilt: readonly [number, number];
  readonly shakeEnergy: number;
  readonly wobblePhase: number;
  readonly grabbedDieId: string;
}

export interface AnchoredRollGroupGestureController {
  begin(input: {
    readonly sample: RollGroupPointerSample;
    readonly captureTarget: PointerCaptureOwner;
    readonly projection: TrayPlaneProjection;
    readonly hitRegions: readonly Readonly<{
      dieId: string;
      bounds: ClientBounds;
      memberAnchor: TrayPlanePoint;
      stableIndex: number;
    }>[];
    readonly hitPaddingPx: number;
    readonly motionSeed: number;
  }): AnchoredHeldRollGroupState | undefined;
  move(sample: RollGroupPointerSample): AnchoredHeldRollGroupState | undefined;
  release(sample: RollGroupPointerSample): VisualThrowProfileV1 | undefined;
  cancel(pointerId: number): boolean;
  reset(): void;
  held(): AnchoredHeldRollGroupState | undefined;
}

type Tuple2 = readonly [number, number];
type HitRegion = Readonly<{
  dieId: string;
  bounds: ClientBounds;
  memberAnchor: TrayPlanePoint;
  stableIndex: number;
}>;

interface ActiveGesture {
  readonly pointerId: number;
  readonly captureTarget: PointerCaptureOwner;
  readonly projection: TrayPlaneProjection;
  readonly motionSeed: number;
  readonly anchor: TrayPlanePoint;
  readonly grabbedDieId: string;
  previousSample: RollGroupPointerSample;
  previousPosition: Tuple2;
  previousVelocity: Tuple2;
  previousDelta: Tuple2 | undefined;
  accumulatedTurn: number;
  heldState: AnchoredHeldRollGroupState;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function frozenTuple(first: number, second: number): Tuple2 {
  return Object.freeze([first, second] as [number, number]);
}

function frozenHeldState(
  anchor: TrayPlanePoint,
  normalizedPosition: Tuple2,
  normalizedTilt: Tuple2,
  shakeEnergy: number,
  wobblePhase: number,
  grabbedDieId: string
): AnchoredHeldRollGroupState {
  return Object.freeze({
    anchor,
    normalizedPosition,
    normalizedTilt,
    shakeEnergy,
    wobblePhase,
    grabbedDieId,
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

function copyHitRegion(region: HitRegion): HitRegion {
  return Object.freeze({
    dieId: region.dieId,
    bounds: copyBounds(region.bounds),
    memberAnchor: frozenTuple(region.memberAnchor[0], region.memberAnchor[1]),
    stableIndex: region.stableIndex,
  });
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

function isFiniteTuple2(tuple: readonly number[]): tuple is Tuple2 {
  return (
    tuple.length === 2 && Number.isFinite(tuple[0]) && Number.isFinite(tuple[1])
  );
}

function containsPoint(
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

function validHitRegion(region: HitRegion): boolean {
  return (
    typeof region.dieId === 'string' &&
    region.dieId.length > 0 &&
    isValidBounds(region.bounds) &&
    isFiniteTuple2(region.memberAnchor) &&
    Number.isSafeInteger(region.stableIndex) &&
    region.stableIndex >= 0
  );
}

function validBegin(
  input: Parameters<AnchoredRollGroupGestureController['begin']>[0],
  sample: RollGroupPointerSample
): boolean {
  if (
    !isFiniteSample(sample) ||
    !Number.isFinite(input.hitPaddingPx) ||
    input.hitPaddingPx < 0 ||
    !Number.isInteger(input.motionSeed) ||
    input.hitRegions.length === 0
  ) {
    return false;
  }

  const ids = new Set<string>();
  return input.hitRegions.every((region) => {
    if (!validHitRegion(region) || ids.has(region.dieId)) return false;
    ids.add(region.dieId);
    return true;
  });
}

function snapshotProjection(
  projection: TrayPlaneProjection
): TrayPlaneProjection {
  const screenToPlane = projection.screenToPlane;
  const planeToScreen = projection.planeToScreen;
  const planeToNormalized = projection.planeToNormalized;
  const snapshot: TrayPlaneProjection = {
    screenToPlane: (clientX: number, clientY: number) =>
      screenToPlane(clientX, clientY),
    planeToScreen: (point: TrayPlanePoint) => planeToScreen(point),
    planeToNormalized: (point: TrayPlanePoint) => planeToNormalized(point),
  };
  return Object.freeze(snapshot);
}

function chooseHit(
  projection: TrayPlaneProjection,
  hitRegions: readonly HitRegion[],
  hitPaddingPx: number,
  sample: RollGroupPointerSample
): HitRegion | undefined {
  const padded = hitRegions.filter((region) =>
    containsPoint(region.bounds, hitPaddingPx, sample.clientX, sample.clientY)
  );
  if (padded.length === 0) return undefined;

  const unpadded = padded.filter((region) =>
    containsPoint(region.bounds, 0, sample.clientX, sample.clientY)
  );
  const candidates = unpadded.length > 0 ? unpadded : padded;
  const scored = candidates
    .map((region, arrayIndex) => {
      const center = projection.planeToScreen(region.memberAnchor);
      if (!center) return undefined;
      const distance = Math.hypot(
        center[0] - sample.clientX,
        center[1] - sample.clientY
      );
      return Number.isFinite(distance)
        ? { region, distance, arrayIndex }
        : undefined;
    })
    .filter(
      (
        value
      ): value is {
        region: HitRegion;
        distance: number;
        arrayIndex: number;
      } => value !== undefined
    );
  scored.sort((first, second) => {
    if (first.distance !== second.distance)
      return first.distance - second.distance;
    if (first.region.stableIndex !== second.region.stableIndex)
      return first.region.stableIndex - second.region.stableIndex;
    return first.arrayIndex - second.arrayIndex;
  });
  return scored[0]?.region;
}

function groupPlanePosition(
  pointer: TrayPlanePoint,
  anchor: TrayPlanePoint
): TrayPlanePoint {
  return frozenTuple(pointer[0] - anchor[0], pointer[1] - anchor[1]);
}

function normalizedPosition(
  projection: TrayPlaneProjection,
  planePosition: TrayPlanePoint
): Tuple2 | undefined {
  const normalized = projection.planeToNormalized(planePosition);
  if (!normalized || !isFiniteTuple2(normalized)) return undefined;
  return frozenTuple(clamp(normalized[0], 0, 1), clamp(normalized[1], 0, 1));
}

function updateMotion(
  gesture: ActiveGesture,
  nextSample: RollGroupPointerSample
): boolean {
  let nextPlanePosition: TrayPlanePoint;
  let nextPosition: Tuple2 | undefined;
  try {
    const pointer = gesture.projection.screenToPlane(
      nextSample.clientX,
      nextSample.clientY
    );
    if (!pointer || !isFiniteTuple2(pointer)) return false;
    nextPlanePosition = groupPlanePosition(pointer, gesture.anchor);
    nextPosition = normalizedPosition(gesture.projection, nextPlanePosition);
  } catch {
    return false;
  }
  if (!nextPosition) return false;

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
    gesture.anchor,
    nextPosition,
    normalizedTilt,
    shakeEnergy,
    wobblePhase,
    gesture.grabbedDieId
  );
  return true;
}

export function createAnchoredRollGroupGestureController(): AnchoredRollGroupGestureController {
  let active: ActiveGesture | undefined;

  function safelyReleasePointerCapture(
    captureTarget: PointerCaptureOwner,
    pointerId: number
  ): void {
    try {
      captureTarget.releasePointerCapture(pointerId);
    } catch {
      // Capture cleanup is best-effort and must never escape the controller.
    }
  }

  function safelyReleaseCapture(gesture: ActiveGesture): void {
    safelyReleasePointerCapture(gesture.captureTarget, gesture.pointerId);
  }

  function clearAndRelease(gesture: ActiveGesture): void {
    active = undefined;
    safelyReleaseCapture(gesture);
  }

  function stillOwnsCapture(gesture: ActiveGesture): boolean {
    try {
      if (gesture.captureTarget.hasPointerCapture(gesture.pointerId))
        return true;
      active = undefined;
      return false;
    } catch {
      clearAndRelease(gesture);
      return false;
    }
  }

  return {
    begin(input) {
      let captureRequested = false;
      let capturedPointerId: number | undefined;
      try {
        if (active) return undefined;
        const sample = copySample(input.sample);
        if (!validBegin(input, sample)) return undefined;
        const projection = snapshotProjection(input.projection);
        const regions = input.hitRegions.map(copyHitRegion);
        const selected = chooseHit(
          projection,
          regions,
          input.hitPaddingPx,
          sample
        );
        if (!selected) return undefined;
        const pointer = projection.screenToPlane(
          sample.clientX,
          sample.clientY
        );
        if (!pointer || !isFiniteTuple2(pointer)) return undefined;
        const anchor = frozenTuple(
          pointer[0] - selected.memberAnchor[0],
          pointer[1] - selected.memberAnchor[1]
        );
        const planePosition = groupPlanePosition(pointer, anchor);
        const position = normalizedPosition(projection, planePosition);
        if (!position) return undefined;

        capturedPointerId = sample.pointerId;
        captureRequested = true;
        input.captureTarget.setPointerCapture(capturedPointerId);
        if (!input.captureTarget.hasPointerCapture(capturedPointerId)) {
          safelyReleasePointerCapture(input.captureTarget, capturedPointerId);
          captureRequested = false;
          return undefined;
        }

        const heldState = frozenHeldState(
          anchor,
          position,
          frozenTuple(0, 0),
          0,
          0,
          selected.dieId
        );
        active = {
          pointerId: sample.pointerId,
          captureTarget: input.captureTarget,
          projection,
          motionSeed: input.motionSeed,
          anchor,
          grabbedDieId: selected.dieId,
          previousSample: sample,
          previousPosition: position,
          previousVelocity: frozenTuple(0, 0),
          previousDelta: undefined,
          accumulatedTurn: 0,
          heldState,
        };
        captureRequested = false;
        return heldState;
      } catch {
        if (captureRequested && capturedPointerId !== undefined)
          safelyReleasePointerCapture(input.captureTarget, capturedPointerId);
        return undefined;
      }
    },

    move(sample) {
      const gesture = active;
      if (!gesture) return undefined;
      if (!isFiniteSample(sample)) {
        clearAndRelease(gesture);
        return undefined;
      }
      if (sample.pointerId !== gesture.pointerId) return undefined;
      if (!stillOwnsCapture(gesture)) return undefined;
      if (!updateMotion(gesture, sample)) {
        clearAndRelease(gesture);
        return undefined;
      }
      return gesture.heldState;
    },

    release(sample) {
      const gesture = active;
      if (!gesture) return undefined;
      if (!isFiniteSample(sample)) {
        clearAndRelease(gesture);
        return undefined;
      }
      if (sample.pointerId !== gesture.pointerId) return undefined;
      if (!stillOwnsCapture(gesture)) return undefined;

      try {
        if (!updateMotion(gesture, sample)) return undefined;
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
