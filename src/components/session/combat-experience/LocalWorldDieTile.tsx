import type { Scene3D } from '@/components/session/atlasToScene3D';
import {
  localWorldDieDimensions,
  readDiceDials,
} from '@/components/session/local-world-die/diceDials';
import type { LocalWorldDieHeldState } from '@/components/session/local-world-die/localWorldDieCommand';
import { isLocalWorldDieFloorPoint } from '@/components/session/local-world-die/localWorldDieFloor';
import type { TrayPlaneProjection } from '@/components/ui/dice/trayPlaneProjection';
import {
  createVisualThrowProfile,
  type VisualThrowProfileV1,
} from '@/components/ui/dice/visualThrowProfile';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import styles from './CombatExperience.module.css';

export interface LocalWorldDieTileProps {
  readonly mode: 'ready' | 'fallback' | 'status';
  readonly pickupReady?: boolean;
  readonly scene?: Scene3D;
  readonly projectionRef?: MutableRefObject<TrayPlaneProjection | undefined>;
  readonly onHeldChange?: (held: LocalWorldDieHeldState | undefined) => void;
  readonly onRelease?: (
    held: LocalWorldDieHeldState,
    profile: VisualThrowProfileV1
  ) => void;
  readonly onRoll?: () => void;
  readonly onRevealResult?: () => void;
}

function suppress(event: { preventDefault(): void; stopPropagation(): void }) {
  event.preventDefault();
  event.stopPropagation();
}

