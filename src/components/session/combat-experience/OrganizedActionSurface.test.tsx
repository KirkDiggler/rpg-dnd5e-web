import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  DeclarationSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  SpellRefSchema,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrganizedActionSurface } from './OrganizedActionSurface';
const offer = (id: string, verb: Verb, available = true) =>
  create(DeclarationSchema, {
    id,
    verb,
    slot: Slot.ACTION,
    available,
    targetKind: TargetKind.NONE,
    why: available
      ? undefined
      : create(ShortfallSchema, {
          reason: ShortfallReason.NO_BUDGET,
          text: 'Action spent.',
        }),
  });
function pointer(
  target: Element | Window,
  type: string,
  pointerType = 'touch'
) {
  fireEvent(
    target,
    Object.assign(new Event(type, { bubbles: true }), {
      pointerId: 1,
      pointerType,
      isPrimary: true,
      clientX: 10,
      clientY: 10,
    })
  );
}
function hold(target: Element) {
  pointer(target, 'pointerdown');
  act(() => vi.advanceTimersByTime(450));
  pointer(window, 'pointerup');
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function renderInspectionCase() {
  const onSelect = vi.fn();
  render(
    <OrganizedActionSurface
      declarations={[
        offer('move', Verb.MOVE),
        offer('dash', Verb.ACTIVATE),
        offer('dodge', Verb.ACTIVATE),
      ]}
      authorityFresh
      presentation={{ quickDeclarationIds: ['move'] }}
      onSelectDeclaration={onSelect}
    />
  );
  return onSelect;
}
describe('OrganizedActionSurface', () => {
  it('uses long press and menus exclusively without any per-offer Details buttons', () => {
    vi.useFakeTimers();
    const onSelect = renderInspectionCase();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
    hold(screen.getByRole('button', { name: /^Move\./ }));
    expect(screen.getByRole('region', { name: 'Move details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abilities 2/ }));
    expect(screen.queryByRole('region', { name: 'Move details' })).toBeNull();
    const menu = screen.getByRole('region', { name: 'Abilities collection' });
    hold(within(menu).getAllByRole('button', { name: /^Ability\./ })[0]!);
    expect(
      screen.queryByRole('region', { name: 'Abilities collection' })
    ).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Ability details' })
    ).toBeTruthy();
    // A release click retargeted by the now-closed menu must not choose Move.
    fireEvent.click(screen.getByRole('button', { name: /^Move\./ }), {
      detail: 1,
    });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(
      screen.queryByRole('region', { name: 'Ability details' })
    ).toBeNull();
  });
  it('uses actual mouse input even when the PC reports no fine hover capability', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const onSelect = renderInspectionCase();
    fireEvent.click(screen.getByRole('button', { name: /Abilities 2/ }));
    const menu = screen.getByRole('region', { name: 'Abilities collection' });
    const button = within(menu).getAllByRole('button', {
      name: /^Ability\./,
    })[0]!;
    pointer(button, 'pointerover', 'mouse');
    expect(
      screen.getByRole('tooltip', { name: 'Ability details' })
    ).toBeTruthy();
    expect(menu).toBeInTheDocument();
    pointer(button, 'pointerout', 'mouse');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(menu).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('clears a mouse preview when touch enters a different offer on a hybrid device', () => {
    const onSelect = renderInspectionCase();
    pointer(
      screen.getByRole('button', { name: /^Move\./ }),
      'pointerover',
      'mouse'
    );
    expect(screen.getByRole('tooltip', { name: 'Move details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abilities 2/ }));
    const menu = screen.getByRole('region', { name: 'Abilities collection' });
    const ability = within(menu).getAllByRole('button', {
      name: /^Ability\./,
    })[0]!;
    pointer(
      screen.getByRole('button', { name: /^Move\./ }),
      'pointerover',
      'mouse'
    );
    expect(screen.getByRole('tooltip', { name: 'Move details' })).toBeTruthy();
    pointer(ability, 'pointerover', 'touch');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('measures groups into Cantrips then Features menus, dispatches current offers and closes menus on expansion', () => {
    let available = 900;
    const container = document.createElement('div');
    document.body.append(container);
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      get: () => available,
    });
    const getStyle = window.getComputedStyle.bind(window);
    vi.stubGlobal(
      'getComputedStyle',
      (element: Element, pseudo?: string | null) => {
        const style = getStyle(element, pseudo);
        Object.defineProperties(
          style,
          Object.fromEntries(
            Object.entries({
              paddingLeft: '0px',
              paddingRight: '0px',
              borderLeftWidth: '0px',
              borderRightWidth: '0px',
              columnGap: '5px',
            }).map(([key, value]) => [key, { value, configurable: true }])
          )
        );
        return style;
      }
    );
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const width = this.dataset.quickMenu
          ? 80
          : this.dataset.quickGroup === 'cantrips'
            ? 120
            : this.dataset.quickGroup === 'features'
              ? 160
              : this.textContent === 'Quick'
                ? 30
                : 100;
        return new DOMRect(0, 0, width, 44);
      });
    const onSelect = vi.fn();
    const declarations = [
      offer('move', Verb.MOVE),
      create(DeclarationSchema, {
        ...offer('can-a', Verb.CAST),
        spell: create(SpellRefSchema, {
          ref: 'test:spells:a',
          name: 'Spark A',
        }),
      }),
      create(DeclarationSchema, {
        ...offer('can-b', Verb.CAST),
        spell: create(SpellRefSchema, {
          ref: 'test:spells:b',
          name: 'Spark B',
        }),
      }),
      create(DeclarationSchema, {
        ...offer('feature', Verb.ACTIVATE),
        ability: create(AbilityRefSchema, {
          ref: 'test:features:a',
          name: 'Feature A',
        }),
      }),
    ];
    const view = render(
      <OrganizedActionSurface
        declarations={declarations}
        authorityFresh
        presentation={{
          quickDeclarationIds: ['move', 'can-a', 'can-b', 'feature'],
          quickGroupByDeclarationId: {
            'can-a': 'cantrips',
            'can-b': 'cantrips',
            feature: 'features',
          },
        }}
        onSelectDeclaration={onSelect}
      />,
      { container }
    );
    try {
      const quick = within(
        screen.getByRole('group', { name: 'Quick actions' })
      );
      expect(quick.getByRole('button', { name: /^Spark A\./ })).toBeTruthy();
      act(() => {
        available = 549;
        window.dispatchEvent(new Event('resize'));
      });
      fireEvent.click(quick.getByRole('button', { name: 'Cantrips 2' }));
      expect(quick.getByRole('button', { name: /^Feature A\./ })).toBeTruthy();
      expect(quick.queryByRole('button', { name: /^Spark A\./ })).toBeNull();
      fireEvent.click(
        within(
          screen.getByRole('region', { name: 'Cantrips collection' })
        ).getByRole('button', { name: /^Spark A\./ })
      );
      expect(onSelect).toHaveBeenCalledWith(declarations[1]);
      expect(
        screen.queryByRole('region', { name: 'Cantrips collection' })
      ).toBeNull();
      act(() => {
        available = 284;
        window.dispatchEvent(new Event('resize'));
      });
      fireEvent.click(quick.getByRole('button', { name: 'Features 1' }));
      expect(
        screen.getByRole('region', { name: 'Features collection' })
      ).toBeTruthy();
      act(() => {
        available = 900;
        window.dispatchEvent(new Event('resize'));
      });
      expect(quick.queryByRole('button', { name: 'Features 1' })).toBeNull();
      expect(quick.getByRole('button', { name: /^Feature A\./ })).toBeTruthy();
      expect(quick.getByRole('button', { name: /^Spark B\./ })).toBeTruthy();
      expect(
        screen.queryByRole('region', { name: 'Features collection' })
      ).toBeNull();
      act(() => {
        available = 284;
        window.dispatchEvent(new Event('resize'));
      });
      expect(quick.getByRole('button', { name: 'Features 1' })).toBeTruthy();
      expect(
        screen.queryByRole('region', { name: 'Features collection' })
      ).toBeNull();
      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
      container.remove();
      rect.mockRestore();
    }
  });

  it('does not hover or inspect on a normal touch tap', () => {
    vi.useFakeTimers();
    const onSelect = renderInspectionCase();
    const button = screen.getByRole('button', { name: /^Move\./ });
    pointer(button, 'pointerover');
    pointer(button, 'pointerdown');
    act(() => button.focus());
    expect(screen.queryByRole('tooltip')).toBeNull();
    pointer(button, 'pointerup');
    fireEvent.click(button, { detail: 1 });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'move' })
    );
  });
  it('previews during keyboard focus, including a disabled offer, and dismisses on blur', () => {
    render(
      <OrganizedActionSurface
        declarations={[offer('attack', Verb.ATTACK, false)]}
        authorityFresh
        presentation={{ quickDeclarationIds: ['attack'] }}
        onSelectDeclaration={vi.fn()}
      />
    );
    const focusTarget = screen.getByRole('group', { name: /^Attack\./ });
    act(() => focusTarget.focus());
    expect(
      screen.getByRole('tooltip', { name: 'Attack details' })
    ).toHaveTextContent('Unavailable: Action spent.');
    act(() => focusTarget.blur());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('inspects a denied offer by holding without dispatching', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(
      <OrganizedActionSurface
        declarations={[offer('attack', Verb.ATTACK, false)]}
        authorityFresh
        presentation={{ quickDeclarationIds: ['attack'] }}
        onSelectDeclaration={onSelect}
      />
    );
    hold(screen.getByRole('button', { name: /^Attack\./ }));
    expect(
      screen.getByRole('region', { name: 'Attack details' })
    ).toHaveTextContent('Unavailable: Action spent.');
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('closes a collection before dispatching its current offer', () => {
    const onSelect = renderInspectionCase();
    fireEvent.click(screen.getByRole('button', { name: /Abilities 2/ }));
    const menu = screen.getByRole('region', { name: 'Abilities collection' });
    fireEvent.click(
      within(menu).getAllByRole('button', { name: /^Ability\./ })[0]!
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dash' })
    );
    expect(
      screen.queryByRole('region', { name: 'Abilities collection' })
    ).toBeNull();
  });
  it('renders cancel for an armed action', () => {
    const onCancel = vi.fn();
    render(
      <OrganizedActionSurface
        declarations={[offer('move', Verb.MOVE)]}
        authorityFresh
        armedDeclarationId="move"
        presentation={{ quickDeclarationIds: ['move'] }}
        onSelectDeclaration={vi.fn()}
        onCancelSelection={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it('removes a collection when its offers are withdrawn', () => {
    const view = render(
      <OrganizedActionSurface
        declarations={[
          offer('dash', Verb.ACTIVATE),
          offer('dodge', Verb.ACTIVATE),
        ]}
        authorityFresh
        onSelectDeclaration={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Abilities 2/ }));
    view.rerender(
      <OrganizedActionSurface
        declarations={[]}
        authorityFresh
        onSelectDeclaration={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('region', { name: 'Abilities collection' })
    ).toBeNull();
  });
});
