import { useFinalizeDraft, useValidateDraft } from '@/api/hooks';
import { useCharacterDraft } from '@/character/creation/useCharacterDraft';
import { Button } from '@/components/ui/Button';
import { create } from '@bufbuild/protobuf';
import {
  FinalizeDraftRequestSchema,
  ValidateDraftRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface CharacterSheetFooterProps {
  onComplete: (characterId: string) => void;
}

export function CharacterSheetFooter({
  onComplete,
}: CharacterSheetFooterProps) {
  const { draft, draftId, raceInfo, classInfo } = useCharacterDraft();
  const { finalizeDraft, loading: finalizing } = useFinalizeDraft();
  const { validateDraft, loading: validating } = useValidateDraft();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const isComplete = !!(
    draft?.name &&
    raceInfo &&
    classInfo &&
    draft?.abilityScores &&
    draft?.background
  );

  const handleComplete = async () => {
    if (!isComplete || !draftId) return;

    setValidationErrors([]);

    try {
      // First validate the draft
      const validateRequest = create(ValidateDraftRequestSchema, {
        draftId,
      });
      const validateResponse = await validateDraft(validateRequest);

      if (!validateResponse.isValid) {
        const errors = validateResponse.errors?.map((e) =>
          typeof e === 'string' ? e : e.message || 'Validation error'
        ) || ['Draft validation failed'];
        setValidationErrors(errors);
        return;
      }

      // If valid, finalize the draft
      const finalizeRequest = create(FinalizeDraftRequestSchema, {
        draftId,
      });
      const finalizeResponse = await finalizeDraft(finalizeRequest);

      if (finalizeResponse.character?.id) {
        onComplete(finalizeResponse.character.id);
      }
    } catch (err) {
      console.error('Failed to finalize character:', err);
      setValidationErrors([
        err instanceof Error ? err.message : 'Failed to finalize character',
      ]);
    }
  };

  // Calculate completion percentage based on required fields
  const requiredFields = [
    draft?.name,
    raceInfo,
    classInfo,
    draft?.abilityScores,
    draft?.background,
  ];
  const completedFields = requiredFields.filter(Boolean).length;
  const completionPercentage = Math.round(
    (completedFields / requiredFields.length) * 100
  );

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Character Creation Progress
          </span>
          <span className="text-sm text-muted">
            {completionPercentage}% Complete
          </span>
        </div>
        <div className="resource-bar">
          <motion.div
            className="resource-fill"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted">
          {isComplete
            ? 'Your character is ready for adventure!'
            : 'Complete all sections to finalize your character'}
        </div>

        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="primary"
            onClick={handleComplete}
            disabled={!isComplete || finalizing || validating}
            className="px-8 py-3 text-lg font-bold"
          >
            {finalizing || validating
              ? 'Finalizing...'
              : isComplete
                ? 'Begin Adventure!'
                : 'Complete Character'}
          </Button>
        </motion.div>
      </div>

      {/* Error Display */}
      {validationErrors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-lg border border-red-500 bg-red-50 dark:bg-red-900/20"
        >
          <h3 className="font-bold mb-2 text-red-700 dark:text-red-400">
            Validation Errors
          </h3>
          <ul className="list-disc list-inside space-y-1">
            {validationErrors.map((error, index) => (
              <li
                key={index}
                className="text-sm text-red-600 dark:text-red-300"
              >
                {error}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Character Summary */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--accent-primary)',
          }}
        >
          <h3
            className="font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Character Summary
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {draft?.name}, a {raceInfo?.name || 'Unknown'}{' '}
            {classInfo?.name || 'Unknown'} with a{' '}
            {typeof draft?.background === 'string'
              ? draft.background
              : draft?.background?.name || 'mysterious'}{' '}
            background, is ready to embark on epic adventures!
          </p>
        </motion.div>
      )}
    </div>
  );
}
