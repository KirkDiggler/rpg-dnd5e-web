/**
 * THE SERVER'S ENCOUNTERS, FOR THE STUDIO'S OPEN PANEL (rpg-project#585,
 * R21–R24). The list is the lobby's `ListDungeons`, the one every host's
 * picker reads, so the panel and the picker never disagree about what a
 * world holds; it answers on a server with authoring off and on a server
 * from before the world store. A file is read with authoring `GetDungeon`,
 * the verb Save and Play's overwrite check already uses. Rename and Delete
 * are the owner's verbs and the server's to refuse.
 *
 * Two things degrade rather than break on a server that predates them:
 * a summary with no `source` is a reference and has no owner (so nothing
 * is Mine), and a Rename or Delete the server does not implement answers
 * one sentence saying so.
 *
 * The multi-room dialect is never listed (R23), whatever the server sends:
 * each listed file is read once and passed through `readDraftYaml`, the
 * studio's one reader, and a file it refuses as the other dialect is left
 * out. Nothing here decodes a file itself.
 */
import { getPlayerId } from '@/api/auth';
import { lobbyClient } from '@/api/client';
import {
  defaultAuthoringLibraryClient,
  type AuthoringLibraryClient,
} from '@/author/authoringRpc';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, type Client } from '@connectrpc/connect';
import {
  DeleteDungeonRequestSchema,
  GetDungeonRequestSchema,
  RenameDungeonRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  DungeonSource,
  ListDungeonsRequestSchema,
  type DungeonSummary,
  type LobbyService,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { defaultDraftKey, readDraftYaml } from './draftFile';

export type LobbyListClient = Pick<Client<typeof LobbyService>, 'listDungeons'>;

export const defaultLobbyListClient: LobbyListClient = lobbyClient;

/** The one line a server without a verb answers (R18's style). */
export function notOnServerSentence(verb: 'Rename' | 'Delete'): string {
  return `${verb} is not available on this server.`;
}

/** Shown once above the lists when the server's summaries carry no
 * source: it cannot say whose each encounter is. */
export const OWNERS_NOT_ON_SERVER_SENTENCE =
  'Owners are not available on this server, so every encounter is listed under References.';

export type LibraryResult = { ok: true } | { ok: false; refusal: string };

export interface DungeonLibrary {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Source WORLD, server order; `owner` on each. */
  world: DungeonSummary[];
  /** Source SHIPPED or unstated, server order. */
  references: DungeonSummary[];
  /** Owner equals the caller's player id (only a WORLD row has one). */
  isMine(summary: DungeonSummary): boolean;
  /** False when the server listed encounters without a source (a server
   * from before the world store). */
  sourcesKnown: boolean;
  /** Every key the server listed, the multi-room files left out of the
   * lists included: the keys a fresh key must avoid. */
  taken: ReadonlySet<string>;
  /** The list's failure, else null. */
  message: string | null;
  refetch(): Promise<void>;
  read(
    key: string
  ): Promise<{ ok: true; yaml: string } | { ok: false; refusal: string }>;
  rename(key: string, newKey: string): Promise<LibraryResult>;
  remove(key: string): Promise<LibraryResult>;
}

/** The server's sentence without the code prefix. */
function refusalOf(error: unknown): string {
  if (error instanceof ConnectError) return error.rawMessage;
  return error instanceof Error ? error.message : String(error);
}

function isUnimplemented(error: unknown): boolean {
  return ConnectError.from(error).code === Code.Unimplemented;
}

export function useDungeonLibrary(input: {
  client?: AuthoringLibraryClient;
  lobby?: LobbyListClient;
  enabled: boolean;
  /** The caller's player id; the auth state's when omitted. */
  playerId?: string | null;
}): DungeonLibrary {
  const {
    client = defaultAuthoringLibraryClient,
    lobby = defaultLobbyListClient,
    enabled,
  } = input;
  const playerId =
    input.playerId === undefined ? getPlayerId() : input.playerId;
  const [state, setState] = useState<{
    status: DungeonLibrary['status'];
    listed: DungeonSummary[];
    shown: DungeonSummary[];
    message: string | null;
  }>({ status: 'idle', listed: [], shown: [], message: null });
  const sequence = useRef(0);

  const read = useCallback(
    async (
      key: string
    ): Promise<{ ok: true; yaml: string } | { ok: false; refusal: string }> => {
      try {
        const response = await client.getDungeon(
          create(GetDungeonRequestSchema, { key })
        );
        return { ok: true, yaml: response.yaml };
      } catch (error) {
        return { ok: false, refusal: refusalOf(error) };
      }
    },
    [client]
  );

  const refetch = useCallback(async (): Promise<void> => {
    const mine = ++sequence.current;
    setState((current) => ({ ...current, status: 'loading', message: null }));
    let listed: DungeonSummary[];
    try {
      listed = (await lobby.listDungeons(create(ListDungeonsRequestSchema, {})))
        .dungeons;
    } catch (error) {
      if (mine !== sequence.current) return;
      setState({
        status: 'error',
        listed: [],
        shown: [],
        message: refusalOf(error),
      });
      return;
    }
    // A file the reader refuses as the multi-room dialect is never listed;
    // a file that cannot be read stays, and Open shows why.
    const multiRoom = await Promise.all(
      listed.map(async (summary) => {
        const file = await read(summary.key);
        if (!file.ok) return false;
        const opened = readDraftYaml(file.yaml);
        return !opened.ok && opened.multiRoom === true;
      })
    );
    if (mine !== sequence.current) return;
    setState({
      status: 'ready',
      listed,
      shown: listed.filter((_, index) => !multiRoom[index]),
      message: null,
    });
  }, [lobby, read]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [enabled, refetch]);

  const isMine = useCallback(
    (summary: DungeonSummary): boolean =>
      summary.source === DungeonSource.WORLD &&
      summary.owner !== '' &&
      playerId !== null &&
      summary.owner === playerId,
    [playerId]
  );

  const rename = useCallback(
    async (key: string, newKey: string): Promise<LibraryResult> => {
      try {
        await client.renameDungeon(
          create(RenameDungeonRequestSchema, { key, newKey })
        );
      } catch (error) {
        return {
          ok: false,
          refusal: isUnimplemented(error)
            ? notOnServerSentence('Rename')
            : refusalOf(error),
        };
      }
      await refetch();
      return { ok: true };
    },
    [client, refetch]
  );

  const remove = useCallback(
    async (key: string): Promise<LibraryResult> => {
      try {
        await client.deleteDungeon(create(DeleteDungeonRequestSchema, { key }));
      } catch (error) {
        return {
          ok: false,
          refusal: isUnimplemented(error)
            ? notOnServerSentence('Delete')
            : refusalOf(error),
        };
      }
      await refetch();
      return { ok: true };
    },
    [client, refetch]
  );

  return useMemo(() => {
    const world = state.shown.filter(
      (summary) => summary.source === DungeonSource.WORLD
    );
    const references = state.shown.filter(
      (summary) => summary.source !== DungeonSource.WORLD
    );
    return {
      status: state.status,
      world,
      references,
      isMine,
      sourcesKnown: state.listed.every(
        (summary) => summary.source !== DungeonSource.UNSPECIFIED
      ),
      taken: new Set(state.listed.map((summary) => summary.key)),
      message: state.message,
      refetch,
      read,
      rename,
      remove,
    };
  }, [state, isMine, refetch, read, rename, remove]);
}

/** A key for a copy (R24): the slug of the room name when no listed key
 * holds it, else the first free `-2`, `-3`, …. */
export function freshKeyFor(
  document: Readonly<RoomDraftDocument>,
  taken: ReadonlySet<string>
): string {
  const base = defaultDraftKey(document);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const key = `${base}-${suffix}`;
    if (!taken.has(key)) return key;
  }
}
