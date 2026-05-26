// src/common/components/traits/TraitBadge.tsx
import { cn } from '@/lib/utils'; // utility for conditional classnames, or use clsx if you prefer
import * as Tooltip from '@radix-ui/react-tooltip';
import { AnimatePresence, motion } from 'framer-motion';
import { FC, useState } from 'react';

export type TraitType = 'racial' | 'class' | 'background' | 'feat';
export type TraitRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

interface TraitBadgeProps {
  name: string;
  icon: React.ReactNode;
  type: TraitType;
  rarity: TraitRarity;
  description?: string;
}

const typeColors: Record<TraitType, string> = {
  racial: 'bg-blue-500',
  class: 'bg-green-500',
  background: 'bg-purple-500',
  feat: 'bg-yellow-500',
};

const rarityStyles: Record<TraitRarity, string> = {
  common: 'border-gray-300',
  uncommon: 'border-blue-400 shadow-md',
  rare: 'border-purple-500 shadow-lg',
  legendary: 'border-yellow-400 shadow-xl animate-pulse',
};

export const TraitBadge: FC<TraitBadgeProps> = ({
  name,
  icon,
  type,
  rarity,
  description,
}) => {
  const [selected, setSelected] = useState(false);

  return (
    <AnimatePresence>
      <Tooltip.Root delayDuration={100}>
        <Tooltip.Trigger asChild>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelected(!selected)}
            className={cn(
              'flex items-center gap-1 px-3 py-1 rounded-full border text-white font-medium text-sm transition-all duration-200',
              typeColors[type],
              rarityStyles[rarity],
              selected && 'ring-2 ring-offset-2 ring-white'
            )}
          >
            {icon}
            <span>{name}</span>
          </motion.button>
        </Tooltip.Trigger>

        {description && (
          <Tooltip.Portal>
            <Tooltip.Content
              side="top"
              className="z-50 rounded bg-black px-3 py-1 text-sm text-white shadow-lg"
            >
              {description}
              <Tooltip.Arrow className="fill-black" />
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </AnimatePresence>
  );
};
