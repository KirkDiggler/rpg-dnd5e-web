import {
  fakeAuthoringClient,
  type FakeAuthoringSink,
} from '@/author/testing/fakeAuthoringClient';
import type { AuthoringGateState } from '@/author/useAuthoringGate';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  DungeonSource,
  DungeonSummarySchema,
  type DungeonSummary,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import referenceTombYaml from '../../author/fixtures/reference-tomb.yaml?raw';
import { exportDraftYaml } from './draftFile';
import { useDungeonLibrary, type LobbyListClient } from './dungeonLibrary';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import {
  EMPTY_WORLD_SENTENCE,
  StudioOpen,
  StudioOpenButton,
} from './StudioOpen';
import { GATE_OFF_SENTENCE, PUBLISH_RUNNING_TITLE } from './studioPublishing';

const ME = 'player-a';
const fileFor = (key: string, name = `Room ${key}`) => {
  const document = createPopulatedStudioDocument();
  document.draft.name = name;
  return exportDraftYaml(document, key);
};

function summary(
  key: string,
  source: DungeonSource,
  owner = ''
): DungeonSummary {
  return create(DungeonSummarySchema, {
    key,
    name: `Room ${key}`,
    source,
    owner,
  });
}

const WORLD = [
  summary('the-cells', DungeonSource.WORLD, ME),
  summary('b-keep', DungeonSource.WORLD, 'walk-player-b'),
];
const REFERENCES = [summary('castle-kitchen', DungeonSource.SHIPPED)];

function setup(lists: DungeonSummary[][], files: Record<string, string> = {}) {
  const sink = {
    puts: [],
    gets: [],
    putAnswers: [],
    getAnswers: [],
    deletes: [],
    renames: [],
  } as FakeAuthoringSink & {
    deletes: NonNullable<FakeAuthoringSink['deletes']>;
    renames: NonNullable<FakeAuthoringSink['renames']>;
  };
  const client = fakeAuthoringClient(sink);
  const queue = [...lists];
  const lobby: LobbyListClient = {
    listDungeons: vi.fn(async () => ({
      dungeons: queue.length > 1 ? queue.shift()! : queue[0]!,
    })) as never,
  };
  /** Answer every unanswered GetDungeon from `files`, a v4 file by default. */
  const answered = new Set<number>();
  const answerGets = async () => {
    await waitFor(() => {
      if (sink.gets.length === answered.size) throw new Error('no get yet');
      sink.gets.forEach((get, index) => {
        if (answered.has(index)) return;
        answered.add(index);
        sink.getAnswers[index]!.resolve({
          yaml: files[get.key] ?? fileFor(get.key),
        });
      });
    });
  };
  const handlers = {
    onOpen: vi.fn(),
    onRenamed: vi.fn(),
    onDeleted: vi.fn(),
    onClose: vi.fn(),
  };
  function Harness({
    gate,
    publishing = false,
  }: {
    gate: AuthoringGateState;
    publishing?: boolean;
  }) {
    const library = useDungeonLibrary({
      client,
      lobby,
      enabled: gate === 'live',
      playerId: ME,
    });
    return (
      <StudioOpen
        library={library}
        gate={gate}
        publishing={publishing}
        {...handlers}
      />
    );
  }
  return { sink, lobby, answerGets, handlers, Harness };
}

async function renderReady(lists: DungeonSummary[][], files = {}) {
  const harness = setup(lists, files);
  render(<harness.Harness gate="live" />);
  await screen.findByRole('heading', { name: 'My World' });
  return harness;
}

const rowOf = (name: string) => screen.getByRole('listitem', { name });

