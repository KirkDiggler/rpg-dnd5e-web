import { forwardRef } from 'react';
import { cn } from '../../../utils/cn';

/**
 * Responsive grid system for consistent layouts
 */
export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns */
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
  /** Gap between grid items */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Responsive breakpoints */
  responsive?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

const colClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
};

const gapClasses = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

export const Grid = forwardRef<HTMLDivElement, GridProps>(
  ({ className, cols = 3, gap = 'md', responsive, ...props }, ref) => {
    const responsiveClasses = responsive
      ? [
          responsive.sm && `sm:grid-cols-${responsive.sm}`,
          responsive.md && `md:grid-cols-${responsive.md}`,
          responsive.lg && `lg:grid-cols-${responsive.lg}`,
          responsive.xl && `xl:grid-cols-${responsive.xl}`,
        ].filter(Boolean)
      : [];

    return (
      <div
        ref={ref}
        className={cn(
          'grid',
          colClasses[cols],
          gapClasses[gap],
          ...responsiveClasses,
          className
        )}
        {...props}
      />
    );
  }
);

Grid.displayName = 'Grid';

/**
 * Grid item component with span controls
 */
export interface GridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns to span */
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'full';
  /** Start position */
  start?: number;
  /** End position */
  end?: number;
}

const spanClasses = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  12: 'col-span-12',
  full: 'col-span-full',
};

export const GridItem = forwardRef<HTMLDivElement, GridItemProps>(
  ({ className, span = 1, start, end, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          spanClasses[span],
          start && `col-start-${start}`,
          end && `col-end-${end}`,
          className
        )}
        {...props}
      />
    );
  }
);

GridItem.displayName = 'GridItem';
