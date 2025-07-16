import type { CharacterDraft } from '@/api';
import { Button } from '@/components/ui/Button';

interface ClassStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export function ClassStep({ onNext }: ClassStepProps) {
  return (
    <div className="space-y-6">
      <p style={{ color: 'var(--ink-brown)' }}>
        Class selection will be implemented once the ListClasses API is ready.
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue (Skip for now)
        </Button>
      </div>
    </div>
  );
}
