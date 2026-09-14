/** Touch gesture ownership only. Camera projection and game intent stay with callers. */
export interface ScreenPanDelta {
  dx: number;
  dy: number;
}
export interface TouchPanInput {
  canvas: HTMLCanvasElement;
  onPan: (delta: ScreenPanDelta) => void;
}
interface Gesture {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  panning: boolean;
  cancelled: boolean;
}
const PAN_THRESHOLD_PX = 6;

/**
 * Opt-in canvas binding. A tap is left to the existing event manager; a claimed
 * or interrupted drag consumes its compatibility click in capture phase before
 * the renderer can turn it into an action. No timers or synthetic game clicks.
 * A second finger cancels this increment (pinch/rotation are not implemented).
 */
export function bindTouchPan({ canvas, onPan }: TouchPanInput): () => void {
  const originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  const touches = new Set<number>();
  let gesture: Gesture | null = null;
  let suppressClick = false;

  const releaseCapture = (id: number): void => {
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  const cancelGesture = (): void => {
    if (gesture) {
      gesture.cancelled = true;
      suppressClick = true;
    }
  };
  const trackDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') {
      // A genuine mouse/pen press is new input, not a touch-generated click.
      if (!gesture) suppressClick = false;
      return;
    }
    touches.add(event.pointerId);
    if (touches.size > 1) cancelGesture();
  };
  const begin = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    touches.add(event.pointerId);
    if (gesture) {
      if (gesture.id !== event.pointerId) cancelGesture();
      return;
    }
    gesture = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      panning: false,
      cancelled: touches.size !== 1,
    };
    suppressClick = gesture.cancelled;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // The pointer can already have gone away by the time capture is asked.
      cancelGesture();
    }
  };
  const move = (event: PointerEvent): void => {
    if (
      event.pointerType !== 'touch' ||
      !gesture ||
      gesture.id !== event.pointerId ||
      gesture.cancelled
    )
      return;
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
    if (gesture?.id === event.pointerId) {
      suppressClick =
        suppressClick ||
        event.type === 'pointercancel' ||
        gesture.cancelled ||
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY
        ) > PAN_THRESHOLD_PX;
      gesture = null; // releaseCapture may synchronously emit lostpointercapture.
      if (suppressClick) event.preventDefault();
      releaseCapture(event.pointerId);
    }
  };
  const lostCapture = (event: PointerEvent): void => {
    if (gesture?.id === event.pointerId) cancelGesture();
  };
  const abandon = (): void => {
    const id = gesture?.id;
    cancelGesture();
    gesture = null;
    touches.clear();
    if (id !== undefined) releaseCapture(id);
  };
  const visibilityChanged = (): void => {
    if (document.visibilityState === 'hidden') abandon();
  };
  const guardClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  // Window tracking handles leaving the map and a second finger on HUD chrome.
  // No HUD event is cancelled or turned into pan unless a canvas gesture owns it.
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
