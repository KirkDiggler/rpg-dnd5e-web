import { ChoiceCardGrid } from '@/components/ChoiceCard';
import { DetailModal } from '@/components/DetailModal';
import { TraitBadge } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import { motion } from 'framer-motion';
import { useState } from 'react';

// Sample data - replace with API calls
const SAMPLE_RACES = [
  {
    id: 'human',
    title: 'Human',
    description: 'Versatile and ambitious, humans adapt to any situation.',
    rarity: 'common' as const,
    badge: 'Versatile',
    tags: ['Extra Feat', 'Extra Skill', 'Adaptable'],
    details: 'Humans are the most adaptable race...',
  },
  {
    id: 'elf',
    title: 'Elf',
    description: 'Graceful and magical, masters of blade and spell.',
    rarity: 'uncommon' as const,
    badge: 'Magical',
    tags: ['Darkvision', 'Keen Senses', 'Fey Ancestry'],
    details: 'Elves are magical beings...',
  },
  {
    id: 'dwarf',
    title: 'Dwarf',
    description: 'Hardy and determined, renowned for craftsmanship.',
    rarity: 'common' as const,
    badge: 'Resilient',
    tags: ['Darkvision', 'Stonecunning', 'Dwarven Resilience'],
    details: 'Dwarves are stout and proud...',
  },
];

const SAMPLE_CLASSES = [
  {
    id: 'fighter',
    title: 'Fighter',
    description: 'Master of weapons and armor, tactical combat expert.',
    rarity: 'common' as const,
    badge: 'Martial',
    tags: ['Fighting Style', 'Second Wind', 'Action Surge'],
    details: 'Fighters are versatile warriors...',
  },
  {
    id: 'wizard',
    title: 'Wizard',
    description: 'Scholar of magic, wielder of arcane power.',
    rarity: 'rare' as const,
    badge: 'Arcane',
    tags: ['Spellcasting', 'Ritual Casting', 'Arcane Recovery'],
    details: 'Wizards study the arcane arts...',
  },
  {
    id: 'rogue',
    title: 'Rogue',
    description: 'Stealthy and cunning, master of precision strikes.',
    rarity: 'uncommon' as const,
    badge: 'Cunning',
    tags: ['Sneak Attack', 'Expertise', 'Cunning Action'],
    details: 'Rogues excel at what others cant...',
  },
];

export function RaceClassSection() {
  const { setSelectedChoice, selectedChoices } = useCharacterBuilder();
  const [showRaceModal, setShowRaceModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);

  const selectedRace = SAMPLE_RACES.find((r) => r.id === selectedChoices.race);
  const selectedClass = SAMPLE_CLASSES.find(
    (c) => c.id === selectedChoices.class
  );

  const handleRaceSelect = (raceId: string) => {
    setSelectedChoice('race', raceId);
    setShowRaceModal(false);
  };

  const handleClassSelect = (classId: string) => {
    setSelectedChoice('class', classId);
    setShowClassModal(false);
  };

  return (
    <div className="space-y-6">
      <h2
        className="text-2xl font-bold font-serif"
        style={{ color: 'var(--text-primary)' }}
      >
        Character Identity
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Race Selection */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer"
          onClick={() => setShowRaceModal(true)}
        >
          <div
            className="p-6 rounded-lg border-2 border-dashed transition-all duration-300 hover:border-solid"
            style={{
              backgroundColor: selectedRace
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              borderColor: selectedRace
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
            }}
          >
            {selectedRace ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🧝</div>
                  <div>
                    <h3
                      className="text-xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedRace.title}
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedRace.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedRace.tags.map((tag) => (
                    <TraitBadge
                      key={tag}
                      name={tag}
                      type="racial"
                      icon={TraitIcons.racial}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted">Click to change race</p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="text-4xl opacity-50">🧝</div>
                <div>
                  <h3
                    className="text-xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Choose Race
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Select your character's heritage
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Class Selection */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer"
          onClick={() => setShowClassModal(true)}
        >
          <div
            className="p-6 rounded-lg border-2 border-dashed transition-all duration-300 hover:border-solid"
            style={{
              backgroundColor: selectedClass
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              borderColor: selectedClass
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
            }}
          >
            {selectedClass ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">⚔️</div>
                  <div>
                    <h3
                      className="text-xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedClass.title}
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedClass.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedClass.tags.map((tag) => (
                    <TraitBadge
                      key={tag}
                      name={tag}
                      type="class"
                      icon={TraitIcons.class}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted">Click to change class</p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="text-4xl opacity-50">⚔️</div>
                <div>
                  <h3
                    className="text-xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Choose Class
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Select your character's profession
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Race Selection Modal */}
      <DetailModal
        isOpen={showRaceModal}
        onClose={() => setShowRaceModal(false)}
        items={[
          {
            id: 'race-selection',
            title: 'Choose Your Race',
            content: (
              <div className="space-y-4">
                <p style={{ color: 'var(--text-muted)' }}>
                  Your race determines your character's heritage, appearance,
                  and natural abilities.
                </p>
                <ChoiceCardGrid
                  choices={SAMPLE_RACES}
                  selectedId={selectedChoices.race as string}
                  onSelect={handleRaceSelect}
                  columns={2}
                />
              </div>
            ),
          },
        ]}
      />

      {/* Class Selection Modal */}
      <DetailModal
        isOpen={showClassModal}
        onClose={() => setShowClassModal(false)}
        items={[
          {
            id: 'class-selection',
            title: 'Choose Your Class',
            content: (
              <div className="space-y-4">
                <p style={{ color: 'var(--text-muted)' }}>
                  Your class determines your character's abilities, role, and
                  playstyle.
                </p>
                <ChoiceCardGrid
                  choices={SAMPLE_CLASSES}
                  selectedId={selectedChoices.class as string}
                  onSelect={handleClassSelect}
                  columns={2}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
