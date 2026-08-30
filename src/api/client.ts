import type { Interceptor } from '@connectrpc/connect';
import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { DiceService } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';
import { AuthoringService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { LobbyService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { SessionPresentationService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import { SessionService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { CharacterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { CharacterService as CharacterServiceV2 } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { EncounterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';

import { getDiscordToken, getPlayerId } from './auth';
import { wrapStreamResponseForLogging } from './streamLogging';

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

const PRESENTATION_SERVICE_PREFIX =
  'dnd5e.api.session.presentation.v1alpha1.SessionPresentationService.';

function loggedPayload(methodName: string, value: unknown) {
  if (!methodName.startsWith(PRESENTATION_SERVICE_PREFIX)) return value;
  const wrapper =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  const plan =
    wrapper?.draft && typeof wrapper.draft === 'object'
      ? (wrapper.draft as Record<string, unknown>)
      : wrapper?.plan && typeof wrapper.plan === 'object'
        ? (wrapper.plan as Record<string, unknown>)
        : wrapper;
  const terminal =
    plan?.terminal && typeof plan.terminal === 'object'
      ? (plan.terminal as Record<string, unknown>)
      : undefined;
  return {
    presentationId:
      typeof plan?.presentationId === 'string' ? plan.presentationId : '',
    attempt: typeof plan?.attempt === 'number' ? plan.attempt : 0,
    bodyCount: Array.isArray(plan?.bodies) ? plan.bodies.length : 0,
    contactCount: Array.isArray(plan?.contacts) ? plan.contacts.length : 0,
    terminalCount: Array.isArray(terminal?.dice) ? terminal.dice.length : 0,
  };
}

// Logging interceptor for debugging. Exported (only) so it can be unit
// tested directly against fake `next` responses — not intended as a public
// API for other modules to import interceptors from.
export const loggingInterceptor: Interceptor = (next) => async (req) => {
  const startTime = Date.now();
  const methodName = `${req.service.typeName}.${req.method.name}`;

  if (import.meta.env.MODE === 'development') {
    console.log(
      `🔵 Request: ${methodName}`,
      loggedPayload(methodName, req.message)
    );
    console.log(`📡 API Host: ${API_HOST}`);
  }

  try {
    const response = await next(req);
    const duration = Date.now() - startTime;

    // Server streams: `response.message` is an AsyncIterable, not a
    // message — logging it directly (the `else` branch below) only ever
    // shows the iterator object once, at open, and never a single event.
    // wrapStreamResponseForLogging replaces it with a lazy logging
    // generator (see its own doc comment for why this must not buffer).
    if (response.stream) {
      if (import.meta.env.MODE === 'development') {
        return wrapStreamResponseForLogging(methodName, response);
      }
      return response;
    }

    if (import.meta.env.MODE === 'development') {
      console.log(
        `🟢 Response: ${methodName} (${duration}ms)`,
        loggedPayload(methodName, response.message)
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

// Create the v1alpha2 character service client (EquipItem/UnequipItem —
// character-scoped, out-of-encounter equip surface; rpg-dnd5e-web#571).
// Distinct from `characterClient` above, which is the v1alpha1 character
// creation/sheet service — the two live on different proto packages with
// no relation, not a versioned replacement of one another.
export const characterV2Client = createClient(CharacterServiceV2, transport);

// Create the dice service client
export const diceClient = createClient(DiceService, transport);

// Create the encounter service client
export const encounterClient = createClient(EncounterService, transport);

// Create the session service client (dnd5e.api.session.v1alpha1 — the NEW
// stack: one map of absolute cells, walls that are declared rather than
// implied, props that say what they are.
//
// It is NOT a newer version of `encounterClient` above and there is no
// migration path between them. The old EncounterService is shaped by the old
// toolkit's vocabulary and has RPCs this one simply does not have
// (SubmitCheck, SetReactionReady, ActivateFeature); this one has ten the web
// has never called. Reimplementation, not a port — keeping the old surface
// over the new stack is the wrapper the server side already refused
// (rpg-project#227).
//
// Like `authoringClient` below, it is only live when the server enables it:
// StartEncounter builds on the new stack only under RPG_SESSION_STACK_ENABLED,
// so against a default server every call here answers about a session that was
// never created on this stack. Probe and fall back rather than assuming.
export const sessionClient = createClient(SessionService, transport);

// Decorative dice coordination remains separate from authoritative SessionService.
// Published actors use the unary call; visual-only witnesses consume the live stream.
export const sessionPresentationClient = createClient(
  SessionPresentationService,
  transport
);

// Create the lobby service client (dnd5e.api.lobby.v1alpha1 — party
// assembly, GameView slice 2). Distinct service from the old v1alpha1
// EncounterService's CreateEncounter/JoinEncounter/SetReady lobby RPCs,
// deleted in slice 3 along with LobbyView, their only caller.
export const lobbyClient = createClient(LobbyService, transport);

// Create the authoring service client (dnd5e.api.authoring.v1alpha1 —
// PutDungeon). Absent from the server's reflection list (Unimplemented)
// unless RPG_AUTHORING_ENABLED is set — see the dungeon-builder concept's
// usePutDungeonPreview hook for how it probes and falls back.
export const authoringClient = createClient(AuthoringService, transport);
