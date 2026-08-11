import { create } from '@bufbuild/protobuf';
import {
  CreateLobbyRequestSchema,
  JoinLobbyRequestSchema,
  SetReadyRequestSchema,
  StartEncounterRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { ListCharactersRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useRef, useState } from 'react';
import { DungeonBuilderConcept } from '../author/DungeonBuilderConcept';
import { toolkitSandboxClients as clients } from './clients';
import {
  TOOLKIT_SANDBOX_BARBARIAN,
  TOOLKIT_SANDBOX_BARBARIAN_LABEL,
  TOOLKIT_SANDBOX_FIGHTER,
  TOOLKIT_SANDBOX_FIGHTER_LABEL,
  TOOLKIT_SANDBOX_KEY,
  TOOLKIT_SANDBOX_YAML,
} from './constants';

type SandboxResult =
  | 'fighter'
  | 'barbarian'
  | 'fighter-then-barbarian'
  | 'barbarian-then-fighter'
  | null;

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Sandbox RPC failed.';
}

export function ToolkitContributorSandbox() {
  const [partyChoicesEnabled, setPartyChoicesEnabled] = useState(false);
  const [fighterCharacterId, setFighterCharacterId] = useState<string | null>(
    null
  );
  const [barbarianCharacterId, setBarbarianCharacterId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SandboxResult>(null);
  const operationGeneration = useRef(0);
  const actionInFlight = useRef(false);

  const invalidateOperations = () => {
    operationGeneration.current += 1;
    actionInFlight.current = false;
    return operationGeneration.current;
  };
  const isCurrentOperation = (generation: number) =>
    generation === operationGeneration.current;

  useEffect(
    () => () => {
      operationGeneration.current += 1;
      actionInFlight.current = false;
    },
    []
  );

  const handleSaveSucceeded = async (key: string) => {
    const generation = invalidateOperations();
    setPartyChoicesEnabled(false);
    setFighterCharacterId(null);
    setBarbarianCharacterId(null);
    setError(null);
    setResult(null);

    if (key !== TOOLKIT_SANDBOX_KEY) {
      if (isCurrentOperation(generation)) {
        setError(`Unexpected saved dungeon key: ${key}`);
      }
      return;
    }

    try {
      const fighterCharacters = await clients.fighter.character.listCharacters(
        create(ListCharactersRequestSchema)
      );
      if (!isCurrentOperation(generation)) return;

      const barbarianCharacters =
        await clients.barbarian.character.listCharacters(
          create(ListCharactersRequestSchema)
        );
      if (!isCurrentOperation(generation)) return;

      if (fighterCharacters.characters.length !== 1) {
        setError('Expected exactly one fighter character.');
        return;
      }
      if (barbarianCharacters.characters.length !== 1) {
        setError('Expected exactly one barbarian character.');
        return;
      }

      setFighterCharacterId(fighterCharacters.characters[0].id);
      setBarbarianCharacterId(barbarianCharacters.characters[0].id);
      setPartyChoicesEnabled(true);
    } catch (requestError) {
      if (!isCurrentOperation(generation)) return;
      setError(messageFor(requestError));
    }
  };

  const startFighter = async () => {
    if (!partyChoicesEnabled || !fighterCharacterId || actionInFlight.current)
      return;
    actionInFlight.current = true;
    const generation = ++operationGeneration.current;
    setPartyChoicesEnabled(false);
    setError(null);
    setResult(null);

    try {
      const created = await clients.fighter.lobby.createLobby(
        create(CreateLobbyRequestSchema, {
          campaignId: TOOLKIT_SANDBOX_KEY,
          characterId: fighterCharacterId,
        })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.fighter.lobby.setReady(
        create(SetReadyRequestSchema, { lobbyId: created.lobbyId, ready: true })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.fighter.lobby.startEncounter(
        create(StartEncounterRequestSchema, {
          lobbyId: created.lobbyId,
          dungeonKey: TOOLKIT_SANDBOX_KEY,
        })
      );
      if (!isCurrentOperation(generation)) return;

      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setResult('fighter');
    } catch (requestError) {
      if (!isCurrentOperation(generation)) return;
      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setError(messageFor(requestError));
    }
  };

  const startBarbarian = async () => {
    if (!partyChoicesEnabled || !barbarianCharacterId || actionInFlight.current)
      return;
    actionInFlight.current = true;
    const generation = ++operationGeneration.current;
    setPartyChoicesEnabled(false);
    setError(null);
    setResult(null);

    try {
      const created = await clients.barbarian.lobby.createLobby(
        create(CreateLobbyRequestSchema, {
          campaignId: TOOLKIT_SANDBOX_KEY,
          characterId: barbarianCharacterId,
        })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.barbarian.lobby.setReady(
        create(SetReadyRequestSchema, { lobbyId: created.lobbyId, ready: true })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.barbarian.lobby.startEncounter(
        create(StartEncounterRequestSchema, {
          lobbyId: created.lobbyId,
          dungeonKey: TOOLKIT_SANDBOX_KEY,
        })
      );
      if (!isCurrentOperation(generation)) return;

      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setResult('barbarian');
    } catch (requestError) {
      if (!isCurrentOperation(generation)) return;
      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setError(messageFor(requestError));
    }
  };

  const startFighterThenBarbarian = async () => {
    if (
      !partyChoicesEnabled ||
      !fighterCharacterId ||
      !barbarianCharacterId ||
      actionInFlight.current
    )
      return;
    actionInFlight.current = true;
    const generation = ++operationGeneration.current;
    setPartyChoicesEnabled(false);
    setError(null);
    setResult(null);

    try {
      const created = await clients.fighter.lobby.createLobby(
        create(CreateLobbyRequestSchema, {
          campaignId: TOOLKIT_SANDBOX_KEY,
          characterId: fighterCharacterId,
        })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.barbarian.lobby.joinLobby(
        create(JoinLobbyRequestSchema, {
          joinRef: created.joinRef,
          characterId: barbarianCharacterId,
        })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.fighter.lobby.setReady(
        create(SetReadyRequestSchema, { lobbyId: created.lobbyId, ready: true })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.barbarian.lobby.setReady(
        create(SetReadyRequestSchema, { lobbyId: created.lobbyId, ready: true })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.fighter.lobby.startEncounter(
        create(StartEncounterRequestSchema, {
          lobbyId: created.lobbyId,
          dungeonKey: TOOLKIT_SANDBOX_KEY,
        })
      );
      if (!isCurrentOperation(generation)) return;

      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setResult('fighter-then-barbarian');
    } catch (requestError) {
      if (!isCurrentOperation(generation)) return;
      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setError(messageFor(requestError));
    }
  };

  const startBarbarianThenFighter = async () => {
    if (
      !partyChoicesEnabled ||
      !fighterCharacterId ||
      !barbarianCharacterId ||
      actionInFlight.current
    )
      return;
    actionInFlight.current = true;
    const generation = ++operationGeneration.current;
    setPartyChoicesEnabled(false);
    setError(null);
    setResult(null);

    try {
      const created = await clients.barbarian.lobby.createLobby(
        create(CreateLobbyRequestSchema, {
          campaignId: TOOLKIT_SANDBOX_KEY,
          characterId: barbarianCharacterId,
        })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.fighter.lobby.joinLobby(
        create(JoinLobbyRequestSchema, {
          joinRef: created.joinRef,
          characterId: fighterCharacterId,
        })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.barbarian.lobby.setReady(
        create(SetReadyRequestSchema, { lobbyId: created.lobbyId, ready: true })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.fighter.lobby.setReady(
        create(SetReadyRequestSchema, { lobbyId: created.lobbyId, ready: true })
      );
      if (!isCurrentOperation(generation)) return;

      await clients.barbarian.lobby.startEncounter(
        create(StartEncounterRequestSchema, {
          lobbyId: created.lobbyId,
          dungeonKey: TOOLKIT_SANDBOX_KEY,
        })
      );
      if (!isCurrentOperation(generation)) return;

      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setResult('barbarian-then-fighter');
    } catch (requestError) {
      if (!isCurrentOperation(generation)) return;
      actionInFlight.current = false;
      setPartyChoicesEnabled(false);
      setError(messageFor(requestError));
    }
  };

  return (
    <main>
      <h1>Toolkit Contributor Sandbox</h1>
      <DungeonBuilderConcept
        initialYaml={TOOLKIT_SANDBOX_YAML}
        authoringClient={clients.fighter.authoring}
        persistDraft={false}
        allowNewCanvas={false}
        allowYamlFileIO={false}
        onSaveSucceeded={handleSaveSucceeded}
        showSaveResultLink={false}
      />
      <section aria-labelledby="toolkit-sandbox-party-heading">
        <h2 id="toolkit-sandbox-party-heading">Fixed party arrangements</h2>
        <button disabled={!partyChoicesEnabled} onClick={startFighter}>
          {TOOLKIT_SANDBOX_FIGHTER_LABEL}
        </button>
        <button disabled={!partyChoicesEnabled} onClick={startBarbarian}>
          {TOOLKIT_SANDBOX_BARBARIAN_LABEL}
        </button>
        <button
          disabled={!partyChoicesEnabled}
          onClick={startFighterThenBarbarian}
        >
          Fighter then Barbarian
        </button>
        <button
          disabled={!partyChoicesEnabled}
          onClick={startBarbarianThenFighter}
        >
          Barbarian then Fighter
        </button>
        {error && <p role="alert">{error}</p>}
        {result === 'fighter' && (
          <p>
            <a href={`/?playerId=${TOOLKIT_SANDBOX_FIGHTER}`}>
              Play as Fighter
            </a>
          </p>
        )}
        {result === 'barbarian' && (
          <p>
            <a href={`/?playerId=${TOOLKIT_SANDBOX_BARBARIAN}`}>
              Play as Barbarian
            </a>
          </p>
        )}
        {result === 'fighter-then-barbarian' && (
          <p>
            <a href={`/?playerId=${TOOLKIT_SANDBOX_FIGHTER}`}>
              Play as Fighter
            </a>{' '}
            <a href={`/?playerId=${TOOLKIT_SANDBOX_BARBARIAN}`}>
              Play as Barbarian
            </a>
          </p>
        )}
        {result === 'barbarian-then-fighter' && (
          <p>
            <a href={`/?playerId=${TOOLKIT_SANDBOX_BARBARIAN}`}>
              Play as Barbarian
            </a>{' '}
            <a href={`/?playerId=${TOOLKIT_SANDBOX_FIGHTER}`}>
              Play as Fighter
            </a>
          </p>
        )}
      </section>
    </main>
  );
}
