/**
 * The builder against a fake `AuthoringService`: the compiler's
 * path-addressed errors land on the thing they name, Save stays
 * disabled until the file compiles, and Save sends the exact bytes the
 * YAML pane shows.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthoringClient } from './authoringRpc';
import { staleAtlasNotice } from './authoringRpc';
import { DungeonBuilder } from './DungeonBuilder';
import {
  addDoor,
  addRegion,
  emitDungeon,
  emptyDungeon,
  paintCell,
  setStart,
  updateDoor,
} from './dungeonYaml';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { referenceTombDoc } from './fixtures/referenceTomb';
import { axialKey, fromOffset, type Axial } from './hexOffset';

const p = (c: number, r: number): Axial => fromOffset('pointy', [c, r]);

vi.mock('@/api/useListDungeons', () => ({
  useListDungeons: () => ({
    dungeons: [],
    loading: false,
    error: null,
    refetch: async () => {},
  }),
}));

function fakeClient(errors: { path: string; message: string }[]) {
  const doc = referenceTombDoc();
  const putDungeon = vi.fn(async (req: { validateOnly: boolean }) => ({
    errors: req.validateOnly || errors.length ? errors : [],
    atlas: errors.length ? undefined : fixtureAtlasOf(doc),
  }));
  const getDungeon = vi.fn(async () => ({ yaml: emitDungeon(doc) }));
  return { putDungeon, getDungeon } as unknown as AuthoringClient & {
    putDungeon: typeof putDungeon;
  };
}

describe('DungeonBuilder', () => {
  it('highlights the cell a FieldError.path names and disables Save while errors exist', async () => {
    const client = fakeClient([
      { path: 'regions[1].cells[0][3]', message: 'cell is in two regions' },
      { path: 'start', message: 'start must be floor' },
    ]);
    render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('error-list').textContent).toContain(
        'regions[1].cells[0][3]'
      )
    );
    // regions[1] = hall, row 0 col 3 → [9,0]
    const named = document.querySelector(
      `[data-cell="${axialKey(fromOffset('pointy', [9, 0]))}"]`
    );
    expect(named?.getAttribute('stroke')).toBe('#ff3b30');
    const start = document.querySelector('[data-start]');
    expect(start?.querySelector('circle')?.getAttribute('stroke')).toBe(
      '#ff3b30'
    );
    const save = screen.getByRole('button', {
      name: /^Save$/,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(client.putDungeon).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'reference-tomb', validateOnly: true })
    );
  });

  it('enables Save once the file compiles and sends the pane bytes verbatim', async () => {
    const client = fakeClient([]);
    const yaml = emitDungeon(referenceTombDoc());
    render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={yaml}
        persistDraft={false}
      />
    );
    const save = screen.getByRole('button', {
      name: /^Save$/,
    }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(screen.getByTestId('status-line').textContent).toMatch(
      /compiled — 224 cells/
    );
    expect(screen.getByTestId('yaml-text').textContent).toBe(yaml);
    fireEvent.click(save);
    await waitFor(() =>
      expect(client.putDungeon).toHaveBeenLastCalledWith(
        expect.objectContaining({
          key: 'reference-tomb',
          yaml,
          validateOnly: false,
        })
      )
    );
    await screen.findByText('Saved reference-tomb');
  });

  it('Save & Play saves, then hands the key to onPlay; disabled with a reason when no character is picked', async () => {
    const client = fakeClient([]);
    const onPlay = vi.fn(async () => {});
    const { rerender } = render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
        onPlay={onPlay}
        playDisabledReason="Pick a character on Home to play"
      />
    );
    const play = screen.getByRole('button', {
      name: /Save & Play/,
    }) as HTMLButtonElement;
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^Save$/ }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
    expect(play.disabled).toBe(true);
    expect(play.title).toMatch(/Pick a character/);

    rerender(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
        onPlay={onPlay}
      />
    );
    await waitFor(() => expect(play.disabled).toBe(false));
    fireEvent.click(play);
    await waitFor(() => expect(onPlay).toHaveBeenCalledWith('reference-tomb'));
    expect(client.putDungeon).toHaveBeenCalledWith(
      expect.objectContaining({ validateOnly: false })
    );
  });
});

describe('DungeonBuilder — concealment links to the door (rpg-dnd5e-web#893)', () => {
  /** The rpg-dnd5e-web#890 shape: a door drawn concealed, its region left
   * unticked — one authored fact stated once, the other never caught up. */
  function buggyYaml(): string {
    let doc = emptyDungeon();
    doc = addRegion(doc); // region-2
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = paintCell(doc, 'region-2', p(2, 0));
    doc = addDoor(doc, [[p(1, 0), p(2, 0)]]);
    doc = updateDoor(doc, doc.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
    doc = setStart(doc, p(0, 0));
    return emitDungeon(doc);
  }

  it('self-heals the #890 shape on load: the region ticks concealed and the canvas shows it, without hand-tracing anything', async () => {
    const client = fakeClient([]);
    render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={buggyYaml()}
        persistDraft={false}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain(
        'concealed: true'
      )
    );
    const region2Cell = document.querySelector(
      `[data-cell="${axialKey(p(2, 0))}"]`
    );
    expect(region2Cell?.getAttribute('data-concealed')).toBe('true');
    const region1Cell = document.querySelector(
      `[data-cell="${axialKey(p(0, 0))}"]`
    );
    expect(region1Cell?.getAttribute('data-concealed')).toBeNull();
  });

  it('the derived region panel locks the checkbox and names the provenance (unmark-strips itself is covered as a pure function in dungeonYaml.test.ts)', async () => {
    const client = fakeClient([]);
    render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={buggyYaml()}
        persistDraft={false}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain(
        'concealed: true'
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(
      document.querySelector(`[data-cell="${axialKey(p(2, 0))}"]`)!
    );
    const checkbox = screen.getByLabelText(/concealed/) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByTestId('region-panel').textContent).toContain('derived');
  });
});

