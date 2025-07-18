import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../utils/cn';

export interface Step {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'upcoming' | 'disabled';
  conditional?: boolean;
}

export interface ProgressTrackerProps {
  steps: Step[];
  onStepClick?: (stepIndex: number) => void;
  orientation?: 'horizontal' | 'vertical';
}

export function ProgressTracker({
  steps,
  onStepClick,
  orientation = 'horizontal',
}: ProgressTrackerProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <nav
      className={cn(
        'flex',
        isHorizontal ? 'flex-row items-center' : 'flex-col',
        'w-full'
      )}
      aria-label="Progress"
    >
      <ol
        className={cn(
          'flex',
          isHorizontal
            ? 'flex-row items-center justify-between w-full'
            : 'flex-col space-y-4'
        )}
      >
        {steps.map((step, index) => {
          const isClickable =
            step.status === 'completed' ||
            (onStepClick && step.status !== 'disabled');

          return (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                'flex items-center',
                isHorizontal && index !== steps.length - 1 && 'flex-1'
              )}
            >
              {/* Step indicator */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick?.(index)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200',
                    step.status === 'completed' &&
                      'border-green-600 bg-green-600 text-white',
                    step.status === 'current' &&
                      'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/25',
                    step.status === 'upcoming' &&
                      'border-gray-300 bg-white text-gray-500',
                    step.status === 'disabled' &&
                      'border-gray-200 bg-gray-100 text-gray-400',
                    isClickable && 'cursor-pointer hover:scale-110',
                    !isClickable && 'cursor-not-allowed'
                  )}
                  aria-label={`${step.label} - ${step.status}`}
                  aria-current={step.status === 'current' ? 'step' : undefined}
                >
                  {step.status === 'completed' ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}

                  {/* Pulse animation for current step */}
                  {step.status === 'current' && (
                    <span className="absolute inset-0 rounded-full bg-blue-600 animate-ping opacity-25" />
                  )}
                </button>

                {/* Step label */}
                <span
                  className={cn(
                    'ml-3 text-sm font-medium',
                    step.status === 'completed' && 'text-gray-900',
                    step.status === 'current' && 'text-blue-600',
                    step.status === 'upcoming' && 'text-gray-500',
                    step.status === 'disabled' && 'text-gray-400'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index !== steps.length - 1 && (
                <div
                  className={cn(
                    'transition-all duration-300',
                    isHorizontal ? 'ml-3 flex-1' : 'ml-5 mt-4 h-16 w-0.5'
                  )}
                >
                  <div
                    className={cn(
                      'h-full',
                      isHorizontal ? 'h-0.5' : 'w-full',
                      step.status === 'completed'
                        ? 'bg-green-600'
                        : 'bg-gray-300'
                    )}
                  />
                </div>
              )}
            </motion.li>
          );
        })}
      </ol>
    </nav>
  );
}
