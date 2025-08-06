import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface ProficienciesDisplayProps {
  character: Character;
}

interface ProficiencyCategory {
  name: string;
  items: string[];
  icon: string;
}

export function ProficienciesDisplay({ character }: ProficienciesDisplayProps) {
  // Get actual proficiencies from character data
  const proficiencies: ProficiencyCategory[] = [];

  // Armor Proficiencies
  const armorProficiencies = character.proficiencies?.armor || [];
  if (armorProficiencies.length > 0) {
    proficiencies.push({
      name: 'Armor',
      items: armorProficiencies,
      icon: '🛡️',
    });
  }

  // Weapon Proficiencies
  const weaponProficiencies = character.proficiencies?.weapons || [];
  if (weaponProficiencies.length > 0) {
    proficiencies.push({
      name: 'Weapons',
      items: weaponProficiencies,
      icon: '⚔️',
    });
  }

  // Tool Proficiencies
  const toolProficiencies = character.proficiencies?.tools || [];
  if (toolProficiencies.length > 0) {
    proficiencies.push({
      name: 'Tools',
      items: toolProficiencies,
      icon: '🔨',
    });
  }

  // Languages
  const languages = character.languages || [];
  if (languages.length > 0) {
    proficiencies.push({
      name: 'Languages',
      items: languages,
      icon: '💬',
    });
  }

  // If no proficiencies at all, don't render the component
  if (proficiencies.length === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <h3
        className="text-xl font-bold mb-4 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        Proficiencies & Languages
      </h3>

      <div className="space-y-4">
        {proficiencies.map((category) => (
          <div key={category.name}>
            {/* Category Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{category.icon}</span>
              <h4
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {category.name}
              </h4>
            </div>

            {/* Category Items */}
            <div className="space-y-2 ml-6">
              {category.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center p-2 rounded transition-all hover:scale-105"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full mr-3"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item}
                  </span>
                </div>
              ))}

              {category.items.length === 0 && (
                <div
                  className="text-sm italic"
                  style={{ color: 'var(--text-muted)' }}
                >
                  None
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
