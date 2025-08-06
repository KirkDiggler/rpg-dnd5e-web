import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Language } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useState } from 'react';
import { Card } from '../../../components/ui/Card';

interface DnDProficienciesProps {
  character: Character;
  onShowModal?: (title: string, content: React.ReactNode) => void;
}

export function DnDProficiencies({
  character,
  onShowModal,
}: DnDProficienciesProps) {
  const [expanded, setExpanded] = useState(false);

  // Get proficiencies from character data
  const armorProficiencies = character.proficiencies?.armor || [];
  const weaponProficiencies = character.proficiencies?.weapons || [];
  const toolProficiencies = character.proficiencies?.tools || [];

  // Convert language enums to display names
  const languages: string[] = (character.languages || []).map((langEnum) => {
    const langName = Language[langEnum];
    return langName
      ? langName
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Unknown';
  });

  const handleShowDetails = () => {
    const content = (
      <div className="space-y-4">
        {armorProficiencies.length > 0 && (
          <div>
            <h5
              className="font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Armor Proficiencies
            </h5>
            <ul className="space-y-1">
              {armorProficiencies.map((armor, index) => (
                <li
                  key={index}
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  • {armor}
                </li>
              ))}
            </ul>
          </div>
        )}

        {weaponProficiencies.length > 0 && (
          <div>
            <h5
              className="font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Weapon Proficiencies
            </h5>
            <ul className="space-y-1">
              {weaponProficiencies.map((weapon, index) => (
                <li
                  key={index}
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  • {weapon}
                </li>
              ))}
            </ul>
          </div>
        )}

        {toolProficiencies.length > 0 && (
          <div>
            <h5
              className="font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Tool Proficiencies
            </h5>
            <ul className="space-y-1">
              {toolProficiencies.map((tool, index) => (
                <li
                  key={index}
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  • {tool}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h5
            className="font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Languages
          </h5>
          <ul className="space-y-1">
            {languages.map((language, index) => (
              <li
                key={index}
                className="text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                • {language}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );

    if (onShowModal) {
      onShowModal('Proficiencies & Languages', content);
    } else {
      setExpanded(!expanded);
    }
  };

  const totalProficiencies =
    armorProficiencies.length +
    weaponProficiencies.length +
    toolProficiencies.length;

  return (
    <Card className="p-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={handleShowDetails}
      >
        <h4
          className="text-lg font-bold"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          OTHER PROFICIENCIES & LANGUAGES
        </h4>
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-button)',
          }}
        >
          {totalProficiencies} items
        </div>
      </div>

      {/* Preview - show first few items */}
      <div className="mt-3 space-y-2">
        {armorProficiencies.slice(0, 2).map((armor, index) => (
          <div
            key={index}
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            • {armor}
          </div>
        ))}

        {weaponProficiencies.slice(0, 2).map((weapon, index) => (
          <div
            key={index}
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            • {weapon}
          </div>
        ))}

        {totalProficiencies > 4 && (
          <div
            className="text-sm italic"
            style={{ color: 'var(--text-subtle)' }}
          >
            ...and {totalProficiencies - 4} more
          </div>
        )}

        <div
          className="mt-3 pt-2 border-t"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            Languages: {languages.slice(0, 3).join(', ')}
            {languages.length > 3 && `, +${languages.length - 3} more`}
          </div>
        </div>
      </div>

      {/* Click indicator */}
      <div
        className="text-center mt-3 text-xs"
        style={{ color: 'var(--text-subtle)' }}
      >
        Click to view all proficiencies
      </div>

      {/* Expanded content (if modal not used) */}
      {expanded && !onShowModal && (
        <div
          className="mt-4 pt-4 border-t space-y-4"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          {armorProficiencies.length > 0 && (
            <div>
              <h5
                className="font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Armor Proficiencies
              </h5>
              <ul className="space-y-1">
                {armorProficiencies.map((armor, index) => (
                  <li
                    key={index}
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    • {armor}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {weaponProficiencies.length > 0 && (
            <div>
              <h5
                className="font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Weapon Proficiencies
              </h5>
              <ul className="space-y-1">
                {weaponProficiencies.map((weapon, index) => (
                  <li
                    key={index}
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    • {weapon}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toolProficiencies.length > 0 && (
            <div>
              <h5
                className="font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Tool Proficiencies
              </h5>
              <ul className="space-y-1">
                {toolProficiencies.map((tool, index) => (
                  <li
                    key={index}
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    • {tool}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
