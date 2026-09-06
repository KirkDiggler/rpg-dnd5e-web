/**
 * The builder against a fake `AuthoringService`: the compiler's
 * path-addressed errors land on the thing they name, Save stays
 * disabled until the file compiles, and Save sends the exact bytes the
 * YAML pane shows.
 */
import { create } from '@bufbuild/protobuf';
import {
  FieldType,
  ScenarioDescriptorSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringClient } from './authoringRpc';
import { staleAtlasNotice } from './authoringRpc';
import { DungeonBuilder } from './DungeonBuilder';
import {
  addRegion,
  emitDungeon,
  emptyDungeon,
  intelHolders,
  paintCell,
  paintScenery,
  parseDungeon,
  placeAt,
  setStart,
  updateDoor,
} from './dungeonYaml';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { referenceTombDoc } from './fixtures/referenceTomb';
import { referenceTombHeirloomDoc } from './fixtures/referenceTombHeirloom';
import {
  cellPositions,
  latticeOf,
  positionCrossing,
  type PositionRef,
} from './hexGeometry';
import { axialKey, fromOffset, type Axial } from './hexOffset';

const p = (c: number, r: number): Axial => fromOffset('pointy', [c, r]);

/** The file lives on the rail's Source tab now — one pane at a time
 * (rpg-dnd5e-web#945) — so reading it means asking for that pane first.
 * Clicking a tab that is already up costs nothing. */
function sourceText(): HTMLElement {
  fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
  return screen.getByTestId('yaml-text');
}

// The rail remembers which pane it was on (`dg.rail.tab`), so a test that
// opens the Source tab would otherwise decide where the NEXT test opens.
beforeEach(() => window.localStorage.clear());

vi.mock('@/api/useListDungeons', () => ({
  useListDungeons: () => ({
    dungeons: [],
    loading: false,
    error: null,
    refetch: async () => {},
  }),
}));

/** What this build's rulebook offers, as `ListScenarios` sends it — one
 * blank of kind `faction`, which the raider camp is authored against. */
const HOLD_OUT = create(ScenarioDescriptorSchema, {
  id: 'hold-out',
  name: 'The hold-out',
  fields: [
    {
      key: 'convince',
      label: 'Convince',
      type: FieldType.ENTITY_REF,
      kind: 'faction',
      guidance: 'which faction the party must turn',
    },
  ],
});

