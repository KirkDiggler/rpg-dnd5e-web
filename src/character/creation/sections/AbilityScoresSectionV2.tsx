import { useAbilityScoreRolls } from '@/api/diceHooks';
import { useUpdateDraftAbilityScores } from '@/api/hooks';
import { AnimatedStat } from '@/components/AnimatedStat';
import { Button } from '@/components/ui/Button';
import { useDiscord } from '@/discord';
import {
  calculateAbilityScoreValue,
  formatModifier,
  getAbilityModifier,
} from '@/utils/diceCalculations';
import { create } from '@bufbuild/protobuf';
import type { DiceRoll } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';
import {
  RollAssignmentsSchema,
  UpdateAbilityScoresRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { CheckCircle, Dices, RefreshCw } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { CharacterDraftContext } from '../CharacterDraftContextDef';

type AbilityKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

const ABILITY_NAMES: Array<{ key: AbilityKey; label: string; abbr: string }> = [
  { key: 'strength', label: 'Strength', abbr: 'STR' },
  { key: 'dexterity', label: 'Dexterity', abbr: 'DEX' },
  { key: 'constitution', label: 'Constitution', abbr: 'CON' },
  { key: 'intelligence', label: 'Intelligence', abbr: 'INT' },
  { key: 'wisdom', label: 'Wisdom', abbr: 'WIS' },
  { key: 'charisma', label: 'Charisma', abbr: 'CHA' },
];

interface DiceRollDisplayProps {
  roll: DiceRoll;
  isAssigned: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function DiceRollDisplay({
  roll,
  isAssigned,
  isSelected,
  onClick,
}: DiceRollDisplayProps) {
  const actualTotal = calculateAbilityScoreValue(roll);
  const modifier = getAbilityModifier(actualTotal);
  const modifierStr = formatModifier(modifier);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
        isAssigned
          ? 'opacity-50 cursor-not-allowed'
          : isSelected
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-300 hover:border-gray-400'
      }`}
      onClick={!isAssigned ? onClick : undefined}
      style={{
        backgroundColor: isAssigned
          ? 'var(--bg-secondary)'
          : isSelected
            ? 'var(--accent-bg)'
            : 'var(--card-bg)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : 'var(--border-primary)',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xl font-bold">{actualTotal}</span>
        <span className="text-sm text-muted">{modifierStr}</span>
      </div>
      <div className="flex gap-1 text-xs">
        {(() => {
          // WORKAROUND: Server currently returns only kept dice + dropped values
          // See issue: https://github.com/KirkDiggler/rpg-api/issues/196
          // Server returns: { dice: [4,6,4], dropped: [3] } for a 4d6 roll
          // We need to reconstruct the full roll for display

          let displayDice = [...roll.dice];
          const droppedIndices = new Set<number>();

          if (roll.dropped && roll.dropped.length > 0) {
            // Reconstruct the full roll by adding dropped dice back
            // Note: This assumes 4d6 drop lowest (1 die dropped)
            displayDice = [...roll.dice, ...roll.dropped].sort((a, b) => b - a);

            // Find which index has the dropped value
            // For 4d6 drop lowest, it's always the lowest value
            const lowestValue = Math.min(...displayDice);
            const lowestIndex = displayDice.indexOf(lowestValue);
            droppedIndices.add(lowestIndex);
          } else if (roll.dice.length === 4) {
            // Legacy path: For 4d6 with no server-side dropping
            const lowestValue = Math.min(...displayDice);
            const lowestIndex = displayDice.indexOf(lowestValue);
            droppedIndices.add(lowestIndex);
          }

          return displayDice.map((die, idx) => {
            const isDropped = droppedIndices.has(idx);

            return (
              <span
                key={idx}
                className={`px-1 py-0.5 rounded ${
                  isDropped ? 'opacity-50 line-through' : ''
                }`}
                style={{
                  backgroundColor: isDropped
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-secondary)',
                }}
              >
                {die}
              </span>
            );
          });
        })()}
      </div>
      {isAssigned && <div className="text-xs text-muted mt-1">Assigned</div>}
    </motion.div>
  );
}

interface AbilitySlotProps {
  ability: (typeof ABILITY_NAMES)[0];
  assignedRoll?: DiceRoll;
  onSelect: () => void;
  isSelected: boolean;
}

function AbilitySlot({
  ability,
  assignedRoll,
  onSelect,
  isSelected,
}: AbilitySlotProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : assignedRoll
            ? 'border-green-500'
            : 'border-gray-300 hover:border-gray-400'
      }`}
      onClick={onSelect}
      style={{
        backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--card-bg)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : assignedRoll
            ? 'var(--success)'
            : 'var(--border-primary)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          className="font-bold text-sm"
          style={{ color: 'var(--text-primary)' }}
        >
          {ability.abbr}
        </h3>
        {assignedRoll && (
          <CheckCircle
            className="w-4 h-4"
            style={{ color: 'var(--success)' }}
          />
        )}
      </div>

      {assignedRoll ? (
        <AnimatedStat
          label={ability.label}
          value={calculateAbilityScoreValue(assignedRoll)}
          previousValue={10}
          modifier={getAbilityModifier(
            calculateAbilityScoreValue(assignedRoll)
          )}
          animate={true}
          variant="compact"
          size="small"
        />
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-muted">Click to assign</p>
        </div>
      )}
    </motion.div>
  );
}

