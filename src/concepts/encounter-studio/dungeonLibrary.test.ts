import {
  fakeAuthoringClient,
  type FakeAuthoringSink,
} from '@/author/testing/fakeAuthoringClient';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  DungeonSource,
  DungeonSummarySchema,
  type DungeonSummary,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  freshKeyFor,
  notOnServerSentence,
  useDungeonLibrary,
  type LobbyListClient,
} from './dungeonLibrary';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';

const ME = 'player-a';

function summary(
  key: string,
  source: DungeonSource,
  owner = ''
): DungeonSummary {
  return create(DungeonSummarySchema, {
    key,
    name: `Name of ${key}`,
    source,
    owner,
  });
}

/** A library over the deferred authoring fake and a lobby list that
 * answers each call with the next queued list. */
function setup(lists: DungeonSummary[][]) {
  const sink: FakeAuthoringSink & {
    deletes: NonNullable<FakeAuthoringSink['deletes']>;
    renames: NonNullable<FakeAuthoringSink['renames']>;
  } = {
    puts: [],
    gets: [],
    putAnswers: [],
    getAnswers: [],
    deletes: [],
    renames: [],
  };
  const client = fakeAuthoringClient(sink);
  const queue = [...lists];
  const lobby: LobbyListClient = {
    listDungeons: vi.fn(async () => ({
      dungeons: queue.length > 1 ? queue.shift()! : queue[0]!,
    })) as never,
  };
  return { sink, client, lobby };
}