function fakeClient(errors: { path: string; message: string }[]) {
  const doc = referenceTombDoc();
  const putDungeon = vi.fn(async (req: { validateOnly: boolean }) => ({
    errors: req.validateOnly || errors.length ? errors : [],
    atlas: errors.length ? undefined : fixtureAtlasOf(doc),
  }));
  const getDungeon = vi.fn(async () => ({ yaml: emitDungeon(doc) }));
  const listScenarios = vi.fn(async () => ({ scenarios: [HOLD_OUT] }));
  return {
    putDungeon,
    getDungeon,
    listScenarios,
  } as unknown as AuthoringClient & {
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
    expect(sourceText().textContent).toBe(yaml);
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
  const paneOf = () => sourceText() as HTMLTextAreaElement;

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

    // Nothing to complain about, said on the pane that was typed into.
    expect(screen.queryByTestId('yaml-parse-error')).toBeNull();
    // And the document took it — the inspector, a tab away, is showing the
    // typed name.
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }));
    await waitFor(() =>
      expect(screen.queryByDisplayValue('The Typed Tomb')).not.toBeNull()
    );
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

  it('keeps an unparsed draft across a look at another pane', async () => {
    // The rail shows one pane at a time (#945), so the Source pane unmounts
    // when the author checks the inspector. #899's promise has to survive
    // that: half-typed text is unfinished work, not junk.
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

    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }));
    await waitFor(() =>
      expect(screen.queryByDisplayValue('The Reference Tomb')).not.toBeNull()
    );
    // Back on Source: the text is still there, and so is the reason.
    expect(paneOf().value).toBe('version: 2\nkey: [unclosed');
    expect(screen.getByTestId('yaml-parse-error')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }));
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
  const tab = (name: string) => screen.getByRole('tab', { name });
  const railBuilder = () =>
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
      />
    );

  it('shows one pane at a time and remembers which, opening on the Inspector', async () => {
    window.localStorage.clear();
    const { unmount } = railBuilder();
    // The pane the rail has always opened on, and its own fields.
    expect(tab('Inspector').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByDisplayValue('The Reference Tomb')).not.toBeNull();
    expect(screen.queryByTestId('yaml-pane')).toBeNull();

    fireEvent.click(tab('Source'));
    // ONE AT A TIME: the file gets the whole column, which is the point —
    // the inspector is not sharing it any more.
    expect(screen.getByTestId('yaml-pane')).toBeTruthy();
    expect(screen.queryByDisplayValue('The Reference Tomb')).toBeNull();

    fireEvent.click(tab('Scenario'));
    expect(screen.getByTestId('scenario-panel')).toBeTruthy();
    expect(screen.queryByTestId('yaml-pane')).toBeNull();

    // It is a preference, so it survives a remount.
    unmount();
    railBuilder();
    expect(tab('Scenario').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('scenario-panel')).toBeTruthy();
    window.localStorage.clear();
  });

  it('brings the Inspector forward when something is selected on the canvas', () => {
    // A click on the board asks a question only the inspector answers, so
    // the rail follows the click. Nothing ELSE moves it — the tabs are the
    // author's.
    window.localStorage.clear();
    railBuilder();
    fireEvent.click(tab('Source'));
    expect(screen.getByTestId('yaml-pane')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(
      document.querySelector(`[data-cell="${axialKey(p(1, 1))}"]`)!,
      { button: 0 }
    );
    expect(tab('Inspector').getAttribute('aria-selected')).toBe('true');
    // The brazier standing on that cell, on the pane that describes it.
    expect(screen.getByTestId('placement-panel')).toBeTruthy();
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
  /** The side midpoint between two adjacent cells — a wall's line is two
   * positions now, not a hex-to-hex crossing, so a door needs the
   * position that side's midpoint is (rpg-project#360 slice 2). */
  function sideBetween(a: Axial, b: Axial): PositionRef {
    for (const pos of cellPositions('pointy', a)) {
      const crossing = positionCrossing('pointy', latticeOf('pointy', pos));
      if (!crossing) continue;
      const [x, y] = crossing;
      if (
        (axialKey(x) === axialKey(a) && axialKey(y) === axialKey(b)) ||
        (axialKey(x) === axialKey(b) && axialKey(y) === axialKey(a))
      ) {
        return pos;
      }
    }
    throw new Error('sideBetween: cells are not adjacent');
  }

  /** The rpg-dnd5e-web#890 shape: a door drawn concealed, its region left
   * unticked — one authored fact stated once, the other never caught up.
   * Built directly rather than through `toggleDoorAt` — that mutator
   * refuses a door with no wall under it (F10), a guard rail this test
   * has no use for; it only needs a door on the crossing, which is all a
   * door concealed with no matching wall on the wire is anyway. */
  function buggyYaml(): string {
    let doc = emptyDungeon();
    doc = addRegion(doc); // region-2
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = paintCell(doc, 'region-2', p(2, 0));
    doc = {
      ...doc,
      doors: [{ id: 'door-1', at: sideBetween(p(1, 0), p(2, 0)) }],
    };
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
      expect(sourceText().textContent).toContain('concealed: true')
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
      expect(sourceText().textContent).toContain('concealed: true')
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
    await waitFor(() => expect(sourceText().textContent).toContain('scenery:'));

    fireEvent.click(screen.getByRole('button', { name: 'Scenery' }));
    fireEvent.pointerDown(cell(5, 1), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);

    await waitFor(() =>
      expect(sourceText().textContent).toContain(
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
      expect(sourceText().textContent).toContain('start: [0, 1]')
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
    expect(sourceText().textContent).toContain('start: [0, 1]');

    // ...and it still moves onto a room cell.
    fireEvent.pointerDown(cell(1, 1), { button: 0 });
    await waitFor(() =>
      expect(sourceText().textContent).toContain('start: [1, 1]')
    );
  });

  it('places the generated exact Plushie ref with its explicit behavior', async () => {
    mountBuilder(stripYaml());
    await waitFor(() => expect(sourceText().textContent).toContain('scenery:'));

    const plushie = document.querySelector(
      '[title^="dnd5e:props:plushie:skeleton-dog"]'
    ) as HTMLElement;
    expect(plushie).not.toBeNull();
    fireEvent.click(plushie);
    fireEvent.pointerDown(cell(3, 1), { button: 0 });

    await waitFor(() =>
      expect(sourceText().textContent).toContain(
        'dnd5e:props:plushie:skeleton-dog'
      )
    );
    expect(sourceText().textContent).toContain('blocks_movement: false');
    expect(sourceText().textContent).toContain('blocks_los: false');
  });

  it('refuses a monster on scenery and accepts a prop there (F2)', async () => {
    mountBuilder(stripYaml());
    await waitFor(() => expect(sourceText().textContent).toContain('scenery:'));

    fireEvent.click(screen.getByRole('button', { name: 'Sk' }));
    fireEvent.pointerDown(cell(3, 1), { button: 0 });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'nobody can stand here'
      )
    );
    expect(sourceText().textContent).toContain('place: []');

    // A prop on the very same cell is fine — that is what the strip is for.
    const prop = document.querySelector(
      '[title^="dnd5e:props:"]'
    ) as HTMLElement;
    expect(prop).not.toBeNull();
    fireEvent.click(prop);
    fireEvent.pointerDown(cell(3, 1), { button: 0 });
    await waitFor(() =>
      expect(sourceText().textContent).toContain('at: [3,1]')
    );
    expect(sourceText().textContent).toContain('dnd5e:props:');
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

describe('DungeonBuilder — the scenery brush refuses rather than deletes', () => {
  it('names what is standing in the way and leaves it standing', async () => {
    let doc = emptyDungeon();
    for (const c of [0, 1, 2]) doc = paintCell(doc, 'region-1', p(c, 0));
    doc = setStart(doc, p(0, 0));
    doc = placeAt(doc, { ref: 'dnd5e:monsters:skeleton', at: p(1, 0) });

    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(doc)}
        persistDraft={false}
      />
    );
    const cell = (c: number, r: number) =>
      document.querySelector(`[data-cell="${axialKey(p(c, r))}"]`)!;
    await waitFor(() => expect(cell(0, 0)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Scenery' }));

    fireEvent.pointerDown(cell(0, 0), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'the party starts here'
      )
    );
    expect(cell(0, 0).getAttribute('data-scenery')).toBeNull();

    fireEvent.pointerDown(cell(1, 0), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'a monster stands here'
      )
    );
    expect(cell(1, 0).getAttribute('data-scenery')).toBeNull();

    // Nothing was deleted: the file still carries both.
    const yaml = sourceText().textContent ?? '';
    expect(yaml).toContain('start: [0, 0]');
    expect(yaml).toContain('dnd5e:monsters:skeleton');

    // The free cell beside them still paints.
    fireEvent.pointerDown(cell(2, 0), { button: 0 });
    fireEvent.pointerUp(document.querySelector('svg')!);
    await waitFor(() =>
      expect(cell(2, 0).getAttribute('data-scenery')).toBe('true')
    );
  });
});

describe('the intel record, end to end through the builder (rpg-project#372)', () => {
  /** The heirloom tomb has a named captain and a concealed vault door —
   * everything a record needs something to point at. */
  const heirloomYaml = () => emitDungeon(referenceTombHeirloomDoc());

  function renderBuilder() {
    return render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={heirloomYaml()}
        persistDraft={false}
      />
    );
  }

  it('lists the record the file already declares', () => {
    // The heirloom tomb authors `vault-map` — the panel is where it is
    // read and changed, not a second place it is described.
    renderBuilder();
    expect(screen.getByTestId('intel-vault-map')).toBeTruthy();
    fireEvent.click(screen.getByTestId('intel-vault-map'));
    expect((screen.getByTestId('intel-id') as HTMLInputElement).value).toBe(
      'vault-map'
    );
    expect(
      (screen.getByTestId('intel-reveals-door') as HTMLSelectElement).value
    ).toBe('vault');
    expect(
      (screen.getByTestId('intel-holder-captain') as HTMLInputElement).checked
    ).toBe(true);
  });

  it('creates a record from the palette and opens its form', () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId('new-intel'));
    // The list beside Regions gets the record, and the inspector opens on
    // it — the two halves design §5 asks for. The suggested id numbers
    // around the one the file already has.
    expect(screen.getByTestId('intel-intel-3')).toBeTruthy();
    expect(screen.getByTestId('intel-panel')).toBeTruthy();
    expect((screen.getByTestId('intel-id') as HTMLInputElement).value).toBe(
      'intel-3'
    );
  });

  it('writes intel: and holds: into the file the server will read', async () => {
    // THE WHOLE TOOL, in one path: declare a record, point it at the
    // concealed door, hand it to the captain, and read the bytes back out
    // of the pane that gets sent.
    renderBuilder();
    fireEvent.click(screen.getByTestId('new-intel'));
    fireEvent.change(screen.getByTestId('intel-id'), {
      target: { value: 'the-password' },
    });
    fireEvent.change(screen.getByTestId('intel-reveals-door'), {
      target: { value: 'hall-tomb' },
    });
    fireEvent.click(screen.getByTestId('intel-holder-captain'));

    // The TEXTAREA, not the pane: the pane's textContent also carries the
    // toolbar and the status line, which is not a document.
    const yaml = (sourceText() as HTMLTextAreaElement).value;
    expect(yaml).toContain('- id: the-password');
    expect(yaml).toContain('reveals: { door: hall-tomb }');
    // The captain now carries BOTH — intel copies, and a monster may hold
    // more than one record.
    expect(yaml).toContain('holds: [vault-map, the-password]');

    const doc = parseDungeon(yaml);
    expect(doc.intel).toEqual([
      { id: 'vault-map', reveals: { door: 'vault' } },
      { id: 'hall-notes', reveals: { door: 'vault' } },
      { id: 'the-password', reveals: { door: 'hall-tomb' } },
    ]);
    expect(intelHolders(doc, 'the-password')).toEqual(['captain']);
  });

  it('shows the assignment on the monster, read only, and links back', async () => {
    renderBuilder();
    // Select the captain on the board: its panel mirrors the holding the
    // file already declares, and offers no way to edit it.
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(
      document.querySelector(
        `[data-cell="${axialKey(fromOffset('pointy', [23, 5]))}"]`
      )!,
      { button: 0 }
    );
    const readout = screen.getByTestId('holds-readout');
    expect(readout.querySelectorAll('input')).toHaveLength(0);
    // The link goes back to the record's own form, which is where intel
    // is edited (design R2).
    fireEvent.click(screen.getByTestId('holds-vault-map'));
    expect(screen.getByTestId('intel-panel')).toBeTruthy();
    expect((screen.getByTestId('intel-id') as HTMLInputElement).value).toBe(
      'vault-map'
    );
  });
});

