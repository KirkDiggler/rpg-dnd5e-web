/** Gesture ownership only. Camera projection and game intent stay with callers. */
export interface ScreenPoint {
  x: number;
  y: number;
}
export interface ScreenPanDelta {
  dx: number;
  dy: number;
}
export interface ScreenPinchDelta {
  scale: number;
  from: ScreenPoint;
  to: ScreenPoint;
}
export interface TouchPanInput {
  canvas: HTMLCanvasElement;
  onPan: (delta: ScreenPanDelta) => void;
  /** Omitted retains the one-finger-only policy: a second finger cancels. */
  onPinch?: (delta: ScreenPinchDelta) => void;
}
interface Gesture {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  panning: boolean;
}
interface Pinch {
  midpoint: ScreenPoint;
  span: number;
}
const PAN_THRESHOLD_PX = 6;
const MIN_PINCH_SPAN_PX = 8;

/**
 * Canvas-only touch gestures, with window tracking for release and interruption.
 * Two canvas-origin fingers may pinch; a HUD finger/third finger cancels until
 * all fingers lift. Pinch -> one finger continues a claimed pan, never a tap.
 * Claimed/interrupted gestures consume compatibility clicks before the renderer.
 */
export function bindTouchPan({
  canvas,
  onPan,
  onPinch,
}: TouchPanInput): () => void {
  const originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  const touches = new Map<number, ScreenPoint>();
  const owned = new Set<number>();
  let gesture: Gesture | null = null;
  let pinch: Pinch | null = null;
  let blocked = false;
  let suppressClick = false;

  const point = (event: PointerEvent): ScreenPoint => ({
    x: event.clientX,
    y: event.clientY,
  });
  const newPan = (id: number, at: ScreenPoint, panning = false): Gesture => ({
    id,
    startX: at.x,
    startY: at.y,
    lastX: at.x,
    lastY: at.y,
    panning,
  });
  const measurePinch = (): Pinch | null => {
    const [first, second] = [...owned].map((id) => touches.get(id));
    if (owned.size !== 2 || !first || !second) return null;
    return {
      midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      span: Math.hypot(first.x - second.x, first.y - second.y),
    };
  };
  const releaseCapture = (id: number): void => {
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  const cancelGesture = (): void => {
    if (owned.size || gesture || pinch) {
      blocked = true;
      suppressClick = true;
      gesture = null;
      pinch = null;
    }
  };
  const capture = (id: number): void => {
    try {
      canvas.setPointerCapture?.(id);
    } catch {
      cancelGesture();
    }
  };
  const trackDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') {
      if (!owned.size) suppressClick = false;
      return;
    }
    touches.set(event.pointerId, point(event));
    if (
      owned.size &&
      touches.size > 1 &&
      (touches.size !== 2 || event.target !== canvas || !onPinch)
    )
      cancelGesture();
  };
  const begin = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || owned.has(event.pointerId)) return;
    touches.set(event.pointerId, point(event));
    owned.add(event.pointerId);
    if (blocked) return;
    if (touches.size === 1) {
      gesture = newPan(event.pointerId, point(event));
      pinch = null;
      suppressClick = false;
    } else if (touches.size === 2 && owned.size === 2 && onPinch) {
      gesture = null;
      pinch = measurePinch();
      suppressClick = true;
      if (!pinch) cancelGesture();
    } else {
      cancelGesture();
    }
    if (!blocked) capture(event.pointerId);
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    if (touches.has(event.pointerId))
      touches.set(event.pointerId, point(event));
    if (!owned.has(event.pointerId) || blocked) return;
    if (pinch) {
      const previous = pinch;
      const next = measurePinch();
      if (!next) {
        cancelGesture();
        return;
      }
      pinch = next;
      event.preventDefault();
      // Nearly coincident contacts establish a fresh baseline; never divide by
      // zero or turn a one-pixel separation into a huge jump.
      if (
        previous.span >= MIN_PINCH_SPAN_PX &&
        next.span >= MIN_PINCH_SPAN_PX
      ) {
        onPinch?.({
          scale: next.span / previous.span,
          from: previous.midpoint,
          to: next.midpoint,
        });
      }
      return;
    }
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!gesture.panning) {
      if (
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY
        ) <= PAN_THRESHOLD_PX
      )
        return;
      gesture.panning = true;
      suppressClick = true;
    }
    event.preventDefault();
    const dx = event.clientX - gesture.lastX;
    const dy = event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    if (dx !== 0 || dy !== 0) onPan({ dx, dy });
  };
  const finish = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    touches.delete(event.pointerId);
    const wasOwned = owned.delete(event.pointerId);
    if (wasOwned) {
      if (event.type === 'pointercancel') {
        // This pointer was ours even if removing it emptied the set.
        suppressClick = true;
        blocked = true;
        gesture = null;
        pinch = null;
      } else if (gesture?.id === event.pointerId) {
        suppressClick =
          suppressClick ||
          gesture.panning ||
          Math.hypot(
            event.clientX - gesture.startX,
            event.clientY - gesture.startY
          ) > PAN_THRESHOLD_PX;
        gesture = null;
      } else if (pinch && !blocked) {
        pinch = null;
        suppressClick = true;
        const [id] = owned;
        const remaining = id === undefined ? undefined : touches.get(id);
        if (
          owned.size === 1 &&
          touches.size === 1 &&
          id !== undefined &&
          remaining
        ) {
          gesture = newPan(id, remaining, true);
        }
      }
      if (suppressClick) event.preventDefault();
      // Remove ownership before releasing: lostpointercapture must not cancel
      // the surviving finger after an ordinary pinch -> pan transition.
      releaseCapture(event.pointerId);
    }
    if (!touches.size) {
      owned.clear();
      gesture = null;
      pinch = null;
      blocked = false;
      // Keep click suppression until the next fresh press.
    }
  };
  const lostCapture = (event: PointerEvent): void => {
    if (owned.has(event.pointerId)) cancelGesture();
  };
  const abandon = (): void => {
    const ids = [...owned];
    if (ids.length) suppressClick = true;
    owned.clear();
    touches.clear();
    gesture = null;
    pinch = null;
    blocked = false;
    ids.forEach(releaseCapture);
  };
  const visibilityChanged = (): void => {
    if (document.visibilityState === 'hidden') abandon();
  };
  const guardClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener('pointerdown', trackDown, true);
  window.addEventListener('pointermove', move, {
    capture: true,
    passive: false,
  });
  window.addEventListener('pointerup', finish, true);
  window.addEventListener('pointercancel', finish, true);
  window.addEventListener('blur', abandon);
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('pointerdown', begin, true);
  canvas.addEventListener('lostpointercapture', lostCapture);
  canvas.addEventListener('click', guardClick, true);
  canvas.addEventListener('dblclick', guardClick, true);
  return () => {
    abandon();
    window.removeEventListener('pointerdown', trackDown, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', finish, true);
    window.removeEventListener('pointercancel', finish, true);
    window.removeEventListener('blur', abandon);
    document.removeEventListener('visibilitychange', visibilityChanged);
    canvas.removeEventListener('pointerdown', begin, true);
    canvas.removeEventListener('lostpointercapture', lostCapture);
    canvas.removeEventListener('click', guardClick, true);
    canvas.removeEventListener('dblclick', guardClick, true);
    canvas.style.touchAction = originalTouchAction;
  };
}
