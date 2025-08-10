import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface CombatPanelProps {
  title: string;
  className?: string;
  children: ReactNode;
  onClose?: () => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

/**
 * Base component for all combat panels.
 * Provides consistent styling and behavior across the combat UI system.
 */
export function CombatPanelBase({
  title,
  className = '',
  children,
  onClose,
  collapsible = false,
  defaultCollapsed = false,
}: CombatPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20 }}
      className={`bg-slate-800 border-2 border-slate-600 rounded-xl shadow-xl ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-600">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              className="text-slate-400 hover:text-slate-200 transition-colors p-1"
              aria-label={defaultCollapsed ? 'Expand' : 'Collapse'}
            >
              <span className="text-xs">{defaultCollapsed ? '📈' : '📉'}</span>
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1"
              aria-label="Close"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Panel Content */}
      <div className="p-3">{children}</div>
    </motion.div>
  );
}
