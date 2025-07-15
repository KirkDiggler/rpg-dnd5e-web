import { motion } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'dice';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', children, ...props },
    ref
  ) => {
    const variantClasses = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      dice: 'btn-dice',
    };

    const sizeClasses = {
      sm: 'text-sm px-4 py-2',
      md: 'text-base px-6 py-3',
      lg: 'text-lg px-8 py-4',
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          variantClasses[variant],
          variant !== 'dice' && sizeClasses[size],
          className
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
