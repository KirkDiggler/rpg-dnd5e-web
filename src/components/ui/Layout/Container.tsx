import { forwardRef } from 'react';
import { cn } from '../../../utils/cn';

/**
 * Container component for consistent max-width and centering
 */
export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Container size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Whether to center the container */
  center?: boolean;
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-7xl',
  full: 'max-w-full',
};

const paddingClasses = {
  none: '',
  sm: 'px-4',
  md: 'px-6',
  lg: 'px-8',
};

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  (
    { className, size = 'xl', center = true, padding = 'md', ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'w-full',
          sizeClasses[size],
          center && 'mx-auto',
          paddingClasses[padding],
          className
        )}
        {...props}
      />
    );
  }
);

Container.displayName = 'Container';
