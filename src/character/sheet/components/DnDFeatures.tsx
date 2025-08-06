import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { Card } from '../../../components/ui/Card';

interface DnDFeaturesProps {
  character: Character;
  onShowModal?: (title: string, content: React.ReactNode) => void;
}

// TODO: Replace with character.features when available from API
// Currently using mock data as the API doesn't provide features yet
const MOCK_FEATURES = [
  {
    name: 'Fighting Style',
    source: 'Fighter',
    level: 1,
    description:
      'You adopt a particular style of fighting as your specialty. Choose one of the following options: Defense, Dueling, Great Weapon Fighting, or Protection.',
  },
  {
    name: 'Second Wind',
    source: 'Fighter',
    level: 1,
    description:
      'You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level.',
  },
  {
    name: 'Action Surge',
    source: 'Fighter',
    level: 2,
    description:
      'Starting at 2nd level, you can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action on top of your regular action and a possible bonus action.',
  },
  {
    name: 'Darkvision',
    source: 'Elf',
    level: 1,
    description:
      'Accustomed to twilit forests and the night sky, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light.',
  },
];

export function DnDFeatures({ onShowModal }: DnDFeaturesProps) {
  const [expanded, setExpanded] = useState(false);

  // In real app, get from character.features
  const features = MOCK_FEATURES;
  const classFeatures = features.filter(
    (f) => f.source !== 'Elf' && f.source !== 'Human'
  );
  const racialTraits = features.filter(
    (f) => f.source === 'Elf' || f.source === 'Human'
  );

  const handleShowDetails = () => {
    const content = (
      <div className="space-y-6">
        {classFeatures.length > 0 && (
          <div>
            <h5
              className="text-lg font-bold mb-3 pb-2 border-b"
              style={{
                color: 'var(--text-primary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              Class Features
            </h5>
            <div className="space-y-4">
              {classFeatures.map((feature, index) => (
                <div
                  key={index}
                  className="p-3 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h6
                      className="font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {feature.name}
                    </h6>
                    <div
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: 'var(--rare)',
                        color: 'var(--text-button)',
                      }}
                    >
                      {feature.source} {feature.level}
                    </div>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {racialTraits.length > 0 && (
          <div>
            <h5
              className="text-lg font-bold mb-3 pb-2 border-b"
              style={{
                color: 'var(--text-primary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              Racial Traits
            </h5>
            <div className="space-y-4">
              {racialTraits.map((trait, index) => (
                <div
                  key={index}
                  className="p-3 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h6
                      className="font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {trait.name}
                    </h6>
                    <div
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: 'var(--uncommon)',
                        color: 'var(--text-button)',
                      }}
                    >
                      {trait.source}
                    </div>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {trait.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );

    if (onShowModal) {
      onShowModal('Features & Traits', content);
    } else {
      setExpanded(!expanded);
    }
  };

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
          FEATURES & TRAITS
        </h4>
        <div
          className="text-sm px-2 py-1 rounded"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-button)',
          }}
        >
          {features.length} features
        </div>
      </div>

      {/* Preview - show first few features */}
      <div className="mt-3 space-y-3">
        {features.slice(0, 3).map((feature, index) => (
          <div
            key={index}
            className="p-2 rounded border-l-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: feature.source.includes('Fighter')
                ? 'var(--rare)'
                : 'var(--uncommon)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <h6
                className="font-bold text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                {feature.name}
              </h6>
              <span
                className="text-xs px-1 py-0.5 rounded"
                style={{
                  backgroundColor: feature.source.includes('Fighter')
                    ? 'var(--rare)'
                    : 'var(--uncommon)',
                  color: 'var(--text-button)',
                }}
              >
                {feature.source}
              </span>
            </div>
            <p
              className="text-xs line-clamp-2"
              style={{ color: 'var(--text-muted)' }}
            >
              {feature.description.length > 100
                ? feature.description.substring(0, 100) + '...'
                : feature.description}
            </p>
          </div>
        ))}

        {features.length > 3 && (
          <div
            className="text-sm italic text-center"
            style={{ color: 'var(--text-subtle)' }}
          >
            ...and {features.length - 3} more features
          </div>
        )}
      </div>

      {/* Click indicator */}
      <div
        className="text-center mt-3 text-xs"
        style={{ color: 'var(--text-subtle)' }}
      >
        Click to view all features & traits
      </div>

      {/* Expanded content (if modal not used) */}
      {expanded && !onShowModal && (
        <div
          className="mt-4 pt-4 border-t space-y-4"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-3 rounded"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <h6
                  className="font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {feature.name}
                </h6>
                <div
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: feature.source.includes('Fighter')
                      ? 'var(--rare)'
                      : 'var(--uncommon)',
                    color: 'var(--text-button)',
                  }}
                >
                  {feature.source} {feature.level}
                </div>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-muted)' }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
