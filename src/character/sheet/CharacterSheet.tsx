import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useGetCharacter } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { CharacterHeader } from './components/CharacterHeader';
import { DnDAbilityScores } from './components/DnDAbilityScores';
import { DnDCombatStats } from './components/DnDCombatStats';
import { DnDEquipment } from './components/DnDEquipment';
import { DnDFeatures } from './components/DnDFeatures';
import { DnDProficiencies } from './components/DnDProficiencies';
import { DnDSavingThrows } from './components/DnDSavingThrows';
import { DnDSkills } from './components/DnDSkills';
import './dnd-sheet.css';

interface CharacterSheetProps {
  characterId: string;
  onBack: () => void;
}

// Helper components for the character sheet sections
function InspirationBox() {
  const [inspired, setInspired] = useState(false);

  return (
    <Card className="p-4 text-center">
      <h4
        className="text-sm font-bold mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        INSPIRATION
      </h4>
      <button
        onClick={() => setInspired(!inspired)}
        className="w-8 h-8 rounded border-2 transition-colors"
        style={{
          borderColor: 'var(--border-primary)',
          backgroundColor: inspired ? 'var(--accent-primary)' : 'transparent',
        }}
      />
    </Card>
  );
}

function ProficiencyBonusBox({ character }: { character: Character }) {
  // Use API proficiencyBonus when available, fallback to calculation
  const proficiencyBonus =
    character.combatStats?.proficiencyBonus !== undefined &&
    character.combatStats.proficiencyBonus > 0
      ? character.combatStats.proficiencyBonus
      : Math.ceil(character.level / 4) + 1;

  return (
    <Card className="p-4 text-center">
      <h4
        className="text-sm font-bold mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        PROFICIENCY BONUS
      </h4>
      <div
        className="text-2xl font-bold"
        style={{ color: 'var(--text-primary)' }}
      >
        +{proficiencyBonus}
      </div>
    </Card>
  );
}

function AttacksSection({ character }: { character: Character }) {
  // TODO: Get actual attacks from character data when available in API
  // For now, return empty attacks or could derive from equipment
  void character; // Acknowledge parameter usage
  const sampleAttacks = [
    {
      name: 'Longsword',
      atkBonus: '+5',
      damage: '1d8+3',
      range: '5 ft',
      notes: 'Versatile',
    },
    {
      name: 'Shortbow',
      atkBonus: '+3',
      damage: '1d6+1',
      range: '80/320 ft',
      notes: 'Ammunition',
    },
  ];

  return (
    <Card className="p-4">
      <h4
        className="text-lg font-bold mb-3 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        ATTACKS & SPELLCASTING
      </h4>
      <div className="space-y-2">
        {/* Attack headers */}
        <div
          className="grid grid-cols-5 gap-2 text-xs font-bold pb-2 border-b"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div>NAME</div>
          <div>ATK BONUS</div>
          <div>DAMAGE/TYPE</div>
          <div>RANGE</div>
          <div>NOTES</div>
        </div>

        {/* Attack rows - display only */}
        {sampleAttacks.map((attack, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-2 py-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            <div className="font-medium">{attack.name}</div>
            <div className="text-center">{attack.atkBonus}</div>
            <div className="text-center">{attack.damage}</div>
            <div className="text-center">{attack.range}</div>
            <div className="text-sm">{attack.notes}</div>
          </div>
        ))}

        {/* Empty rows for character sheet feel */}
        {Array.from({ length: Math.max(0, 3 - sampleAttacks.length) }).map(
          (_, i) => (
            <div
              key={`empty-${i}`}
              className="grid grid-cols-5 gap-2 py-2 text-sm border-b"
              style={{
                color: 'var(--text-muted)',
                borderColor: 'var(--border-primary)',
                borderStyle: 'dashed',
              }}
            >
              <div>—</div>
              <div className="text-center">—</div>
              <div className="text-center">—</div>
              <div className="text-center">—</div>
              <div>—</div>
            </div>
          )
        )}
      </div>
    </Card>
  );
}

export function CharacterSheet({ characterId, onBack }: CharacterSheetProps) {
  const {
    data: character,
    loading,
    error,
    refetch,
  } = useGetCharacter(characterId);
  const [modalContent, setModalContent] = useState<{
    title: string;
    content: React.ReactNode;
  } | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-4 border-t-transparent rounded-full"
          style={{
            borderColor: 'var(--board-accent)',
            borderTopColor: 'transparent',
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-8">
        <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
          Failed to load character
        </p>
        <div className="space-x-4">
          <Button variant="secondary" onClick={() => refetch()}>
            Try Again
          </Button>
          <Button variant="secondary" onClick={onBack}>
            Back to List
          </Button>
        </div>
      </Card>
    );
  }

  if (!character) {
    return (
      <Card className="text-center py-8">
        <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
          Character not found
        </p>
        <Button variant="secondary" onClick={onBack}>
          Back to List
        </Button>
      </Card>
    );
  }

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-6xl mx-auto"
      >
        {/* Back Button - Outside the paper */}
        <div className="flex justify-start mb-6">
          <Button variant="secondary" onClick={onBack}>
            ← Back to Character List
          </Button>
        </div>

        {/* Character Sheet Paper Container */}
        <div
          className="dnd-sheet rounded-lg shadow-2xl p-8 space-y-6"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-modal)',
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          {/* Character Header */}
          <CharacterHeader character={character} />

          {/* Top Row - Inspiration and Proficiency Bonus */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <InspirationBox />
            <ProficiencyBonusBox character={character} />
          </div>

          {/* Combat Stats - Compact Row */}
          <div className="mb-6">
            <DnDCombatStats character={character} />
          </div>

          {/* Main Stats - Ability Scores, Saving Throws, Skills */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <DnDAbilityScores character={character} />
            <DnDSavingThrows character={character} />
            <DnDSkills character={character} />
          </div>

          {/* Full Width Sections Below */}
          <div className="mt-6 space-y-6">
            {/* Attacks & Spellcasting */}
            <AttacksSection character={character} />

            {/* Equipment, Features, etc. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <DnDEquipment
                character={character}
                onShowModal={(title, content) =>
                  setModalContent({ title, content })
                }
              />
              <DnDProficiencies
                character={character}
                onShowModal={(title, content) =>
                  setModalContent({ title, content })
                }
              />
              <DnDFeatures
                character={character}
                onShowModal={(title, content) =>
                  setModalContent({ title, content })
                }
              />
            </div>
          </div>

          {/* Detail Modal */}
          {modalContent && (
            <Modal
              title={modalContent.title}
              onClose={() => setModalContent(null)}
            >
              {modalContent.content}
            </Modal>
          )}
        </div>
      </motion.div>
    </div>
  );
}
