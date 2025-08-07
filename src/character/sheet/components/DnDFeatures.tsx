import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { Card } from '../../../components/ui/Card';

interface DnDFeaturesProps {
  character: Character;
  onShowModal?: (title: string, content: React.ReactNode) => void;
}

// Feature data structure for consistent typing
interface FeatureData {
  name: string;
  source: string;
  level: number;
  description: string;
}

export function DnDFeatures({ character, onShowModal }: DnDFeaturesProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract features from character data
  // Note: The protobuf Character type doesn't yet have features, fightingStyles, racialTraits, backgroundFeature fields
  // This implementation provides structure for when those fields are added
  const extractFeatures = (): FeatureData[] => {
    const features: FeatureData[] = [];

    // TODO: When protobuf is updated, replace with:
    // - character.features?.map(f => ({ name: f.name, source: 'Class', level: f.level, description: f.description })) || []
    // - character.fightingStyles?.map(style => ({ name: style, source: 'Fighting Style', level: 1, description: '' })) || []
    // - character.racialTraits?.map(trait => ({ name: trait, source: getRaceDisplayName(character.race), level: 1, description: '' })) || []
    // - character.backgroundFeature ? [{ name: character.backgroundFeature, source: 'Background', level: 1, description: '' }] : []

    // For now, we have no feature data available in the current character structure
    // Acknowledge the character parameter for future use
    void character;
    // Return empty array to show graceful empty state
    return features;
  };

  const allFeatures = extractFeatures();

  // Group features by source type
  const classFeatures = allFeatures.filter(
    (f) =>
      f.source !== 'Racial Trait' &&
      f.source !== 'Background' &&
      f.source !== 'Fighting Style'
  );
  const racialTraits = allFeatures.filter((f) => f.source === 'Racial Trait');
  const fightingStyles = allFeatures.filter(
    (f) => f.source === 'Fighting Style'
  );
  const backgroundFeatures = allFeatures.filter(
    (f) => f.source === 'Background'
  );

  const handleShowDetails = () => {
    const content = (
      <div className="space-y-6">
        {allFeatures.length === 0 && (
          <div
            className="text-center py-8"
            style={{ color: 'var(--text-muted)' }}
          >
            <p className="text-sm">
              No features available yet. Features will appear here as your
              character gains class abilities, racial traits, and other special
              abilities.
            </p>
          </div>
        )}

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

        {fightingStyles.length > 0 && (
          <div>
            <h5
              className="text-lg font-bold mb-3 pb-2 border-b"
              style={{
                color: 'var(--text-primary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              Fighting Styles
            </h5>
            <div className="space-y-4">
              {fightingStyles.map((style, index) => (
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
                      {style.name}
                    </h6>
                    <div
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: 'var(--epic)',
                        color: 'var(--text-button)',
                      }}
                    >
                      {style.source}
                    </div>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {style.description}
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

        {backgroundFeatures.length > 0 && (
          <div>
            <h5
              className="text-lg font-bold mb-3 pb-2 border-b"
              style={{
                color: 'var(--text-primary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              Background Features
            </h5>
            <div className="space-y-4">
              {backgroundFeatures.map((feature, index) => (
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
                        backgroundColor: 'var(--legendary)',
                        color: 'var(--text-button)',
                      }}
                    >
                      {feature.source}
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
          {allFeatures.length} features
        </div>
      </div>

      {/* Preview - show first few features or empty state */}
      <div className="mt-3 space-y-3">
        {allFeatures.length === 0 ? (
          <div
            className="text-center py-6"
            style={{ color: 'var(--text-muted)' }}
          >
            <p className="text-sm">No features available yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
              Features will appear as your character develops
            </p>
          </div>
        ) : (
          <>
            {allFeatures.slice(0, 3).map((feature, index) => {
              // Determine color based on feature source
              const getBorderColor = (source: string) => {
                if (source.includes('Class') || source === 'Class')
                  return 'var(--rare)';
                if (source === 'Fighting Style') return 'var(--epic)';
                if (source === 'Racial Trait') return 'var(--uncommon)';
                if (source === 'Background') return 'var(--legendary)';
                return 'var(--uncommon)';
              };

              const getBackgroundColor = (source: string) => {
                if (source.includes('Class') || source === 'Class')
                  return 'var(--rare)';
                if (source === 'Fighting Style') return 'var(--epic)';
                if (source === 'Racial Trait') return 'var(--uncommon)';
                if (source === 'Background') return 'var(--legendary)';
                return 'var(--uncommon)';
              };

              return (
                <div
                  key={index}
                  className="p-2 rounded border-l-4"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: getBorderColor(feature.source),
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
                        backgroundColor: getBackgroundColor(feature.source),
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
              );
            })}

            {allFeatures.length > 3 && (
              <div
                className="text-sm italic text-center"
                style={{ color: 'var(--text-subtle)' }}
              >
                ...and {allFeatures.length - 3} more features
              </div>
            )}
          </>
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
          {allFeatures.length === 0 ? (
            <div
              className="text-center py-4"
              style={{ color: 'var(--text-muted)' }}
            >
              <p className="text-sm">
                No features available yet. Features will appear here as your
                character gains class abilities, racial traits, and other
                special abilities.
              </p>
            </div>
          ) : (
            allFeatures.map((feature, index) => {
              const getBackgroundColor = (source: string) => {
                if (source.includes('Class') || source === 'Class')
                  return 'var(--rare)';
                if (source === 'Fighting Style') return 'var(--epic)';
                if (source === 'Racial Trait') return 'var(--uncommon)';
                if (source === 'Background') return 'var(--legendary)';
                return 'var(--uncommon)';
              };

              return (
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
                        backgroundColor: getBackgroundColor(feature.source),
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
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