describe('StudioOpen', () => {
  it('gate-off disables Open with the server sentence', () => {
    const onPress = vi.fn();
    render(
      <StudioOpenButton gate="gate-off" panelOpen={false} onPress={onPress} />
    );
    const button = screen.getByRole('button', { name: 'Open' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe(GATE_OFF_SENTENCE);
    // A panel left open when the gate turns off lists nothing and says why.
    const { lobby, Harness } = setup([[]]);
    render(<Harness gate="gate-off" />);
    expect(screen.getByRole('status').textContent).toContain(GATE_OFF_SENTENCE);
    expect(lobby.listDungeons).not.toHaveBeenCalled();
  });

  it("lists This world with owners, the caller's own marked Mine, then References", async () => {
    await renderReady([[...WORLD, ...REFERENCES]]);
    const world = screen.getByRole('list', { name: 'My World' });
    const worldRows = within(world).getAllByRole('listitem');
    expect(worldRows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Room the-cells',
      'Room b-keep',
    ]);
    expect(within(worldRows[0]!).getByText('Mine')).toBeTruthy();
    expect(within(worldRows[1]!).getByText('by walk-player-b')).toBeTruthy();
    const references = screen.getByRole('list', { name: 'References' });
    expect(
      within(references)
        .getAllByRole('listitem')
        .map((row) => row.getAttribute('aria-label'))
    ).toEqual(['Room castle-kitchen']);
  });

  it('an empty world says where Save and Play saves', async () => {
    await renderReady([REFERENCES]);
    expect(screen.getByText(EMPTY_WORLD_SENTENCE)).toBeTruthy();
  });

  it("another member's row offers Open only and opens as a copy", async () => {
    const { answerGets, handlers } = await renderReady([[...WORLD]]);
    const row = rowOf('Room b-keep');
    expect(within(row).queryByRole('button', { name: /Rename/ })).toBeNull();
    expect(within(row).queryByRole('button', { name: /Delete/ })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Open b-keep' }));
    await answerGets();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(handlers.onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'b-keep', source: 'copy' })
    );
  });

  it('a version 2 file read from the server shows the dialect sentence and imports nothing', async () => {
    // An older server lists a version 2 file; the reader refuses it at Open.
    const { sink, handlers } = await renderReady([[...WORLD]]);
    fireEvent.click(screen.getByRole('button', { name: 'Open the-cells' }));
    await waitFor(() => expect(sink.gets.length).toBe(1));
    sink.getAnswers[0]!.resolve({ yaml: referenceTombYaml });
    expect(
      (await within(rowOf('Room the-cells')).findByRole('alert')).textContent
    ).toMatch(/version 2 dungeon, the multi-room dialect/);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it('a read refusal is shown on the row', async () => {
    const { sink } = await renderReady([[...WORLD]]);
    fireEvent.click(screen.getByRole('button', { name: 'Open the-cells' }));
    await waitFor(() => expect(sink.gets.length).toBe(1));
    sink.getAnswers[0]!.resolve(
      new ConnectError('dungeon not found', Code.NotFound)
    );
    expect(
      (await within(rowOf('Room the-cells')).findByRole('alert')).textContent
    ).toContain('dungeon not found');
  });

  it('Open asks before replacing; Keep imports nothing; Replace calls onOpen with the source', async () => {
    const { answerGets, handlers } = await renderReady([
      [...WORLD, ...REFERENCES],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Open the-cells' }));
    await answerGets();
    const ask = await screen.findByRole('alertdialog', {
      name: 'Replace with the-cells',
    });
    expect(ask.textContent).toContain(
      'Replace the current draft with Room the-cells? Undo brings it back.'
    );
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(handlers.onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open the-cells' }));
    await answerGets();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(handlers.onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'the-cells', source: 'mine' })
    );
    expect(handlers.onOpen.mock.calls[0]![0].read.draft.name).toBe(
      'Room the-cells'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Open castle-kitchen' })
    );
    await answerGets();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(handlers.onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'castle-kitchen', source: 'copy' })
    );
  });

  it('rename sends key and new_key and shows the AlreadyExists sentence on refusal', async () => {
    const { sink, handlers } = await renderReady([
      [...WORLD],
      [summary('kitchen-copy', DungeonSource.WORLD, ME), WORLD[1]!],
    ]);
    const row = rowOf('Room the-cells');
    fireEvent.click(
      within(row).getByRole('button', { name: 'Rename the-cells' })
    );
    const field = within(row).getByRole('textbox', { name: 'New key' });
    fireEvent.change(field, { target: { value: 'b-keep' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sink.renames).toHaveLength(1));
    expect(sink.renames[0]).toMatchObject({
      key: 'the-cells',
      newKey: 'b-keep',
    });
    sink.renames[0]!.deferred.resolve(
      new ConnectError(
        'new key already names one of your encounters',
        Code.AlreadyExists
      )
    );
    expect((await within(row).findByRole('alert')).textContent).toContain(
      'new key already names one of your encounters'
    );
    expect(handlers.onRenamed).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: 'kitchen-copy' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sink.renames).toHaveLength(2));
    sink.renames[1]!.deferred.resolve(undefined);
    expect(
      await screen.findByRole('listitem', { name: 'Room kitchen-copy' })
    ).toBeTruthy();
    expect(handlers.onRenamed).toHaveBeenCalledWith(
      'the-cells',
      'kitchen-copy'
    );
  });

  it('delete asks, sends the key, and the row is gone after the refetch', async () => {
    const { sink, handlers } = await renderReady([[...WORLD], [WORLD[1]!]]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete the-cells' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete the-cells' });
    expect(ask.textContent).toContain(
      'Delete the-cells from the server? This cannot be undone.'
    );
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sink.deletes).toHaveLength(1));
    expect(sink.deletes[0]!.key).toBe('the-cells');
    sink.deletes[0]!.deferred.resolve(undefined);
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: 'Room the-cells' })
      ).toBeNull()
    );
    expect(handlers.onDeleted).toHaveBeenCalledWith('the-cells');
  });

  it('a server without Delete says so on the row', async () => {
    const { sink } = await renderReady([[...WORLD]]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete the-cells' }));
    fireEvent.click(
      within(
        screen.getByRole('alertdialog', { name: 'Delete the-cells' })
      ).getByRole('button', { name: 'Delete' })
    );
    await waitFor(() => expect(sink.deletes).toHaveLength(1));
    sink.deletes[0]!.deferred.resolve(new ConnectError('', Code.Unimplemented));
    expect(
      (await within(rowOf('Room the-cells')).findByRole('alert')).textContent
    ).toContain('Delete is not available on this server.');
  });

  it('listing reads no file', async () => {
    const { sink } = await renderReady([[...WORLD, ...REFERENCES]]);
    expect(sink.gets).toEqual([]);
  });

  it('a Save and Play in flight disables Rename and Delete with the lock title', async () => {
    const harness = setup([[...WORLD]]);
    const view = render(<harness.Harness gate="live" publishing />);
    await screen.findByRole('heading', { name: 'My World' });
    const row = rowOf('Room the-cells');
    for (const name of ['Rename the-cells', 'Delete the-cells']) {
      const button = within(row).getByRole('button', {
        name,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('title')).toBe(PUBLISH_RUNNING_TITLE);
    }
    // Open stays: the owner's lock refuses the import itself.
    expect(
      (
        within(row).getByRole('button', {
          name: 'Open the-cells',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    view.rerender(<harness.Harness gate="live" />);
    expect(
      (
        within(row).getByRole('button', {
          name: 'Rename the-cells',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });

  it('References rows offer neither Rename nor Delete', async () => {
    await renderReady([[...WORLD, ...REFERENCES]]);
    const row = rowOf('Room castle-kitchen');
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Open']);
  });

  it('a server that lists no source says owners are not available', async () => {
    await renderReady([[summary('the-cells', DungeonSource.UNSPECIFIED)]]);
    expect(
      screen.getByText(/Owners are not available on this server/)
    ).toBeTruthy();
    expect(screen.getByText(EMPTY_WORLD_SENTENCE)).toBeTruthy();
    const row = rowOf('Room the-cells');
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Open']);
  });
});