interface AbilityScoresSectionV2Props {
  draftId?: string;
  playerId?: string;
}

export function AbilityScoresSectionV2({
  draftId: propDraftId,
  playerId: propPlayerId,
}: AbilityScoresSectionV2Props = {}) {
  const context = useContext(CharacterDraftContext);
  const discord = useDiscord();
  const isDevelopment = import.meta.env.MODE === 'development';

  // Simplified player ID resolution: props > discord > development fallback
  const draftId = propDraftId || context?.draftId;
  const playerId =
    propPlayerId || discord.user?.id || (isDevelopment ? 'test-player' : '');
  const [selectedRoll, setSelectedRoll] = useState<string | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    rolls,
    assignments,
    loading,
    error,
    loadExistingRolls,
    rollAbilityScores,
    assignRoll,
    unassignRoll,
    isRollAssigned,
    getAssignedRoll,
    isComplete,
    getRollAssignments,
  } = useAbilityScoreRolls(playerId);

  const { updateAbilityScores } = useUpdateDraftAbilityScores();

  // Load existing rolls on mount
  useEffect(() => {
    if (playerId) {
      loadExistingRolls();
    }
    // Only run on mount and when playerId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // Handle roll selection
  const handleRollClick = (rollId: string) => {
    if (isRollAssigned(rollId)) return;

    if (selectedAbility) {
      // Assign roll to selected ability
      assignRoll(selectedAbility, rollId);
      setSelectedAbility(null);
      setSelectedRoll(null);
    } else {
      // Select roll
      setSelectedRoll(rollId === selectedRoll ? null : rollId);
    }
  };

  // Handle ability selection
  const handleAbilityClick = (abilityKey: string) => {
    if (selectedRoll) {
      // Assign selected roll to ability
      assignRoll(abilityKey, selectedRoll);
      setSelectedRoll(null);
      setSelectedAbility(null);
    } else {
      // Select ability or unassign if already assigned
      if (getAssignedRoll(abilityKey)) {
        unassignRoll(abilityKey);
      } else {
        setSelectedAbility(abilityKey === selectedAbility ? null : abilityKey);
      }
    }
  };

  // Roll individual ability score
  const handleRollOne = async () => {
    try {
      await rollAbilityScores(1);
    } catch (error) {
      console.error('Failed to roll:', error);
    }
  };

  // Roll all ability scores at once
  const handleRollAll = async () => {
    try {
      await rollAbilityScores(6);
    } catch (error) {
      console.error('Failed to roll all:', error);
    }
  };

  // Submit ability scores to server
  const handleSubmit = async () => {
    if (!draftId || !isComplete()) return;

    setIsSubmitting(true);
    try {
      const rollAssignments = create(
        RollAssignmentsSchema,
        getRollAssignments()
      );

      console.log('Submitting ability scores with roll assignments:', {
        draftId,
        rollAssignments,
      });

      const response = await updateAbilityScores(
        create(UpdateAbilityScoresRequestSchema, {
          draftId,
          scoresInput: {
            value: rollAssignments,
            case: 'rollAssignments',
          },
        })
      );

      console.log('Ability scores submitted successfully:', response);

      // Update the context with the new draft that includes ability scores
      if (response.draft && context) {
        // The server has calculated the ability scores from our roll assignments
        // Update the context so the UI knows they're saved
        if (response.draft.abilityScores) {
          context.setAbilityScores({
            strength: response.draft.abilityScores.strength,
            dexterity: response.draft.abilityScores.dexterity,
            constitution: response.draft.abilityScores.constitution,
            intelligence: response.draft.abilityScores.intelligence,
            wisdom: response.draft.abilityScores.wisdom,
            charisma: response.draft.abilityScores.charisma,
          });
        }
      }
    } catch (error) {
      console.error('Failed to submit ability scores:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!draftId) {
    return (
      <div className="text-center py-8">
        <p className="text-muted">Please create a character draft first.</p>
      </div>
    );
  }

  // Check if ability scores are already set in the draft
  if (context?.draft?.abilityScores) {
    const scores = context.draft.abilityScores;
    const hasScores =
      scores.strength > 0 ||
      scores.dexterity > 0 ||
      scores.constitution > 0 ||
      scores.intelligence > 0 ||
      scores.wisdom > 0 ||
      scores.charisma > 0;

    if (hasScores) {
      return (
        <div className="space-y-6">
          <h2
            className="text-2xl font-bold font-serif"
            style={{ color: 'var(--text-primary)' }}
          >
            Ability Scores
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ABILITY_NAMES.map((ability) => {
              const score = scores[ability.key];
              const scoreValue = typeof score === 'number' ? score : 0;
              const modifier = getAbilityModifier(scoreValue);

              return (
                <div
                  key={ability.key}
                  className="p-4 rounded-lg border-2 border-green-500"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--success)',
                  }}
                >
                  <AnimatedStat
                    label={ability.label}
                    value={scoreValue}
                    previousValue={10}
                    modifier={modifier}
                    animate={false}
                    variant="compact"
                    size="small"
                  />
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted">
              Ability scores have been assigned
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2
          className="text-2xl font-bold font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          Ability Scores
        </h2>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleRollOne}
            size="sm"
            disabled={loading || rolls.length >= 6}
          >
            <Dices className="w-4 h-4 mr-1" />
            Roll One
          </Button>
          <Button
            variant="primary"
            onClick={handleRollAll}
            size="sm"
            disabled={loading || rolls.length > 0}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Roll All (6)
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: 'var(--danger-bg)',
            borderColor: 'var(--danger)',
          }}
        >
          <p className="text-sm">{error.message}</p>
        </div>
      )}

      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <p className="text-sm text-muted mb-2">
          Roll dice using the buttons above, then assign them to abilities by
          clicking a roll and then an ability slot.
        </p>
        <p className="text-sm text-muted">
          Each roll uses 4d6, dropping the lowest die.
        </p>
      </div>

      {/* Unassigned Rolls */}
      {rolls.length > 0 && (
        <div>
          <h3
            className="text-lg font-semibold mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            Available Rolls
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {rolls.map((roll) => (
              <DiceRollDisplay
                key={roll.rollId}
                roll={roll}
                isAssigned={isRollAssigned(roll.rollId)}
                isSelected={selectedRoll === roll.rollId}
                onClick={() => handleRollClick(roll.rollId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ability Slots */}
      <div>
        <h3
          className="text-lg font-semibold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Abilities
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {ABILITY_NAMES.map((ability) => {
            const assignedRollId = getAssignedRoll(ability.key);
            const assignedRoll = rolls.find((r) => r.rollId === assignedRollId);
            return (
              <AbilitySlot
                key={ability.key}
                ability={ability}
                assignedRoll={assignedRoll}
                onSelect={() => handleAbilityClick(ability.key)}
                isSelected={selectedAbility === ability.key}
              />
            );
          })}
        </div>
      </div>

      {/* Submit Button */}
      {isComplete() && (
        <div className="flex justify-center pt-4">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Confirm Ability Scores'}
          </Button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="text-center">
        <p className="text-sm text-muted">
          {Object.keys(assignments).length} of 6 abilities assigned
        </p>
        {isComplete() && (
          <p className="text-sm text-muted mt-1">
            Total modifier:{' '}
            {ABILITY_NAMES.reduce((sum, ability) => {
              const rollId = getAssignedRoll(ability.key);
              const roll = rolls.find((r) => r.rollId === rollId);
              if (!roll) return sum;

              const total = calculateAbilityScoreValue(roll);
              return sum + getAbilityModifier(total);
            }, 0)}
          </p>
        )}
      </div>
    </div>
  );
}
