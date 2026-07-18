import { useUpdateDraftAbilityScores } from '@/api/hooks';
import { AnimatedStat } from '@/components/AnimatedStat';
import { Button } from '@/components/ui/Button';
import { formatModifier, getAbilityModifier } from '@/utils/diceCalculations';
import { create } from '@bufbuild/protobuf';
import { UpdateAbilityScoresRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AbilityScoresSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useContext, useState } from 'react';
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

// D&D 5e standard array. Fixed values, not dice rolls — assigning one to an
// ability never needs a server-issued roll ID, so scores are submitted to
// UpdateAbilityScores via the direct `ability_scores` field, not
// `roll_assignments` (that oneof branch is for an actual rolled-dice flow;
// see #460).
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

interface ScoreSlot {
  id: string;
  value: number;
}

const SCORE_SLOTS: ScoreSlot[] = STANDARD_ARRAY.map((value, index) => ({
  id: `standard-${index}`,
  value,
}));

interface ScoreDisplayProps {
  value: number;
  isAssigned: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function ScoreDisplay({
  value,
  isAssigned,
  isSelected,
  onClick,
}: ScoreDisplayProps) {
  const modifier = getAbilityModifier(value);
  const modifierStr = formatModifier(modifier);

  return (
    <motion.div
      data-testid={`score-slot-${value}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
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
      <div className="text-center">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted">{modifierStr}</div>
      </div>
      {isAssigned && (
        <div className="text-xs text-muted mt-1 text-center">Assigned</div>
      )}
    </motion.div>
  );
}

interface AbilitySlotProps {
  ability: (typeof ABILITY_NAMES)[0];
  assignedValue?: number;
  onSelect: () => void;
  isSelected: boolean;
}

function AbilitySlot({
  ability,
  assignedValue,
  onSelect,
  isSelected,
}: AbilitySlotProps) {
  return (
    <motion.div
      data-testid={`ability-slot-${ability.key}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : assignedValue
            ? 'border-green-500'
            : 'border-gray-300 hover:border-gray-400'
      }`}
      onClick={onSelect}
      style={{
        backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--card-bg)',
        borderColor: isSelected
          ? 'var(--accent-primary)'
          : assignedValue
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
        {assignedValue && (
          <CheckCircle
            className="w-4 h-4"
            style={{ color: 'var(--success)' }}
          />
        )}
      </div>

      {assignedValue ? (
        <AnimatedStat
          label={ability.label}
          value={assignedValue}
          previousValue={10}
          modifier={getAbilityModifier(assignedValue)}
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

interface AbilityScoresSectionProps {
  draftId?: string;
  // No longer used internally (see #460) — kept so existing callers
  // (ServerRollingDemo, AbilityScoresTest) keep compiling unchanged.
  playerId?: string;
}

export function AbilityScoresSection({
  draftId: propDraftId,
}: AbilityScoresSectionProps = {}) {
  const context = useContext(CharacterDraftContext);
  const draftId = propDraftId || context?.draftId;

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedAbility, setSelectedAbility] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<
    Partial<Record<AbilityKey, string>>
  >({});

  const { updateAbilityScores } = useUpdateDraftAbilityScores();

  const assignSlot = (ability: string, slotId: string) => {
    setAssignments((prev) => ({ ...prev, [ability]: slotId }));
  };

  const unassignSlot = (ability: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[ability as AbilityKey];
      return next;
    });
  };

  const isSlotAssigned = (slotId: string) =>
    Object.values(assignments).includes(slotId);

  const getAssignedSlotId = (ability: string) =>
    assignments[ability as AbilityKey];

  // All six abilities filled, and — since assignment always checks
  // isSlotAssigned before allowing a pick — each of the six slots used
  // exactly once. Re-verified explicitly here as the submit gate.
  const isComplete = () => {
    const requiredAbilities: AbilityKey[] = [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ];
    const assignedSlotIds = requiredAbilities
      .map((ability) => assignments[ability])
      .filter((slotId): slotId is string => Boolean(slotId));
    return (
      assignedSlotIds.length === requiredAbilities.length &&
      new Set(assignedSlotIds).size === requiredAbilities.length
    );
  };

  // Handle score slot selection
  const handleSlotClick = (slotId: string) => {
    if (isSlotAssigned(slotId)) return;

    if (selectedAbility) {
      // Assign slot to selected ability
      assignSlot(selectedAbility, slotId);
      setSelectedAbility(null);
      setSelectedSlotId(null);
    } else {
      // Select slot
      setSelectedSlotId(slotId === selectedSlotId ? null : slotId);
    }
  };

  // Handle ability selection
  const handleAbilityClick = (abilityKey: string) => {
    if (selectedSlotId) {
      // Assign selected slot to ability
      assignSlot(abilityKey, selectedSlotId);
      setSelectedSlotId(null);
      setSelectedAbility(null);
    } else {
      // Select ability or unassign if already assigned
      if (getAssignedSlotId(abilityKey)) {
        unassignSlot(abilityKey);
      } else {
        setSelectedAbility(abilityKey === selectedAbility ? null : abilityKey);
      }
    }
  };

  // Submit ability scores to server
  const handleSubmit = async () => {
    if (!draftId || !isComplete()) return;

    setIsSubmitting(true);
    try {
      const scoreFor = (ability: AbilityKey) => {
        const slotId = assignments[ability];
        return SCORE_SLOTS.find((slot) => slot.id === slotId)?.value ?? 0;
      };

      const abilityScores = create(AbilityScoresSchema, {
        strength: scoreFor('strength'),
        dexterity: scoreFor('dexterity'),
        constitution: scoreFor('constitution'),
        intelligence: scoreFor('intelligence'),
        wisdom: scoreFor('wisdom'),
        charisma: scoreFor('charisma'),
      });

      console.log('Submitting ability scores:', { draftId, abilityScores });

      const response = await updateAbilityScores(
        create(UpdateAbilityScoresRequestSchema, {
          draftId,
          scoresInput: {
            value: abilityScores,
            case: 'abilityScores',
          },
        })
      );

      console.log('Ability scores submitted successfully:', response);

      // Update the context with the new draft that includes ability scores
      if (response.draft && context) {
        // Update the context so the UI knows they're saved
        if (response.draft.baseAbilityScores) {
          context.setAbilityScores({
            strength: response.draft.baseAbilityScores.strength,
            dexterity: response.draft.baseAbilityScores.dexterity,
            constitution: response.draft.baseAbilityScores.constitution,
            intelligence: response.draft.baseAbilityScores.intelligence,
            wisdom: response.draft.baseAbilityScores.wisdom,
            charisma: response.draft.baseAbilityScores.charisma,
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
  const draftScores = context?.draft?.baseAbilityScores;
  if (draftScores) {
    const scores = draftScores;
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

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
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
      <h2
        className="text-2xl font-bold font-serif"
        style={{ color: 'var(--text-primary)' }}
      >
        Ability Scores
      </h2>

      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <p className="text-sm text-muted mb-2">
          Assign scores to abilities by clicking a score and then an ability
          slot. Click an assigned ability to unassign it.
        </p>
        <p className="text-sm text-muted">
          Standard Array: 15, 14, 13, 12, 10, 8
        </p>
      </div>

      {/* Available Scores - standard array has exactly 6 fixed values */}
      <div>
        <h3
          className="text-lg font-semibold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Available Scores
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {SCORE_SLOTS.map((slot) => (
            <ScoreDisplay
              key={slot.id}
              value={slot.value}
              isAssigned={isSlotAssigned(slot.id)}
              isSelected={selectedSlotId === slot.id}
              onClick={() => handleSlotClick(slot.id)}
            />
          ))}
        </div>
      </div>

      {/* Ability Slots */}
      <div>
        <h3
          className="text-lg font-semibold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Abilities
        </h3>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {ABILITY_NAMES.map((ability) => {
            const assignedSlotId = getAssignedSlotId(ability.key);
            const assignedSlot = SCORE_SLOTS.find(
              (slot) => slot.id === assignedSlotId
            );
            return (
              <AbilitySlot
                key={ability.key}
                ability={ability}
                assignedValue={assignedSlot?.value}
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
              const slotId = getAssignedSlotId(ability.key);
              const slot = SCORE_SLOTS.find((s) => s.id === slotId);
              if (!slot) return sum;

              return sum + getAbilityModifier(slot.value);
            }, 0)}
          </p>
        )}
      </div>
    </div>
  );
}
