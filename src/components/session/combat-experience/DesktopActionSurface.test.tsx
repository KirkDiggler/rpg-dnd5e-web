import { DESKTOP_HOTBAR_PROFILES } from '@/concepts/desktop-hotbar/fixtures';
import { create } from '@bufbuild/protobuf';
import { DeclarationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopActionSurface } from './DesktopActionSurface';

const profile = DESKTOP_HOTBAR_PROFILES[0]!;
const ready = profile.fixtures[0]!;
const presentation = {
  ...profile.presentation,
  desktopIcons: profile.desktopIcons,
};
const defaults = {
  declarations: ready.declarations,
  authorityFresh: true,
  presentation,
  onSelectDeclaration: vi.fn(),
};
afterEach(cleanup);

describe('DesktopActionSurface', () => {
  it('exposes every spell without opening a collection; artwork cannot create offers', () => {
    render(
      <DesktopActionSurface
        {...defaults}
        presentation={{
          ...presentation,
          desktopIcons: {
            ...profile.desktopIcons,
            imaginary: { src: '/none', fallback: 'XX', tone: 'gold' },
          },
        }}
      />
    );
    for (const name of [
      'Bane',
      'Bless',
      'Command',
      'Cure Wounds',
      'Healing Word',
    ])
      expect(screen.getByRole('button', { name })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Spells/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /End turn/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('XX')).not.toBeInTheDocument();
  });
  it('focus and mouse hover inspect without selecting; Escape dismisses', () => {
    const select = vi.fn();
    render(<DesktopActionSurface {...defaults} onSelectDeclaration={select} />);
    const button = screen.getByRole('button', { name: 'Cure Wounds' });
    fireEvent.focus(button);
    expect(
      screen.getByRole('tooltip', { name: 'Cure Wounds details' })
    ).toHaveTextContent('1st-level Spell Slots');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // jsdom lacks PointerEvent; supply the pointerType on the dispatched event.
    const enter = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
    fireEvent(button, enter);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cure Wounds');
    expect(select).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screen.getByTestId('desktop-action-surface'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('keeps a refused action focusable and shows the reason without dispatch', () => {
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
    const button = screen.getByRole('button', { name: 'Cure Wounds' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Unavailable — action: 1 needed, 0 left'
    );
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Healing Word' }));
    expect(select).toHaveBeenCalledOnce();
  });
  it('blocks stale authority and dispatches only the replacement current row when fresh', () => {
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
  it('removes a withdrawn inspection and uses readable fallback on image failure or missing art', () => {
    const view = render(<DesktopActionSurface {...defaults} />);
    const button = screen.getByRole('button', { name: 'Bane' });
    fireEvent.error(button.querySelector('img')!);
    expect(within(button).getByText('Ba')).toBeVisible();
    fireEvent.focus(button);
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
  it('uses the chosen image alpha for colored glyphs, not a rule-derived tint', () => {
    render(<DesktopActionSurface {...defaults} />);
    const button = screen.getByRole('button', { name: 'Cure Wounds' });
    const source = profile.desktopIcons!['cure-wounds']!.src;
    expect(button).toHaveAttribute('data-tone', 'green');
    expect(button.querySelector('img')!.parentElement).toHaveStyle({
      maskImage: `url("${source}")`,
    });
    fireEvent.error(button.querySelector('img')!);
    expect(within(button).getByText('Cw')).toBeVisible();
  });

  it('shows selected state and routes cancellation without executing another declaration', () => {
    const cancel = vi.fn();
    render(
      <DesktopActionSurface
        {...defaults}
        armedDeclarationId="bane"
        onCancelSelection={cancel}
      />
    );
    expect(screen.getByRole('button', { name: 'Bane' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
