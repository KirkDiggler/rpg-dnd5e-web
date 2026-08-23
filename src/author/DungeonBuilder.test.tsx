/**
 * The builder against a fake `AuthoringService`: the compiler's
 * path-addressed errors land on the thing they name, Save stays
 * disabled until the file compiles, and Save sends the exact bytes the
 * YAML pane shows.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthoringClient } from './authoringRpc';
import { DungeonBuilder } from './DungeonBuilder';
import { emitDungeon } from './dungeonYaml';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { referenceTombDoc } from './fixtures/referenceTomb';
import { axialKey, fromOffset } from './hexOffset';

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
