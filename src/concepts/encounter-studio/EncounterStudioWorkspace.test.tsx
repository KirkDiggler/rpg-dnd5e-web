import type { CompositionSource } from '@/compositions/compositionSource';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoomDraft } from '../world-building/roomDraft';
import type { WorldBuildingViewportProps } from '../world-building/WorldBuildingViewport';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import type {
  EncounterStudioPresentation,
  EncounterStudioSession,
  LayoutViewportProps,
} from './studioSession';

const observed = vi.hoisted(() => ({
  session: null as EncounterStudioSession | null,
  ownerMounts: 0,
  ownerUnmounts: 0,
  layoutUnmounts: 0,
  viewportUnmounts: 0,
  ownerProps: null as Record<string, unknown> | null,
  layoutProps: null as LayoutViewportProps | null,
  viewportProps: null as WorldBuildingViewportProps | null,
  events: [] as string[],
}));

vi.mock('../world-building/WorldBuildingConcept', () => ({
  WorldBuildingConcept: (props: {
    studioPresentation: EncounterStudioPresentation;
  }) => {
    observed.ownerProps = props;
    observed.events.push(`render:${props.studioPresentation.view}`);
    useEffect(() => {
      observed.ownerMounts++;
      return () => {
        observed.ownerUnmounts++;
      };
    }, []);
    if (!observed.session) throw new Error('Missing fake owner session');
    return props.studioPresentation.render(observed.session);
  },
}));

vi.mock('./LayoutViewport', () => ({
  LayoutViewport: (props: LayoutViewportProps) => {
    observed.layoutProps = props;
    useEffect(
      () => () => {
        observed.layoutUnmounts++;
      },
      []
    );
    return (
      <div aria-label="Layout floor surface">
        <button
          onClick={() =>
            props.onFrameChange({ center: { x: 3, z: -2 }, zoom: 1.75 })
          }
        >
          Pan and zoom test surface
        </button>
        <button
          onClick={() =>
            props.onCommit(
              [{ q: 1, r: 0 }],
              props.tool === 'erase' ? 'erase' : 'paint'
            )
          }
        >
          Commit test floor
        </button>
      </div>
    );
  },
}));

vi.mock('../world-building/WorldBuildingViewport', () => ({
  WorldBuildingViewport: (props: WorldBuildingViewportProps) => {
    observed.viewportProps = props;
    useEffect(
      () => () => {
        observed.viewportUnmounts++;
      },
      []
    );
    return <div aria-label="Controlled 3D surface" />;
  },
}));

const source: CompositionSource = {
  worldId: 'current-world',
  reader: { listCompositions: vi.fn(), getComposition: vi.fn() },
};

function createSession(): EncounterStudioSession {
  const draft = createRoomDraft(
    { version: 1, id: 'scene-1', name: 'Studio scene', items: [], groups: [] },
    'room-1'
  );
  return {
    document: { draft, scope: {} },
    viewportProps: {
      scene: draft.scene,
      previewScene: null,
      selectedIds: ['selected-prop'],
      tool: 'select',
      activeDrag: null,
      roomAuthoring: {
        tool: 'select',
        workspace: draft.workspace,
        walkableHexes: draft.room.walkableHexes,
        propDeclarations: draft.room.propDeclarations,
        onWalkableGesture: vi.fn(),
      },
      onSelect: vi.fn(),
      onDrop: vi.fn(),
      onDragFinished: vi.fn(),
      onTransformPreview: vi.fn(),
      onTransformCommit: vi.fn(),
      onTransformReject: vi.fn(),
      onAssetState: vi.fn(),
    },
    canUndo: true,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    commitFloor: vi.fn(() => true),
    cancelTransients: vi.fn(() => {
      observed.events.push('cancel');
    }),
    propTool: 'select',
    setPropTool: vi.fn(),
    propControls: {
      palette: (
        <div>
          <input aria-label="Search reused assets" defaultValue="" />
          <button>Repeat existing piece</button>
        </div>
      ),
      tree: <div>Reused scene tree</div>,
      selection: <div>Reused selection visuals</div>,
    },
    saveStatus: 'Room authoring draft saved locally',
    notice: null,
    autosaveBlocked: false,
    saveLocalDraft: vi.fn(),
    dismissNotice: vi.fn(),
  };
}

