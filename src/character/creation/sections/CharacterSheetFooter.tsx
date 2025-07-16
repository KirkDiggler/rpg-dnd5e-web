import { Button } from '@/components/ui/Button';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import { motion } from 'framer-motion';

interface CharacterSheetFooterProps {
  onComplete: (characterId: string) => void;
}

export function CharacterSheetFooter({
  onComplete,
}: CharacterSheetFooterProps) {
  const { selectedChoices, draft } = useCharacterBuilder();

  const isComplete = !!(
    draft?.name &&
    selectedChoices.race &&
    selectedChoices.class &&
    selectedChoices.background
  );

  const handleComplete = () => {
    if (isComplete) {
      // In real implementation, this would call the API to finalize the character
      onComplete('temp-character-id');
    }
  };

  const completionPercentage = Math.round(
    (Object.keys(selectedChoices).length / 4) * 100
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
            disabled={!isComplete}
            className="px-8 py-3 text-lg font-bold"
          >
            {isComplete ? 'Begin Adventure!' : 'Complete Character'}
          </Button>
        </motion.div>
      </div>

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
            {draft?.name}, a {String(selectedChoices.race)}{' '}
            {String(selectedChoices.class)} with a{' '}
            {String(selectedChoices.background)} background, is ready to embark
            on epic adventures!
          </p>
        </motion.div>
      )}
    </div>
  );
}
