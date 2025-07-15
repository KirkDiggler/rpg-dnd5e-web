import { DiscordSDK } from '@discord/embedded-app-sdk';

// Discord SDK instance - will be initialized when app loads
let discordSdk: DiscordSDK | null = null;

/**
 * Initialize the Discord SDK
 * This should be called once when the app starts
 */
export async function initializeDiscordSdk(): Promise<DiscordSDK> {
  if (discordSdk) {
    return discordSdk;
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      'VITE_DISCORD_CLIENT_ID environment variable is required for Discord integration'
    );
  }

  discordSdk = new DiscordSDK(clientId);

  // Wait for the SDK to be ready
  await discordSdk.ready();

  console.log('🎮 Discord SDK initialized');
  return discordSdk;
}

/**
 * Get the Discord SDK instance
 * Throws if SDK hasn't been initialized
 */
export function getDiscordSdk(): DiscordSDK {
  if (!discordSdk) {
    throw new Error(
      'Discord SDK not initialized. Call initializeDiscordSdk() first.'
    );
  }
  return discordSdk;
}

/**
 * Check if we're running inside Discord
 */
export function isDiscordEnvironment(): boolean {
  // Discord sets a specific query parameter
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('frame_id') || urlParams.has('instance_id');
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    isDiscord: isDiscordEnvironment(),
    frameId: urlParams.get('frame_id'),
    instanceId: urlParams.get('instance_id'),
    guildId: urlParams.get('guild_id'),
    channelId: urlParams.get('channel_id'),
    userAgent: navigator.userAgent,
    url: window.location.href,
  };
}
