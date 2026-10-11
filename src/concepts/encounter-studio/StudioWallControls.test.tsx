import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectStudioArrange } from '../world-building/studioArrange';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { StudioArrangePanel } from './StudioArrangePanel';
import type { EncounterStudioSession } from './studioSession';
import { StudioWallControls } from './StudioWallControls';

afterEach(cleanup);
function fixture(): EncounterStudioSession {
  return {
    document: createPopulatedStudioDocument(),
    viewportProps: {
      scene: createPopulatedStudioDocument().draft.scene,
      previewScene: null,
      selectedIds: [],
      tool: 'select',
      activeDrag: null,
      onSelect: vi.fn(),
      onDrop: vi.fn(),
      onDragFinished: vi.fn(),
      onTransformPreview: vi.fn(),
      onTransformCommit: vi.fn(),
      onTransformReject: vi.fn(),
      onAssetState: vi.fn(),
    },
    arrange: null,
    intentEpoch: 0,
    regionEditing: {
      resolutions: [],
      createRoomLabel: vi.fn(() => true),
      useEnclosingWalls: vi.fn(() => true),
      setExplicitRegionArea: vi.fn(() => true),
      removeRegionAndLabel: vi.fn(() => true),
    },
    doorEditing: {
      assetRef: null,
      active: false,
      options: [],
      selectedTarget: null,
      preview: null,
      setAsset: vi.fn(() => true),
      setActive: vi.fn(() => true),
      select: vi.fn(() => true),
      previewPlacement: vi.fn(() => true),
      create: vi.fn(() => true),
      previewMove: vi.fn(() => true),
      move: vi.fn(() => true),
      cancelPreview: vi.fn(),
    },
    commitArrange: vi.fn(() => true),
    commitTables: vi.fn(() => true),
    mapLabelSelection: { selectedId: null, select: vi.fn(() => true) },
    renameDocument: vi.fn(() => true),
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    commitFloor: vi.fn(() => true),
    resizeWorkspace: vi.fn(() => true),
    createMapLabel: vi.fn(() => true),
    moveMapLabel: vi.fn(() => true),
    renameMapLabel: vi.fn(() => true),
    deleteMapLabel: vi.fn(() => true),
    cancelTransients: vi.fn(),
    propTool: 'select',
    setPropTool: vi.fn(),
    propControls: {
      palette: null,
      tree: null,
      selection: null,
      arrangeExtras: null,
    },
    saveStatus: '',
    notice: null,
    autosaveBlocked: false,
    saveLocalDraft: vi.fn(),
    dismissNotice: vi.fn(),
    wallEditing: {
      selectedId: null,
      assetRef: null,
      snapEnabled: false,
      endpointSnapEnabled: true,
      setEndpointSnap: vi.fn(() => true),
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
          thumbnail: { status: 'error', message: 'No published preview' },
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

function selectedPanel(session: EncounterStudioSession): React.JSX.Element {
  const arrange = projectStudioArrange({
    draft: session.document.draft,
    target: { kind: 'wall', id: session.wallEditing.selectedId! },
    selectionRevision: 1,
  });
  return <StudioArrangePanel session={{ ...session, arrange }} expanded />;
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
    expect(
      screen.getByLabelText('Preview unavailable for Castle wall')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Preview unavailable for Creative table')
    ).toBeTruthy();
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
    const view = render(selectedPanel(session));
    fireEvent.click(
      screen.getByRole('button', { name: 'Change wall appearance' })
    );
    expect(
      screen.getByText(/Unsupported imported appearance/).textContent
    ).toContain('dnd5e:env:dark-fortress:45_wall_01');
    fireEvent.change(screen.getByLabelText('Wall length'), {
      target: { value: '9.123' },
    });
    fireEvent.change(screen.getByLabelText('Wall midpoint X'), {
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
    view.rerender(selectedPanel(cosmetic));
    expect(
      (screen.getByLabelText('Wall length') as HTMLInputElement).value
    ).toBe('9.123');
    expect(
      (screen.getByLabelText('Wall midpoint X') as HTMLInputElement).value
    ).toBe('4.56');
    expect(session.wallEditing.edit).not.toHaveBeenCalled();
    view.rerender(<StudioArrangePanel session={cosmetic} expanded={false} />);
    expect(session.wallEditing.remove).not.toHaveBeenCalled();
    const replacement = {
      ...cosmetic,
      document: createPopulatedStudioDocument(),
    };
    view.rerender(selectedPanel(replacement));
    expect(
      (screen.getByLabelText('Wall length') as HTMLInputElement).value
    ).toBe('8');
  });
  it('numeric invalid/refused edits stay staged and visible; the whole dirty patch reaches the owner', () => {
    const session = fixture();
    session.wallEditing = {
      ...session.wallEditing,
      selectedId: 'studio-wall',
      edit: vi.fn(() => false),
    };
    session.commitArrange = vi.fn(() => false);
    render(selectedPanel(session));
    fireEvent.change(screen.getByLabelText('Wall midpoint X'), {
      target: { value: '' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Arrange selected noun' })
    );
    expect(session.wallEditing.edit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/finite numeric/);
    fireEvent.change(screen.getByLabelText('Wall midpoint X'), {
      target: { value: '1' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Arrange selected noun' })
    );
    expect(screen.getByRole('alert').textContent).toMatch(/refused/);
    expect(
      (screen.getByLabelText('Wall midpoint X') as HTMLInputElement).value
    ).toBe('1');
    fireEvent.change(screen.getByLabelText('Wall length'), {
      target: { value: '2' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Arrange selected noun' })
    );
    expect(session.commitArrange).toHaveBeenLastCalledWith({
      kind: 'wall-edit',
      target: { kind: 'wall', id: 'studio-wall' },
      midpoint: { x: 1 },
      length: { value: 2, anchor: 'start' },
    });
  });
  it('creation appearance search Enter remains a filter and never arms an asset or commits Arrange', () => {
    const session = fixture();
    const initial = props(session);
    render(<StudioWallControls {...initial} />);
    const search = screen.getByLabelText('Search wall appearances');
    fireEvent.change(search, { target: { value: 'CREATIVE' } });
    expect(fireEvent.keyDown(search, { key: 'Enter' })).toBe(false);
    expect((search as HTMLInputElement).value).toBe('CREATIVE');
    expect(
      within(
        screen.getByRole('group', { name: 'Wall appearance choices' })
      ).getAllByRole('button')
    ).toHaveLength(1);
    expect(session.wallEditing.setAsset).not.toHaveBeenCalled();
    expect(session.wallEditing.create).not.toHaveBeenCalled();
    expect(session.commitArrange).not.toHaveBeenCalled();
    expect(initial.onDismiss).not.toHaveBeenCalled();
    expect(initial.onExitWallTool).not.toHaveBeenCalled();
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

describe('M1 untouched precision display', () => {
  it.each(['start', 'end'])(
    'uses canonical length for an untouched %s endpoint, but honors explicitly edited display precision',
    (endpoint) => {
      const session = fixture();
      const wall = session.document.draft.room.walls![0];
      wall.line = { start: { x: 0, z: 0 }, end: { x: 3, z: 2 } };
      wall.openings = [];
      wall.blocker.footprint.width = Math.hypot(3, 2);
      session.wallEditing = { ...session.wallEditing, selectedId: wall.id };
      render(selectedPanel(session));
      fireEvent.change(screen.getByLabelText('Fixed endpoint'), {
        target: { value: endpoint },
      });
      expect(
        (screen.getByLabelText('Wall length') as HTMLInputElement).value
      ).toBe('3.605551');
      fireEvent.submit(
        screen.getByRole('form', { name: 'Arrange selected noun' })
      );
      expect(session.commitArrange).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('Wall length'), {
        target: { value: '3.605552' },
      });
      fireEvent.submit(
        screen.getByRole('form', { name: 'Arrange selected noun' })
      );
      expect(session.commitArrange).toHaveBeenLastCalledWith({
        kind: 'wall-edit',
        target: { kind: 'wall', id: wall.id },
        length: { value: 3.605552, anchor: endpoint },
      });
      fireEvent.change(screen.getByLabelText('Wall length'), {
        target: { value: '' },
      });
      fireEvent.submit(
        screen.getByRole('form', { name: 'Arrange selected noun' })
      );
      expect(screen.getByRole('alert').textContent).toMatch(/finite numeric/);
      expect(session.commitArrange).toHaveBeenCalledTimes(1);
    }
  );
});
