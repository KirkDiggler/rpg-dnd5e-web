import type { CharacterDraft } from '@/api';
import { Button } from '@/components/ui/Button';

interface AbilityScoresStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export function AbilityScoresStep({ onNext }: AbilityScoresStepProps) {
  return (
    <div className="space-y-6">
      <p style={{ color: 'var(--ink-brown)' }}>
        Ability score assignment will be implemented here. This will include
        standard array, point buy, or manual entry options.
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue (Skip for now)
        </Button>
      </div>
    </div>
  );
}
