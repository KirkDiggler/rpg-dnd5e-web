import { motion } from 'framer-motion';
import { cn } from '../../../utils/cn';

/**
 * Loading spinner components with various styles and sizes
 */
export interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Spinner variant */
  variant?: 'spinner' | 'dots' | 'pulse' | 'dice';
  /** Custom className */
  className?: string;
  /** Loading text */
  text?: string;
}

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

export function LoadingSpinner({
  size = 'md',
  variant = 'spinner',
  className,
  text,
}: LoadingSpinnerProps) {
  const renderSpinner = () => {
    switch (variant) {
      case 'spinner':
        return (
          <div
            className={cn(
              'animate-spin rounded-full border-2 border-current border-t-transparent',
              sizeClasses[size],
              className
            )}
            style={{ color: 'var(--accent-primary)' }}
          />
        );

      case 'dots':
        return (
          <div className={cn('flex space-x-1', className)}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className={cn(
                  'rounded-full bg-current',
                  size === 'xs'
                    ? 'w-1 h-1'
                    : size === 'sm'
                      ? 'w-1.5 h-1.5'
                      : size === 'md'
                        ? 'w-2 h-2'
                        : size === 'lg'
                          ? 'w-3 h-3'
                          : 'w-4 h-4'
                )}
                style={{ color: 'var(--accent-primary)' }}
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        );

      case 'pulse':
        return (
          <motion.div
            className={cn(
              'rounded-full bg-current',
              sizeClasses[size],
              className
            )}
            style={{ color: 'var(--accent-primary)' }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        );

      case 'dice':
        return (
          <motion.div
            className={cn(
              'bg-gradient-to-br from-red-500 to-red-700 rounded-md flex items-center justify-center text-white font-bold',
              sizeClasses[size],
              className
            )}
            animate={{ rotateX: 360, rotateY: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            🎲
          </motion.div>
        );

      default:
        return null;
    }
  };

  if (text) {
    return (
      <div className="flex items-center gap-3">
        {renderSpinner()}
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {text}
        </span>
      </div>
    );
  }

  return renderSpinner();
}

/**
 * Full-screen loading overlay
 */
export interface LoadingOverlayProps {
  /** Whether overlay is visible */
  visible: boolean;
  /** Loading text */
  text?: string;
  /** Spinner variant */
  variant?: LoadingSpinnerProps['variant'];
}

export function LoadingOverlay({
  visible,
  text = 'Loading...',
  variant = 'spinner',
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--overlay-bg)' }}
    >
      <div
        className="p-6 rounded-lg border text-center"
        style={{
          backgroundColor: 'var(--modal-bg)',
          borderColor: 'var(--border-primary)',
        }}
      >
        <LoadingSpinner size="lg" variant={variant} className="mx-auto mb-4" />
        <p
          className="text-lg font-medium"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'Cinzel, serif',
          }}
        >
          {text}
        </p>
      </div>
    </motion.div>
  );
}
