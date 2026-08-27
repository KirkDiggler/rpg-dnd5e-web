import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  createAnchoredRollGroupGestureController,
  type AnchoredHeldRollGroupState,
  type AnchoredRollGroupGestureController,
} from './anchoredRollGroupGestureController';
import {
  createRollGroupGestureController,
  type ClientBounds,
  type HeldRollGroupState,
  type RollGroupGestureController,
  type RollGroupPointerSample,
} from './rollGroupGestureController';
import type {
  TrayPlanePoint,
  TrayPlaneProjection,
} from './trayPlaneProjection';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

export type DiceTrayInteractionMode = 'legacy-normalized' | 'tray-plane';
export type DiceTrayInteractionHeldState =
  | HeldRollGroupState
  | AnchoredHeldRollGroupState;

export interface DiceTrayInteractionHitRegion {
  readonly dieId: string;
  readonly bounds: ClientBounds;
  readonly memberAnchor: TrayPlanePoint;
  readonly stableIndex: number;
}

interface DiceTrayInteractionSurfaceBaseProps {
  readonly canInteract: boolean;
  readonly motionSeed: number;
  readonly resetKey?: number;
  readonly onHeldChange: (
    held: DiceTrayInteractionHeldState | undefined
  ) => void;
  readonly onReleaseRequest?: (throwProfile?: VisualThrowProfileV1) => void;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly grabLabel?: string;
}

export interface LegacyNormalizedDiceTrayInteractionSurfaceProps extends DiceTrayInteractionSurfaceBaseProps {
  readonly mode: 'legacy-normalized';
}

export interface TrayPlaneDiceTrayInteractionSurfaceProps extends DiceTrayInteractionSurfaceBaseProps {
  readonly mode: 'tray-plane';
  readonly projection?: TrayPlaneProjection;
  readonly hitRegions?: readonly DiceTrayInteractionHitRegion[];
  readonly getHitRegions?: () => readonly DiceTrayInteractionHitRegion[];
}

export type DiceTrayInteractionSurfaceProps =
  | LegacyNormalizedDiceTrayInteractionSurfaceProps
  | TrayPlaneDiceTrayInteractionSurfaceProps;

type SurfaceController =
  | RollGroupGestureController
  | AnchoredRollGroupGestureController;

type PointerElement = HTMLDivElement;

function snapshotBounds(rect: DOMRect): ClientBounds {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function pointerSample(
  event: ReactPointerEvent<PointerElement>
): RollGroupPointerSample {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    timeMs: event.timeStamp,
  };
}

export function DiceTrayInteractionSurface({
  mode,
  canInteract,
  motionSeed,
  resetKey = 0,
  onHeldChange,
  onReleaseRequest,
  children,
  className,
  testId,
  grabLabel,
  ...modeProps
}: DiceTrayInteractionSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const grabTargetRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<SurfaceController | undefined>(undefined);
  const previousResetKey = useRef(resetKey);
  const previousMode = useRef(mode);
  const trayPlaneProps = modeProps as Omit<
    TrayPlaneDiceTrayInteractionSurfaceProps,
    keyof DiceTrayInteractionSurfaceBaseProps | 'mode'
  >;
  const [held, setHeld] = useState<DiceTrayInteractionHeldState | undefined>(
    undefined
  );
  const setHeldState = useCallback(
    (next: DiceTrayInteractionHeldState | undefined) => {
      setHeld(next);
      onHeldChange(next);
    },
    [onHeldChange]
  );
  const resetController = useCallback(() => {
    controllerRef.current?.reset();
    controllerRef.current = undefined;
    setHeldState(undefined);
  }, [setHeldState]);

  useLayoutEffect(() => {
    const identityChanged = previousMode.current !== mode;
    const resetChanged = previousResetKey.current !== resetKey;
    previousMode.current = mode;
    previousResetKey.current = resetKey;
    if (!canInteract || identityChanged || resetChanged) resetController();
  }, [canInteract, mode, resetController, resetKey]);

  useEffect(
    () => () => {
      controllerRef.current?.reset();
      controllerRef.current = undefined;
    },
    []
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<PointerElement>) => {
      if (!canInteract || !surfaceRef.current) return;
      const controller =
        controllerRef.current ??
        (mode === 'legacy-normalized'
          ? createRollGroupGestureController()
          : createAnchoredRollGroupGestureController());
      controllerRef.current = controller;
      const sample = pointerSample(event);
      let next: DiceTrayInteractionHeldState | undefined;
      if (mode === 'legacy-normalized') {
        const grabTarget = grabTargetRef.current;
        if (!grabTarget) return;
        const legacyController = controller as RollGroupGestureController;
        next = legacyController.begin({
          sample,
          captureTarget: event.currentTarget,
          trayBounds: snapshotBounds(
            surfaceRef.current.getBoundingClientRect()
          ),
          hitBounds: snapshotBounds(grabTarget.getBoundingClientRect()),
          hitPaddingPx: event.pointerType === 'touch' ? 24 : 14,
          motionSeed,
        });
      } else {
        const projection = trayPlaneProps.projection;
        const hitRegions =
          trayPlaneProps.getHitRegions?.() ?? trayPlaneProps.hitRegions;
        if (!projection || !hitRegions) return;
        const anchoredController =
          controller as AnchoredRollGroupGestureController;
        next = anchoredController.begin({
          sample,
          captureTarget: event.currentTarget,
          projection,
          hitRegions,
          hitPaddingPx: event.pointerType === 'touch' ? 24 : 14,
          motionSeed,
        });
      }
      if (next) setHeldState(next);
    },
    [canInteract, mode, motionSeed, setHeldState, trayPlaneProps]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<PointerElement>) => {
      if (!controllerRef.current) return;
      const next = controllerRef.current.move(pointerSample(event));
      if (next) setHeldState(next);
      else if (!controllerRef.current.held()) setHeldState(undefined);
    },
    [setHeldState]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<PointerElement>) => {
      const controller = controllerRef.current;
      if (!controller) return;
      const throwProfile = controller.release(pointerSample(event));
      if (!throwProfile) {
        if (!controller.held()) setHeldState(undefined);
        return;
      }
      setHeldState(undefined);
      onReleaseRequest?.(throwProfile);
    },
    [onReleaseRequest, setHeldState]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<PointerElement>) => {
      if (controllerRef.current?.cancel(event.pointerId))
        setHeldState(undefined);
    },
    [setHeldState]
  );

  const handleGrabClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0 || controllerRef.current?.held()) return;
      onReleaseRequest?.(undefined);
    },
    [onReleaseRequest]
  );

  return (
    <div
      ref={surfaceRef}
      className={className}
      data-testid={testId}
      data-grabbed={held !== undefined ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    >
      {children}
      {canInteract && grabLabel && (
        <button
          ref={grabTargetRef}
          type="button"
          className="dice-tray-3d-grab-target"
          aria-label={grabLabel}
          data-grabbed={held !== undefined ? 'true' : 'false'}
          onClick={handleGrabClick}
        />
      )}
    </div>
  );
}
