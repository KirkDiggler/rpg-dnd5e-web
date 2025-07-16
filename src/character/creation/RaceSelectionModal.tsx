import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

interface Race {
  id: string;
  name: string;
  emoji: string;
  description: string;
  traits: string[];
  abilityScoreIncrease: string;
  size: string;
  speed: string;
}

const RACES: Race[] = [
  {
    id: 'human',
    name: 'Human',
    emoji: '👨',
    description:
      'The most ambitious and adaptable of the common races, humans have no unified culture or homeland.',
    traits: ['Versatile', 'Adaptable', 'Ambitious'],
    abilityScoreIncrease: '+1 to all ability scores',
    size: 'Medium',
    speed: '30 feet',
  },
  {
    id: 'elf',
    name: 'Elf',
    emoji: '🧝',
    description:
      'Elves are a magical people of otherworldly grace, living in the world but not entirely part of it.',
    traits: ['Darkvision', 'Fey Ancestry', 'Trance'],
    abilityScoreIncrease: '+2 Dexterity',
    size: 'Medium',
    speed: '30 feet',
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    emoji: '🧔',
    description:
      'Bold and hardy, dwarves are known as skilled warriors, miners, and workers of stone and metal.',
    traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'],
    abilityScoreIncrease: '+2 Constitution',
    size: 'Medium',
    speed: '25 feet',
  },
  {
    id: 'halfling',
    name: 'Halfling',
    emoji: '🧙',
    description:
      'Halflings are an affable and cheerful people who cherish the bonds of family and friendship.',
    traits: ['Lucky', 'Brave', 'Halfling Nimbleness'],
    abilityScoreIncrease: '+2 Dexterity',
    size: 'Small',
    speed: '25 feet',
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    emoji: '🐉',
    description:
      'Born of dragons, as their name proclaims, dragonborn walk proudly through a world that greets them with fearful incomprehension.',
    traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'],
    abilityScoreIncrease: '+2 Strength, +1 Charisma',
    size: 'Medium',
    speed: '30 feet',
  },
  {
    id: 'gnome',
    name: 'Gnome',
    emoji: '🧞',
    description:
      'Small, energetic, and innately magical, gnomes are driven by curiosity and a love of discovery.',
    traits: ['Darkvision', 'Gnome Cunning', 'Tinker'],
    abilityScoreIncrease: '+2 Intelligence',
    size: 'Small',
    speed: '25 feet',
  },
  {
    id: 'half-elf',
    name: 'Half-Elf',
    emoji: '🧝‍♂️',
    description:
      'Walking in two worlds but truly belonging to neither, half-elves combine what some say are the best qualities of their elf and human parents.',
    traits: ['Darkvision', 'Fey Ancestry', 'Two Skills'],
    abilityScoreIncrease: '+2 Charisma, +1 to two others',
    size: 'Medium',
    speed: '30 feet',
  },
  {
    id: 'half-orc',
    name: 'Half-Orc',
    emoji: '🗡️',
    description:
      'Whether united under the leadership of a mighty warlock or having fought to a standstill after years of conflict, orc and human tribes sometimes form alliances.',
    traits: ['Darkvision', 'Relentless Endurance', 'Savage Attacks'],
    abilityScoreIncrease: '+2 Strength, +1 Constitution',
    size: 'Medium',
    speed: '30 feet',
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    emoji: '😈',
    description:
      'To be greeted with stares and whispers, to suffer violence and insult on the street, to see mistrust and fear in every eye: this is the lot of the tiefling.',
    traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
    abilityScoreIncrease: '+2 Charisma, +1 Intelligence',
    size: 'Medium',
    speed: '30 feet',
  },
];

interface RaceSelectionModalProps {
  isOpen: boolean;
  currentRace?: string;
  onSelect: (race: Race) => void;
  onClose: () => void;
}

export function RaceSelectionModal({
  isOpen,
  currentRace,
  onSelect,
  onClose,
}: RaceSelectionModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (currentRace) {
      const index = RACES.findIndex((race) => race.name === currentRace);
      return index >= 0 ? index : 0;
    }
    return 0;
  });

  const currentRaceData = RACES[selectedIndex];

  const nextRace = () => {
    setSelectedIndex((prev) => (prev + 1) % RACES.length);
  };

  const prevRace = () => {
    setSelectedIndex((prev) => (prev - 1 + RACES.length) % RACES.length);
  };

  const handleSelect = () => {
    onSelect(currentRaceData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative max-w-2xl w-full mx-4 rounded-lg shadow-2xl"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '3px solid var(--border-primary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="p-6 border-b"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <div className="flex items-center justify-between">
              <h2
                className="text-2xl font-bold font-serif"
                style={{ color: 'var(--text-primary)' }}
              >
                Choose Your Race
              </h2>
              <button
                onClick={onClose}
                className="text-2xl hover:opacity-70 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Carousel Content */}
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-4 mb-4">
                <button
                  onClick={prevRace}
                  className="p-2 rounded-full hover:bg-opacity-80 transition-all"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <span className="text-xl">←</span>
                </button>

                <div className="flex-1 max-w-md">
                  <div className="text-6xl mb-2">{currentRaceData.emoji}</div>
                  <h3
                    className="text-3xl font-bold font-serif mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {currentRaceData.name}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {selectedIndex + 1} of {RACES.length}
                  </p>
                </div>

                <button
                  onClick={nextRace}
                  className="p-2 rounded-full hover:bg-opacity-80 transition-all"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <span className="text-xl">→</span>
                </button>
              </div>
            </div>

            {/* Race Details */}
            <div className="space-y-4 mb-6">
              <div>
                <h4
                  className="font-bold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Description
                </h4>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {currentRaceData.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4
                    className="font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Racial Traits
                  </h4>
                  <ul className="text-sm space-y-1">
                    {currentRaceData.traits.map((trait, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-xs">•</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {trait}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <div>
                    <h4
                      className="font-bold mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Ability Score Increase
                    </h4>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {currentRaceData.abilityScoreIncrease}
                    </p>
                  </div>
                  <div>
                    <h4
                      className="font-bold mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Size & Speed
                    </h4>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {currentRaceData.size}, {currentRaceData.speed}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg border transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleSelect}
                className="px-8 py-2 rounded-lg font-bold transition-all hover:scale-105"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                Select {currentRaceData.name}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
