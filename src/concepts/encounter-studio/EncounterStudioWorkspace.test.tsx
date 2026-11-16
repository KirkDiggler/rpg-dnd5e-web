import type { CompositionSource } from '@/compositions/compositionSource';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentPlacementNames } from '../world-building/placementNames';
import { projectStudioArrange } from '../world-building/studioArrange';
import type {
  WorldBuildingCanvasOptions,
  WorldBuildingViewportProps,
} from '../world-building/WorldBuildingViewport';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import type {
  EncounterStudioPresentation,
  EncounterStudioSession,
  LayoutViewportProps,
} from './studioSession';
import { studioButton } from './studioTestNavigation';

const observed = vi.hoisted(() => ({
  session: null as EncounterStudioSession | null,
  ownerMounts: 0,
  ownerUnmounts: 0,
  layoutUnmounts: 0,
  viewportUnmounts: 0,
  ownerProps: null as Record<string, unknown> | null,
  layoutProps: null as LayoutViewportProps | null,
  viewportProps: null as
    | (WorldBuildingViewportProps & WorldBuildingCanvasOptions)
    | null,
  events: [] as string[],
}));

vi.mock('../world-building/WorldBuildingConcept', () => ({
  WorldBuildingConcept: (props: {
    studioPresentation: EncounterStudioPresentation;
  }) => {
    const [, refresh] = useState(0);
    const bound = useRef(false);
    observed.ownerProps = props;
    observed.events.push(`render:${props.studioPresentation.view}`);
    useEffect(() => {
      observed.ownerMounts++;
      return () => {
        observed.ownerUnmounts++;
      };
    }, []);
    if (!observed.session) throw new Error('Missing fake owner session');
    observed.session.mapLabelSelection.select = vi.fn((id: string | null) => {
      observed.session!.mapLabelSelection = {
        ...observed.session!.mapLabelSelection,
        selectedId: id,
      };
      const old = observed.session!.arrange;
      observed.session = {
        ...observed.session!,
        arrange: projectStudioArrange({
          draft: observed.session!.document.draft,
          target: id === null ? null : { kind: 'label', id },
          selectionRevision: (old?.selectionRevision ?? 0) + 1,
        }),
      };
      refresh((value) => value + 1);
      return true;
    });
    if (!bound.current) {
      bound.current = true;
      observed.session.cancelTransients = vi.fn(() => {
        observed.events.push('cancel');
        observed.session = {
          ...observed.session!,
          intentEpoch: observed.session!.intentEpoch + 1,
        };
        refresh((value) => value + 1);
      });
    }
    return props.studioPresentation.render(observed.session);
  },
}));

const gate = vi.hoisted(() => ({
  state: 'gate-off' as 'probing' | 'live' | 'gate-off' | 'unreachable',
}));
vi.mock('@/author/useAuthoringGate', () => ({
  useAuthoringGate: () => ({ state: gate.state, retry: vi.fn() }),
}));

/** The refusals the header reads (R34), set by a test; null reads the real
 * publishing hook, which with the gate off holds none. */
const refusals = vi.hoisted(() => ({
  current: null as Array<{ path: string; message: string }> | null,
}));
vi.mock('./studioPublishing', async (importOriginal) => {
  const real = await importOriginal<typeof import('./studioPublishing')>();
  return {
    ...real,
    currentRefusals: (...args: Parameters<typeof real.currentRefusals>) =>
      refusals.current ?? real.currentRefusals(...args),
  };
});

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
  WorldBuildingViewport: (
    props: WorldBuildingViewportProps & WorldBuildingCanvasOptions
  ) => {
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
  return createFakeStudioSession(() => {
    observed.events.push('cancel');
  });
}

