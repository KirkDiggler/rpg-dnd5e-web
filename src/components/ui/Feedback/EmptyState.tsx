import { motion } from 'framer-motion';
import { cn } from '../../../utils/cn';

/**
 * Empty state component for when there's no data to display
 */
export interface EmptyStateProps {
  /** Icon or illustration */
  icon?: React.ReactNode;
  /** Title text */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Custom className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'py-8',
  md: 'py-12',
  lg: 'py-16',
};

const iconSizes = {
  sm: 'text-4xl',
  md: 'text-6xl',
  lg: 'text-8xl',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
}: EmptyStateProps) {
  const defaultIcon = <div className="text-6xl opacity-50">📭</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('text-center', sizeClasses[size], className)}
    >
      {/* Icon */}
      <div className={cn('mb-4 flex justify-center', iconSizes[size])}>
        {icon || defaultIcon}
      </div>

      {/* Title */}
      <h3
        className="text-xl font-bold mb-2"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p
          className="max-w-md mx-auto mb-6 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center justify-center gap-3">
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} className="btn-secondary">
              {secondaryAction.label}
            </button>
          )}

          {action && (
            <button onClick={action.onClick} className="btn-primary">
              {action.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Specialized empty states for common scenarios
 */

export function NoCharactersEmpty({
  onCreateCharacter,
}: {
  onCreateCharacter: () => void;
}) {
  return (
    <EmptyState
      icon={<div className="text-6xl">🏃‍♂️</div>}
      title="No Characters Yet"
      description="Start your adventure by creating your first D&D character!"
      action={{
        label: 'Create Character',
        onClick: onCreateCharacter,
      }}
    />
  );
}

export function NoEquipmentEmpty({
  onBrowseEquipment,
}: {
  onBrowseEquipment: () => void;
}) {
  return (
    <EmptyState
      icon={<div className="text-6xl">⚔️</div>}
      title="No Equipment"
      description="Your inventory is empty. Browse equipment to gear up for battle!"
      action={{
        label: 'Browse Equipment',
        onClick: onBrowseEquipment,
      }}
    />
  );
}

export function NoSpellsEmpty({
  onLearnSpells,
}: {
  onLearnSpells: () => void;
}) {
  return (
    <EmptyState
      icon={<div className="text-6xl">🔮</div>}
      title="No Spells Known"
      description="Knowledge is power! Learn your first spells to harness magical abilities."
      action={{
        label: 'Learn Spells',
        onClick: onLearnSpells,
      }}
    />
  );
}

export function SearchEmpty({
  query,
  onClearSearch,
}: {
  query: string;
  onClearSearch: () => void;
}) {
  return (
    <EmptyState
      icon={<div className="text-6xl">🔍</div>}
      title="No Results Found"
      description={`No results found for "${query}". Try adjusting your search terms.`}
      action={{
        label: 'Clear Search',
        onClick: onClearSearch,
      }}
      size="sm"
    />
  );
}
