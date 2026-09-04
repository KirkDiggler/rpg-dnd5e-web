import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  AppearanceSchema,
  type Appearance,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceSelectionModal } from './AppearanceSelectionModal';

const classModelWitness = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  accessoryLoads: [] as string[],
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: PropsWithChildren) => (
    <div data-testid="webgl-preview">{children}</div>
  ),
}));

vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }));

vi.mock('@/components/hex-grid/MediumHumanoid', () => ({
  MediumHumanoid: () => null,
}));

vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: ({
    url,
    accessories,
  }: {
    url: string;
    accessories?: readonly {
      slot: string;
      styleRef: string;
      url: string;
      treatment: unknown;
    }[];
  }) => {
    const accessoryIdentity = (accessories ?? [])
      .map(
        (accessory) =>
          `${accessory.slot}|${accessory.styleRef}|${accessory.url}`
      )
      .join(',');
    useEffect(() => {
      classModelWitness.mounts += 1;
      return () => {
        classModelWitness.unmounts += 1;
      };
    }, []);
    useEffect(() => {
      if (accessoryIdentity) {
        classModelWitness.accessoryLoads.push(accessoryIdentity);
      }
    }, [accessoryIdentity]);
    return (
      <div
        data-testid="class-character-model"
        data-url={url}
        data-accessories={JSON.stringify(accessories)}
      />
    );
  },
}));

beforeEach(() => {
  classModelWitness.mounts = 0;
  classModelWitness.unmounts = 0;
  classModelWitness.accessoryLoads.length = 0;
});

function style(styleRef: string) {
  return create(StyleSelectionSchema, {
    selection: { case: 'styleRef', value: styleRef },
  });
}

function none() {
  return create(StyleSelectionSchema, {
    selection: { case: 'none', value: create(EmptySchema) },
  });
}

function persistedAppearance(): Appearance {
  return create(AppearanceSchema, {
    hair: create(HairCustomizationSchema, {
      scalp: style('modular-fantasy-hero:hair:03'),
      facialHair: none(),
      colorSrgb: 0x654321,
      roughness: 0.4,
    }),
  });
}

function renderModal(
  overrides: Partial<React.ComponentProps<typeof AppearanceSelectionModal>> = {}
) {
  const props: React.ComponentProps<typeof AppearanceSelectionModal> = {
    isOpen: true,
    raceRefId: 'dwarf',
    classRefId: 'fighter',
    currentAppearance: undefined,
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AppearanceSelectionModal {...props} />) };
}

describe('AppearanceSelectionModal production Dwarf preview', () => {
  it.each([
    [
      'barbarian',
      '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-barbarian-body.glb',
    ],
    [
      'fighter',
      '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-fighter-body.glb',
    ],
    [
      'monk',
      '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-monk-body.glb',
    ],
    [
      'rogue',
      '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-rogue-body.glb',
    ],
  ] as const)('previews the exact Dwarf %s body', (classRefId, expectedUrl) => {
    renderModal({ classRefId });

    expect(screen.getAllByTestId('webgl-preview')).toHaveLength(1);
    expect(
      screen.getByTestId('class-character-model').getAttribute('data-url')
    ).toBe(expectedUrl);
  });

  it.each([
    ['dragonborn', 'fighter'],
    ['dwarf', 'wizard'],
    [undefined, 'fighter'],
    ['dwarf', undefined],
  ] as const)(
    'does not offer the picker for unsupported %s + %s',
    (raceRefId, classRefId) => {
      renderModal({ raceRefId, classRefId });
      expect(
        screen.queryByRole('heading', { name: 'Customize Dwarf Appearance' })
      ).toBeNull();
      expect(screen.queryByTestId('webgl-preview')).toBeNull();
    }
  );

  it.each([
    ['human', 'Human'],
    ['elf', 'Elf'],
    ['dwarf', 'Dwarf'],
    ['half-elf', 'Half-Elf'],
    ['tiefling', 'Tiefling'],
    ['halfling', 'Halfling'],
    ['gnome', 'Gnome'],
    ['half-orc', 'Half-Orc'],
  ] as const)(
    'offers the exact %s profile picker and active body',
    (raceRefId, label) => {
      renderModal({ raceRefId, classRefId: 'fighter' });

      expect(
        screen.getByRole('heading', { name: `Customize ${label} Appearance` })
      ).not.toBeNull();
      expect(
        screen.getByTestId('class-character-model').getAttribute('data-url')
      ).toBe(
        `/models/synty/characters/customization/${raceRefId}-v1/bodies/${raceRefId}-fighter-body.glb`
      );
    }
  );

  it('updates treatment in place without an accessory load, while a style change produces a load witness', async () => {
    renderModal();
    await waitFor(() =>
      expect(classModelWitness.accessoryLoads).toHaveLength(1)
    );
    expect(classModelWitness.mounts).toBe(1);
    classModelWitness.accessoryLoads.length = 0;

    fireEvent.change(screen.getByLabelText('Hair color'), {
      target: { value: '#123456' },
    });
    fireEvent.change(screen.getByLabelText('Hair roughness'), {
      target: { value: '0' },
    });

    const treated = JSON.parse(
      screen
        .getByTestId('class-character-model')
        .getAttribute('data-accessories') ?? '[]'
    );
    expect(treated[0].treatment).toEqual({
      baseColorSrgb: '#123456',
      roughness: 0,
      metalness: 0,
    });
    expect(classModelWitness.accessoryLoads).toEqual([]);
    expect(classModelWitness.mounts).toBe(1);
    expect(classModelWitness.unmounts).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Hair 05' }));

    await waitFor(() =>
      expect(classModelWitness.accessoryLoads).toEqual([
        expect.stringContaining(
          'scalp|modular-fantasy-hero:hair:05|/models/synty/characters/customization/dwarf-v1/scalp/hair-05.glb'
        ),
      ])
    );
    expect(classModelWitness.mounts).toBe(1);
    expect(classModelWitness.unmounts).toBe(0);
    expect(screen.getAllByTestId('webgl-preview')).toHaveLength(1);
  });
});

