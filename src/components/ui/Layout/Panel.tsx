import { motion } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '../../../utils/cn';

/**
 * Panel component for sectioned content areas with consistent theming
 */
export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Panel variant */
  variant?: 'default' | 'elevated' | 'outlined' | 'transparent';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Whether panel has animation */
  animate?: boolean;
  /** Panel header */
  header?: React.ReactNode;
  /** Panel footer */
  footer?: React.ReactNode;
}

const variantClasses = {
  default: 'sheet-section',
  elevated: 'sheet-section shadow-lg',
  outlined:
    'border-2 border-current border-opacity-20 bg-transparent rounded-lg p-4',
  transparent: 'bg-transparent',
};

const paddingClasses = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  (
    {
      className,
      variant = 'default',
      padding = 'md',
      animate = true,
      header,
      footer,
      children,
      ...props
    },
    ref
  ) => {
    if (animate) {
      return (
        <motion.div
          ref={ref}
          className={cn(
            variantClasses[variant],
            !header && !footer && paddingClasses[padding],
            className
          )}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={props.style}
        >
          {/* Header */}
          {header && (
            <div
              className={cn(
                'border-b pb-3 mb-4',
                paddingClasses[padding].replace('p-', 'px-')
              )}
              style={{ borderColor: 'var(--border-primary)' }}
            >
              {header}
            </div>
          )}

          {/* Content */}
          <div className={cn(header || footer ? paddingClasses[padding] : '')}>
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div
              className={cn(
                'border-t pt-3 mt-4',
                paddingClasses[padding].replace('p-', 'px-')
              )}
              style={{ borderColor: 'var(--border-primary)' }}
            >
              {footer}
            </div>
          )}
        </motion.div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          variantClasses[variant],
          !header && !footer && paddingClasses[padding],
          className
        )}
        {...props}
      >
        {/* Header */}
        {header && (
          <div
            className={cn(
              'border-b pb-3 mb-4',
              paddingClasses[padding].replace('p-', 'px-')
            )}
            style={{ borderColor: 'var(--border-primary)' }}
          >
            {header}
          </div>
        )}

        {/* Content */}
        <div className={cn(header || footer ? paddingClasses[padding] : '')}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'border-t pt-3 mt-4',
              paddingClasses[padding].replace('p-', 'px-')
            )}
            style={{ borderColor: 'var(--border-primary)' }}
          >
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Panel.displayName = 'Panel';

/**
 * Panel header with title and optional actions
 */
export interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: PanelHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between', className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="text-xl" style={{ color: 'var(--accent-primary)' }}>
            {icon}
          </div>
        )}
        <div>
          <h3
            className="text-lg font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Collapsible panel with expand/collapse functionality
 */
export interface CollapsiblePanelProps extends PanelProps {
  /** Panel title */
  title: string;
  /** Whether panel is open by default */
  defaultOpen?: boolean;
  /** Optional badge text */
  badge?: string;
  /** Whether the panel is required */
  required?: boolean;
}

export function CollapsiblePanel({
  title,
  badge,
  required = false,
  children,
  ...panelProps
}: CollapsiblePanelProps) {
  return (
    <Panel
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4
              className="font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
              {required && (
                <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>
              )}
            </h4>
            {badge && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                }}
              >
                {badge}
              </span>
            )}
          </div>
        </div>
      }
      {...panelProps}
    >
      {children}
    </Panel>
  );
}
