import { useDiscord } from './hooks';
import { getEnvironmentInfo } from './sdk';
import type { DiscordParticipant } from './types';

export function DiscordDebugPanel() {
  const discord = useDiscord();
  const envInfo = getEnvironmentInfo();

  if (!discord.isReady) {
    return (
      <div
        style={{
          padding: '1rem',
          background: '#f3f4f6',
          borderRadius: '8px',
          margin: '1rem 0',
        }}
      >
        <h3>🔄 Discord SDK Loading...</h3>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '1rem',
        background: '#f3f4f6',
        borderRadius: '8px',
        margin: '1rem 0',
        fontSize: '0.875rem',
      }}
    >
      <h3 style={{ marginTop: 0 }}>🔧 Discord Debug Info</h3>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
      >
        {/* Environment */}
        <div>
          <h4>Environment</h4>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            <li>Is Discord: {discord.isDiscord ? '✅' : '❌'}</li>
            <li>SDK Ready: {discord.isReady ? '✅' : '❌'}</li>
            <li>Error: {discord.error || 'None'}</li>
            <li>Frame ID: {envInfo.frameId || 'None'}</li>
            <li>Instance ID: {envInfo.instanceId || 'None'}</li>
            <li>Channel ID: {envInfo.channelId || 'None'}</li>
            <li>Guild ID: {envInfo.guildId || 'None'}</li>
          </ul>
        </div>

        {/* User */}
        <div>
          <h4>User</h4>
          {discord.user ? (
            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
              <li>Authenticated: ✅</li>
              <li>
                Username: {discord.user.username}#{discord.user.discriminator}
              </li>
              <li>Display Name: {discord.user.global_name || 'None'}</li>
              <li>ID: {discord.user.id}</li>
            </ul>
          ) : (
            <div>
              <p>Not authenticated</p>
              {discord.isDiscord && (
                <button
                  onClick={discord.authenticate}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#5865F2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Authenticate with Discord
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Participants */}
      {discord.participants.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Participants ({discord.participants.length})</h4>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            {discord.participants.map((participant: DiscordParticipant) => (
              <li key={participant.id}>
                {participant.username}#{participant.discriminator}
                {participant.global_name && ` (${participant.global_name})`}
              </li>
            ))}
          </ul>
          <button
            onClick={discord.refreshParticipants}
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.5rem',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Refresh Participants
          </button>
        </div>
      )}

      {/* Raw Environment */}
      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          Raw Environment Data
        </summary>
        <pre
          style={{
            background: '#1f2937',
            color: '#f9fafb',
            padding: '0.5rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            overflow: 'auto',
            marginTop: '0.5rem',
          }}
        >
          {JSON.stringify(envInfo, null, 2)}
        </pre>
      </details>
    </div>
  );
}
