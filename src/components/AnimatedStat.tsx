import { motion, useSpring } from 'framer-motion';
import { useEffect, useState } from 'react';

export interface AnimatedStatProps {
  label: string;
  value: number;
  previousValue?: number;
  modifier?: number;
  showModifier?: boolean;
  animate?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'compact';
  className?: string;
}

export function AnimatedStat({
  label,
  value,
  previousValue = 0,
  modifier = 0,
  showModifier = true,
  animate = true,
  size = 'medium',
  variant = 'default',
  className = '',
}: AnimatedStatProps) {
  const [displayValue, setDisplayValue] = useState(previousValue);
  const [isAnimating, setIsAnimating] = useState(false);

  // Spring animation for the value
  const animatedValue = useSpring(previousValue, {
    stiffness: 100,
    damping: 20,
    restDelta: 0.01,
  });

  useEffect(() => {
    if (animate && value !== previousValue) {
      setIsAnimating(true);
      animatedValue.set(value);

      const unsubscribe = animatedValue.onChange((latest) => {
        setDisplayValue(Math.round(latest));
      });

      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 800);

      return () => {
        unsubscribe();
        clearTimeout(timer);
      };
    } else {
      setDisplayValue(value);
    }
  }, [value, previousValue, animate, animatedValue]);

  const getModifierSign = (mod: number): string => {
    if (mod > 0) return '+';
    if (mod < 0) return '−';
    return '';
  };

  const getModifierColor = (mod: number): string => {
    if (mod > 0) return 'positive';
    if (mod < 0) return 'negative';
    return '';
  };

  const getSizeClasses = (size: string): Record<string, string> => {
    switch (size) {
      case 'small':
        return {
          container: 'p-2',
          value: 'text-lg',
          label: 'text-xs',
          modifier: 'text-xs',
        };
      case 'large':
        return {
          container: 'p-6',
          value: 'text-4xl',
          label: 'text-lg',
          modifier: 'text-base',
        };
      default:
        return {
          container: 'p-4',
          value: 'text-2xl',
          label: 'text-sm',
          modifier: 'text-sm',
        };
    }
  };

  const sizeClasses = getSizeClasses(size);
  const hasValueChanged = value !== previousValue;

  const containerClasses = [
    'animated-stat',
    variant === 'compact' && 'flex items-center justify-between',
    sizeClasses.container,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (variant === 'compact') {
    return (
      <div className={containerClasses}>
        <span
          className={`font-medium ${sizeClasses.label}`}
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </span>
        <div className="flex items-center gap-2">
          <motion.span
            className={`font-bold ${sizeClasses.value} animated-stat-value`}
            animate={isAnimating ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.4 }}
          >
            {displayValue}
          </motion.span>
          {showModifier && modifier !== 0 && (
            <span
              className={`animated-stat-bonus ${getModifierColor(modifier)} ${sizeClasses.modifier}`}
            >
              ({getModifierSign(modifier)}
              {Math.abs(modifier)})
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {/* Value change indicator */}
      {hasValueChanged && animate && (
        <motion.div
          className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Main value */}
      <motion.div
        className={`animated-stat-value ${sizeClasses.value}`}
        animate={
          isAnimating
            ? {
                scale: [1, 1.3, 1],
                color: [
                  'var(--text-primary)',
                  'var(--accent-primary)',
                  'var(--text-primary)',
                ],
              }
            : {}
        }
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        {displayValue}
      </motion.div>

      {/* Modifier */}
      {showModifier && modifier !== 0 && (
        <motion.div
          className={`animated-stat-bonus ${getModifierColor(modifier)} ${sizeClasses.modifier}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          {getModifierSign(modifier)}
          {Math.abs(modifier)}
        </motion.div>
      )}

      {/* Label */}
      <motion.div
        className={`font-medium mt-2 ${sizeClasses.label}`}
        style={{ color: 'var(--text-muted)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {label}
      </motion.div>

      {/* Animation particles */}
      {isAnimating && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-blue-400 rounded-full"
              initial={{
                opacity: 0,
                scale: 0,
                x: '50%',
                y: '50%',
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1, 0],
                x: [
                  '50%',
                  `${50 + (Math.random() - 0.5) * 100}%`,
                  `${50 + (Math.random() - 0.5) * 200}%`,
                ],
                y: [
                  '50%',
                  `${50 + (Math.random() - 0.5) * 100}%`,
                  `${50 + (Math.random() - 0.5) * 200}%`,
                ],
              }}
              transition={{
                duration: 0.8,
                delay: i * 0.1,
                ease: 'easeOut',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface AnimatedStatGridProps {
  stats: Array<{
    label: string;
    value: number;
    previousValue?: number;
    modifier?: number;
  }>;
  showModifiers?: boolean;
  animate?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'compact';
  columns?: number;
  className?: string;
}

export function AnimatedStatGrid({
  stats,
  showModifiers = true,
  animate = true,
  size = 'medium',
  variant = 'default',
  columns = 3,
  className = '',
}: AnimatedStatGridProps) {
  const gridClasses = [
    'grid gap-4',
    `grid-cols-1 sm:grid-cols-${Math.min(columns, 3)} lg:grid-cols-${columns}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={gridClasses}>
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1, duration: 0.5 }}
        >
          <AnimatedStat
            label={stat.label}
            value={stat.value}
            previousValue={stat.previousValue}
            modifier={stat.modifier}
            showModifier={showModifiers}
            animate={animate}
            size={size}
            variant={variant}
          />
        </motion.div>
      ))}
    </div>
  );
}
