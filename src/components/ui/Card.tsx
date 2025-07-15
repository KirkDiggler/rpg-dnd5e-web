import { HTMLMotionProps, motion } from 'framer-motion';
import { cn } from '../../utils/cn';

interface CardProps extends HTMLMotionProps<'div'> {
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export function Card({ className, rarity, children, ...props }: CardProps) {
  const glowClasses = {
    common: 'glow-common',
    uncommon: 'glow-uncommon',
    rare: 'glow-rare',
    epic: 'glow-epic',
    legendary: 'glow-legendary',
  };

  return (
    <motion.div
      className={cn('game-card', rarity && glowClasses[rarity], className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
