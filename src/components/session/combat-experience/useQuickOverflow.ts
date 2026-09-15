import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useLayoutEffect, useState, type RefObject } from 'react';
import type { OrganizedActionPresentation } from './organizedActionPresentation';
import { quickOverflow, type QuickOverflowGroup } from './quickOverflow';

/** Measure the uncollapsed controls against the owning row, never against the
 * shrunken result. This lets a resize expand the bar again without oscillation. */
export function useQuickOverflow(
  rootRef: RefObject<HTMLDivElement | null>,
  measureRef: RefObject<HTMLDivElement | null>,
  offers: readonly Declaration[],
  groups: OrganizedActionPresentation['quickGroupByDeclarationId'],
  hasCancel: boolean
): QuickOverflowGroup[] {
  const [collapsed, setCollapsed] = useState<QuickOverflowGroup[]>([]);
  useLayoutEffect(() => {
    const root = rootRef.current,
      measure = measureRef.current,
      row = root?.parentElement;
    if (!root || !measure || !row) return;
    const update = () => {
      const rowStyle = getComputedStyle(row),
        rootStyle = getComputedStyle(root);
      const pixels = (value: string) => Number.parseFloat(value) || 0;
      const available =
        row.clientWidth -
        pixels(rowStyle.paddingLeft) -
        pixels(rowStyle.paddingRight) -
        pixels(rootStyle.paddingLeft) -
        pixels(rootStyle.paddingRight) -
        pixels(rootStyle.borderLeftWidth) -
        pixels(rootStyle.borderRightWidth);
      if (available <= 0) return; // No layout yet (also SSR/jsdom); don't guess a device.
      const widths = {
        fixed: [] as number[],
        cantrips: [] as number[],
        features: [] as number[],
      };
      for (const item of measure.querySelectorAll<HTMLElement>(
        '[data-quick-measure]'
      )) {
        const group = item.dataset.quickGroup;
        widths[
          group === 'cantrips' || group === 'features' ? group : 'fixed'
        ].push(item.getBoundingClientRect().width);
      }
      const menuWidth = (group: QuickOverflowGroup) =>
        measure
          .querySelector<HTMLElement>(`[data-quick-menu="${group}"]`)
          ?.getBoundingClientRect().width ?? 0;
      const next = quickOverflow({
        available,
        ...widths,
        gap: pixels(getComputedStyle(measure).columnGap),
        menuWidths: {
          cantrips: menuWidth('cantrips'),
          features: menuWidth('features'),
        },
      });
      setCollapsed((current) =>
        current.join() === next.join() ? current : next
      );
    };
    update();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(row);
    observer?.observe(measure);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [rootRef, measureRef, offers, groups, hasCancel]);
  return collapsed;
}
