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
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppearanceSelectionModal } from './AppearanceSelectionModal';

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
    accessories?: readonly unknown[];
  }) => (
    <div
      data-testid="class-character-model"
      data-url={url}
      data-accessories={JSON.stringify(accessories)}
    />
  ),
}));

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
    ['elf', 'fighter'],
    ['dwarf', 'wizard'],
    [undefined, 'fighter'],
    ['dwarf', undefined],
  ] as const)(
    'does not offer the picker for unsupported %s + %s',
    (raceRefId, classRefId) => {
      renderModal({ raceRefId, classRefId });
      expect(
        screen.queryByRole('heading', { name: 'Customize Dwarf Hair' })
      ).toBeNull();
      expect(screen.queryByTestId('webgl-preview')).toBeNull();
    }
  );

  it('updates arbitrary color and zero roughness in the one live preview without changing accessory identity', () => {
    renderModal();
    const preview = screen.getByTestId('class-character-model');
    const before = JSON.parse(preview.getAttribute('data-accessories') ?? '[]');

    fireEvent.change(screen.getByLabelText('Hair color'), {
      target: { value: '#123456' },
    });
    fireEvent.change(screen.getByLabelText('Hair roughness'), {
      target: { value: '0' },
    });

    const after = JSON.parse(
      screen
        .getByTestId('class-character-model')
        .getAttribute('data-accessories') ?? '[]'
    );
    expect(screen.getAllByTestId('webgl-preview')).toHaveLength(1);
    expect(
      after.map(({ slot, styleRef, url }: Record<string, string>) => ({
        slot,
        styleRef,
        url,
      }))
    ).toEqual(
      before.map(({ slot, styleRef, url }: Record<string, string>) => ({
        slot,
        styleRef,
        url,
      }))
    );
    expect(after[0].treatment).toEqual({
      baseColorSrgb: '#123456',
      roughness: 0,
      metalness: 0,
    });
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
    fireEvent.click(screen.getByRole('button', { name: 'Facial Hair 18' }));
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
    fireEvent.click(
      screen
        .getByRole('group', { name: 'Facial hair' })
        .querySelectorAll('button')[0]!
    );
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

  it('keeps local edits open and reports an error when persistence fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network down'));
    const onClose = vi.fn();
    renderModal({ onConfirm, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'network down'
    );
    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
