import type { Interceptor } from '@connectrpc/connect';
import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { DiceService } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';
import { CharacterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { EncounterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';

import { getDiscordToken, getPlayerId } from './auth';

// Get API host from environment - handle Discord Activity proxy
const isDiscordActivity = window.location.hostname.includes('discordsays.com');
const API_HOST = isDiscordActivity
  ? '/.proxy'
  : import.meta.env.VITE_API_HOST || window.location.origin;

/**
 * Auth interceptor - adds Discord token to all gRPC requests.
 *
 * Header format: "authorization: Discord <token>"
 *
 * In development mode without Discord auth, uses VITE_DEV_PLAYER_ID
 * with a special "Dev" scheme for local testing.
 */
const authInterceptor: Interceptor = (next) => async (req) => {
  const token = getDiscordToken();
  const playerId = getPlayerId();

  if (token) {
    // Real Discord authentication
    req.header.set('authorization', `Discord ${token}`);
  } else if (playerId && import.meta.env.MODE === 'development') {
    // Development fallback - pass player ID directly for local testing
    // The server can recognize this scheme and bypass Discord validation
    req.header.set('authorization', `Dev ${playerId}`);
  }

  return next(req);
};

// Logging interceptor for debugging
const loggingInterceptor: Interceptor = (next) => async (req) => {
  const startTime = Date.now();
  const methodName = `${req.service.typeName}.${req.method.name}`;

  if (import.meta.env.MODE === 'development') {
    console.log(`🔵 Request: ${methodName}`, req.message);
    console.log(`📡 API Host: ${API_HOST}`);
  }

  try {
    const response = await next(req);
    const duration = Date.now() - startTime;
    if (import.meta.env.MODE === 'development') {
      console.log(
        `🟢 Response: ${methodName} (${duration}ms)`,
        response.message
      );
    }

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    if (import.meta.env.MODE === 'development') {
      console.error(`🔴 Error: ${methodName} (${duration}ms)`, error);
    }

    throw error;
  }
};

// Create the transport with auth and logging interceptors
// Auth runs first to add headers, then logging captures the full request
const transport = createGrpcWebTransport({
  baseUrl: API_HOST,
  interceptors: [authInterceptor, loggingInterceptor],
});

// Create the character service client
export const characterClient = createClient(CharacterService, transport);

// Create the dice service client
export const diceClient = createClient(DiceService, transport);

// Create the encounter service client
export const encounterClient = createClient(EncounterService, transport);
