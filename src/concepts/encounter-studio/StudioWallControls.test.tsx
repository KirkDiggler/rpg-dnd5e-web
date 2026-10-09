import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import type { EncounterStudioSession } from './studioSession';
import { StudioWallControls } from './StudioWallControls';

afterEach(cleanup);
function fixture(): Pick<EncounterStudioSession, 'document' | 'wallEditing'> {
  return {
    document: createPopulatedStudioDocument(),
    wallEditing: {
      selectedId: null,
      assetRef: null,
      snapEnabled: false,
      options: [
        {
          ref: 'creative',
          label: 'Creative table',
          wallMatch: false,
          thumbnail: { status: 'error', message: 'Model unavailable' },
        },
        {
          ref: 'wall',
          label: 'Castle wall',
          wallMatch: true,
          thumbnail: { status: 'loading' },
        },
        {
          ref: 'ready',
          label: 'Ready wall',
          wallMatch: true,
          thumbnail: { status: 'ready', image: 'data:image/png;base64,ready' },
        },
      ],
      select: vi.fn(() => true),
      setAsset: vi.fn(() => true),
      setSnap: vi.fn(() => true),
      create: vi.fn(() => true),
      edit: vi.fn(() => true),
      remove: vi.fn(() => true),
      reportRefusal: vi.fn(),
    },
  };
}
function props(
  session: ReturnType<typeof fixture>,
  drawing = true
): Parameters<typeof StudioWallControls>[0] {
  return { session, drawing, onDismiss: vi.fn(), onExitWallTool: vi.fn() };
}
describe('Studio wall presentation', () => {
  it('ranks wall matches without excluding creative choices; named loading/error native buttons stay selectable', () => {
    const session = fixture();
    render(<StudioWallControls {...props(session)} />);
    const choices = within(
      screen.getByRole('group', { name: 'Wall appearance choices' })
    ).getAllByRole('button');
    expect(choices.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Castle wall'),
      expect.stringContaining('Ready wall'),
      expect.stringContaining('Creative table'),
    ]);
    expect(
      choices.every(
        (button) =>
          button.tagName === 'BUTTON' && !button.hasAttribute('disabled')
      )
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose appearance Castle wall' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose appearance Creative table' })
    );
    expect(session.wallEditing.setAsset).toHaveBeenNthCalledWith(1, 'wall');
    expect(session.wallEditing.setAsset).toHaveBeenNthCalledWith(2, 'creative');
    expect(screen.getByText('Loading preview…')).toBeTruthy();
    expect(screen.getByText('Preview unavailable')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,ready'
    );
    fireEvent.change(screen.getByLabelText('Search wall appearances'), {
      target: { value: 'CREATIVE' },
    });
    expect(
      within(
        screen.getByRole('group', { name: 'Wall appearance choices' })
      ).getAllByRole('button')
    ).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search wall appearances'), {
      target: { value: 'nothing' },
    });
    expect(screen.getByText(/No matching wall appearances/)).toBeTruthy();
  });
  it('thumbnail updates never reset staged values; unsupported imported appearance is explicit and unchanged', () => {
    const session = fixture();
    session.wallEditing = { ...session.wallEditing, selectedId: 'studio-wall' };
    const initial = props(session, false);
    const view = render(<StudioWallControls {...initial} />);
    expect(
      screen.getByText(/Unsupported imported appearance/).textContent
    ).toContain('dnd5e:env:dark-fortress:45_wall_01');
    fireEvent.change(screen.getByLabelText('Wall length'), {
      target: { value: '9.123' },
    });
    fireEvent.change(screen.getByLabelText('Wall move X'), {
      target: { value: '4.56' },
    });
    const cosmetic = {
      ...session,
      wallEditing: {
        ...session.wallEditing,
        options: session.wallEditing.options.map((option) => ({
          ...option,
          thumbnail: {
            status: 'ready' as const,
            image: 'data:image/png;base64,next',
          },
        })),
      },
    };
    view.rerender(<StudioWallControls {...initial} session={cosmetic} />);
    expect(
      (screen.getByLabelText('Wall length') as HTMLInputElement).value
    ).toBe('9.123');
    expect(
      (screen.getByLabelText('Wall move X') as HTMLInputElement).value
    ).toBe('4.56');
    expect(session.wallEditing.edit).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss wall controls' })
    );
    expect(initial.onDismiss).toHaveBeenCalledTimes(1);
    expect(session.wallEditing.remove).not.toHaveBeenCalled();
    const replacement = {
      ...cosmetic,
      document: createPopulatedStudioDocument(),
    };
    view.rerender(<StudioWallControls {...initial} session={replacement} />);
    expect(
      (screen.getByLabelText('Wall length') as HTMLInputElement).value
    ).toBe('8');
  });
  it('numeric invalid/refused edits stay staged and visible; helper clamps exact length to protect attached openings', () => {
    const session = fixture();
    session.wallEditing = {
      ...session.wallEditing,
      selectedId: 'studio-wall',
      edit: vi.fn(() => false),
    };
    render(<StudioWallControls {...props(session, false)} />);
    fireEvent.change(screen.getByLabelText('Wall move X'), {
      target: { value: '' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Wall movement' }));
    expect(session.wallEditing.edit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/finite numeric/);
    fireEvent.change(screen.getByLabelText('Wall move X'), {
      target: { value: '1' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Wall movement' }));
    expect(screen.getByRole('alert').textContent).toMatch(/refused/);
    expect(
      (screen.getByLabelText('Wall move X') as HTMLInputElement).value
    ).toBe('1');
    fireEvent.change(screen.getByLabelText('Wall length'), {
      target: { value: '2' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Wall exact length' }));
    expect(session.wallEditing.edit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'studio-wall',
        line: { start: { x: -4, z: -3 }, end: { x: 3, z: -3 } },
        openings: session.document.draft.room.walls![0].openings,
      })
    );
  });
  it('Escape in drawing context exits the Wall tool; dismissal alone does not disarm it', () => {
    const initial = props(fixture());
    render(<StudioWallControls {...initial} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss wall controls' })
    );
    expect(initial.onDismiss).toHaveBeenCalledTimes(1);
    expect(initial.session.wallEditing.setAsset).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Search wall appearances'), {
      key: 'Escape',
    });
    expect(initial.onExitWallTool).toHaveBeenCalledTimes(1);
  });
});
