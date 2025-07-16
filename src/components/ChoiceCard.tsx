import { motion } from 'framer-motion';
import { useState } from 'react';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ChoiceCardProps {
  id: string;
  title: string;
  description: string;
  details?: string;
  rarity?: Rarity;
  selected?: boolean;
  disabled?: boolean;
  imageUrl?: string;
  badge?: string;
  tags?: string[];
  onSelect?: (id: string) => void;
  onDetailsClick?: (id: string) => void;
  className?: string;
}

export function ChoiceCard({
  id,
  title,
  description,
  details,
  rarity = 'common',
  selected = false,
  disabled = false,
  imageUrl,
  badge,
  tags = [],
  onSelect,
  onDetailsClick,
  className = '',
}: ChoiceCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    if (!disabled && onSelect) {
      onSelect(id);
    }
  };

  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDetailsClick) {
      onDetailsClick(id);
    }
  };

  const cardClasses = [
    'choice-card',
    `rarity-${rarity}`,
    selected && 'selected',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      className={cardClasses}
      onClick={handleClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Selection indicator */}
      {selected && (
        <motion.div
          className="absolute top-3 right-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </motion.div>
      )}

      {/* Badge */}
      {badge && (
        <div className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-semibold bg-opacity-90 backdrop-blur-sm">
          <span
            className="text-white"
            style={{
              backgroundColor: `var(--${rarity})`,
            }}
          >
            {badge}
          </span>
        </div>
      )}

      {/* Image */}
      {imageUrl && (
        <div className="relative w-full h-32 mb-4 overflow-hidden rounded-lg">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300"
            style={{
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        <h3
          className="text-xl font-bold mb-2 font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>

        <p
          className="text-sm mb-3 line-clamp-3"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Details button */}
        {details && onDetailsClick && (
          <motion.button
            className="w-full mt-3 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent-secondary)',
              color: 'var(--text-button)',
              border: '1px solid var(--border-primary)',
            }}
            whileHover={{ backgroundColor: 'var(--accent-secondary-hover)' }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDetailsClick}
          >
            View Details
          </motion.button>
        )}
      </div>

      {/* Hover overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        initial={{ x: '-100%' }}
        animate={isHovered ? { x: '100%' } : { x: '-100%' }}
        transition={{ duration: 0.6 }}
        style={{ pointerEvents: 'none' }}
      />
    </motion.div>
  );
}

export interface ChoiceCardGridProps {
  choices: ChoiceCardProps[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onDetailsClick?: (id: string) => void;
  columns?: number;
  className?: string;
}

export function ChoiceCardGrid({
  choices,
  selectedId,
  onSelect,
  onDetailsClick,
  columns = 3,
  className = '',
}: ChoiceCardGridProps) {
  const gridClasses = [
    'grid gap-6',
    `grid-cols-1 md:grid-cols-${Math.min(columns, 3)} lg:grid-cols-${columns}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={gridClasses}>
      {choices.map((choice) => (
        <ChoiceCard
          key={choice.id}
          {...choice}
          selected={selectedId === choice.id}
          onSelect={onSelect}
          onDetailsClick={onDetailsClick}
        />
      ))}
    </div>
  );
}
