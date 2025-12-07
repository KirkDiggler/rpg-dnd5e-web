import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '../../utils/cn';

/**
 * Enhanced Button component with consistent styling, variants, and accessibility.
 * Uses theme CSS variables and provides loading states, icons, and proper motion.
 */

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'size'> {
  /** Button style variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'dice';
  /** Button size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Loading state */
  loading?: boolean;
  /** Icon to display before text */
  icon?: React.ReactNode;
  /** Icon to display after text */
  iconAfter?: React.ReactNode;
  /** Full width button */
  fullWidth?: boolean;
  /** Disable animations */
  noAnimation?: boolean;
}

const variantClasses = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'bg-red-600 hover:bg-red-700 text-white border border-red-500',
  ghost:
    'bg-transparent hover:bg-black hover:bg-opacity-10 text-current border border-current border-opacity-20',
  dice: 'btn-dice',
};

const sizeClasses = {
  xs: 'text-xs px-2 py-1',
  sm: 'text-sm px-3 py-1.5',
  md: 'text-base px-4 py-2',
  lg: 'text-lg px-6 py-3',
  xl: 'text-xl px-8 py-4',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconAfter,
      fullWidth = false,
      noAnimation = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        className={cn(
          // Base button styles
          'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',

          // Variant styles
          variant !== 'dice' && variantClasses[variant],
          variant === 'dice' && variantClasses[variant],

          // Size styles (not applied to dice variant)
          variant !== 'dice' && sizeClasses[size],

          // Width
          fullWidth && 'w-full',

          // Disabled styles
          isDisabled && 'opacity-50 cursor-not-allowed',

          // Custom classes
          className
        )}
        // Motion props
        whileHover={!isDisabled && !noAnimation ? { scale: 1.02 } : undefined}
        whileTap={!isDisabled && !noAnimation ? { scale: 0.98 } : undefined}
        disabled={isDisabled}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
        )}

        {/* Leading icon */}
        {icon && !loading && <span className="flex-shrink-0">{icon}</span>}

        {/* Button content */}
        {children && (
          <span className={loading ? 'opacity-75' : ''}>
            {children as React.ReactNode}
          </span>
        )}

        {/* Trailing icon */}
        {iconAfter && !loading && (
          <span className="flex-shrink-0">{iconAfter}</span>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

/**
 * Icon button variant - square button optimized for icons
 */
export interface IconButtonProps extends Omit<
  ButtonProps,
  'icon' | 'iconAfter' | 'children'
> {
  /** Icon to display */
  icon: React.ReactNode;
  /** Accessibility label */
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'md', className, ...props }, ref) => {
    const iconSizeClasses = {
      xs: 'w-6 h-6',
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12',
      xl: 'w-14 h-14',
    };

    return (
      <Button
        ref={ref}
        size={size}
        className={cn('p-0 aspect-square', iconSizeClasses[size], className)}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

/**
 * Button group for related actions
 */
export interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}

export function ButtonGroup({
  children,
  className,
  orientation = 'horizontal',
}: ButtonGroupProps) {
  return (
    <div
      className={cn(
        'inline-flex',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        '[&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md',
        orientation === 'vertical' &&
          '[&>button:first-child]:rounded-t-md [&>button:first-child]:rounded-l-none [&>button:last-child]:rounded-b-md [&>button:last-child]:rounded-r-none',
        '[&>button:not(:last-child)]:border-r-0',
        orientation === 'vertical' &&
          '[&>button:not(:last-child)]:border-r [&>button:not(:last-child)]:border-b-0',
        className
      )}
    >
      {/* Pass down props to child buttons */}
      {/* Note: This would require React.cloneElement or context pattern for full implementation */}
      {children}
    </div>
  );
}

/**
 * Floating Action Button for primary actions
 */
export interface FabProps extends Omit<ButtonProps, 'variant' | 'size'> {
  /** Size of the FAB */
  size?: 'sm' | 'md' | 'lg';
  /** Position on screen */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export const Fab = forwardRef<HTMLButtonElement, FabProps>(
  ({ size = 'md', position = 'bottom-right', className, ...props }, ref) => {
    const fabSizes = {
      sm: 'w-12 h-12',
      md: 'w-14 h-14',
      lg: 'w-16 h-16',
    };

    const positions = {
      'bottom-right': 'fixed bottom-6 right-6',
      'bottom-left': 'fixed bottom-6 left-6',
      'top-right': 'fixed top-6 right-6',
      'top-left': 'fixed top-6 left-6',
    };

    return (
      <Button
        ref={ref}
        variant="primary"
        className={cn(
          'rounded-full shadow-lg hover:shadow-xl',
          fabSizes[size],
          positions[position],
          'z-50',
          className
        )}
        {...props}
      />
    );
  }
);

Fab.displayName = 'Fab';
