import { CharacterDraftProvider } from '@/character/creation/CharacterDraftContext';
import { AbilityScoresSectionV2 } from '@/character/creation/sections/AbilityScoresSectionV2';
import { useState } from 'react';
import { Button } from './ui/Button';

export function AbilityScoresTest() {
  const [showSection, setShowSection] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">
          Server-Side Dice Rolling Test
        </h1>

        {!showSection ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">
              Test the New Ability Score Rolling
            </h2>
            <p className="text-gray-600 mb-6">
              This demonstrates the new server-side dice rolling functionality
              for ability score generation.
            </p>
            <Button
              variant="primary"
              onClick={() => setShowSection(true)}
              size="lg"
            >
              Start Test
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <CharacterDraftProvider>
              <AbilityScoresSectionV2 />
            </CharacterDraftProvider>
          </div>
        )}
      </div>
    </div>
  );
}
