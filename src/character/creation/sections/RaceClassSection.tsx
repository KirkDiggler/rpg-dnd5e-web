import { TraitBadge } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import type {
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { ClassChoices } from '../ClassSelectionModal';
import { ClassSelectionModal } from '../ClassSelectionModal';
import type { RaceChoices } from '../RaceSelectionModal';
import { RaceSelectionModal } from '../RaceSelectionModal';

export function RaceClassSection() {
  const { setSelectedChoice } = useCharacterBuilder();
  const [showRaceModal, setShowRaceModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedRaceData, setSelectedRaceData] = useState<RaceInfo | null>(
    null
  );
  const [selectedClassData, setSelectedClassData] = useState<ClassInfo | null>(
    null
  );

  const handleRaceSelect = (race: RaceInfo, choices: RaceChoices) => {
    setSelectedRaceData(race);
    setSelectedChoice('race', race.id);
    setSelectedChoice('raceData', race);
    setSelectedChoice('raceChoices', choices);
    setShowRaceModal(false);
  };

  const handleClassSelect = (classData: ClassInfo, choices: ClassChoices) => {
    setSelectedClassData(classData);
    setSelectedChoice('class', classData.id);
    setSelectedChoice('classData', classData);
    setSelectedChoice('classChoices', choices);
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
              backgroundColor: selectedRaceData
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              borderColor: selectedRaceData
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
            }}
          >
            {selectedRaceData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🧝</div>
                  <div>
                    <h3
                      className="text-xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedRaceData.name}
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedRaceData.description ||
                        'A proud member of this race'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedRaceData.traits.map((trait) => (
                    <TraitBadge
                      key={trait.name}
                      name={trait.name}
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
              backgroundColor: selectedClassData
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              borderColor: selectedClassData
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
            }}
          >
            {selectedClassData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">⚔️</div>
                  <div>
                    <h3
                      className="text-xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedClassData.name}
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedClassData.description ||
                        'A master of their craft'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedClassData.level1Features
                    .slice(0, 3)
                    .map((feature) => (
                      <TraitBadge
                        key={feature.name}
                        name={feature.name}
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
      <RaceSelectionModal
        isOpen={showRaceModal}
        currentRace={selectedRaceData?.name}
        onSelect={handleRaceSelect}
        onClose={() => setShowRaceModal(false)}
      />

      {/* Class Selection Modal */}
      <ClassSelectionModal
        isOpen={showClassModal}
        currentClass={selectedClassData?.name}
        onSelect={handleClassSelect}
        onClose={() => setShowClassModal(false)}
      />
    </div>
  );
}
