import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Ability } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Card } from '../../../components/ui/Card';

interface DnDSavingThrowsProps {
  character: Character;
}

// Helper function to calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Helper function to format modifier with sign
function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

// Helper function to calculate proficiency bonus
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

export function DnDSavingThrows({ character }: DnDSavingThrowsProps) {
  const abilityScores = character.abilityScores;
  const proficiencyBonus = character.combatStats?.proficiencyBonus !== undefined && character.combatStats.proficiencyBonus > 0
    ? character.combatStats.proficiencyBonus 
    : calculateProficiencyBonus(character.level);

  // Get saving throw proficiencies from API
  const savingThrowProficiencies = character.proficiencies?.savingThrows || [];

  const savingThrows = [
    {
      name: 'Strength',
      short: 'STR',
      modifier: calculateModifier(abilityScores?.strength || 10),
      proficient: savingThrowProficiencies.includes(Ability.STRENGTH),
    },
    {
      name: 'Dexterity',
      short: 'DEX',
      modifier: calculateModifier(abilityScores?.dexterity || 10),
      proficient: savingThrowProficiencies.includes(Ability.DEXTERITY),
    },
    {
      name: 'Constitution',
      short: 'CON',
      modifier: calculateModifier(abilityScores?.constitution || 10),
      proficient: savingThrowProficiencies.includes(Ability.CONSTITUTION),
    },
    {
      name: 'Intelligence',
      short: 'INT',
      modifier: calculateModifier(abilityScores?.intelligence || 10),
      proficient: savingThrowProficiencies.includes(Ability.INTELLIGENCE),
    },
    {
      name: 'Wisdom',
      short: 'WIS',
      modifier: calculateModifier(abilityScores?.wisdom || 10),
      proficient: savingThrowProficiencies.includes(Ability.WISDOM),
    },
    {
      name: 'Charisma',
      short: 'CHA',
      modifier: calculateModifier(abilityScores?.charisma || 10),
      proficient: savingThrowProficiencies.includes(Ability.CHARISMA),
    },
  ];

  return (
    <Card className="p-4">
      <h4
        className="text-sm font-bold mb-3 uppercase tracking-wider text-center"
        style={{
          color: 'var(--text-primary)',
        }}
      >
        Saving Throws
      </h4>

      <div className="space-y-1">
        {savingThrows.map((save) => {
          const totalModifier =
            save.modifier + (save.proficient ? proficiencyBonus : 0);

          return (
            <div
              key={save.short}
              className="flex items-center justify-between py-1 px-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {/* Left side - Proficiency dot and modifier */}
              <div className="flex items-center gap-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${save.proficient ? 'bg-green-500' : 'bg-gray-300'}`}
                />
                <div
                  className="font-bold text-xs w-6 text-right"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatModifier(totalModifier)}
                </div>
              </div>

              {/* Right side - Ability Name */}
              <div
                className="text-xs"
                style={{ color: 'var(--text-primary)' }}
              >
                {save.name}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
