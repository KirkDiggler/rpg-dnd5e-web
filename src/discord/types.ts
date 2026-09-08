// Discord-related TypeScript interfaces and types

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
}

export interface DiscordParticipant {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
}

export interface DiscordContextType {
  // SDK and environment
  sdk: import('@discord/embedded-app-sdk').DiscordSDK | null;
  isDiscord: boolean;
  isReady: boolean;
  error: string | null;

  // User and authentication
  user: DiscordUser | null;
  isAuthenticated: boolean;
  grantedScopes: readonly string[];
  /** Opaque local credential epoch. It never contains token material. */
  authSessionId: number;

  // Party/session info
  participants: DiscordParticipant[];
  instanceId: string | null;
  channelId: string | null;
  guildId: string | null;

  // Actions
  authenticate: () => Promise<void>;
  refreshParticipants: () => Promise<void>;
  clearAuthentication: (message?: string) => void;
  clearAuthenticationForSession: (
    expectedAuthSessionId: number,
    message?: string
  ) => void;
  isAuthenticationSessionCurrent: (expectedAuthSessionId: number) => boolean;
}
