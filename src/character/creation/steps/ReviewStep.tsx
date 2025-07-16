import type { CharacterDraft } from '@/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface ReviewStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onFinalize: () => void;
}

export function ReviewStep({ draft, onFinalize }: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3
          className="text-lg font-bold mb-4"
          style={{ color: 'var(--ink-black)' }}
        >
          Character Summary
        </h3>

        <div className="space-y-2">
          <div className="flex justify-between">
            <span style={{ color: 'var(--ink-sepia)' }}>Name:</span>
            <span className="font-semibold">{draft.name || 'Unnamed'}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--ink-sepia)' }}>Race:</span>
            <span className="font-semibold">
              {draft.race || 'Not selected'}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--ink-sepia)' }}>Class:</span>
            <span className="font-semibold">
              {draft.class || 'Not selected'}
            </span>
          </div>
        </div>
      </Card>

      <p className="text-sm" style={{ color: 'var(--ink-brown)' }}>
        Review your character details above. Once you finalize, your character
        will be created and ready for adventure!
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onFinalize}>
          Finalize Character
        </Button>
      </div>
    </div>
  );
}
