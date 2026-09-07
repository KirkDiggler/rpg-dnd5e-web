import type { DiscordSDK } from '@discord/embedded-app-sdk';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { clearAuth, setAuth } from '@/api/auth';

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

const MEMBERSHIP_SCOPE = 'guilds.members.read';
const RECONNECT_MESSAGE =
  'Discord authorization was cancelled or denied. Please reconnect.';

interface DiscordProviderProps {
  children: React.ReactNode;
}

export function DiscordProvider({ children }: DiscordProviderProps) {
  const [sdk, setSdk] = useState<DiscordSDK | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [grantedScopes, setGrantedScopes] = useState<readonly string[]>([]);
  const [authSessionId, setAuthSessionId] = useState(0);
  const authSessionRef = useRef(0);
  const [participants, setParticipants] = useState<DiscordParticipant[]>([]);

  const isDiscord = isDiscordEnvironment();
  const envInfo = getEnvironmentInfo();

  const advanceAuthSession = useCallback(() => {
    const next = authSessionRef.current + 1;
    authSessionRef.current = next;
    setAuthSessionId(next);
    return next;
  }, []);

  const clearAuthentication = useCallback(
    (message?: string) => {
      clearAuth();
      setUser(null);
      setIsAuthenticated(false);
      setGrantedScopes([]);
      setParticipants([]);
      setError(message ?? null);
      advanceAuthSession();
    },
    [advanceAuthSession]
  );

  const clearAuthenticationForSession = useCallback(
    (expectedAuthSessionId: number, message?: string) => {
      if (authSessionRef.current !== expectedAuthSessionId) return;
      clearAuthentication(message);
    },
    [clearAuthentication]
  );

  const isAuthenticationSessionCurrent = useCallback(
    (expectedAuthSessionId: number) =>
      authSessionRef.current === expectedAuthSessionId,
    []
  );

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
        console.error(
          '🔴 Failed to fetch participants:',
          err instanceof Error ? err.message : 'Discord provider error'
        );
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

      // Re-consent replaces the credential session. Tear down the old source
      // before opening Discord's modal; denial must not retain the old grant.
      if (isAuthenticated) clearAuthentication();

      try {
        console.log('🔐 Requesting Discord authorization...');
        const { code } = await sdkToUse.commands.authorize({
          client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
          response_type: 'code',
          state: '',
          scope: ['identify', 'applications.commands', MEMBERSHIP_SCOPE],
        });

        const isDiscordActivity =
          window.location.hostname.includes('discordsays.com');
        const apiBase = import.meta.env.VITE_API_HOST || '';
        const apiUrl = isDiscordActivity
          ? '/.proxy/auth/discord/token'
          : `${apiBase}/auth/discord/token`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

        const body: unknown = await response.json();
        const accessToken =
          body && typeof body === 'object' && 'access_token' in body
            ? (body as { access_token?: unknown }).access_token
            : undefined;
        if (typeof accessToken !== 'string' || !accessToken) {
          throw new Error('Token exchange returned no access token.');
        }

        const auth = await sdkToUse.commands.authenticate({
          access_token: accessToken,
        });
        const scopes: string[] = [];
        for (const scope of auth.scopes ?? []) {
          if (typeof scope === 'string') scopes.push(scope);
        }
        if (!scopes.includes(MEMBERSHIP_SCOPE)) {
          throw new Error(
            'Discord did not grant server membership access. Please reconnect and approve access.'
          );
        }
        if (!auth.user) {
          throw new Error('Discord authentication returned no user.');
        }

        const authenticatedUser: DiscordUser = {
          id: auth.user.id,
          username: auth.user.username,
          discriminator: auth.user.discriminator,
          avatar: auth.user.avatar || undefined,
          global_name: auth.user.global_name || undefined,
        };
        const guildId = sdkToUse.guildId ?? null;

        // Commit React and module auth as one successful credential epoch.
        setAuth(accessToken, authenticatedUser.id, guildId);
        setUser(authenticatedUser);
        setGrantedScopes([...scopes]);
        setIsAuthenticated(true);
        setError(null);
        advanceAuthSession();
        console.log('🎉 Discord authentication successful', {
          userId: authenticatedUser.id,
          scopeCount: scopes.length,
          hasGuild: !!guildId,
        });

        await handleRefreshParticipants(sdkToUse);
      } catch (err) {
        const errorMessage =
          err instanceof Error && err.message ? err.message : RECONNECT_MESSAGE;
        console.error('🔴 Discord authentication failed:', errorMessage);
        clearAuthentication(errorMessage);
      }
    },
    [
      sdk,
      isAuthenticated,
      handleRefreshParticipants,
      advanceAuthSession,
      clearAuthentication,
    ]
  );

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
        console.log(
          '🎮 Discord SDK ready - click authenticate button to login'
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to initialize Discord SDK';
        setError(errorMessage);
        console.error('🔴 Discord SDK initialization failed:', errorMessage);
        setIsReady(true);
      }
    }

    void init();
  }, [isDiscord]);

  const contextValue: DiscordContextType = {
    sdk,
    isDiscord,
    isReady,
    error,
    user,
    isAuthenticated,
    grantedScopes,
    authSessionId,
    participants,
    instanceId: envInfo.instanceId,
    channelId: envInfo.channelId,
    guildId: sdk?.guildId ?? null,
    authenticate: () => handleAuthenticate(),
    refreshParticipants: () => handleRefreshParticipants(),
    clearAuthentication,
    clearAuthenticationForSession,
    isAuthenticationSessionCurrent,
  };

  return (
    <DiscordContext.Provider value={contextValue}>
      {children}
    </DiscordContext.Provider>
  );
}
