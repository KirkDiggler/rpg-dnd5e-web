import type { CharacterDraft } from '@/api';
import { Button } from '@/components/ui/Button';

interface BackgroundStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export function BackgroundStep({ onNext }: BackgroundStepProps) {
  return (
    <div className="space-y-6">
      <p style={{ color: 'var(--ink-brown)' }}>
        Background selection will provide additional skills, languages, and
        roleplay elements for your character.
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue (Skip for now)
        </Button>
      </div>
    </div>
  );
}
