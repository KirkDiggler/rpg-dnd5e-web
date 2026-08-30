import type { Scene3D } from '@/components/session/atlasToScene3D';
import type { LocalWorldDieHeldState } from '@/components/session/local-world-die/LocalWorldDieLayer';
import { isLocalWorldDieFloorPoint } from '@/components/session/local-world-die/localWorldDieFloor';
import type { TrayPlaneProjection } from '@/components/ui/dice/trayPlaneProjection';
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
  readonly mode: 'ready' | 'fallback';
  readonly pickupReady?: boolean;
  readonly scene?: Scene3D;
  readonly projectionRef?: MutableRefObject<TrayPlaneProjection | undefined>;
  readonly onHeldChange?: (held: LocalWorldDieHeldState | undefined) => void;
  readonly onRevealResult?: () => void;
}

function suppress(event: { preventDefault(): void; stopPropagation(): void }) {
  event.preventDefault();
  event.stopPropagation();
}

export function LocalWorldDieTile(props: LocalWorldDieTileProps) {
  const integrationRef = useRef(props);
  integrationRef.current = props;
  const activePointer = useRef<number | undefined>(undefined);
  const captureOwner = useRef<HTMLButtonElement | undefined>(undefined);
  const heldRef = useRef<LocalWorldDieHeldState | undefined>(undefined);
  const lastClientY = useRef(0);
  const [handedOff, setHandedOff] = useState(false);

  const clear = useCallback((notify = true) => {
    const pointerId = activePointer.current;
    const owner = captureOwner.current;
    activePointer.current = undefined;
    captureOwner.current = undefined;
    heldRef.current = undefined;
    setHandedOff(false);
    if (pointerId !== undefined && owner?.hasPointerCapture(pointerId)) {
      try {
        owner.releasePointerCapture(pointerId);
      } catch {
        // Capture may already be gone.
      }
    }
    if (notify) integrationRef.current.onHeldChange?.(undefined);
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
      let next: LocalWorldDieHeldState | undefined;
      if (previous && (event.buttons & 2) !== 0) {
        const height = Math.min(
          3,
          Math.max(
            0.35,
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
            height: previous?.height ?? 1.25,
          };
        }
      }
      lastClientY.current = event.clientY;
      if (!next) return;
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
        disabled
        title="Live Roll arrives with release physics"
      >
        Roll d20
      </button>
    </aside>
  );
}
