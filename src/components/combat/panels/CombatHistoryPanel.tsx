import type {
  AttackResult,
  DamageComponent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import * as Tooltip from '@radix-ui/react-tooltip';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { getDamageSourceDisplay } from '../../../utils/damageSourceIcons';
import { CombatPanelBase } from '../CombatPanelBase';
import { getPanelPositionClasses } from '../utils';

/**
 * Combat history entry - wraps AttackResult with metadata
 */
export interface CombatHistoryEntry {
  id: string;
  timestamp: Date;
  round: number;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  weaponName?: string;
  result: AttackResult;
}

/**
 * Handle for imperatively adding entries to the combat history
 */
export interface CombatHistoryHandle {
  addEntry: (entry: CombatHistoryEntry) => void;
  clear: () => void;
}

interface CombatHistoryPanelProps {
  isVisible: boolean;
  onToggle: () => void;
  initialEntries?: CombatHistoryEntry[];
}

/**
 * CombatHistoryPanel - Shows a log of combat actions with detailed attack results.
 * Uses ref-based API for adding entries, ready for streaming integration.
 */
export const CombatHistoryPanel = forwardRef<
  CombatHistoryHandle,
  CombatHistoryPanelProps
>(function CombatHistoryPanel(
  { isVisible, onToggle, initialEntries = [] },
  ref
) {
  const [entries, setEntries] = useState<CombatHistoryEntry[]>(initialEntries);

  // Expose imperative API via ref
  useImperativeHandle(ref, () => ({
    addEntry: (entry: CombatHistoryEntry) => {
      setEntries((prev) => [entry, ...prev]); // Most recent first
    },
    clear: () => {
      setEntries([]);
    },
  }));

  if (!isVisible) {
    return (
      <div
        className={getPanelPositionClasses('top-right')}
        style={{ zIndex: 900 }}
      >
        <button
          onClick={onToggle}
          className="bg-slate-800 border-2 border-slate-600 rounded-lg px-3 py-2 text-slate-200 hover:text-white transition-colors"
        >
          📜 History ({entries.length})
        </button>
      </div>
    );
  }

  return (
    <div
      className={getPanelPositionClasses('top-right')}
      style={{ zIndex: 900 }}
    >
      <CombatPanelBase title="📜 Combat History" onClose={onToggle} collapsible>
        <div className="max-h-80 overflow-y-auto space-y-3">
          {entries.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-4">
              No actions recorded yet
            </div>
          ) : (
            entries.map((entry) => (
              <AttackResultEntry key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </CombatPanelBase>
    </div>
  );
});

/**
 * Renders a single attack result entry with full breakdown
 */
function AttackResultEntry({ entry }: { entry: CombatHistoryEntry }) {
  const { result, attackerName, targetName, round, weaponName } = entry;
  const {
    hit,
    attackRoll,
    attackTotal,
    targetAc,
    critical,
    damageBreakdown,
    damageType,
  } = result;

  const modifier = attackTotal - attackRoll;
  const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  return (
    <div className="text-xs border-b border-slate-700 pb-2 last:border-b-0">
      {/* Header: Attacker → Target, Round */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-200 font-medium">
          ⚔️ {attackerName} → {targetName}
        </span>
        <span className="text-slate-500 text-xs">R{round}</span>
      </div>

      {/* Attack roll breakdown */}
      <div className="text-slate-300 mb-1">
        Attack: <DiceRoll value={attackRoll} isD20 /> {modifierStr} ={' '}
        {attackTotal} vs AC {targetAc}{' '}
        {critical ? (
          <span className="text-amber-400 font-bold animate-pulse">
            CRIT! 💥
          </span>
        ) : hit ? (
          <span className="text-green-400">✓ HIT</span>
        ) : (
          <span className="text-red-400">✗ MISS</span>
        )}
      </div>

      {/* Damage breakdown (only on hit) */}
      {hit && damageBreakdown && damageBreakdown.components.length > 0 && (
        <div className="mt-1">
          <div className="text-slate-300">
            Damage: {damageBreakdown.totalDamage || result.damage} {damageType}
          </div>
          <div className="ml-2 mt-1 space-y-0.5">
            {damageBreakdown.components.map((comp, idx) => (
              <DamageComponentRow
                key={idx}
                component={comp}
                weaponName={weaponName}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renders a single damage component with source icon and dice breakdown
 */
function DamageComponentRow({
  component,
  weaponName,
}: {
  component: DamageComponent;
  weaponName?: string;
}) {
  const sourceDisplay = getDamageSourceDisplay(component.source);
  const displayName =
    component.source === 'weapon' && weaponName
      ? weaponName
      : sourceDisplay.label;

  // Check for rerolls
  const hasRerolls = component.rerolls && component.rerolls.length > 0;

  // Build dice display
  const diceDisplay = buildDiceDisplay(component, hasRerolls);
  const bonusDisplay = buildBonusDisplay(component.flatBonus);

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="flex items-center gap-1 text-slate-400 cursor-help">
            <span>{sourceDisplay.icon}</span>
            <span>{displayName}:</span>
            {diceDisplay}
            {bonusDisplay}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 max-w-xs"
            sideOffset={5}
          >
            {sourceDisplay.description || sourceDisplay.label}
            <Tooltip.Arrow className="fill-slate-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/**
 * Renders a dice roll value with styling for 1s (red) and max rolls (gold)
 */
function DiceRoll({
  value,
  isD20 = false,
  dieMax,
  isRerolled = false,
}: {
  value: number;
  isD20?: boolean;
  dieMax?: number;
  isRerolled?: boolean;
}) {
  const max = dieMax || (isD20 ? 20 : undefined);
  const isNat1 = value === 1;
  const isMax = max !== undefined && value === max;

  let className = 'font-mono';
  if (isRerolled) {
    className += ' line-through text-slate-500';
  } else if (isNat1) {
    className += ' text-red-400 font-bold';
  } else if (isMax) {
    className += ' text-amber-400 font-bold';
  }

  return <span className={className}>{value}</span>;
}

/**
 * Build the dice display with reroll indicators
 */
function buildDiceDisplay(
  component: DamageComponent,
  hasRerolls: boolean
): React.ReactNode {
  if (component.finalDiceRolls.length === 0) {
    return null;
  }

  // Infer die max from the highest roll (common dice: d4, d6, d8, d10, d12)
  const maxRoll = Math.max(
    ...component.finalDiceRolls,
    ...component.originalDiceRolls
  );
  const dieMax = [4, 6, 8, 10, 12].find((d) => d >= maxRoll) || maxRoll;

  if (hasRerolls) {
    // Build a map of rerolls by die index
    const rerollsByIndex = new Map<number, { before: number; after: number }>();
    for (const reroll of component.rerolls) {
      rerollsByIndex.set(reroll.dieIndex, {
        before: reroll.before,
        after: reroll.after,
      });
    }

    // Show original with strikethrough, then final
    return (
      <span className="ml-1">
        (
        {component.originalDiceRolls.map((roll, i) => {
          const reroll = rerollsByIndex.get(i);

          return (
            <span key={i}>
              {i > 0 && ', '}
              {reroll ? (
                <>
                  <DiceRoll value={reroll.before} dieMax={dieMax} isRerolled />
                  <span className="text-slate-500">→</span>
                  <DiceRoll value={reroll.after} dieMax={dieMax} />
                </>
              ) : (
                <DiceRoll value={roll} dieMax={dieMax} />
              )}
            </span>
          );
        })}
        )
      </span>
    );
  }

  // No rerolls - just show final dice
  const sum = component.finalDiceRolls.reduce((a, b) => a + b, 0);
  return (
    <span className="ml-1">
      (
      {component.finalDiceRolls.map((roll, i) => (
        <span key={i}>
          {i > 0 && '+'}
          <DiceRoll value={roll} dieMax={dieMax} />
        </span>
      ))}
      )={sum}
    </span>
  );
}

/**
 * Build the bonus display
 */
function buildBonusDisplay(flatBonus: number): React.ReactNode {
  if (flatBonus === 0) return null;
  return (
    <span className="ml-1 text-slate-400">
      {flatBonus > 0 ? `+${flatBonus}` : flatBonus}
    </span>
  );
}