export function LocalWorldDieTile(props: LocalWorldDieTileProps) {
  const integrationRef = useRef(props);
  integrationRef.current = props;
  // `?dieScale=` (diceDials.ts) — read once, same convention as
  // LocalWorldDieLayer.tsx's own dieScale/dimensions.
  const dimensionsRef = useRef(
    localWorldDieDimensions(readDiceDials().dieScale)
  );
  const activePointer = useRef<number | undefined>(undefined);
  const captureOwner = useRef<HTMLButtonElement | undefined>(undefined);
  const heldRef = useRef<LocalWorldDieHeldState | undefined>(undefined);
  const releaseValid = useRef(false);
  const lastClientY = useRef(0);
  const previousSample = useRef<
    | { readonly position: readonly [number, number]; readonly timeMs: number }
    | undefined
  >(undefined);
  const filteredVelocity = useRef<readonly [number, number]>([0, 0]);
  const releaseSequence = useRef(1);
  const [handedOff, setHandedOff] = useState(false);

  const clear = useCallback((notify = true) => {
    const pointerId = activePointer.current;
    const owner = captureOwner.current;
    const hadGesture =
      activePointer.current !== undefined || heldRef.current !== undefined;
    activePointer.current = undefined;
    captureOwner.current = undefined;
    heldRef.current = undefined;
    releaseValid.current = false;
    previousSample.current = undefined;
    filteredVelocity.current = [0, 0];
    setHandedOff(false);
    if (pointerId !== undefined && owner?.hasPointerCapture(pointerId)) {
      try {
        owner.releasePointerCapture(pointerId);
      } catch {
        // Capture may already be gone.
      }
    }
    if (notify && hadGesture) integrationRef.current.onHeldChange?.(undefined);
  }, []);

  useEffect(() => () => clear(), [clear]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const current = integrationRef.current;
      if (
        !current.pickupReady ||
        !current.scene ||
        !current.projectionRef?.current ||
        event.button !== 0 ||
        (event.buttons & 1) === 0 ||
        activePointer.current !== undefined
      ) {
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      activePointer.current = event.pointerId;
      captureOwner.current = event.currentTarget;
      lastClientY.current = event.clientY;
      releaseValid.current = false;
      previousSample.current = undefined;
      filteredVelocity.current = [0, 0];
      suppress(event);
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointer.current !== event.pointerId) return;
      suppress(event);
      const current = integrationRef.current;
      const projection = current.projectionRef?.current;
      if (!current.scene || !projection) return;

      const previous = heldRef.current;
      const lifting = Boolean(previous && (event.buttons & 2) !== 0);
      const dimensions = dimensionsRef.current;
      let next: LocalWorldDieHeldState | undefined;
      if (previous && lifting) {
        const height = Math.min(
          dimensions.holdHeightMax,
          Math.max(
            dimensions.holdHeightMin,
            previous.height - (event.clientY - lastClientY.current) * 0.01
          )
        );
        next = { position: previous.position, height };
      } else {
        const point = projection.screenToPlane(event.clientX, event.clientY);
        if (
          point &&
          isLocalWorldDieFloorPoint(current.scene, point[0], point[1])
        ) {
          next = {
            position: [point[0], point[1]],
            height: previous?.height ?? dimensions.holdHeightDefault,
          };
        }
      }
      lastClientY.current = event.clientY;
      if (!next) {
        releaseValid.current = false;
        return;
      }
      if (!lifting) releaseValid.current = true;
      const previousSampleValue = previousSample.current;
      if (previousSampleValue && (event.buttons & 2) === 0) {
        const dt = Math.max(
          1 / 240,
          Math.min(0.1, (event.timeStamp - previousSampleValue.timeMs) / 1000)
        );
        const instantX =
          (next.position[0] - previousSampleValue.position[0]) / dt;
        const instantZ =
          (next.position[1] - previousSampleValue.position[1]) / dt;
        filteredVelocity.current = [
          filteredVelocity.current[0] * 0.55 + instantX * 0.45,
          filteredVelocity.current[1] * 0.55 + instantZ * 0.45,
        ];
      }
      previousSample.current = {
        position: next.position,
        timeMs: event.timeStamp,
      };
      const frozen = Object.freeze({
        position: Object.freeze([...next.position] as [number, number]),
        height: next.height,
      });
      heldRef.current = frozen;
      setHandedOff(true);
      current.onHeldChange?.(frozen);
    },
    []
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointer.current !== event.pointerId || event.button !== 0)
        return;
      suppress(event);
      const held = heldRef.current;
      const onRelease = integrationRef.current.onRelease;
      if (held && releaseValid.current && onRelease) {
        const speed = Math.hypot(...filteredVelocity.current);
        const direction: readonly [number, number] =
          speed > 0.001
            ? [
                filteredVelocity.current[0] / speed,
                filteredVelocity.current[1] / speed,
              ]
            : [0, 0];
        const profile = createVisualThrowProfile({
          releasePosition: [0.5, 0.5],
          releaseDirection: direction,
          releaseSpeed: Math.min(1, speed / 12),
          shakeEnergy: Math.min(1, speed / 16),
          spinBias: 0,
          motionSeed: Math.imul(releaseSequence.current++, 2_654_435_761) >>> 0,
        });
        clear(false);
        onRelease(held, profile);
        return;
      }
      clear();
    },
    [clear]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointer.current !== event.pointerId) return;
      suppress(event);
      clear();
    },
    [clear]
  );

  if (props.mode === 'status') {
    return (
      <aside
        data-testid="local-world-die-tile"
        className={styles.localWorldDieTile}
        aria-label="Attack die"
        role="status"
      >
        <span className={styles.localWorldDieToken} aria-hidden="true">
          20
        </span>
        <div>
          <strong>Shared dice presentation</strong>
          <small>Throwing in the dungeon</small>
        </div>
      </aside>
    );
  }

  if (props.mode === 'fallback') {
    return (
      <aside
        data-testid="local-world-die-tile"
        className={styles.localWorldDieTile}
        aria-label="Attack die"
      >
        <span className={styles.localWorldDieToken} aria-hidden="true">
          20
        </span>
        <div>
          <strong>Dice presentation unavailable</strong>
          <small>Reveal the authoritative result</small>
        </div>
        <button type="button" onClick={props.onRevealResult}>
          Reveal result
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="local-world-die-tile"
      className={styles.localWorldDieTile}
      aria-label="Attack die"
    >
      {props.pickupReady ? (
        <button
          type="button"
          className={`${styles.localWorldDieToken} ${handedOff ? styles.localWorldDieCaptureHidden : ''}`}
          aria-label="Pick up d20"
          tabIndex={handedOff ? -1 : 0}
          aria-hidden={handedOff || undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          onContextMenu={(event) => {
            if (activePointer.current !== undefined) suppress(event);
          }}
        >
          20
        </button>
      ) : (
        <span className={styles.localWorldDieToken} aria-hidden="true">
          20
        </span>
      )}
      <div>
        <strong>
          {props.pickupReady ? 'Attack die ready' : 'Preparing die'}
        </strong>
        <small>
          {handedOff
            ? 'Carrying die in the dungeon'
            : props.pickupReady
              ? 'Drag the die onto the dungeon floor'
              : 'Loading the carved d20'}
        </small>
      </div>
      <button
        type="button"
        aria-label="Roll d20"
        disabled={handedOff || !props.onRoll}
        onClick={props.onRoll}
      >
        Roll
      </button>
    </aside>
  );
}
