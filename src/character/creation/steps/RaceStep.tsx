import type { CharacterDraft } from '@/api';
import { Button } from '@/components/ui/Button';

interface RaceStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export function RaceStep({ onNext }: RaceStepProps) {
  return (
    <div className="space-y-6">
      <p style={{ color: 'var(--ink-brown)' }}>
        Race selection will be implemented once the ListRaces API is ready.
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext}>
          Continue (Skip for now)
        </Button>
      </div>
    </div>
  );
}
