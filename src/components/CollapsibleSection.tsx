import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-opacity-10"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          marginBottom: isOpen ? '8px' : '0',
        }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight 
              size={16} 
              style={{ color: 'var(--text-muted)' }}
            />
          </motion.div>
          <h4 
            className="font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
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
        <ChevronDown
          size={16}
          style={{ 
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}