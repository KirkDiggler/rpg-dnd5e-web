import { motion } from 'framer-motion';

export type TraitType =
  | 'racial'
  | 'class'
  | 'background'
  | 'feat'
  | 'spell'
  | 'item'
  | 'custom';

export interface TraitBadgeProps {
  name: string;
  type: TraitType;
  description?: string;
  value?: string | number;
  icon?: React.ReactNode;
  removable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function TraitBadge({
  name,
  type,
  description,
  value,
  icon,
  removable = false,
  disabled = false,
  onClick,
  onRemove,
  className = '',
}: TraitBadgeProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove();
    }
  };

  const badgeClasses = [
    'trait-badge',
    type,
    disabled && 'opacity-50 cursor-not-allowed',
    onClick && !disabled && 'cursor-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      className={badgeClasses}
      onClick={handleClick}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      title={description}
    >
      {/* Icon */}
      {icon && (
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate">{name}</span>
        {value && (
          <span className="ml-1 opacity-75">
            {typeof value === 'number' ? `(${value})` : value}
          </span>
        )}
      </div>

      {/* Remove button */}
      {removable && (
        <button
          onClick={handleRemove}
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity"
          title="Remove trait"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </motion.div>
  );
}

export interface TraitBadgeGroupProps {
  traits: Array<{
    id: string;
    name: string;
    type: TraitType;
    description?: string;
    value?: string | number;
    icon?: React.ReactNode;
    removable?: boolean;
    disabled?: boolean;
  }>;
  title?: string;
  maxDisplay?: number;
  onTraitClick?: (traitId: string) => void;
  onTraitRemove?: (traitId: string) => void;
  className?: string;
}

export function TraitBadgeGroup({
  traits,
  title,
  maxDisplay,
  onTraitClick,
  onTraitRemove,
  className = '',
}: TraitBadgeGroupProps) {
  const displayedTraits = maxDisplay ? traits.slice(0, maxDisplay) : traits;
  const remainingCount = maxDisplay
    ? Math.max(0, traits.length - maxDisplay)
    : 0;

  if (traits.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {title && (
        <h4
          className="text-sm font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          {title}
        </h4>
      )}

      <div className="flex flex-wrap gap-2">
        {displayedTraits.map((trait) => (
          <TraitBadge
            key={trait.id}
            name={trait.name}
            type={trait.type}
            description={trait.description}
            value={trait.value}
            icon={trait.icon}
            removable={trait.removable}
            disabled={trait.disabled}
            onClick={() => onTraitClick?.(trait.id)}
            onRemove={() => onTraitRemove?.(trait.id)}
          />
        ))}

        {remainingCount > 0 && (
          <div
            className="trait-badge"
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-muted)',
              border: '1px dashed var(--border-primary)',
            }}
          >
            +{remainingCount} more
          </div>
        )}
      </div>
    </div>
  );
}

export interface TraitBadgeListProps {
  sections: Array<{
    id: string;
    title: string;
    traits: Array<{
      id: string;
      name: string;
      type: TraitType;
      description?: string;
      value?: string | number;
      icon?: React.ReactNode;
      removable?: boolean;
      disabled?: boolean;
    }>;
  }>;
  onTraitClick?: (traitId: string, sectionId: string) => void;
  onTraitRemove?: (traitId: string, sectionId: string) => void;
  className?: string;
}

export function TraitBadgeList({
  sections,
  onTraitClick,
  onTraitRemove,
  className = '',
}: TraitBadgeListProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {sections.map((section) => (
        <TraitBadgeGroup
          key={section.id}
          title={section.title}
          traits={section.traits}
          onTraitClick={(traitId) => onTraitClick?.(traitId, section.id)}
          onTraitRemove={(traitId) => onTraitRemove?.(traitId, section.id)}
        />
      ))}
    </div>
  );
}
