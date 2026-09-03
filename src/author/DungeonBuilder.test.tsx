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
  paintScenery,
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

describe('DungeonBuilder — the YAML pane authors, not just mirrors (#899)', () => {
  const paneOf = () => screen.getByTestId('yaml-text') as HTMLTextAreaElement;

  it('takes typed YAML into the document', async () => {
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    const pane = paneOf();
    // It really is an editor now, not a <pre>.
    expect(pane.tagName).toBe('TEXTAREA');

    const renamed = pane.value.replace(
      'name: The Reference Tomb',
      'name: The Typed Tomb'
    );
    expect(renamed).not.toBe(pane.value);
    fireEvent.focus(pane);
    fireEvent.change(pane, { target: { value: renamed } });

    // The document took it — the inspector is showing the typed name.
    await waitFor(() =>
      expect(screen.queryByDisplayValue('The Typed Tomb')).not.toBeNull()
    );
    expect(screen.queryByTestId('yaml-parse-error')).toBeNull();
  });

  it('keeps unparsable text instead of discarding it, and says so', () => {
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    const pane = paneOf();
    fireEvent.focus(pane);
    fireEvent.change(pane, { target: { value: 'version: 2\nkey: [unclosed' } });

    expect(screen.getByTestId('yaml-parse-error')).toBeTruthy();
    // A half-typed line is the ordinary state of typing; blurring onto the
    // canvas must not throw the work away.
    fireEvent.blur(pane);
    expect(paneOf().value).toBe('version: 2\nkey: [unclosed');
  });

  it('does not rewrite the text under the caret while it has focus', async () => {
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    const pane = paneOf();
    fireEvent.focus(pane);
    // Valid, but written in an order the emitter would re-sort. The document
    // accepts it; the pane must still show what was typed, or the caret jumps
    // and the author's formatting is rewritten mid-keystroke.
    const typed = pane.value.replace(
      'name: The Reference Tomb',
      'name: Still Typing'
    );
    fireEvent.change(pane, { target: { value: typed } });
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Still Typing')).not.toBeNull()
    );
    expect(paneOf().value).toBe(typed);

    // On blur the canonical emit comes back.
    fireEvent.blur(pane);
    expect(paneOf().value).toContain('name: Still Typing');
  });
});