beforeEach(() => {
  gate.state = 'gate-off';
  refusals.current = null;
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
  fireEvent.click(studioButton(name));
};

describe('Encounter Studio shell (fake owner, real presentation)', () => {
  it('opens clean Layout with visible Paint Erase Rectangle and no site inspector', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    expect(
      screen.getByRole('heading', { name: 'Encounter Studio' })
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Erase' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeTruthy();
    expect(observed.layoutProps?.tool).toBe('select');
    expect(document.querySelectorAll('.es-header, .es-toolbar')).toHaveLength(
      2
    );
    // Nothing selected: the inspector answers for the room. The Size section
    // is retired: the grid is derived from content (rpg-project#725).
    expect(
      within(screen.getByRole('region', { name: 'Inspector' })).getByRole(
        'heading',
        { name: 'Room' }
      )
    ).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Width (hexes)' })).toBeNull();
    expect(
      screen.queryByRole('form', { name: 'Workspace dimensions' })
    ).toBeNull();
    expect(screen.queryByLabelText('Label name')).toBeNull();
    expect(
      screen.queryByRole('searchbox', { name: 'Search wall appearances' })
    ).toBeNull();
    expect(observed.layoutProps?.wallEditing).toBe(
      observed.session?.wallEditing
    );
    expect(observed.layoutProps?.documentContext).toBe(
      observed.session?.document
    );
    expect(observed.layoutProps?.intentEpoch).toBe(0);
    expect(screen.queryByLabelText('Prop palette')).toBeNull();
    expect(screen.queryByText('Reused scene tree')).toBeNull();
    expect(screen.queryByText(/site inspector|Identity|Policies/i)).toBeNull();
    expect(observed.ownerProps).toEqual(
      expect.objectContaining({ roomMode: true, compositionSource: source })
    );
    // The studio hosts its own publishing (S6); World Builder's panel and
    // its capability prop are not the owner's to render here.
    expect(observed.ownerProps).not.toHaveProperty('roomPublishing');
    expect(observed.ownerProps).not.toHaveProperty('onPlay');
  });

  it('the studio passes onPublishBusyChange to the owner and characterId/onPlay to the surface', () => {
    gate.state = 'live';
    const onBack = vi.fn();
    const onPlay = vi.fn();
    const view = render(
      <EncounterStudioWorkspace
        compositionSource={source}
        onBack={onBack}
        characterId={null}
        onPlay={onPlay}
      />
    );
    expect(observed.ownerProps?.onPublishBusyChange).toEqual(
      expect.any(Function)
    );
    // No character: the surface says so on the one control.
    const play = screen.getByRole('button', { name: 'Play' });
    expect((play as HTMLButtonElement).disabled).toBe(true);
    expect(play.getAttribute('title')).toBe(
      'Pick a character on Home to play.'
    );
    view.rerender(
      <EncounterStudioWorkspace
        compositionSource={source}
        onBack={onBack}
        characterId="hero-1"
        onPlay={onPlay}
      />
    );
    expect(
      (screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    // While the owner reports a publish in flight, leaving is refused.
    act(() =>
      (observed.ownerProps!.onPublishBusyChange as (busy: boolean) => void)(
        true
      )
    );
    click('Back');
    click('Leave Encounter Studio');
    expect(onBack).not.toHaveBeenCalled();
    act(() =>
      (observed.ownerProps!.onPublishBusyChange as (busy: boolean) => void)(
        false
      )
    );
    click('Back');
    click('Leave Encounter Studio');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('Layout and 3D switch without replacing the Concept instance', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('3D');
    expect(screen.queryByLabelText('Layout floor surface')).toBeNull();
    expect(observed.layoutUnmounts).toBe(1);
    const surface = screen.getByLabelText('Controlled 3D surface');
    click('Layout');
    // The 3D viewport stays mounted, hidden and paused (#1271).
    expect(screen.getByLabelText('Controlled 3D surface')).toBe(surface);
    expect(surface.closest('.es-3d')?.hasAttribute('inert')).toBe(true);
    expect(observed.viewportProps).toMatchObject({ active: false });
    expect(observed.viewportUnmounts).toBe(0);
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
    expect(observed.viewportProps).toEqual({
      ...observed.session?.viewportProps,
      // The studio's own presentation: no region, so no 3D region label.
      regionLabels: [],
      active: true,
      studioCanvas: true,
    });
    expect(observed.viewportProps?.scene).toBe(
      observed.session?.viewportProps.scene
    );
    expect(screen.getByText('Reused scene tree')).toBeTruthy();
    expect(screen.queryByText('Reused selection visuals')).toBeNull();
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
    expect(screen.getByText('BROWSER RECOVERY')).toBeTruthy();
    expect(screen.getByText('Unreadable current draft bytes')).toBeTruthy();
    expect(
      screen.getByText(/overwrites the unreadable stored data/)
    ).toBeTruthy();
    click('Site');
    click('Replace unreadable local draft');
    expect(observed.session.saveLocalDraft).toHaveBeenCalledTimes(1);
    click('Close Site');
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
    click('Site');
    click('Save browser recovery');
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

describe('label controls', () => {
  const change = (name: string, value: string): void => {
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  };
  const submit = (name: string): void => {
    fireEvent.submit(screen.getByRole('form', { name }));
  };
  it('arms the typed label and gives keyboard coordinate placement, without floor or a default name', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('Label');
    change('Label name', 'Kitchen');
    expect(observed.session?.createMapLabel).not.toHaveBeenCalled();
    submit('New map label');
    expect(observed.layoutProps?.labelEditing?.placementText).toBe('Kitchen');
    expect(screen.getByText(/Placing “Kitchen”/)).toBeTruthy();
    change('New label world X', '1.25');
    change('New label world Z', '-2');
    submit('Map label coordinates');
    expect(observed.session?.createMapLabel).toHaveBeenCalledExactlyOnceWith(
      'Kitchen',
      { x: 1.25, z: -2 }
    );
    expect(observed.session?.commitFloor).not.toHaveBeenCalled();
    expect(observed.session?.cancelTransients).toHaveBeenCalledTimes(1); // tool transition only
    expect(observed.layoutProps?.labelEditing?.placementText).toBeNull();
  });
  it('arms a new label from an existing selection, then explicitly cancels with Escape or selection', () => {
    observed.session!.document.draft.scene.mapLabels = [
      { id: 'kitchen', text: 'Kitchen', location: { x: 0, z: 0 } },
    ];
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('Label');
    change('Existing label', 'kitchen');
    change('Label name', 'Courtyard');
    submit('New map label');
    expect(observed.layoutProps?.labelEditing?.selectedId).toBeNull();
    expect(observed.layoutProps?.labelEditing?.placementText).toBe('Courtyard');
    expect(screen.getByText(/Placing “Courtyard”/)).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Label name'), { key: 'Escape' });
    expect(observed.layoutProps?.labelEditing?.placementText).toBeNull();
    expect(screen.queryByText(/Placing “Courtyard”/)).toBeNull();
    click('Label');
    submit('New map label');
    expect(observed.layoutProps?.labelEditing?.placementText).toBe('Courtyard');
    change('Existing label', 'kitchen');
    expect(observed.layoutProps?.labelEditing?.placementText).toBeNull();
    expect(observed.layoutProps?.labelEditing?.selectedId).toBe('kitchen');
    expect(observed.session?.createMapLabel).not.toHaveBeenCalled();
    expect(observed.session?.commitFloor).not.toHaveBeenCalled();
  });
  it('selects stable IDs for duplicate names; rename is explicit, Escape/navigation discard, delete and move have accessible controls', () => {
    observed.session!.document.draft.scene.mapLabels = [
      { id: 'kitchen-1', text: 'Kitchen', location: { x: 0, z: 0 } },
      { id: 'kitchen-2', text: 'Kitchen', location: { x: 1, z: 0 } },
    ];
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('Label');
    change('Existing label', 'kitchen-2');
    click('Inspector');
    change('Rename label', 'Courtyard');
    expect(observed.session?.renameMapLabel).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Rename label'), { key: 'Escape' });
    expect(
      (screen.getByLabelText('Rename label') as HTMLInputElement).value
    ).toBe('Kitchen');
    click('Label');
    change('Existing label', 'kitchen-2');
    click('Inspector');
    expect(
      (screen.getByLabelText('Rename label') as HTMLInputElement).value
    ).toBe('Kitchen');
    change('Rename label', 'Courtyard');
    submit('Arrange selected noun');
    expect(observed.session?.commitArrange).toHaveBeenLastCalledWith({
      kind: 'label-edit',
      target: { kind: 'label', id: 'kitchen-2' },
      text: 'Courtyard',
    });
    change('Label world X', '2');
    change('Label world Z', '3');
    submit('Arrange selected noun');
    expect(observed.session?.commitArrange).toHaveBeenLastCalledWith({
      kind: 'label-edit',
      target: { kind: 'label', id: 'kitchen-2' },
      location: { x: 2, z: 3 },
    });
    click('Delete label');
    expect(observed.session?.commitArrange).toHaveBeenLastCalledWith({
      kind: 'label-remove',
      target: { kind: 'label', id: 'kitchen-2' },
    });
    change('Rename label', 'Never commit');
    click('3D');
    click('Layout');
    expect(
      (screen.getByLabelText('Rename label') as HTMLInputElement).value
    ).toBe('Kitchen');
    expect(observed.session?.commitArrange).toHaveBeenCalledTimes(3);
    expect(observed.session?.viewportProps.selectedIds).toEqual([
      'selected-prop',
    ]);
  });
  it('Cancel placement and floor tool switches discard arming; no text-input change becomes a document edit', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('Label');
    change('Label name', 'Kitchen');
    submit('New map label');
    click('Cancel placement');
    expect(observed.layoutProps?.labelEditing?.placementText).toBeNull();
    submit('New map label');
    click('Paint');
    expect(screen.queryByLabelText('Map label controls')).toBeNull();
    expect(observed.layoutProps?.labelEditing?.placementText).toBeNull();
    expect(observed.session?.createMapLabel).not.toHaveBeenCalled();
    expect(observed.session?.renameMapLabel).not.toHaveBeenCalled();
  });
});

describe('shared Arrange context lifecycle', () => {
  it('separates authoring homes from map views, defaults Select and keeps the inactive map mounted', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    const toolbar = screen.getByRole('toolbar', {
      name: 'Studio editing tools',
    });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((node) => node.textContent)
    ).toEqual([
      'Select',
      'Paint',
      'Erase',
      'Rectangle',
      'Wall',
      'Door',
      'Note',
      // The places mode toggle (rpg-project#972).
      'Places',
      'Inspector (N)',
      'Undo',
      'Redo',
      'Paint ground',
      'Erase ground paint',
    ]);
    expect(
      within(toolbar)
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(within(toolbar).queryByRole('button', { name: 'Walls' })).toBeNull();
    click('3D');
    const canvas = screen.getByLabelText('Controlled 3D surface');
    click('Encounter');
    expect(
      screen.getByRole('region', { name: 'Encounter configuration' })
    ).toBeTruthy();
    expect(canvas.isConnected).toBe(true);
    expect(canvas.closest('.es-map-workspace')?.hasAttribute('inert')).toBe(
      true
    );
    expect(
      screen.queryByRole('navigation', { name: 'Studio view' })
    ).toBeNull();
    fireEvent.keyDown(window, { key: 'n' });
    expect(
      screen.queryByRole('complementary', { name: 'Studio options' })
    ).toBeNull();
    click('Build');
    expect(
      screen.getByRole('button', { name: '3D' }).getAttribute('aria-pressed')
    ).toBe('true');
    // The room list and New region live beside Layout, not over 3D.
    expect(screen.queryByRole('button', { name: 'New region' })).toBeNull();
    expect(screen.getByLabelText('Controlled 3D surface')).toBe(canvas);
    expect(observed.viewportUnmounts).toBe(0);
    expect(observed.ownerMounts).toBe(1);
  });
  it('the home nav shows Build and Encounter only', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    expect(
      within(screen.getByRole('navigation', { name: 'Studio home' }))
        .getAllByRole('button')
        .map((node) => node.textContent)
    ).toEqual(['Build', 'Encounter']);
  });
  it('keeps exactly one sidebar section, name drafts and the canvas across section switches and N', () => {
    observed.session!.document.scope.tables = { patrol: {} };
    const mounted = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    const canvas = screen.getByLabelText('Layout floor surface');
    click('Tables');
    fireEvent.click(screen.getByLabelText('Table patrol'));
    const name = screen.getByLabelText('Table id for patrol');
    fireEvent.change(name, { target: { value: 'Night watch' } });
    fireEvent.blur(name);
    expect(screen.queryByRole('button', { name: 'Options (N)' })).toBeNull();
    click('Wall');
    expect(screen.queryByRole('button', { name: 'Add table' })).toBeNull();
    expect(
      screen.getByRole('region', { name: 'New wall palette' })
    ).toBeTruthy();
    click('Tables');
    expect(
      screen.queryByRole('region', { name: 'New wall palette' })
    ).toBeNull();
    expect(
      (screen.getByLabelText('Table id for patrol') as HTMLInputElement).value
    ).toBe('Night watch');
    fireEvent.keyDown(window, { key: 'n' });
    expect(
      screen.queryByRole('complementary', { name: 'Studio options' })
    ).toBeNull();
    fireEvent.keyDown(window, { key: 'n' });
    expect(
      screen
        .getByRole('button', { name: 'Encounter' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    observed.session = { ...observed.session!, arrange: null };
    mounted.rerender(<EncounterStudioWorkspace compositionSource={source} />);
    expect(
      screen
        .getByRole('button', { name: 'Encounter' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByLabelText('Layout floor surface')).toBe(canvas);
    expect(observed.layoutUnmounts).toBe(0);
    expect(observed.session!.commitTables).not.toHaveBeenCalled();
    click('Apply table name');
    expect(observed.session!.commitTables).toHaveBeenCalledWith({
      'Night watch': {},
    });
  });

  it('N ignores text fields, selects, contenteditable, modifiers, repeats and composition', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    click('Wall');
    const search = screen.getByRole('searchbox');
    fireEvent.keyDown(search, { key: 'n' });
    for (const flag of [
      'ctrlKey',
      'metaKey',
      'altKey',
      'shiftKey',
      'repeat',
      'isComposing',
    ]) {
      fireEvent.keyDown(window, { key: 'n', [flag]: true });
    }
    for (const tag of ['textarea', 'select', 'div']) {
      const target = document.createElement(tag);
      if (tag === 'div') target.setAttribute('contenteditable', 'true');
      document.body.append(target);
      fireEvent.keyDown(target, { key: 'n' });
      target.remove();
    }
    expect(
      screen
        .getByRole('button', { name: 'Inspector (N)' })
        .getAttribute('aria-expanded')
    ).toBe('true');
    fireEvent.keyDown(window, { key: 'n' });
    expect(
      screen
        .getByRole('button', { name: 'Inspector (N)' })
        .getAttribute('aria-expanded')
    ).toBe('false');
  });
  function propSelection(session: EncounterStudioSession) {
    session.document.draft.scene.items.push({
      id: 'prop',
      kind: 'prop',
      assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
      label: 'Test prop',
      transform: { x: 1.25, y: 0, z: 2.5, rotationY: 0.123 },
    });
    return projectStudioArrange({
      draft: session.document.draft,
      target: { kind: 'scene', ids: ['prop'] },
      selectionRevision: 1,
    })!;
  }
  it('a preview rerender of the same selection does not reopen a hidden inspector', () => {
    const session = observed.session!;
    const selection = propSelection(session);
    observed.session = { ...session, arrange: selection };
    const mounted = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    click('3D');
    const canvas = screen.getByLabelText('Controlled 3D surface');
    const epoch = observed.session!.intentEpoch;
    const originalSelection = observed.session!.arrange;
    const tool = observed.session!.propTool;
    const toggle = screen.getByRole('button', { name: 'Inspector (N)' });
    expect(toggle.getAttribute('aria-controls')).toBe('studio-sidebar');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByLabelText('World X'), {
      target: { value: '1.75' },
    });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      screen.queryByRole('form', { name: 'Arrange selected noun' })
    ).toBeNull();
    expect(observed.session!.arrange).toBe(originalSelection);
    expect(observed.session!.intentEpoch).toBe(epoch);
    expect(observed.session!.propTool).toBe(tool);
    if (selection.kind !== 'scene')
      throw new Error('Expected scene projection');
    observed.session = {
      ...observed.session!,
      arrange: {
        ...selection,
        preview: {
          position: { x: 2, y: 0.5, z: 3 },
          yaw: selection.yaw,
          height: selection.height,
        },
      },
    };
    mounted.rerender(<EncounterStudioWorkspace compositionSource={source} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByLabelText('Controlled 3D surface')).toBe(canvas);
    expect(observed.viewportUnmounts).toBe(0);
    expect(observed.ownerMounts).toBe(1);
    fireEvent.click(toggle);
    expect((screen.getByLabelText('World X') as HTMLInputElement).value).toBe(
      '1.75'
    );
    expect((screen.getByLabelText('World Y') as HTMLInputElement).value).toBe(
      '0.5'
    );
    expect(observed.session!.commitArrange).not.toHaveBeenCalled();
  });
  it('selecting a different thing reopens a hidden inspector', () => {
    const session = observed.session!;
    observed.session = { ...session, arrange: propSelection(session) };
    const mounted = render(
      <EncounterStudioWorkspace compositionSource={source} />
    );
    const toggle = screen.getByRole('button', { name: 'Inspector (N)' });
    fireEvent.keyDown(window, { key: 'n' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    observed.session!.document.draft.room.walls = structuredClone(
      createPopulatedStudioDocument().draft.room.walls!
    );
    observed.session = {
      ...observed.session!,
      arrange: projectStudioArrange({
        draft: observed.session!.document.draft,
        target: { kind: 'wall', id: 'studio-wall' },
        selectionRevision: 2,
      }),
    };
    mounted.rerender(<EncounterStudioWorkspace compositionSource={source} />);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(screen.getByRole('region', { name: 'Inspector' })).getByRole(
        'heading',
        { name: 'Studio north wall' }
      )
    ).toBeTruthy();
  });
  it('Build has no Arrange, Walls, Doors or Notes buttons and no Size button', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    for (const name of ['Arrange', 'Walls', 'Doors', 'Notes', 'Size'])
      expect(screen.queryByRole('button', { name })).toBeNull();
    click('3D');
    for (const name of ['Arrange', 'Walls', 'Doors', 'Notes', 'Size'])
      expect(screen.queryByRole('button', { name })).toBeNull();
  });
  it('Wall, Door and Note are Layout tools whose options show in the inspector while armed', () => {
    render(<EncounterStudioWorkspace compositionSource={source} />);
    const inspector = (): HTMLElement =>
      screen.getByRole('region', { name: 'Inspector' });
    click('Wall');
    expect(observed.layoutProps?.tool).toBe('wall');
    expect(
      within(inspector()).getByRole('region', { name: 'New wall palette' })
    ).toBeTruthy();
    fireEvent.keyDown(within(inspector()).getByRole('searchbox'), {
      key: 'Escape',
    });
    expect(observed.layoutProps?.tool).toBe('select');
    expect(
      within(inspector()).queryByRole('region', { name: 'New wall palette' })
    ).toBeNull();
    click('Door');
    expect(observed.session?.doorEditing.setActive).toHaveBeenLastCalledWith(
      true
    );
    click('Label');
    expect(observed.layoutProps?.tool).toBe('label');
    expect(within(inspector()).getByLabelText('Label name')).toBeTruthy();
    click('Select');
    expect(within(inspector()).queryByLabelText('Label name')).toBeNull();
    expect(
      within(inspector()).getByRole('heading', { name: 'Room' })
    ).toBeTruthy();
  });

  describe('a refusal is seen from anywhere (R34)', () => {
    const SAYS_AND_DOES =
      'an option is said or done, not both: write `say` or `do`';
    const refused = {
      path: 'room.room.monsterBindings.goblin-1.options[0].do',
      message: SAYS_AND_DOES,
    };
    /** A document that places goblin-1, so its refusal is a jump. */
    const placeGoblin = (): void => {
      observed.session = {
        ...observed.session!,
        document: createPopulatedStudioDocument(),
      };
    };
    const count = (): HTMLElement | null =>
      within(document.querySelector('.es-header') as HTMLElement).queryByRole(
        'button',
        { name: /refusal/ }
      );

    it('with no refusal the header shows no count', () => {
      render(<EncounterStudioWorkspace compositionSource={source} />);
      expect(count()).toBeNull();
      click('Encounter');
      expect(count()).toBeNull();
    });

    it('with one refusal the header names the count on Build and on Encounter, in both views', () => {
      refusals.current = [refused];
      render(<EncounterStudioWorkspace compositionSource={source} />);
      expect(count()?.textContent).toBe('1 refusal');
      click('3D');
      expect(count()?.textContent).toBe('1 refusal');
      click('Encounter');
      expect(count()?.textContent).toBe('1 refusal');
      click('Build');
      click('Layout');
      expect(count()?.textContent).toBe('1 refusal');
    });

    it('two refusals are counted as two', () => {
      refusals.current = [refused, { path: 'line 3', message: 'bad yaml' }];
      render(<EncounterStudioWorkspace compositionSource={source} />);
      expect(count()?.textContent).toBe('2 refusals');
    });

    it("activating the count lists each refusal in the engine's words without opening Save", () => {
      refusals.current = [refused, { path: 'line 3', message: 'bad yaml' }];
      placeGoblin();
      render(<EncounterStudioWorkspace compositionSource={source} />);
      click('Encounter');
      const button = count()!;
      expect(button.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(button);
      expect(button.getAttribute('aria-expanded')).toBe('true');
      const list = within(
        screen.getByRole('group', { name: 'Current refusals' })
      );
      const name = documentPlacementNames(observed.session!.document).get(
        'goblin-1'
      )!;
      expect(
        list.getByRole('button', { name: `${name}: ${SAYS_AND_DOES}` })
      ).toBeTruthy();
      // A refusal with no noun stays a sentence, with its path.
      expect(list.getByText('bad yaml')).toBeTruthy();
      expect(
        list.getAllByRole('button').map((button) => button.textContent)
      ).toEqual([`${name}: ${SAYS_AND_DOES}`, 'Close refusals']);
      expect(
        screen.queryByRole('region', { name: 'Save and Play' })
      ).toBeNull();
    });

    it('Escape or Close closes the list and returns focus to the count', () => {
      refusals.current = [refused];
      render(<EncounterStudioWorkspace compositionSource={source} />);
      fireEvent.click(count()!);
      fireEvent.keyDown(
        screen.getByRole('group', { name: 'Current refusals' }),
        { key: 'Escape' }
      );
      expect(
        screen.queryByRole('group', { name: 'Current refusals' })
      ).toBeNull();
      expect(document.activeElement).toBe(count());
      fireEvent.click(count()!);
      fireEvent.click(screen.getByRole('button', { name: 'Close refusals' }));
      expect(
        screen.queryByRole('group', { name: 'Current refusals' })
      ).toBeNull();
      expect(document.activeElement).toBe(count());
    });

    it('the jump selects the creature and opens its inspector on Build', () => {
      refusals.current = [refused];
      placeGoblin();
      render(<EncounterStudioWorkspace compositionSource={source} />);
      click('Encounter');
      fireEvent.click(count()!);
      const name = documentPlacementNames(observed.session!.document).get(
        'goblin-1'
      )!;
      fireEvent.click(
        screen.getByRole('button', { name: `${name}: ${SAYS_AND_DOES}` })
      );
      expect(observed.session!.creatures.select).toHaveBeenLastCalledWith(
        'goblin-1'
      );
      expect(
        screen
          .getByRole('button', { name: 'Build' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(screen.getByRole('region', { name: 'Inspector' })).toBeTruthy();
      // The list closes on the jump; the count stays while the refusal does.
      expect(
        screen.queryByRole('group', { name: 'Current refusals' })
      ).toBeNull();
      expect(count()?.textContent).toBe('1 refusal');
    });
  });
});

describe('the author sets the inspector width (rpg-project#979)', () => {
  const WIDTH_KEY = 'rpg.concepts.encounter-studio.inspector-width.v1';
  /** A per-test store; the width is the only thing the shell writes. */
  function memory(initial: Record<string, string> = {}) {
    const bytes = new Map(Object.entries(initial));
    return {
      bytes,
      getItem: vi.fn((key: string) => bytes.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        bytes.set(key, value);
      }),
    };
  }
  const handle = (): HTMLElement =>
    screen.getByRole('separator', { name: 'Resize inspector' });
  const now = (): number => Number(handle().getAttribute('aria-valuenow'));
  const cssWidth = (): string =>
    (
      document.querySelector('.encounter-studio') as HTMLElement
    ).style.getPropertyValue('--es-inspector-width');
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
  });

  it('the handle is a vertical separator with its limits: default 384, min 320, max half the workspace', () => {
    render(
      <EncounterStudioWorkspace compositionSource={source} storage={memory()} />
    );
    expect(handle().getAttribute('aria-orientation')).toBe('vertical');
    expect(handle().getAttribute('aria-controls')).toBe('studio-sidebar');
    expect(handle().tabIndex).toBe(0);
    expect(now()).toBe(384);
    expect(handle().getAttribute('aria-valuemin')).toBe('320');
    expect(handle().getAttribute('aria-valuemax')).toBe('640');
    expect(cssWidth()).toBe('384px');
  });

  it('arrows step the width within the limits, Home and End go to them, and the width is kept', () => {
    const storage = memory();
    render(
      <EncounterStudioWorkspace compositionSource={source} storage={storage} />
    );
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(now()).toBe(400);
    expect(cssWidth()).toBe('400px');
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(now()).toBe(368);
    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(now()).toBe(320);
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(now()).toBe(320);
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(now()).toBe(640);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(now()).toBe(640);
    expect(storage.bytes.get(WIDTH_KEY)).toBe('640');
    // Double-click resets to the default.
    fireEvent.doubleClick(handle());
    expect(now()).toBe(384);
    expect(storage.bytes.get(WIDTH_KEY)).toBe('384');
  });

  it('a drag on the inner edge widens toward the map, previews without committing, and commits on release', () => {
    const storage = memory();
    render(
      <EncounterStudioWorkspace compositionSource={source} storage={storage} />
    );
    fireEvent.pointerDown(handle(), { clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(handle(), {
      clientX: 700,
      pointerId: 1,
      buttons: 1,
    });
    // The preview is the CSS variable alone; nothing is kept yet.
    expect(cssWidth()).toBe('484px');
    expect(storage.bytes.has(WIDTH_KEY)).toBe(false);
    fireEvent.pointerUp(handle(), { clientX: 700, pointerId: 1 });
    expect(now()).toBe(484);
    expect(storage.bytes.get(WIDTH_KEY)).toBe('484');
    // Past the limit it stops at the limit.
    fireEvent.pointerDown(handle(), { clientX: 700, pointerId: 2 });
    fireEvent.pointerMove(handle(), {
      clientX: -2000,
      pointerId: 2,
      buttons: 1,
    });
    fireEvent.pointerUp(handle(), { clientX: -2000, pointerId: 2 });
    expect(now()).toBe(640);
  });

  const resizeWindow = (width: number): void =>
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      });
      window.dispatchEvent(new Event('resize'));
    });
  const docking = (): string | null =>
    (document.querySelector('.encounter-studio') as HTMLElement).getAttribute(
      'data-inspector'
    );

  it('a stored 640 is restored, and clamped when the window narrows so the map keeps its floor', () => {
    render(
      <EncounterStudioWorkspace
        compositionSource={source}
        storage={memory({ [WIDTH_KEY]: '640' })}
      />
    );
    expect(now()).toBe(640);
    // Layout's floor: the room list (220) and a 320 px canvas, plus the gutter.
    resizeWindow(1000);
    expect(handle().getAttribute('aria-valuemax')).toBe('436');
    expect(now()).toBe(436);
    expect(cssWidth()).toBe('436px');
  });

  it('at 1280 in 3D the widest inspector leaves the palette, the scene tree and a 320 px canvas', () => {
    render(
      <EncounterStudioWorkspace
        compositionSource={source}
        storage={memory({ [WIDTH_KEY]: '640' })}
      />
    );
    expect(docking()).toBe('docked');
    click('3D');
    // 1280 − 24 gutter − 250 palette − 270 scene tree − 320 canvas = 416.
    expect(handle().getAttribute('aria-valuemax')).toBe('416');
    expect(now()).toBe(416);
    expect(docking()).toBe('docked');
    // Back on Layout the author's own width returns; it was only clamped.
    click('Layout');
    expect(now()).toBe(640);
    click('3D');
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(now()).toBe(416);
  });

  it('where the default inspector and the map floor do not fit side by side, the inspector overlays', () => {
    render(
      <EncounterStudioWorkspace compositionSource={source} storage={memory()} />
    );
    resizeWindow(820);
    expect(docking()).toBe('overlay');
    click('3D');
    expect(docking()).toBe('overlay');
    // 3D docks only from 1248 px (840 floor + 384 + 24).
    resizeWindow(1247);
    expect(docking()).toBe('overlay');
    resizeWindow(1248);
    expect(docking()).toBe('docked');
    // A hidden inspector neither docks nor overlays.
    click('Inspector (N)');
    expect(docking()).toBeNull();
  });

  it('a drag whose release is lost ends without committing, and a hover with no button does not resize', () => {
    const storage = memory();
    render(
      <EncounterStudioWorkspace compositionSource={source} storage={storage} />
    );
    fireEvent.pointerDown(handle(), { clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 700, pointerId: 1, buttons: 1 });
    expect(cssWidth()).toBe('484px');
    fireEvent.lostPointerCapture(handle(), { pointerId: 1 });
    expect(cssWidth()).toBe('384px');
    fireEvent.pointerMove(handle(), { clientX: 600, pointerId: 1, buttons: 0 });
    expect(cssWidth()).toBe('384px');
    // A move with the button already up ends a live drag the same way.
    fireEvent.pointerDown(handle(), { clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 700, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(handle(), { clientX: 650, pointerId: 1, buttons: 0 });
    expect(cssWidth()).toBe('384px');
    fireEvent.pointerMove(handle(), { clientX: 600, pointerId: 1, buttons: 1 });
    expect(cssWidth()).toBe('384px');
    expect(now()).toBe(384);
    expect(storage.bytes.has(WIDTH_KEY)).toBe(false);
  });

  it('a store that throws or holds nonsense leaves the default', () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    const first = render(
      <EncounterStudioWorkspace compositionSource={source} storage={throwing} />
    );
    expect(now()).toBe(384);
    // A write that throws still moves the edge for this visit.
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(now()).toBe(400);
    first.unmount();
    render(
      <EncounterStudioWorkspace
        compositionSource={source}
        storage={memory({ [WIDTH_KEY]: 'wide' })}
      />
    );
    expect(now()).toBe(384);
  });
});
