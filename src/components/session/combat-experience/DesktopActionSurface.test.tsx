import { DESKTOP_HOTBAR_PROFILES } from '@/concepts/desktop-hotbar/fixtures';
import { create } from '@bufbuild/protobuf';
import {
  ActionInformationSchema,
  AttackRefSchema,
  CastOptionSchema,
  DamageType,
  DeclarationSchema,
  EffectParticipation,
  EffectRowSchema,
  EffectState,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopActionSurface } from './DesktopActionSurface';
const profile = DESKTOP_HOTBAR_PROFILES[0]!;
const ready = profile.fixtures[0]!;
const presentation = {
  ...profile.presentation,
  desktopIcons: profile.desktopIcons,
  desktopFavorites: true,
};
const defaults = {
  declarations: ready.declarations,
  authorityFresh: true,
  presentation,
  onSelectDeclaration: vi.fn(),
};
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(): void {
        this.callback(
          [{ contentRect: { width: 236 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      disconnect(): void {}
    }
  )
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DesktopActionSurface', () => {
  it('reads provider base facts above contextual effects before selection and replaces refreshed information', () => {
    const source = ready.declarations.find(
      (offer) => offer.verb === Verb.ATTACK
    )!;
    const offer = create(DeclarationSchema, {
      ...source,
      attack: create(AttackRefSchema, {
        name: 'Warhammer',
        ref: 'dnd5e:weapons:warhammer',
        damageType: DamageType.BLUDGEONING,
      }),
      information: create(ActionInformationSchema, {
        description: 'Provider weapon explanation.',
        details: [
          {
            label: 'Base damage',
            value: '1d8 + STR modifier (+3) · Bludgeoning',
          },
        ],
      }),
      effects: [
        create(EffectRowSchema, {
          id: 'rage',
          name: 'Rage',
          description: 'Provider effect explanation.',
          state: EffectState.APPLIES,
          participation: EffectParticipation.CONTRIBUTES_NOW,
          reason: 'Applies to this attack.',
          benefit: '+2 damage',
        }),
      ],
    });
    const select = vi.fn();
    const view = render(
      <DesktopActionSurface
        {...defaults}
        declarations={[offer]}
        onSelectDeclaration={select}
      />
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Warhammer' }));
    const card = screen.getByRole('tooltip');
    expect(
      within(card).getByText('Provider weapon explanation.')
    ).toBeVisible();
    const base = within(card).getByText(
      '1d8 + STR modifier (+3) · Bludgeoning'
    );
    expect(
      base.compareDocumentPosition(within(card).getByText('Rage')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(card).getByText('+2 damage')).toBeVisible();
    expect(select).not.toHaveBeenCalled();
    const refreshed = create(DeclarationSchema, {
      ...offer,
      information: create(ActionInformationSchema, {
        description: 'Refreshed provider text.',
      }),
      effects: [],
    });
    view.rerender(
      <DesktopActionSurface
        {...defaults}
        declarations={[refreshed]}
        onSelectDeclaration={select}
      />
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Refreshed provider text.'
    );
    expect(within(screen.getByRole('tooltip')).queryByText('Rage')).toBeNull();
    expect(
      within(screen.getByRole('tooltip')).queryByText(
        '1d8 + STR modifier (+3) · Bludgeoning'
      )
    ).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('explains each current choice before submitting only its ID, without inventing missing text', () => {
    const source = ready.declarations.find((offer) => offer.id === 'command')!;
    const offer = create(DeclarationSchema, {
      ...source,
      options: [
        create(CastOptionSchema, {
          id: 'provider-option',
          label: 'Provider choice',
          description: 'Provider-authored choice meaning.',
        }),
        create(CastOptionSchema, {
          id: 'no-description',
          label: 'Unexplained choice',
        }),
      ],
    });
    const select = vi.fn();
    render(
      <DesktopActionSurface
        {...defaults}
        declarations={[offer]}
        optionDeclaration={offer}
        onSelectCastOption={select}
      />
    );
    const choice = screen.getByRole('button', { name: 'Provider choice' });
    expect(choice).toHaveAttribute(
      'aria-description',
      'Provider-authored choice meaning.'
    );
    expect(screen.getByText('Provider-authored choice meaning.')).toBeVisible();
    expect(screen.getByText('Description not provided.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Unexplained choice' })
    ).not.toBeDisabled();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(choice);
    expect(select).toHaveBeenCalledExactlyOnceWith('provider-option');
  });
  it('omits favorite controls and ignores supplied pins unless explicitly opted in', () => {
    const onChange = vi.fn();
    const view = render(
      <DesktopActionSurface
        {...defaults}
        presentation={{
          ...presentation,
          desktopFavorites: undefined,
          desktopCustomization: {
            layout: { rows: 1, favoriteIdsBySection: { spells: ['bane'] } },
            onChange,
          },
        }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Edit bar' })).toBeNull();
    expect(view.container.querySelector('[data-favorite="true"]')).toBeNull();
    expect(screen.queryByText('★')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotbar rows' }), {
      target: { value: '4' },
    });
    expect(onChange).toHaveBeenCalledWith({
      rows: 4,
      favoriteIdsBySection: {},
    });
  });

  it('mounts only supplied categories, with grouped cantrips and no empty placeholders', () => {
    render(<DesktopActionSurface {...defaults} />);
    for (const name of ['Actions', 'Spells'])
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    for (const name of ['Features', 'Items'])
      expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
    for (const name of [
      'Bane',
      'Bless',
      'Command',
      'Cure Wounds',
      'Healing Word',
    ])
      expect(screen.getByRole('button', { name })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Unarmed Strike' })
    ).toBeInTheDocument();
    expect(screen.getByText('Cantrips')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /End turn/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'At hand' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No offers')).not.toBeInTheDocument();
  });
  it('mounts Features when offers arrive and unmounts them when withdrawn', () => {
    const view = render(<DesktopActionSurface {...defaults} />);
    expect(
      screen.queryByRole('region', { name: 'Features' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit bar' }));
    const feature = create(DeclarationSchema, {
      ...ready.declarations.find((offer) => offer.id === 'dash')!,
      id: 'new-feature',
    });
    view.rerender(
      <DesktopActionSurface
        {...defaults}
        declarations={[...ready.declarations, feature]}
        presentation={{
          ...presentation,
          desktopSectionByDeclarationId: {
            ...presentation.desktopSectionByDeclarationId,
            'new-feature': 'features',
          },
        }}
      />
    );
    const features = screen.getByRole('region', { name: 'Features' });
    expect(features.style.flexGrow).toBe('1');
    expect(within(features).queryByText('No offers')).not.toBeInTheDocument();
    expect(
      within(features).getByLabelText('Features favorites 0 of 4')
    ).toBeInTheDocument();
    expect(
      features.querySelector('[data-offer-id="new-feature"]')
    ).not.toBeNull();
    view.rerender(<DesktopActionSurface {...defaults} />);
    expect(features).not.toBeInTheDocument();
  });

  it('mounts Spells when spell offers are gained, keeps it when all are unavailable, and removes it only when absent', () => {
    const withoutSpells = ready.declarations.filter(
      (offer) => offer.verb !== Verb.CAST
    );
    const view = render(
      <DesktopActionSurface {...defaults} declarations={withoutSpells} />
    );
    expect(
      screen.queryByRole('region', { name: 'Spells' })
    ).not.toBeInTheDocument();
    view.rerender(<DesktopActionSurface {...defaults} />);
    const spells = screen.getByRole('region', { name: 'Spells' });
    const unavailable = ready.declarations.map((offer) =>
      offer.verb === Verb.CAST
        ? create(DeclarationSchema, { ...offer, available: false })
        : offer
    );
    view.rerender(
      <DesktopActionSurface {...defaults} declarations={unavailable} />
    );
    expect(screen.getByRole('region', { name: 'Spells' })).toBe(spells);
    expect(screen.getByRole('button', { name: 'Bane' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    view.rerender(
      <DesktopActionSurface {...defaults} declarations={withoutSpells} />
    );
    expect(spells).not.toBeInTheDocument();
  });

  it('focus and mouse hover inspect without selecting; Escape dismisses', () => {
    const select = vi.fn();
    render(<DesktopActionSurface {...defaults} onSelectDeclaration={select} />);
    const button = screen.getByRole('button', { name: 'Cure Wounds' });
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '1st-level Spell Slots'
    );
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    const enter = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
    fireEvent(button, enter);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cure Wounds');
    expect(select).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screen.getByTestId('desktop-action-surface'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('keeps refused actions inspectable and blocks dispatch, while the supplied bonus action works', () => {
    const select = vi.fn();
    render(
      <DesktopActionSurface
        {...defaults}
        declarations={
          profile.fixtures.find((f) => f.id === 'spent-action')!.declarations
        }
        onSelectDeclaration={select}
      />
    );
    const cure = screen.getByRole('button', { name: 'Cure Wounds' });
    fireEvent.focus(cure);
    fireEvent.click(cure);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'action: 1 needed, 0 left'
    );
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Healing Word' }));
    expect(select).toHaveBeenCalledOnce();
  });
  it('blocks stale authority and dispatches only the current replacement row', () => {
    const select = vi.fn();
    const view = render(
      <DesktopActionSurface
        {...defaults}
        authorityFresh={false}
        onSelectDeclaration={select}
      />
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Bane' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Actions may be out of date'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bane' }));
    expect(select).not.toHaveBeenCalled();
    const replacement = create(DeclarationSchema, {
      ...ready.declarations.find((d) => d.id === 'bane')!,
      maxTargets: 1,
    });
    view.rerender(
      <DesktopActionSurface
        {...defaults}
        declarations={[replacement]}
        onSelectDeclaration={select}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bane' }));
    expect(select).toHaveBeenCalledWith(replacement);
    view.rerender(<DesktopActionSurface {...defaults} declarations={[]} />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('removes withdrawn inspection and preserves tinted-image error fallback', () => {
    const view = render(<DesktopActionSurface {...defaults} />);
    const bane = screen.getByRole('button', { name: 'Bane' });
    expect(bane.querySelector('img')?.parentElement).toHaveStyle({
      maskImage: `url("${profile.desktopIcons!.bane!.src}")`,
    });
    fireEvent.error(bane.querySelector('img')!);
    expect(within(bane).getByText('Ba')).toBeVisible();
    fireEvent.focus(bane);
    view.rerender(
      <DesktopActionSurface
        {...defaults}
        declarations={ready.declarations.filter((d) => d.id !== 'bane')}
        presentation={{ desktopIcons: {} }}
      />
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'Cure Wounds' })).getByText(
        'Cu'
      )
    ).toBeVisible();
  });
  it('requires Edit to favorite, permits four, refuses five, and repeats pins on later pages', () => {
    const select = vi.fn();
    const cancel = vi.fn();
    render(
      <DesktopActionSurface
        {...defaults}
        declarations={
          profile.fixtures.find((f) => f.id === 'crowded')!.declarations
        }
        armedDeclarationId="bane"
        onCancelSelection={cancel}
        onSelectDeclaration={select}
      />
    );
    expect(screen.getByRole('button', { name: 'Bane' })).toHaveAttribute(
      'draggable',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit bar' }));
    expect(cancel).toHaveBeenCalledOnce();
    for (const name of ['Bane', 'Bless', 'Command', 'Cure Wounds'])
      fireEvent.click(screen.getByRole('button', { name: `Favorite ${name}` }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Favorite Healing Word' })
    );
    expect(
      screen.getByText(/Four favorites maximum in Spells/)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Spells favorites 4 of 4')
    ).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next Spells page' }));
    const level = screen
      .getByRole('region', { name: 'Spells' })
      .querySelector('[data-band="leveled"]')!;
    expect(
      Array.from(level.querySelectorAll('[data-offer-id]'))
        .slice(0, 4)
        .map((node) => node.getAttribute('data-offer-id'))
    ).toEqual(['bane', 'bless', 'command', 'cure-wounds']);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Done editing' }), {
      key: 'Escape',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bane' }));
    expect(select).not.toHaveBeenCalled(); // Same armed multi-target action preserves picks.
    fireEvent.click(screen.getByRole('button', { name: 'Bless' }));
    expect(select).toHaveBeenCalledOnce();
  });
  it('shares the four-favorite limit across cantrips and leveled spells without mixing the blocks', () => {
    render(<DesktopActionSurface {...defaults} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit bar' }));
    for (const name of ['Resistance', 'Toll the Dead', 'Bane', 'Bless'])
      fireEvent.click(screen.getByRole('button', { name: `Favorite ${name}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Command' }));
    expect(
      screen.getByLabelText('Spells favorites 4 of 4')
    ).toBeInTheDocument();
    const spells = screen.getByRole('region', { name: 'Spells' });
    expect(spells.querySelectorAll('[data-favorite="true"]')).toHaveLength(4);
    expect(
      spells
        .querySelector('[data-band="cantrips"]')
        ?.querySelectorAll('[data-favorite="true"]')
    ).toHaveLength(2);
    expect(
      spells
        .querySelector('[data-band="leveled"]')
        ?.querySelectorAll('[data-favorite="true"]')
    ).toHaveLength(2);
  });

  it('can favorite unavailable offers without selecting them, then unstar', () => {
    const select = vi.fn();
    render(
      <DesktopActionSurface
        {...defaults}
        authorityFresh={false}
        onSelectDeclaration={select}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit bar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Bane' }));
    expect(
      screen.getByRole('button', { name: 'Unfavorite Bane' })
    ).toHaveAttribute('data-favorite', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite Bane' }));
    expect(
      screen.getByRole('button', { name: 'Favorite Bane' })
    ).toHaveAttribute('data-favorite', 'false');
    expect(select).not.toHaveBeenCalled();
  });
  it('refuses unnamed or ambiguous option identities rather than inventing a choice', () => {
    const choose = vi.fn();
    const option = create(DeclarationSchema, {
      ...ready.declarations.find((d) => d.id === 'command')!,
      options: [
        create(CastOptionSchema, { id: 'nameless', label: '' }),
        create(CastOptionSchema, { id: 'duplicate', label: 'First label' }),
        create(CastOptionSchema, { id: 'duplicate', label: 'Second label' }),
      ],
    });
    render(
      <DesktopActionSurface
        {...defaults}
        declarations={[option]}
        optionDeclaration={option}
        onSelectCastOption={choose}
      />
    );
    for (const name of [
      'Choice label unavailable',
      'First label',
      'Second label',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(choose).not.toHaveBeenCalled();
  });

  it('keeps the bar present for exact current option choices, cancel and switching actions', () => {
    const option = ready.declarations.find((d) => d.id === 'command')!;
    const choose = vi.fn();
    const cancel = vi.fn();
    const action = vi.fn();
    const view = render(
      <DesktopActionSurface
        {...defaults}
        optionDeclaration={option}
        onSelectCastOption={choose}
        onCancelCastOption={cancel}
        onSelectDeclaration={action}
      />
    );
    expect(
      screen.getByRole('dialog', { name: 'Command choices' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bane' })).toBeVisible();
    fireEvent.click(screen.getByTestId('cast-option-grovel'));
    expect(choose).toHaveBeenCalledWith('grovel');
    fireEvent.click(screen.getByRole('button', { name: 'Bane' }));
    expect(action).toHaveBeenCalledWith(
      ready.declarations.find((d) => d.id === 'bane')
    );
    fireEvent.keyDown(screen.getByTestId('cast-option-cancel'), {
      key: 'Escape',
    });
    expect(cancel).toHaveBeenCalledOnce();
    view.rerender(
      <DesktopActionSurface
        {...defaults}
        authorityFresh={false}
        optionDeclaration={option}
        onSelectCastOption={choose}
      />
    );
    fireEvent.click(screen.getByTestId('cast-option-flee'));
    expect(choose).toHaveBeenCalledTimes(1);
    view.rerender(
      <DesktopActionSurface
        {...defaults}
        declarations={ready.declarations.filter((d) => d.id !== 'command')}
        optionDeclaration={option}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
