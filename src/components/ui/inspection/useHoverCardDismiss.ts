import { useEffect, type RefObject } from 'react';

/** Bounded pointer travel, not a pin: also handles a single coalesced move off the icon. */
export function useHoverCardDismiss(
  open: boolean,
  trigger: RefObject<HTMLElement | null>,
  card: RefObject<HTMLElement | null>,
  onOpenChange: (open: boolean) => void
): void {
  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const inside = (target: EventTarget | null): boolean =>
      target instanceof Node &&
      Boolean(
        trigger.current?.contains(target) || card.current?.contains(target)
      );
    const track = (target: EventTarget | null): void => {
      if (inside(target)) {
        cancel();
        return;
      }
      if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          onOpenChange(false);
        }, 100);
    };
    const move = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') track(event.target);
    };
    const leave = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') track(event.relatedTarget);
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerout', leave, true);
    return () => {
      cancel();
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerout', leave, true);
    };
  }, [open, trigger, card, onOpenChange]);
}
