import type {
  Character,
  CharacterDraft,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useDeleteCharacter } from '../../api/hooks';
import { Button } from '../ui/Button';

// Helper to convert Race enum to display name
function getRaceDisplayName(raceEnum: Race): string {
  const raceNames: Record<Race, string> = {
    [Race.UNSPECIFIED]: 'Unknown',
    [Race.HUMAN]: 'Human',
    [Race.ELF]: 'Elf',
    [Race.DWARF]: 'Dwarf',
    [Race.HALFLING]: 'Halfling',
    [Race.DRAGONBORN]: 'Dragonborn',
    [Race.GNOME]: 'Gnome',
    [Race.HALF_ELF]: 'Half-Elf',
    [Race.HALF_ORC]: 'Half-Orc',
    [Race.TIEFLING]: 'Tiefling',
  };
  return raceNames[raceEnum] || 'Unknown Race';
}

// Helper to convert Class enum to display name
function getClassDisplayName(classEnum: Class): string {
  const classNames: Record<Class, string> = {
    [Class.UNSPECIFIED]: 'Unknown',
    [Class.BARBARIAN]: 'Barbarian',
    [Class.BARD]: 'Bard',
    [Class.CLERIC]: 'Cleric',
    [Class.DRUID]: 'Druid',
    [Class.FIGHTER]: 'Fighter',
    [Class.MONK]: 'Monk',
    [Class.PALADIN]: 'Paladin',
    [Class.RANGER]: 'Ranger',
    [Class.ROGUE]: 'Rogue',
    [Class.SORCERER]: 'Sorcerer',
    [Class.WARLOCK]: 'Warlock',
    [Class.WIZARD]: 'Wizard',
  };
  return classNames[classEnum] || 'Unknown Class';
}

interface SelectedCharacterPanelProps {
  character: Character | null;
  draft: CharacterDraft | null;
  onPlay: (characterId: string) => void;
  onViewSheet: (characterId: string) => void;
  onContinueDraft: (draftId: string) => void;
  onDelete: (characterId: string) => void;
  onDeleteDraft: (draftId: string) => void;
}

export function SelectedCharacterPanel({
  character,
  draft,
  onPlay,
  onViewSheet,
  onContinueDraft,
  onDelete,
  onDeleteDraft,
}: SelectedCharacterPanelProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { deleteCharacter, loading: deleteLoading } = useDeleteCharacter();

  const handleDeleteConfirm = async () => {
    if (character) {
      try {
        await deleteCharacter(character.id);
        onDelete(character.id);
      } catch (error) {
        console.error('Failed to delete character:', error);
      }
    } else if (draft) {
      // TODO: Add delete draft API call
      onDeleteDraft(draft.id);
    }
    setShowDeleteConfirm(false);
  };

  // Nothing selected
  if (!character && !draft) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-8"
      >
        <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
          Select a character to continue
        </p>
      </motion.div>
    );
  }

  // Draft selected
  if (draft) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`draft-${draft.id}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="rounded-xl p-8"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '2px dashed var(--border-primary)',
          }}
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Character Info */}
            <div className="flex-1 text-center md:text-left">
              <h2
                className="text-3xl font-bold mb-2"
                style={{
                  fontFamily: 'Cinzel, serif',
                  color: 'var(--text-primary)',
                }}
              >
                {draft.name || 'Unnamed Character'}
              </h2>
              <p style={{ color: 'var(--text-muted)' }}>
                {draft.race ? getRaceDisplayName(draft.race) : 'No Race'} •{' '}
                {draft.class ? getClassDisplayName(draft.class) : 'No Class'}
              </p>
              <p className="mt-2 text-sm" style={{ color: 'var(--warning)' }}>
                {draft.progress?.completionPercentage || 0}% complete
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="xl"
                variant="primary"
                onClick={() => onContinueDraft(draft.id)}
                className="rounded-xl"
              >
                Continue Creation
              </Button>
              <Button
                size="lg"
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-xl"
              >
                Delete
              </Button>
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <DeleteConfirmModal
              name={draft.name || 'this draft'}
              onConfirm={handleDeleteConfirm}
              onCancel={() => setShowDeleteConfirm(false)}
              loading={deleteLoading}
            />
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Character selected
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`char-${character!.id}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="p-8"
      >
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Stats row */}
          <div className="flex gap-8 justify-center">
            <StatBlock label="HP" value={character!.currentHitPoints || 0} />
            <StatBlock
              label="AC"
              value={character!.combatStats?.armorClass || 10}
            />
          </div>

          {/* Name and details */}
          <div>
            <h2
              className="text-4xl font-bold mb-2"
              style={{
                fontFamily: 'Cinzel, serif',
                color: 'var(--text-primary)',
              }}
            >
              {character!.name}
            </h2>
            <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
              Level {character!.level} {getRaceDisplayName(character!.race)}{' '}
              {getClassDisplayName(character!.class)}
            </p>
          </div>

          {/* Action Buttons - balanced size */}
          <div className="flex flex-col gap-3 mt-4">
            <Button
              size="xl"
              variant="primary"
              onClick={() => onPlay(character!.id)}
              className="rounded-xl shadow-lg"
            >
              Play
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => onViewSheet(character!.id)}
              className="rounded-xl"
            >
              View Sheet
            </Button>
            <Button
              size="md"
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-xl"
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <DeleteConfirmModal
            name={character!.name}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setShowDeleteConfirm(false)}
            loading={deleteLoading}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Stat Block Component
function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="text-center px-6 py-3 rounded-xl"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div
        className="text-sm uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-3xl font-bold"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

// Delete Confirmation Modal
interface DeleteConfirmModalProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteConfirmModal({
  name,
  onConfirm,
  onCancel,
  loading,
}: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full mx-4 p-8 rounded-xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '2px solid var(--danger)',
        }}
      >
        <h3
          className="text-2xl font-bold text-center mb-4"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          Delete Character?
        </h3>
        <p className="text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          Are you sure you want to delete <strong>{name}</strong>? This cannot
          be undone.
        </p>
        <div className="flex gap-4">
          <Button
            size="lg"
            variant="secondary"
            onClick={onCancel}
            className="flex-1 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            size="lg"
            variant="danger"
            onClick={onConfirm}
            loading={loading}
            className="flex-1 rounded-xl"
          >
            Delete
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
