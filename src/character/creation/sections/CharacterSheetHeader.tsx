import { Button } from '@/components/ui/Button';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface CharacterSheetHeaderProps {
  onCancel: () => void;
}

export function CharacterSheetHeader({ onCancel }: CharacterSheetHeaderProps) {
  const { draft, updateDraft } = useCharacterBuilder();
  const [isEditing, setIsEditing] = useState(!draft?.name);

  const handleNameChange = (name: string) => {
    updateDraft({ name });
    setIsEditing(false);
  };

  const handleNameClick = () => {
    setIsEditing(true);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Enter character name..."
              defaultValue={draft?.name || ''}
              className="text-3xl font-bold bg-transparent border-b-2 border-accent focus:outline-none focus:border-accent-primary"
              style={{
                color: 'var(--text-primary)',
                borderColor: 'var(--accent-primary)',
              }}
              autoFocus
              onBlur={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNameChange(e.currentTarget.value);
                }
              }}
            />
            <p className="text-sm text-muted">
              Press Enter or click away to save
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <h1
              className="text-3xl font-bold font-serif cursor-pointer hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
              onClick={handleNameClick}
            >
              {draft?.name || 'Unnamed Character'}
            </h1>
            <p className="text-sm text-muted">Click to edit name</p>
          </motion.div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Progress indicator */}
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-accent rounded-full"></div>
          <span className="text-sm text-muted">Building...</span>
        </div>

        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
