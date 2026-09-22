export type QuickOverflowGroup = 'cantrips' | 'features';
export interface QuickOverflowInput {
  available: number;
  fixed: readonly number[];
  cantrips: readonly number[];
  features: readonly number[];
  menuWidths: Record<QuickOverflowGroup, number>;
  gap: number;
}
/** Measured CSS pixels, not a device guess or an action-count breakpoint. */
export function quickOverflow(input: QuickOverflowInput): QuickOverflowGroup[] {
  const collapsed: QuickOverflowGroup[] = [];
  const occupied = () => {
    const widths = [...input.fixed];
    for (const group of ['cantrips', 'features'] as const) {
      if (!input[group].length) continue;
      widths.push(
        ...(collapsed.includes(group)
          ? [input.menuWidths[group]]
          : input[group])
      );
    }
    return (
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, widths.length - 1) * input.gap
    );
  };
  for (const group of ['cantrips', 'features'] as const) {
    if (occupied() <= input.available) break;
    const widths = input[group];
    const expandedWidth =
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, widths.length - 1) * input.gap;
    if (widths.length && input.menuWidths[group] < expandedWidth)
      collapsed.push(group);
  }
  // If even fixed controls cannot fit, the row scrolls; no offer is discarded.
  return collapsed;
}
