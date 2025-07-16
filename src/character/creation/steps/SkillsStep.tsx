import type { CharacterDraft } from '@/api';
import { Button } from '@/components/ui/Button';

interface SkillsStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export function SkillsStep({ onNext }: SkillsStepProps) {
  return (
    <div className="space-y-6">
      <p style={{ color: 'var(--ink-brown)' }}>
        Skill proficiency selection will be implemented based on your chosen
        class and background.
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue (Skip for now)
        </Button>
      </div>
    </div>
  );
}