describe('DungeonBuilder — review follow-ups (PR #781)', () => {
  it('drops stale save errors once the document changes, so Save can be retried', async () => {
    const client = fakeClient([]);
    client.putDungeon.mockImplementation(
      async (req: { validateOnly: boolean }) =>
        req.validateOnly
          ? { errors: [], atlas: fixtureAtlasOf(referenceTombDoc()) }
          : { errors: [{ path: 'key', message: 'taken' }], atlas: undefined }
    );
    render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    const save = screen.getByRole('button', {
      name: /^Save$/,
    }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(save.disabled).toBe(true));
    expect(screen.getByTestId('error-list').textContent).toContain('taken');
    // edit the document: the stale save errors must clear
    fireEvent.change(screen.getByDisplayValue('The Reference Tomb'), {
      target: { value: 'Renamed' },
    });
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(screen.queryByTestId('error-list')).toBeNull();
  });

  it('fixtureCompile follows the current document', async () => {
    const compile = vi.fn((doc: Parameters<typeof fixtureAtlasOf>[0]) =>
      fixtureAtlasOf(doc)
    );
    render(
      <DungeonBuilder
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
        fixtureCompile={compile}
      />
    );
    expect(compile).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByDisplayValue('The Reference Tomb'), {
      target: { value: 'Renamed' },
    });
    await waitFor(() => expect(compile).toHaveBeenCalledTimes(2));
    expect(compile.mock.calls[1][0].name).toBe('Renamed');
  });
});

describe('DungeonBuilder timer lifecycle', () => {
  it('clears the toast timeout when the builder unmounts', async () => {
    const client = fakeClient([]);
    try {
      const { unmount } = render(
        <DungeonBuilder
          authoringClient={client}
          initialYaml={emitDungeon(referenceTombDoc())}
          persistDraft={false}
        />
      );
      const save = screen.getByRole('button', {
        name: /^Save$/,
      }) as HTMLButtonElement;
      await waitFor(() => expect(save.disabled).toBe(false));

      vi.useFakeTimers();
      fireEvent.click(save);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Saved reference-tomb')).toBeTruthy();

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('staleAtlasNotice — the 3D tab names a lagging atlas (#804 walk finding)', () => {
  const atlas = {} as never;
  it('is null when the shown atlas IS the current compile (or there is nothing to show)', () => {
    expect(
      staleAtlasNotice({ status: 'compiled', errors: [], atlas, message: null })
    ).toBeNull();
    expect(
      staleAtlasNotice({
        status: 'errors',
        errors: [],
        atlas: null,
        message: null,
      })
    ).toBeNull();
  });

  it('names the lag while validating, on errors, and when unreachable', () => {
    expect(
      staleAtlasNotice({
        status: 'validating',
        errors: [],
        atlas,
        message: null,
      })
    ).toMatch(/last compiled document/);
    expect(
      staleAtlasNotice({ status: 'errors', errors: [], atlas, message: null })
    ).toMatch(/problems/);
    expect(
      staleAtlasNotice({
        status: 'unreachable',
        errors: [],
        atlas,
        message: 'boom',
      })
    ).toMatch(/unreachable: boom/);
  });
});