describe('the Scenario tab, end to end through the builder (#945)', () => {
  it('adds the chosen scenario to the FILE as an empty block, and takes it back out', async () => {
    window.localStorage.clear();
    render(
      <DungeonBuilder
        authoringClient={fakeClient([])}
        initialYaml={emitDungeon(referenceTombDoc())}
        persistDraft={false}
        allowYamlFileIO
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Scenario' }));
    // The tomb binds nothing, so there is a chooser and no form.
    await waitFor(() =>
      expect(screen.getByTestId('scenario-add-pick')).toBeTruthy()
    );
    expect(screen.queryByTestId('scenario-hold-out')).toBeNull();

    fireEvent.change(screen.getByTestId('scenario-add-pick'), {
      target: { value: 'hold-out' },
    });
    fireEvent.click(screen.getByTestId('scenario-add-do'));
    // Its blanks are on screen, unfilled…
    expect(screen.getByTestId('scenario-hold-out')).toBeTruthy();
    expect(screen.getByLabelText('Convince')).toBeTruthy();
    // …and the file says so, in the one token that means "bound, nothing
    // filled in yet".
    expect(sourceText().textContent).toContain('scenarios:\n  hold-out: {}');

    fireEvent.click(screen.getByRole('tab', { name: 'Scenario' }));
    fireEvent.click(screen.getByTestId('scenario-hold-out-remove'));
    expect(screen.queryByTestId('scenario-hold-out')).toBeNull();
    expect(sourceText().textContent).not.toContain('scenarios:');
    window.localStorage.clear();
  });
});
