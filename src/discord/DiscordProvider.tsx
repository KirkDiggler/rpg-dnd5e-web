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
        // Step 1: Get authorization code from Discord
        console.log('🔐 Requesting Discord authorization...');
        const { code } = await sdkToUse.commands.authorize({
          client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify', 'applications.commands'],
        });

        console.log(
          '🔐 Got authorization code:',
          code ? 'received' : 'missing'
        );

        // Step 2: Exchange the code for an access token via our backend
        console.log('🔐 Exchanging code for token...');

        // In Discord Activities, we need to use the proxy path
        const isDiscordActivity =
          window.location.hostname.includes('discordsays.com');
        const apiBase = import.meta.env.VITE_API_HOST || '';
        const apiUrl = isDiscordActivity
          ? '/.proxy/api/discord/token'
          : `${apiBase}/api/discord/token`;

        console.log('🔐 Calling API:', apiUrl);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const { access_token } = await response.json();
        console.log(
          '🔐 Got access token:',
          access_token ? 'received' : 'missing'
        );

        // Step 3: Authenticate with Discord using the access token
        console.log('🔐 Authenticating with Discord SDK...');
        const auth = await sdkToUse.commands.authenticate({
          access_token,
        });

        console.log('🎉 Authentication successful!', auth);
        setIsAuthenticated(true);
        setError(null);

        // Extract user info from auth response
        if (auth.user) {
          setUser({
            id: auth.user.id,
            username: auth.user.username,
            discriminator: auth.user.discriminator,
            avatar: auth.user.avatar || undefined,
            global_name: auth.user.global_name || undefined,
          });
          console.log('👤 User authenticated:', auth.user.username);
        }

        // Fetch initial participants
        await handleRefreshParticipants(sdkToUse);
      } catch (err) {
        console.error('🔴 Discord authentication failed:', err);
        // Store error for display
        let errorMessage = 'Unknown error';
        if (err instanceof Error) {
          errorMessage = err.message;
          // Add more context for fetch errors
          if (err.message.includes('fetch')) {
            errorMessage = `Network error: ${err.message}. This might be due to Discord's security restrictions.`;
          }
        } else if (err && typeof err === 'object') {
          // Handle Discord SDK error objects
          errorMessage = JSON.stringify(err, null, 2);
        } else {
          errorMessage = String(err);
        }
        setError(errorMessage);
        // Don't throw - let user see error and retry
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

        // Don't auto-authenticate - let user trigger it manually
        // This helps us see any errors in the debug panel
        console.log(
          '🎮 Discord SDK ready - click authenticate button to login'
        );
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