beforeEach(() => {
  observed.session = createSession();
  observed.ownerMounts =
    observed.ownerUnmounts =
    observed.layoutUnmounts =
    observed.viewportUnmounts =
      0;
  observed.ownerProps = observed.layoutProps = observed.viewportProps = null;
  observed.events = [];
});

const click = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('Encounter Studio shell (fake owner, real presentation)', () => {
  it('opens clean Layout with visible Paint Erase Rectangle and no site inspector', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    expect(
      screen.getByRole('heading', { name: 'Encounter Studio' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Paint' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Erase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeTruthy();
    expect(observed.layoutProps?.tool).toBe('paint');
    expect(screen.queryByLabelText('Prop palette')).toBeNull();
    expect(screen.queryByText('Reused scene tree')).toBeNull();
    expect(
      screen.queryByText(/site inspector|Save & Play|Identity|Policies/i)
    ).toBeNull();
    expect(observed.ownerProps).toEqual(
      expect.objectContaining({ roomMode: true, compositionSource: source })
    );
    expect(observed.ownerProps).not.toHaveProperty('roomPublishing');
    expect(observed.ownerProps).not.toHaveProperty('onPlay');
  });

  it('Layout and 3D switch without replacing the Concept instance', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('3D');
    expect(screen.queryByLabelText('Layout floor surface')).toBeNull();
    expect(observed.layoutUnmounts).toBe(1);
    click('Layout');
    expect(screen.queryByLabelText('Controlled 3D surface')).toBeNull();
    expect(observed.viewportUnmounts).toBe(1);
    expect(observed.ownerMounts).toBe(1);
    expect(observed.ownerUnmounts).toBe(0);
    expect(observed.session?.viewportProps.selectedIds).toEqual([
      'selected-prop',
    ]);
  });

  it('switch calls cancellation but never commit undo save or play', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    observed.events = [];
    click('Layout');
    expect(observed.session?.cancelTransients).not.toHaveBeenCalled();
    click('3D');
    expect(observed.events.slice(0, 2)).toEqual(['cancel', 'render:3d']);
    click('Layout');
    expect(observed.session?.cancelTransients).toHaveBeenCalledTimes(2);
    for (const fn of [
      observed.session?.commitFloor,
      observed.session?.undo,
      observed.session?.redo,
      observed.session?.saveLocalDraft,
      observed.session?.viewportProps.onTransformCommit,
      observed.session?.viewportProps.onSelect,
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it('returns to the same Layout frame and floor tool', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('Erase');
    click('Pan and zoom test surface');
    const frame = observed.layoutProps?.frame;
    click('3D');
    click('Layout');
    expect(observed.layoutProps?.frame).toBe(frame);
    expect(observed.layoutProps?.frame).toEqual({
      center: { x: 3, z: -2 },
      zoom: 1.75,
    });
    expect(observed.layoutProps?.tool).toBe('erase');
    expect(observed.session?.commitFloor).not.toHaveBeenCalled();
    click('Commit test floor');
    expect(observed.session?.commitFloor).toHaveBeenCalledWith(
      [{ q: 1, r: 0 }],
      'erase'
    );
    expect(observed.layoutProps?.draft).toBe(observed.session?.document.draft);
  });

  it('3D receives the shared viewport props and reused prop controls', () => {
    const { rerender } = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    click('3D');
    expect(observed.viewportProps).toEqual(observed.session?.viewportProps);
    expect(observed.viewportProps?.scene).toBe(
      observed.session?.viewportProps.scene
    );
    expect(screen.getByText('Reused scene tree')).toBeTruthy();
    expect(screen.getByText('Reused selection visuals')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Repeat existing piece' })
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    click('Move');
    click('Rotate');
    click('Select');
    expect(observed.session?.setPropTool).toHaveBeenNthCalledWith(1, 'move');
    expect(observed.session?.setPropTool).toHaveBeenNthCalledWith(2, 'rotate');
    expect(observed.session?.setPropTool).toHaveBeenNthCalledWith(3, 'select');
    expect(screen.queryByRole('button', { name: 'Paint' })).toBeNull();
    observed.session = {
      ...observed.session!,
      viewportProps: {
        ...observed.session!.viewportProps,
        roomAuthoring: {
          ...observed.session!.viewportProps.roomAuthoring!,
          tool: 'repeat',
          repeat: {
            assetRef: 'existing-piece',
            step: 1,
            originOffset: 0,
            maxCount: 5,
          },
          onRepeatGesture: vi.fn(),
        },
      },
    };
    rerender(<EncounterStudioWorkspace compositionSource={source} />);
    expect(screen.getByText(/Repeat active/)).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('false');
    expect(observed.viewportProps?.roomAuthoring).toBe(
      observed.session.viewportProps.roomAuthoring
    );
    expect(observed.viewportProps?.roomAuthoring?.repeat?.assetRef).toBe(
      'existing-piece'
    );
  });

  it('callback rerenders preserve the owner renderer and prop controls', () => {
    const { rerender } = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    click('3D');
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search reused assets' }),
      { target: { value: 'candles' } }
    );
    const input = screen.getByRole('textbox', { name: 'Search reused assets' });
    observed.session = {
      ...observed.session!,
      saveStatus: 'Saved locally now',
    };
    rerender(
      <EncounterStudioWorkspace
        compositionSource={source}
        onBack={() => undefined}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Search reused assets' })).toBe(
      input
    );
    expect((input as HTMLInputElement).value).toBe('candles');
    expect(observed.ownerMounts).toBe(1);
    expect(observed.viewportUnmounts).toBe(0);
  });

  it('shows load refusal autosave pause and in-memory save failure', () => {
    observed.session = {
      ...observed.session!,
      notice: 'Unreadable current draft bytes',
      autosaveBlocked: true,
      saveStatus: 'Autosave paused',
    };
    const { rerender } = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    expect(screen.getByText('LOCAL DRAFT')).toBeTruthy();
    expect(screen.getByText('Unreadable current draft bytes')).toBeTruthy();
    expect(
      screen.getByText(/overwrites the unreadable stored data/)
    ).toBeTruthy();
    click('Replace unreadable local draft');
    expect(observed.session.saveLocalDraft).toHaveBeenCalledTimes(1);
    observed.session = {
      ...observed.session,
      notice: 'Storage quota exceeded',
      saveStatus: 'Room save failed — good in-memory draft kept',
    };
    rerender(<EncounterStudioWorkspace compositionSource={source} />);
    expect(screen.getByRole('status').textContent).toBe(
      'Room save failed — good in-memory draft kept'
    );
    expect(screen.getByText('Storage quota exceeded')).toBeTruthy();
    click('Dismiss notice');
    expect(observed.session.dismissNotice).toHaveBeenCalledTimes(1);
  });

  it('delegates history and explicit local saving to the owner', () => {
    const { rerender } = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    expect(
      (screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    click('Undo');
    expect(observed.session?.undo).toHaveBeenCalledTimes(1);
    observed.session = { ...observed.session!, canRedo: true };
    rerender(<EncounterStudioWorkspace compositionSource={source} />);
    click('Redo');
    click('Save local draft');
    expect(observed.session.redo).toHaveBeenCalledTimes(1);
    expect(observed.session.saveLocalDraft).toHaveBeenCalledTimes(1);
  });

  it('Back warns about unsaved memory and does not silently save or claim persistence', () => {
    const onBack = vi.fn();
    render(
      <EncounterStudioWorkspace compositionSource={source} onBack={onBack} />
    );
    click('Back');
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Only successfully saved local drafts are kept'
    );
    click('Keep editing');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    click('Back');
    click('Leave Encounter Studio');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(observed.session?.cancelTransients).toHaveBeenCalledTimes(1);
    expect(observed.session?.saveLocalDraft).not.toHaveBeenCalled();
  });
});