function FocusHarness({
  showModal = true,
  onConfirm = vi.fn().mockResolvedValue(undefined),
}: {
  showModal?: boolean;
  onConfirm?: (appearance: Appearance) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open appearance picker
      </button>
      <button type="button">Background action</button>
      {showModal && (
        <AppearanceSelectionModal
          isOpen={open}
          raceRefId="dwarf"
          classRefId="fighter"
          onConfirm={onConfirm}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function openFocusHarness(
  props: React.ComponentProps<typeof FocusHarness> = {}
) {
  const view = render(<FocusHarness {...props} />);
  const trigger = screen.getByRole('button', {
    name: 'Open appearance picker',
  });
  const background = screen.getByRole('button', { name: 'Background action' });
  trigger.focus();
  fireEvent.click(trigger);
  return {
    ...view,
    trigger,
    background,
  };
}

describe('AppearanceSelectionModal focus lifecycle', () => {
  it('moves focus into the dialog and wraps Tab in both directions without reaching the background', async () => {
    const { background } = openFocusHarness();
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    const last = screen.getByRole('button', { name: 'Apply' });

    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(background.closest('[aria-hidden="true"]')).not.toBeNull();

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(document.activeElement).not.toBe(background);

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(document.activeElement).toBe(last));
    expect(document.activeElement).not.toBe(background);
  });

  it('closes on Escape and restores the connected trigger', async () => {
    const { trigger } = openFocusHarness();
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    await waitFor(() => expect(document.activeElement).toBe(first));

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('restores the connected trigger after Cancel', async () => {
    const { trigger } = openFocusHarness();
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('restores the connected trigger after successful Apply', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { trigger } = openFocusHarness({ onConfirm });
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('restores the connected trigger after overlay dismissal', async () => {
    const { trigger } = openFocusHarness();
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    await waitFor(() => expect(document.activeElement).toBe(first));
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();

    fireEvent.pointerDown(overlay!);
    fireEvent.mouseDown(overlay!);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('restores focus when only the open modal unmounts and tolerates the remaining tree unmount', async () => {
    const view = openFocusHarness();
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    await waitFor(() => expect(document.activeElement).toBe(first));

    view.rerender(<FocusHarness showModal={false} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(view.trigger));
    expect(view.trigger.isConnected).toBe(true);
    expect(() => view.unmount()).not.toThrow();
  });

  it('tolerates whole-tree unmount while open when the saved trigger disconnects', async () => {
    const view = openFocusHarness();
    const first = await screen.findByRole('button', {
      name: 'Close appearance picker',
    });
    await waitFor(() => expect(document.activeElement).toBe(first));

    expect(() => view.unmount()).not.toThrow();
    expect(view.trigger.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(first);
  });
});

describe('AppearanceSelectionModal persistence interactions', () => {
  it('applies one whole Appearance with exact none/ref oneofs and present zero treatment values', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ onConfirm, onClose });

    fireEvent.click(
      screen
        .getByRole('group', { name: 'Scalp hair' })
        .querySelectorAll('button')[1]!
    );
    fireEvent.click(screen.getByRole('button', { name: /^Facial Hair/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Facial Hair 18' }));
    fireEvent.click(screen.getByRole('button', { name: /^Hair(?:#|$)/ }));
    fireEvent.change(screen.getByLabelText('Hair color'), {
      target: { value: '#000000' },
    });
    fireEvent.change(screen.getByLabelText('Hair roughness'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const appearance = onConfirm.mock.calls[0]![0] as Appearance;
    expect(appearance.$typeName).toBe('dnd5e.api.v1alpha1.Appearance');
    expect(appearance.hair?.scalp?.selection.case).toBe('none');
    expect(appearance.hair?.facialHair?.selection).toEqual({
      case: 'styleRef',
      value: 'modular-fantasy-hero:facial-hair:18',
    });
    expect(appearance.hair?.colorSrgb).toBe(0);
    expect(appearance.hair?.roughness).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends provider defaults as absent fields after explicit values are reset', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal({
      currentAppearance: persistedAppearance(),
      onConfirm,
    });

    fireEvent.click(
      screen
        .getByRole('group', { name: 'Scalp hair' })
        .querySelectorAll('button')[0]!
    );
    fireEvent.click(screen.getByRole('button', { name: /^Facial Hair/ }));
    fireEvent.click(
      screen
        .getByRole('group', { name: 'Facial hair' })
        .querySelectorAll('button')[0]!
    );
    fireEvent.click(screen.getByRole('button', { name: /^Hair(?:#|$)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use default color' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Use default roughness' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const appearance = onConfirm.mock.calls[0]![0] as Appearance;
    expect(appearance.$typeName).toBe('dnd5e.api.v1alpha1.Appearance');
    expect(appearance.hair).toBeUndefined();
  });

  it('cancels without sending and restores persisted values when reopened', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const currentAppearance = persistedAppearance();
    const props = {
      isOpen: true,
      raceRefId: 'dwarf',
      classRefId: 'fighter',
      currentAppearance,
      onConfirm,
      onClose,
    };
    const { rerender } = render(<AppearanceSelectionModal {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hair 10' }));
    expect(
      screen
        .getByRole('button', { name: 'Hair 10' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<AppearanceSelectionModal {...props} isOpen={false} />);
    rerender(<AppearanceSelectionModal {...props} isOpen />);

    expect(
      screen
        .getByRole('button', { name: 'Hair 03' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Hair 10' })
        .getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('retains edited local state and the prior draft after failure, then retries the exact payload successfully', async () => {
    const priorAppearance = persistedAppearance();
    let persistedDraftAppearance = priorAppearance;
    const persist = vi
      .fn<(appearance: Appearance) => Promise<void>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined);
    const onConfirm = async (appearance: Appearance) => {
      await persist(appearance);
      persistedDraftAppearance = appearance;
    };
    const onClose = vi.fn();
    renderModal({
      currentAppearance: priorAppearance,
      onConfirm,
      onClose,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hair 10' }));
    fireEvent.change(screen.getByLabelText('Hair color'), {
      target: { value: '#123456' },
    });
    fireEvent.change(screen.getByLabelText('Hair roughness'), {
      target: { value: '0.25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'network down'
    );
    expect(
      screen
        .getByRole('button', { name: 'Hair 10' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      (screen.getByLabelText('Hair color') as HTMLInputElement).value
    ).toBe('#123456');
    expect(
      (screen.getByLabelText('Hair roughness') as HTMLInputElement).value
    ).toBe('0.25');
    expect(persistedDraftAppearance).toBe(priorAppearance);
    expect(onClose).not.toHaveBeenCalled();

    const failedPayload = persist.mock.calls[0]![0];
    expect(failedPayload.hair?.scalp?.selection).toEqual({
      case: 'styleRef',
      value: 'modular-fantasy-hero:hair:10',
    });
    expect(failedPayload.hair?.facialHair?.selection.case).toBe('none');
    expect(failedPayload.hair?.colorSrgb).toBe(0x123456);
    expect(failedPayload.hair?.roughness).toBe(0.25);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const successfulPayload = persist.mock.calls[1]![0];
    expect(successfulPayload).toEqual(failedPayload);
    expect(persistedDraftAppearance).toBe(successfulPayload);
  });
});
