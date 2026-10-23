import { useEffect, type RefObject } from 'react';

type HoverTrigger = RefObject<HTMLElement | null> | (() => HTMLElement | null);
/** Route wheel input from an inspected icon/card to that card, not the map/page. */
export function useHoverCardWheel(
  open: boolean,
  trigger: HoverTrigger,
  card: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!open) return;
    const wheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) return; // Preserve browser zoom gestures.
      const reader = card.current;
      const source =
        typeof trigger === 'function' ? trigger() : trigger.current;
      const target = event.target;
      if (
        !reader ||
        !(target instanceof Node) ||
        (!reader.contains(target) && !source?.contains(target))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const line = Number.parseFloat(getComputedStyle(reader).lineHeight) || 16;
      const xUnit =
        event.deltaMode === 1
          ? line
          : event.deltaMode === 2
            ? reader.clientWidth
            : 1;
      const yUnit =
        event.deltaMode === 1
          ? line
          : event.deltaMode === 2
            ? reader.clientHeight
            : 1;
      const sideways = event.shiftKey && event.deltaX === 0;
      const dx = (sideways ? event.deltaY : event.deltaX) * xUnit;
      const dy = (sideways ? 0 : event.deltaY) * yUnit;
      reader.scrollLeft = Math.max(
        0,
        Math.min(
          Math.max(0, reader.scrollWidth - reader.clientWidth),
          reader.scrollLeft + dx
        )
      );
      reader.scrollTop = Math.max(
        0,
        Math.min(
          Math.max(0, reader.scrollHeight - reader.clientHeight),
          reader.scrollTop + dy
        )
      );
    };
    // Capture, non-passive: consume before map listeners, including at scroll limits.
    document.addEventListener('wheel', wheel, {
      capture: true,
      passive: false,
    });
    return () =>
      document.removeEventListener('wheel', wheel, { capture: true });
  }, [open, trigger, card]);
}
