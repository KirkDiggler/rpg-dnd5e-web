import type { DiscordSDK } from '@discord/embedded-app-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { DiscordContext } from './context';
import {
  getEnvironmentInfo,
  initializeDiscordSdk,
  isDiscordEnvironment,
} from './sdk';
import type {
  DiscordContextType,
  DiscordParticipant,
  DiscordUser,
} from './types';

interface DiscordProviderProps {
  children: React.ReactNode;
}

export function DiscordProvider({ children }: DiscordProviderProps) {
  const [sdk, setSdk] = useState<DiscordSDK | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [participants, setParticipants] = useState<DiscordParticipant[]>([]);

  const isDiscord = isDiscordEnvironment();
  const envInfo = getEnvironmentInfo();

  const handleRefreshParticipants = useCallback(
    async (discordSdk?: DiscordSDK) => {
      const sdkToUse = discordSdk || sdk;
      if (!sdkToUse) return;

      try {
        const result =
          await sdkToUse.commands.getInstanceConnectedParticipants();
        setParticipants(result.participants as DiscordParticipant[]);
        console.log(`👥 Found ${result.participants.length} participants`);
      } catch (err) {
        console.error('🔴 Failed to fetch participants:', err);
      }
    },
    [sdk]
  );

  const handleAuthenticate = useCallback(
    async (discordSdk?: DiscordSDK) => {
      const sdkToUse = discordSdk || sdk;
      if (!sdkToUse) {
        throw new Error('Discord SDK not available');
      }

      try {
        console.log('🔐 Attempting Discord authentication...');
        // Using explicit type assertion for Discord SDK authenticate method
        const result = await sdkToUse.commands.authenticate({
          scope: ['identify', 'guilds'],
        } as Parameters<typeof sdkToUse.commands.authenticate>[0]);
        console.log('🔐 Authentication result:', result);

        if (result.access_token && result.user) {
          setUser(result.user as DiscordUser);
          setIsAuthenticated(true);
          console.log(
            '👤 Discord authentication successful:',
            result.user.username
          );

          // Fetch initial participants
          await handleRefreshParticipants(sdkToUse);
        }
      } catch (err) {
        console.error('🔴 Discord authentication failed:', err);
        // Store error for debug panel
        setError(err instanceof Error ? err.message : String(err));
        // Don't throw - let user retry
      }
    },
    [sdk, handleRefreshParticipants]
  );

  // Initialize Discord SDK on mount
  useEffect(() => {
    async function init() {
      try {
        if (!isDiscord) {
          console.log('📝 Running outside Discord - SDK not initialized');
          setIsReady(true);
          return;
        }

        const discordSdk = await initializeDiscordSdk();
        setSdk(discordSdk);
        setIsReady(true);

        // Don't auto-authenticate - let user click button
        console.log('🎮 Discord SDK ready - user can authenticate when ready');
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to initialize Discord SDK';
        setError(errorMessage);
        console.error('🔴 Discord SDK initialization failed:', err);
        setIsReady(true); // Still mark as ready so app can function
      }
    }

    init();
  }, [isDiscord, handleAuthenticate]);

  const contextValue: DiscordContextType = {
    // SDK and environment
    sdk,
    isDiscord,
    isReady,
    error,

    // User and authentication
    user,
    isAuthenticated,

    // Party/session info
    participants,
    instanceId: envInfo.instanceId,
    channelId: envInfo.channelId,
    guildId: envInfo.guildId,

    // Actions
    authenticate: () => handleAuthenticate(),
    refreshParticipants: () => handleRefreshParticipants(),
  };

  return (
    <DiscordContext.Provider value={contextValue}>
      {children}
    </DiscordContext.Provider>
  );
}
