import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export interface DiceRoll {
  id: string;
  dice: DiceType;
  count: number;
  modifier: number;
  result: number;
  rolls: number[];
  timestamp: number;
}

export interface DiceRollerProps {
  dice: DiceType;
  count?: number;
  modifier?: number;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  onRoll?: (roll: DiceRoll) => void;
  className?: string;
}

export function DiceRoller({
  dice,
  count = 1,
  modifier = 0,
  label,
  size = 'medium',
  disabled = false,
  onRoll,
  className = '',
}: DiceRollerProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);

  const getDiceValue = (dice: DiceType): number => {
    switch (dice) {
      case 'd4':
        return 4;
      case 'd6':
        return 6;
      case 'd8':
        return 8;
      case 'd10':
        return 10;
      case 'd12':
        return 12;
      case 'd20':
        return 20;
      case 'd100':
        return 100;
      default:
        return 6;
    }
  };

  const rollDice = () => {
    if (disabled || isRolling) return;

    setIsRolling(true);

    const diceValue = getDiceValue(dice);
    const rolls = Array.from(
      { length: count },
      () => Math.floor(Math.random() * diceValue) + 1
    );
    const total = rolls.reduce((sum, roll) => sum + roll, 0);
    const result = total + modifier;

    const rollData: DiceRoll = {
      id: Date.now().toString(),
      dice,
      count,
      modifier,
      result,
      rolls,
      timestamp: Date.now(),
    };

    setTimeout(() => {
      setLastRoll(rollData);
      setIsRolling(false);
      onRoll?.(rollData);
    }, 600);
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return {
          button: 'w-12 h-12 text-sm',
          text: 'text-xs',
          result: 'text-sm',
        };
      case 'large':
        return {
          button: 'w-20 h-20 text-xl',
          text: 'text-base',
          result: 'text-xl',
        };
      default:
        return {
          button: 'w-16 h-16 text-lg',
          text: 'text-sm',
          result: 'text-base',
        };
    }
  };

  const sizeClasses = getSizeClasses();

  const formatRollString = (): string => {
    const diceStr = count > 1 ? `${count}${dice}` : dice;
    const modStr =
      modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : '';
    return `${diceStr}${modStr}`;
  };

  return (
    <div className={`dice-container ${className}`}>
      {label && (
        <div
          className={`text-center mb-2 font-medium ${sizeClasses.text}`}
          style={{ color: 'var(--text-button)' }}
        >
          {label}
        </div>
      )}

      <div className="text-center">
        <div className={`dice-modifier mb-2 ${sizeClasses.text}`}>
          {formatRollString()}
        </div>

        <motion.button
          className={`btn-dice ${sizeClasses.button} ${isRolling ? 'animate-dice-roll' : ''}`}
          onClick={rollDice}
          disabled={disabled || isRolling}
          whileHover={!disabled && !isRolling ? { scale: 1.05 } : {}}
          whileTap={!disabled && !isRolling ? { scale: 0.95 } : {}}
        >
          {dice.toUpperCase()}
        </motion.button>

        <AnimatePresence mode="wait">
          {lastRoll && (
            <motion.div
              key={lastRoll.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="mt-3"
            >
              <div className={`dice-result ${sizeClasses.result}`}>
                {lastRoll.result}
              </div>
              {lastRoll.rolls.length > 1 && (
                <div className={`dice-modifier ${sizeClasses.text} mt-1`}>
                  ({lastRoll.rolls.join(' + ')}
                  {lastRoll.modifier !== 0 &&
                    ` ${lastRoll.modifier > 0 ? '+' : ''}${lastRoll.modifier}`}
                  )
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export interface DiceTrayProps {
  dice: Array<{
    id: string;
    type: DiceType;
    count?: number;
    modifier?: number;
    label?: string;
  }>;
  onRoll?: (roll: DiceRoll) => void;
  className?: string;
}

export function DiceTray({ dice, onRoll, className = '' }: DiceTrayProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {dice.map((die) => (
        <DiceRoller
          key={die.id}
          dice={die.type}
          count={die.count}
          modifier={die.modifier}
          label={die.label}
          size="medium"
          onRoll={onRoll}
        />
      ))}
    </div>
  );
}

export interface DiceRollHistoryProps {
  rolls: DiceRoll[];
  maxRolls?: number;
  onClear?: () => void;
  className?: string;
}

export function DiceRollHistory({
  rolls,
  maxRolls = 10,
  onClear,
  className = '',
}: DiceRollHistoryProps) {
  const displayRolls = rolls.slice(0, maxRolls);

  if (rolls.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No rolls yet. Start rolling some dice!
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center">
        <h3
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          Roll History
        </h3>
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-primary)',
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {displayRolls.map((roll) => (
          <motion.div
            key={roll.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-between items-center p-2 rounded"
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <span
              className="text-sm font-mono"
              style={{ color: 'var(--text-primary)' }}
            >
              {roll.count > 1 ? `${roll.count}${roll.dice}` : roll.dice}
              {roll.modifier !== 0 &&
                (roll.modifier > 0 ? `+${roll.modifier}` : `${roll.modifier}`)}
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: 'var(--accent-primary)' }}
            >
              {roll.result}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
