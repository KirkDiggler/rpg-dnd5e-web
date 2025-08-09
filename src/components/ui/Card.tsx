import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '../../utils/cn';

/**
 * Enhanced Card component with consistent theming, variants, and composition patterns.
 * Supports game rarity system, hover effects, and flexible content areas.
 */

export interface CardProps extends HTMLMotionProps<'div'> {
  /** Card variant for different use cases */
  variant?: 'default' | 'elevated' | 'outline' | 'filled';
  /** Game item rarity for special styling */
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Whether card is interactive */
  interactive?: boolean;
  /** Whether card is selected */
  selected?: boolean;
  /** Disable hover effects */
  noHover?: boolean;
  /** Custom header content */
  header?: React.ReactNode;
  /** Custom footer content */
  footer?: React.ReactNode;
}

const variantClasses = {
  default: 'game-card',
  elevated: 'game-card shadow-lg',
  outline: 'border-2 border-current border-opacity-20 bg-transparent',
  filled: 'border-0',
};

const rarityClasses = {
  common: 'glow-common border-gray-400',
  uncommon: 'glow-uncommon border-green-400',
  rare: 'glow-rare border-blue-400',
  epic: 'glow-epic border-purple-400',
  legendary: 'glow-legendary border-orange-400',
};

const paddingClasses = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = 'default',
      rarity,
      padding = 'md',
      interactive = false,
      selected = false,
      noHover = false,
      header,
      footer,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          // Base styles
          'relative overflow-hidden',

          // Variant styles
          variantClasses[variant],

          // Rarity styles
          rarity && rarityClasses[rarity],

          // Padding
          !header && !footer && paddingClasses[padding],

          // Interactive states
          interactive && 'cursor-pointer',
          selected && 'ring-2 ring-blue-400 ring-opacity-60',

          // Custom classes
          className
        )}
        // Motion effects
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={
          !noHover && interactive ? { scale: 1.02, y: -4 } : undefined
        }
        whileTap={interactive ? { scale: 0.98 } : undefined}
        {...props}
      >
        {/* Selection indicator */}
        {selected && (
          <motion.div
            className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </motion.div>
        )}

        {/* Header */}
        {header && (
          <div
            className={cn(
              'border-b px-4 py-3',
              paddingClasses[padding].replace('p-', 'px-')
            )}
            style={{ borderColor: 'var(--border-primary)' }}
          >
            {header}
          </div>
        )}

        {/* Content */}
        <div
          className={cn(
            header || footer ? paddingClasses[padding] : '',
            'flex-1'
          )}
        >
          {children as React.ReactNode}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'border-t px-4 py-3',
              paddingClasses[padding].replace('p-', 'px-')
            )}
            style={{ borderColor: 'var(--border-primary)' }}
          >
            {footer}
          </div>
        )}

        {/* Shimmer effect for legendary items */}
        {rarity === 'legendary' && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatDelay: 3,
              ease: 'easeInOut',
            }}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';

/**
 * Card header component with title and optional actions
 */
export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between', className)}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {icon && <div className="flex-shrink-0 text-xl">{icon}</div>}
        <div className="min-w-0">
          <h3
            className="font-bold text-lg truncate"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              className="text-sm mt-1 truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex-shrink-0 ml-2">{actions}</div>}
    </div>
  );
}

/**
 * Card footer with common action patterns
 */
export interface CardFooterProps {
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  metadata?: React.ReactNode;
  className?: string;
}

export function CardFooter({
  primaryAction,
  secondaryAction,
  metadata,
  className,
}: CardFooterProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {/* Metadata section */}
      <div className="flex-1 min-w-0">{metadata}</div>

      {/* Actions section */}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="btn-secondary text-sm px-3 py-1"
            >
              {secondaryAction.label}
            </button>
          )}

          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.loading}
              className="btn-primary text-sm px-3 py-1"
            >
              {primaryAction.loading ? (
                <div className="flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent" />
                  {primaryAction.label}
                </div>
              ) : (
                primaryAction.label
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Simple stats card for displaying key-value pairs
 */
export interface StatsCardProps extends Omit<CardProps, 'children'> {
  title: string;
  stats: Array<{
    label: string;
    value: string | number;
    icon?: React.ReactNode;
    color?: string;
  }>;
}

export function StatsCard({ title, stats, ...cardProps }: StatsCardProps) {
  return (
    <Card {...cardProps}>
      <CardHeader title={title} />

      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="text-center">
            {stat.icon && (
              <div className="text-2xl mb-1 flex justify-center">
                {stat.icon}
              </div>
            )}
            <div
              className="text-2xl font-bold"
              style={{
                color: stat.color || 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
              }}
            >
              {stat.value}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Grid layout for cards
 */
export interface CardGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4 | 6;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CardGrid({
  children,
  columns = 3,
  gap = 'md',
  className,
}: CardGridProps) {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  };

  const gapClasses = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6',
  };

  return (
    <div
      className={cn('grid', gridClasses[columns], gapClasses[gap], className)}
    >
      {children}
    </div>
  );
}
