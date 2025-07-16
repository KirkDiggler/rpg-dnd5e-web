import type { CharacterDraft } from '@/api';
import { useUpdateDraftName } from '@/api';
import { Button } from '@/components/ui/Button';
import { create } from '@bufbuild/protobuf';
import { UpdateNameRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';

interface NameStepProps {
  draft: CharacterDraft;
  onUpdate: (updates: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export function NameStep({ draft, onUpdate, onNext }: NameStepProps) {
  const [name, setName] = useState(draft.name || '');
  const [error, setError] = useState('');

  const { updateName, loading: isPending } = useUpdateDraftName();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Please enter a character name');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters long');
      return;
    }

    if (trimmedName.length > 50) {
      setError('Name must be 50 characters or less');
      return;
    }

    const request = create(UpdateNameRequestSchema, {
      draftId: draft.id,
      name: trimmedName,
    });
    updateName(request)
      .then(() => {
        onUpdate({ name: trimmedName });
        onNext();
      })
      .catch((error) => {
        setError('Failed to update name. Please try again.');
        console.error('Failed to update name:', error);
      });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="character-name"
          className="block text-sm font-medium mb-2"
        >
          Character Name
        </label>
        <input
          id="character-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="Enter your character's name"
          className="w-full px-4 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="text-sm text-muted space-y-2">
        <p>
          Choose a name that fits your character's personality and background.
        </p>
        <p>You can always change this later if you change your mind.</p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