describe('useDungeonLibrary', () => {
  it('splits This world and References in server order', async () => {
    const { client, lobby } = setup([
      [
        summary('b-mine', DungeonSource.WORLD, ME),
        summary('a-theirs', DungeonSource.WORLD, 'player-b'),
        summary('castle-kitchen', DungeonSource.SHIPPED),
        summary('alpha-ref', DungeonSource.SHIPPED),
      ],
    ]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: true, playerId: ME })
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.world.map((s) => s.key)).toEqual([
      'b-mine',
      'a-theirs',
    ]);
    // Server order kept, not re-sorted.
    expect(result.current.references.map((s) => s.key)).toEqual([
      'castle-kitchen',
      'alpha-ref',
    ]);
    expect([...result.current.taken]).toEqual([
      'b-mine',
      'a-theirs',
      'castle-kitchen',
      'alpha-ref',
    ]);
    expect(result.current.sourcesKnown).toBe(true);
  });

  it('lists as the server sends, reading no file', async () => {
    // The server owns the dialect rule (R23); an older server's version 2
    // entry is listed, and Open refuses it with the reader's sentence.
    const { client, lobby, sink } = setup([
      [summary('reference-tomb', DungeonSource.UNSPECIFIED)],
    ]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: true, playerId: ME })
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.references.map((s) => s.key)).toEqual([
      'reference-tomb',
    ]);
    expect(sink.gets).toEqual([]);
  });

  it('a summary with no source is a reference and nothing is Mine', async () => {
    const { client, lobby } = setup([
      [summary('the-cells', DungeonSource.UNSPECIFIED)],
    ]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: true, playerId: ME })
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.world).toEqual([]);
    expect(result.current.references.map((s) => s.key)).toEqual(['the-cells']);
    expect(result.current.isMine(result.current.references[0]!)).toBe(false);
    expect(result.current.sourcesKnown).toBe(false);
  });

  it('isMine compares owner to the player id', () => {
    const { client, lobby } = setup([[]]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: false, playerId: ME })
    );
    expect(result.current.isMine(summary('k', DungeonSource.WORLD, ME))).toBe(
      true
    );
    expect(
      result.current.isMine(summary('k', DungeonSource.WORLD, 'player-b'))
    ).toBe(false);
    // A shipped row never has an owner, even one that happens to match.
    expect(result.current.isMine(summary('k', DungeonSource.SHIPPED, ME))).toBe(
      false
    );
  });

  it('does not fetch while disabled', () => {
    const { client, lobby, sink } = setup([[]]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: false, playerId: ME })
    );
    expect(lobby.listDungeons).not.toHaveBeenCalled();
    expect(sink.gets).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('a list failure is the status message', async () => {
    const { client } = setup([[]]);
    const lobby: LobbyListClient = {
      listDungeons: vi.fn(async () => {
        throw new ConnectError('no lobby', Code.Unavailable);
      }) as never,
    };
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: true, playerId: ME })
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.message).toBe('no lobby');
  });

  it('rename refetches and returns ok', async () => {
    const { client, lobby, sink } = setup([
      [summary('old', DungeonSource.WORLD, ME)],
      [summary('new', DungeonSource.WORLD, ME)],
    ]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: true, playerId: ME })
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let answer: Promise<unknown>;
    act(() => {
      answer = result.current.rename('old', 'new');
    });
    await waitFor(() => expect(sink.renames).toHaveLength(1));
    expect(sink.renames[0]).toMatchObject({ key: 'old', newKey: 'new' });
    sink.renames[0]!.deferred.resolve(undefined);
    await act(async () => {
      expect(await answer).toEqual({ ok: true });
    });
    expect(lobby.listDungeons).toHaveBeenCalledTimes(2);
    expect(result.current.world.map((s) => s.key)).toEqual(['new']);
  });

  it('rename AlreadyExists returns the sentence', async () => {
    const { client, lobby, sink } = setup([[]]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: false, playerId: ME })
    );
    const answer = result.current.rename('a', 'b');
    await waitFor(() => expect(sink.renames).toHaveLength(1));
    sink.renames[0]!.deferred.resolve(
      new ConnectError(
        'new key already names one of your encounters',
        Code.AlreadyExists
      )
    );
    expect(await answer).toEqual({
      ok: false,
      refusal: 'new key already names one of your encounters',
    });
    expect(lobby.listDungeons).not.toHaveBeenCalled();
  });

  it('remove PermissionDenied returns the sentence', async () => {
    const { client, lobby, sink } = setup([[]]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: false, playerId: ME })
    );
    const answer = result.current.remove('theirs');
    await waitFor(() => expect(sink.deletes).toHaveLength(1));
    expect(sink.deletes[0]!.key).toBe('theirs');
    sink.deletes[0]!.deferred.resolve(
      new ConnectError(
        'that key belongs to another member of this world',
        Code.PermissionDenied
      )
    );
    expect(await answer).toEqual({
      ok: false,
      refusal: 'that key belongs to another member of this world',
    });
  });

  it('a server without Rename or Delete answers one sentence', async () => {
    const { client, lobby, sink } = setup([[]]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: false, playerId: ME })
    );
    const renamed = result.current.rename('a', 'b');
    const removed = result.current.remove('a');
    await waitFor(() => expect(sink.deletes).toHaveLength(1));
    const unimplemented = new ConnectError('', Code.Unimplemented);
    sink.renames[0]!.deferred.resolve(unimplemented);
    sink.deletes[0]!.deferred.resolve(unimplemented);
    expect(await renamed).toEqual({
      ok: false,
      refusal: notOnServerSentence('Rename'),
    });
    expect(await removed).toEqual({
      ok: false,
      refusal: notOnServerSentence('Delete'),
    });
  });

  it('read returns the bytes or the server sentence', async () => {
    const { client, lobby, sink } = setup([[]]);
    const { result } = renderHook(() =>
      useDungeonLibrary({ client, lobby, enabled: false, playerId: ME })
    );
    const found = result.current.read('the-cells');
    const missing = result.current.read('gone');
    await waitFor(() => expect(sink.gets).toHaveLength(2));
    sink.getAnswers[0]!.resolve({ yaml: 'bytes' });
    sink.getAnswers[1]!.resolve(
      new ConnectError('dungeon not found', Code.NotFound)
    );
    expect(await found).toEqual({ ok: true, yaml: 'bytes' });
    expect(await missing).toEqual({ ok: false, refusal: 'dungeon not found' });
  });
});

describe('freshKeyFor', () => {
  const document = () => {
    const doc = createPopulatedStudioDocument();
    doc.draft.name = 'The Castle Kitchen';
    return doc;
  };

  it('returns the slug when free', () => {
    expect(freshKeyFor(document(), new Set(['castle-kitchen']))).toBe(
      'the-castle-kitchen'
    );
  });

  it('suffixes -2 then -3', () => {
    expect(freshKeyFor(document(), new Set(['the-castle-kitchen']))).toBe(
      'the-castle-kitchen-2'
    );
    expect(
      freshKeyFor(
        document(),
        new Set(['the-castle-kitchen', 'the-castle-kitchen-2'])
      )
    ).toBe('the-castle-kitchen-3');
  });
});
