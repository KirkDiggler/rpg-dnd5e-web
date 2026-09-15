import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
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
