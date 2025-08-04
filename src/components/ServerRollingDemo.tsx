import { AbilityScoresSectionV2 } from '@/character/creation/sections/AbilityScoresSectionV2';

import { useDiscord } from '@/discord';

export function ServerRollingDemo() {
  // For demo purposes, using a test draft ID
  // In real usage, this would come from the character draft context
  const testDraftId = 'demo_draft_' + Date.now();
  const discord = useDiscord();
  const isDevelopment = import.meta.env.MODE === 'development';
  const playerId = discord.user?.id || (isDevelopment ? 'test-player' : '');

  return (
    <div
      className="min-h-screen p-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Server-Side Dice Rolling Demo
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            New secure dice rolling for ability score generation
          </p>
        </div>

        <div
          className="rounded-lg shadow-xl p-6"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '2px solid var(--border-primary)',
          }}
        >
          <div
            className="mb-4 p-4 rounded"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              How it works:
            </h2>
            <ol
              className="list-decimal list-inside space-y-1 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              <li>
                Click "Roll One" to roll a single ability score (4d6 drop
                lowest)
              </li>
              <li>
                Click "Roll All (6)" to roll all six ability scores at once
              </li>
              <li>
                Click a roll to select it, then click an ability slot to assign
                it
              </li>
              <li>
                Or click an ability slot first, then click a roll to assign
              </li>
              <li>
                Once all abilities are assigned, click "Confirm Ability Scores"
              </li>
            </ol>
          </div>

          <AbilityScoresSectionV2 draftId={testDraftId} playerId={playerId} />
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Draft ID for testing: {testDraftId}
          </p>
        </div>
      </div>
    </div>
  );
}