describe("DungeonBuilder — the right rail is the author's to control", () => {
  it('folds the inspector away and remembers it, leaving the YAML pane standing', async () => {
    window.localStorage.clear();
    const { unmount } = render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    const fold = () => screen.getByRole('button', { name: /Inspector/i });
    expect(fold().getAttribute('aria-expanded')).toBe('true');
    // The inspector's own fields are on screen while it is open.
    expect(screen.queryByDisplayValue('The Reference Tomb')).not.toBeNull();

    fireEvent.click(fold());
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByDisplayValue('The Reference Tomb')).toBeNull();
    // Folding the inspector must not take the YAML with it — the whole point
    // is to give the YAML the height the inspector was using.
    expect(screen.getByTestId('yaml-pane')).toBeTruthy();

    // It is a preference, so it survives a remount.
    unmount();
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    expect(
      screen
        .getByRole('button', { name: /Inspector/i })
        .getAttribute('aria-expanded')
    ).toBe('false');
    window.localStorage.clear();
  });

  it('offers a resize handle that reports itself to assistive tech', () => {
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );
    const grip = screen.getByRole('separator', {
      name: /Resize the inspector rail/i,
    });
    expect(grip.getAttribute('aria-orientation')).toBe('vertical');
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

describe('DungeonBuilder — the scenery brush (rpg-project#360 slice 1)', () => {
  /** A room of three cells with a two-cell scenery strip beside it. */
  function stripYaml(): string {
    let doc = emptyDungeon();
    for (const c of [0, 1, 2]) doc = paintCell(doc, 'region-1', p(c, 1));
    doc = paintScenery(doc, p(3, 1));
    doc = paintScenery(doc, p(4, 1));
    doc = setStart(doc, p(0, 1));
    return emitDungeon(doc);
  }

  const cell = (c: number, r: number) =>
    document.querySelector(`[data-cell="${axialKey(p(c, r))}"]`)!;

  function mountBuilder(yaml: string) {
    return render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={yaml}
        persistDraft={false}
      />
    );
  }

  it('paints scenery from the palette and writes it to the file', async () => {
    mountBuilder(stripYaml());
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain('scenery:')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scenery' }));
    fireEvent.pointerDown(cell(5, 1), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);

    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain(
        'scenery:\n      - [[3,1],[4,1],[5,1]]'
      )
    );
    expect(cell(5, 1).getAttribute('data-scenery')).toBe('true');
  });

  it('moves a cell between the room and the strip rather than letting both claim it', async () => {
    mountBuilder(stripYaml());
    await waitFor(() =>
      expect(cell(2, 1).getAttribute('data-region')).toBe('region-1')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Scenery' }));
    fireEvent.pointerDown(cell(2, 1), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);
    await waitFor(() =>
      expect(cell(2, 1).getAttribute('data-scenery')).toBe('true')
    );
    expect(cell(2, 1).getAttribute('data-region')).toBe('');

    // Painting the room back over it takes it out of the strip again.
    fireEvent.click(screen.getByRole('button', { name: 'Region brush' }));
    fireEvent.pointerDown(cell(2, 1), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);
    await waitFor(() =>
      expect(cell(2, 1).getAttribute('data-region')).toBe('region-1')
    );
    expect(cell(2, 1).getAttribute('data-scenery')).toBeNull();
  });

  it('refuses the start on scenery IN PLACE, with the reason (design §2.4)', async () => {
    mountBuilder(stripYaml());
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain(
        'start: [0, 1]'
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    // The board acts on pointer DOWN — the same press the brush uses.
    fireEvent.pointerDown(cell(3, 1), { button: 0 });

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'nobody can stand here'
      )
    );
    // The start did not move — refused in place, not silently relocated.
    expect(screen.getByTestId('yaml-text').textContent).toContain(
      'start: [0, 1]'
    );

    // ...and it still moves onto a room cell.
    fireEvent.pointerDown(cell(1, 1), { button: 0 });
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain(
        'start: [1, 1]'
      )
    );
  });

  it('refuses a monster on scenery and accepts a prop there (F2)', async () => {
    mountBuilder(stripYaml());
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain('scenery:')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sk' }));
    fireEvent.pointerDown(cell(3, 1), { button: 0 });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'nobody can stand here'
      )
    );
    expect(screen.getByTestId('yaml-text').textContent).toContain('place: []');

    // A prop on the very same cell is fine — that is what the strip is for.
    const prop = document.querySelector(
      '[title^="dnd5e:props:"]'
    ) as HTMLElement;
    expect(prop).not.toBeNull();
    fireEvent.click(prop);
    fireEvent.pointerDown(cell(3, 1), { button: 0 });
    await waitFor(() =>
      expect(screen.getByTestId('yaml-text').textContent).toContain('at: [3,1]')
    );
    expect(screen.getByTestId('yaml-text').textContent).toContain(
      'dnd5e:props:'
    );
  });
});

describe('DungeonBuilder — the preview survives a server that has not learned `scenery` yet', () => {
  it('lists the strict decoder refusal, keeps drawing the board, and never blanks', async () => {
    // Until the toolkit slice lands and rpg-api is pinned, `PutDungeon
    // validate_only` REFUSES a document carrying `scenery` — an unknown
    // key, reported against the document rather than any cell. The field
    // is real, so the builder sends it and shows the refusal; it must not
    // fall over on a path it cannot draw.
    let doc = emptyDungeon();
    for (const c of [0, 1]) doc = paintCell(doc, 'region-1', p(c, 0));
    doc = paintScenery(doc, p(2, 0));
    const client = fakeClient([
      { path: 'document', message: 'unknown key "scenery"' },
    ]);

    render(
      <DungeonBuilder
        authoringClient={client}
        initialYaml={emitDungeon(doc)}
        persistDraft={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('error-list').textContent).toContain(
        'unknown key "scenery"'
      )
    );
    // The board still draws the document, scenery included — the refusal
    // is about the server's vocabulary, not about the file being undrawable.
    const strip = document.querySelector(`[data-cell="${axialKey(p(2, 0))}"]`);
    expect(strip?.getAttribute('data-scenery')).toBe('true');
    // The field is NOT stripped before sending: it is real, and hiding it
    // would hide the very refusal the pin is waiting to clear.
    expect(client.putDungeon).toHaveBeenLastCalledWith(
      expect.objectContaining({ yaml: expect.stringContaining('scenery:') })
    );
    // Save stays disabled while the server refuses, as with any error.
    expect(
      (screen.getByRole('button', { name: /^Save$/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
