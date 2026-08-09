/**
 * Pure scroll-pin math for CombatLog's auto-follow behavior (#738). Split
 * out of CombatLog.tsx itself so the component file keeps its
 * component-only export shape (react-refresh/only-export-components) — the
 * predicate is tested directly here without mocking a DOM layout, since
 * jsdom never computes real scrollHeight/clientHeight values.
 */

/** Slack (px) before "scrolled up" registers, so a scroll position that's
 * merely a hair off the very bottom (e.g. mid-momentum-scroll) doesn't
 * flicker the jump-to-latest affordance on and off. */
export const SCROLL_PIN_THRESHOLD_PX = 24;

/**
 * Whether the panel is scrolled far enough from the newest entry that
 * auto-follow should pause.
 */
export function isScrolledAwayFromBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx: number = SCROLL_PIN_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight > thresholdPx;
}
