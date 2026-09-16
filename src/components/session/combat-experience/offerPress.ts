export interface OfferPressBinding {
  dispose: () => void;
  isTouchInput: () => boolean;
}

/** One gesture owner survives the menu offer being removed by inspection. */
export function bindOfferPress(
  root: HTMLElement,
  inspect: (id: string) => void
): OfferPressBinding {
  let active: {
    id: number;
    x: number;
    y: number;
    element: HTMLElement;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let suppressClick = false;
  let touchInput = false;
  const abandon = (suppress = true) => {
    if (!active) return;
    clearTimeout(active.timer);
    active = null;
    if (suppress) suppressClick = true;
  };
  const startInput = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && event.isPrimary === false) {
      abandon();
      return;
    }
    abandon(false);
    suppressClick = false; // A fresh gesture is never poisoned by an old cancellation.
    touchInput = event.pointerType === 'touch';
  };
  const startHold = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || event.isPrimary === false) return;
    const element =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-offer-id]')
        : null;
    if (!element || !root.contains(element)) return;
    active = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      element,
      timer: setTimeout(() => {
        if (!active) return;
        suppressClick = true;
        if (!element.isConnected || !root.contains(element)) {
          abandon();
          return;
        }
        // Keep the release on the surviving surface when inspection closes a menu.
        // The window click guard also covers browsers that release capture on removal.
        try {
          root.setPointerCapture?.(event.pointerId);
        } catch {
          /* capture is optional */
        }
        inspect(element.dataset.offerId!);
      }, 450),
    };
  };
  const move = (event: PointerEvent) => {
    if (
      active?.id === event.pointerId &&
      Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8
    )
      abandon();
  };
  const end = (event: PointerEvent) => {
    if (active?.id === event.pointerId) abandon(false);
  };
  const cancel = (event: PointerEvent) => {
    if (active?.id === event.pointerId) abandon();
  };
  const blur = () => abandon();
  const keyboard = () => {
    touchInput = false;
  };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const contextMenu = (event: MouseEvent) => {
    if (
      touchInput &&
      event.target instanceof Element &&
      event.target.closest('[data-offer-id]')
    )
      event.preventDefault();
  };
  window.addEventListener('pointerdown', startInput, true);
  root.addEventListener('pointerdown', startHold);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', cancel, true);
  root.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', blur);
  window.addEventListener('keydown', keyboard, true);
  window.addEventListener('click', click, true);
  root.addEventListener('contextmenu', contextMenu);
  return {
    isTouchInput: () => touchInput,
    dispose: () => {
      const pointerId = active?.id;
      abandon(false);
      if (pointerId !== undefined && root.hasPointerCapture?.(pointerId))
        root.releasePointerCapture(pointerId);
      window.removeEventListener('pointerdown', startInput, true);
      root.removeEventListener('pointerdown', startHold);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', cancel, true);
      root.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('click', click, true);
      root.removeEventListener('contextmenu', contextMenu);
    },
  };
}
