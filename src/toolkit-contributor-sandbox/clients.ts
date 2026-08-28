import {
  createClient,
  type Client,
  type Interceptor,
} from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { AuthoringService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { LobbyService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { CharacterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  TOOLKIT_SANDBOX_BARBARIAN,
  TOOLKIT_SANDBOX_FIGHTER,
  type ToolkitSandboxPlayer,
} from './constants';

export interface ToolkitSandboxClients {
  readonly fighter: SandboxUnaryClients;
  readonly barbarian: SandboxUnaryClients;
}

export interface SandboxUnaryClients {
  readonly authoring: Pick<
    Client<typeof AuthoringService>,
    'putDungeon' | 'getDungeon'
  >;
  readonly character: Pick<Client<typeof CharacterService>, 'listCharacters'>;
  readonly lobby: Pick<
    Client<typeof LobbyService>,
    'createLobby' | 'joinLobby' | 'setReady' | 'startEncounter'
  >;
}

// Match the normal application API-host convention without importing its
// mutable global auth clients or auth state.
const isDiscordActivity = window.location.hostname.includes('discordsays.com');
const apiHost = isDiscordActivity
  ? '/.proxy'
  : import.meta.env.VITE_API_HOST || window.location.origin;

function fixedDevInterceptor(player: ToolkitSandboxPlayer): Interceptor {
  return (next) => async (request) => {
    request.header.set('authorization', `Dev ${player}`);
    return next(request);
  };
}

const fighterInterceptor = fixedDevInterceptor(TOOLKIT_SANDBOX_FIGHTER);
const barbarianInterceptor = fixedDevInterceptor(TOOLKIT_SANDBOX_BARBARIAN);

// This deliberately exposes only the two fixed interceptors for the focused
// header-isolation test. It is not an arbitrary-identity interceptor factory.
export const toolkitSandboxInterceptors = Object.freeze({
  fighter: fighterInterceptor,
  barbarian: barbarianInterceptor,
});

const fighterTransport = createGrpcWebTransport({
  baseUrl: apiHost,
  interceptors: [fighterInterceptor],
});
const barbarianTransport = createGrpcWebTransport({
  baseUrl: apiHost,
  interceptors: [barbarianInterceptor],
});

const fighterAuthoringClient = createClient(AuthoringService, fighterTransport);
const fighterCharacterClient = createClient(CharacterService, fighterTransport);
const fighterLobbyClient = createClient(LobbyService, fighterTransport);
const barbarianAuthoringClient = createClient(
  AuthoringService,
  barbarianTransport
);
const barbarianCharacterClient = createClient(
  CharacterService,
  barbarianTransport
);
const barbarianLobbyClient = createClient(LobbyService, barbarianTransport);

export const toolkitSandboxClients: ToolkitSandboxClients = Object.freeze({
  fighter: Object.freeze({
    authoring: Object.freeze({
      putDungeon: fighterAuthoringClient.putDungeon,
      getDungeon: fighterAuthoringClient.getDungeon,
    }),
    character: Object.freeze({
      listCharacters: fighterCharacterClient.listCharacters,
    }),
    lobby: Object.freeze({
      createLobby: fighterLobbyClient.createLobby,
      joinLobby: fighterLobbyClient.joinLobby,
      setReady: fighterLobbyClient.setReady,
      startEncounter: fighterLobbyClient.startEncounter,
    }),
  }),
  barbarian: Object.freeze({
    authoring: Object.freeze({
      putDungeon: barbarianAuthoringClient.putDungeon,
      getDungeon: barbarianAuthoringClient.getDungeon,
    }),
    character: Object.freeze({
      listCharacters: barbarianCharacterClient.listCharacters,
    }),
    lobby: Object.freeze({
      createLobby: barbarianLobbyClient.createLobby,
      joinLobby: barbarianLobbyClient.joinLobby,
      setReady: barbarianLobbyClient.setReady,
      startEncounter: barbarianLobbyClient.startEncounter,
    }),
  }),
});
