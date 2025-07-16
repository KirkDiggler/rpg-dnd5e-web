import { STANDARD_DICE } from '@/constants/dice';
import { TraitIcons } from '@/constants/traits';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { AnimatedStatGrid } from './AnimatedStat';
import { ChoiceCardGrid, type ChoiceCardProps } from './ChoiceCard';
import { DetailModal, type DetailModalItem } from './DetailModal';
import {
  DiceRoller,
  DiceRollHistory,
  DiceTray,
  type DiceRoll,
} from './DiceRoller';
import { TraitBadge, TraitBadgeGroup } from './TraitBadge';

export function Phase1Demo() {
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<string>('');
  const [abilityScores, setAbilityScores] = useState({
    strength: 10,
    dexterity: 12,
    constitution: 14,
    intelligence: 13,
    wisdom: 11,
    charisma: 15,
  });
  const [diceRolls, setDiceRolls] = useState<DiceRoll[]>([]);

  // Sample race data
  const races: ChoiceCardProps[] = [
    {
      id: 'human',
      title: 'Human',
      description:
        'Versatile and ambitious, humans are the most adaptable of all races.',
      rarity: 'common',
      badge: 'Versatile',
      tags: ['Extra Feat', 'Extra Skill', 'Adaptable'],
      details: 'Humans are known for their ambition and versatility...',
    },
    {
      id: 'elf',
      title: 'Elf',
      description:
        'Graceful and magical, elves are masters of both blade and spell.',
      rarity: 'uncommon',
      badge: 'Magical',
      tags: ['Darkvision', 'Keen Senses', 'Fey Ancestry'],
      details: 'Elves are a magical people of otherworldly grace...',
    },
    {
      id: 'dwarf',
      title: 'Dwarf',
      description:
        'Hardy and determined, dwarves are renowned for their craftsmanship.',
      rarity: 'common',
      badge: 'Resilient',
      tags: ['Darkvision', 'Stonecunning', 'Dwarven Resilience'],
      details: 'Dwarves are a stout race known for their skill in warfare...',
    },
    {
      id: 'dragonborn',
      title: 'Dragonborn',
      description:
        'Born of dragons, as their name proclaims, dragonborn are proud and honor-bound.',
      rarity: 'rare',
      badge: 'Draconic',
      tags: ['Breath Weapon', 'Damage Resistance', 'Draconic Ancestry'],
      details: 'Dragonborn look very much like dragons standing erect...',
    },
  ];

  // Sample detail modal items
  const detailItems: DetailModalItem[] = races.map((race) => ({
    id: race.id,
    title: race.title,
    content: (
      <div className="space-y-4">
        <p>{race.description}</p>
        <div>
          <h4 className="font-semibold mb-2">Racial Traits:</h4>
          <div className="flex flex-wrap gap-2">
            {race.tags?.map((tag) => (
              <TraitBadge key={tag} name={tag} type="racial" />
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Ability Score Increase:</h4>
          <p>Various bonuses depending on subrace...</p>
        </div>
      </div>
    ),
  }));

  // Sample traits
  const traits = [
    {
      id: '1',
      name: 'Darkvision',
      type: 'racial' as const,
      description: 'See in darkness up to 60 feet',
    },
    {
      id: '2',
      name: 'Keen Senses',
      type: 'racial' as const,
      description: 'Proficiency in Perception',
    },
    {
      id: '3',
      name: 'Action Surge',
      type: 'class' as const,
      description: 'Take an additional action',
    },
    {
      id: '4',
      name: 'Second Wind',
      type: 'class' as const,
      description: 'Regain hit points as a bonus action',
    },
    {
      id: '5',
      name: 'Noble',
      type: 'background' as const,
      description: 'You understand wealth and power',
    },
  ];

  const handleRaceSelect = (raceId: string) => {
    setSelectedRace(raceId);
    // Simulate ability score changes
    const newScores = { ...abilityScores };
    switch (raceId) {
      case 'human':
        Object.keys(newScores).forEach((key) => {
          newScores[key as keyof typeof newScores] += 1;
        });
        break;
      case 'elf':
        newScores.dexterity += 2;
        break;
      case 'dwarf':
        newScores.constitution += 2;
        break;
      case 'dragonborn':
        newScores.strength += 2;
        newScores.charisma += 1;
        break;
    }
    setAbilityScores(newScores);
  };

  const handleDetailsClick = (raceId: string) => {
    setSelectedDetails(raceId);
    setShowDetailsModal(true);
  };

  const handleDiceRoll = (roll: DiceRoll) => {
    setDiceRolls((prev) => [roll, ...prev]);
  };

  const clearDiceHistory = () => {
    setDiceRolls([]);
  };

  const statData = Object.entries(abilityScores).map(([key, value]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value,
    previousValue: 10,
    modifier: Math.floor((value - 10) / 2),
  }));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-center mb-2 font-serif">
          Phase 1 Interactive Components Demo
        </h1>
        <p className="text-center text-muted mb-8">
          Showcase of the new interactive character creation components
        </p>
      </motion.div>

      {/* Race Selection */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Race Selection</h2>
        <ChoiceCardGrid
          choices={races}
          selectedId={selectedRace}
          onSelect={handleRaceSelect}
          onDetailsClick={handleDetailsClick}
          columns={2}
        />
      </section>

      {/* Ability Scores */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Ability Scores</h2>
        <AnimatedStatGrid
          stats={statData}
          animate={true}
          size="medium"
          columns={6}
        />
      </section>

      {/* Traits */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Character Traits</h2>
        <TraitBadgeGroup
          title="Racial Traits"
          traits={traits
            .filter((t) => t.type === 'racial')
            .map((t) => ({
              ...t,
              icon: TraitIcons.racial,
            }))}
        />
        <TraitBadgeGroup
          title="Class Features"
          traits={traits
            .filter((t) => t.type === 'class')
            .map((t) => ({
              ...t,
              icon: TraitIcons.class,
            }))}
        />
        <TraitBadgeGroup
          title="Background"
          traits={traits
            .filter((t) => t.type === 'background')
            .map((t) => ({
              ...t,
              icon: TraitIcons.background,
            }))}
        />
      </section>

      {/* Dice Rolling */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Dice Rolling</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium mb-4">Standard Dice</h3>
            <DiceTray dice={STANDARD_DICE} onRoll={handleDiceRoll} />
          </div>
          <div>
            <h3 className="text-lg font-medium mb-4">Ability Score Roll</h3>
            <DiceRoller
              dice="d6"
              count={4}
              label="Roll 4d6"
              size="large"
              onRoll={handleDiceRoll}
            />
          </div>
        </div>
        <DiceRollHistory
          rolls={diceRolls}
          maxRolls={10}
          onClear={clearDiceHistory}
        />
      </section>

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        items={detailItems}
        initialItemId={selectedDetails}
        showNavigation={true}
        enableSwipe={true}
      />
    </div>
  );
}
