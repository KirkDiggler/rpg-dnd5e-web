import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import { FeaturesPanel } from '../../../components/features';
import { Card } from '../../../components/ui/Card';

interface DnDFeaturesProps {
  character: Character;
  onShowModal?: (title: string, content: React.ReactNode) => void;
}

export function DnDFeatures({ character, onShowModal }: DnDFeaturesProps) {
  const [expanded, setExpanded] = useState(false);

  const features = character.features || [];

  const renderFeatures = () =>
    features.length === 0 ? (
      <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">
          No features available yet. Features will appear here as your character
          gains class abilities, racial traits, and other special abilities.
        </p>
      </div>
    ) : (
      <FeaturesPanel character={character} />
    );

  const handleShowDetails = () => {
    if (onShowModal) {
      onShowModal('Features & Traits', renderFeatures());
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

      {/* Preview */}
      <div className="mt-3">{renderFeatures()}</div>

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
          className="mt-4 pt-4 border-t"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          {renderFeatures()}
        </div>
      )}
    </Card>
  );
}
