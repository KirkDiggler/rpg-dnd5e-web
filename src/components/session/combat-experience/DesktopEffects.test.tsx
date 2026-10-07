import { DESKTOP_HOTBAR_PROFILES } from '@/concepts/desktop-hotbar/fixtures';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesktopEffects } from './DesktopEffects';
const profile = DESKTOP_HOTBAR_PROFILES[1]!;
const attack = profile.fixtures[0]!.declarations.find(
  (offer) => offer.id === profile.presentation.desktopEffectsDeclarationId
)!;

describe('DesktopEffects', () => {
  it('inspects Raging and Sneak Attack as information with a named action context, not commands', () => {
    const view = render(
      <DesktopEffects
        declaration={attack}
        authorityFresh
        icons={profile.presentation.desktopEffectIcons}
      />
    );
    expect(view.container.querySelector('[data-offer-id]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Raging' }));
    expect(
      screen.getByRole('region', { name: 'Raging information' })
    ).toHaveTextContent('For Longsword');
    expect(
      screen.getByRole('region', { name: 'Raging information' })
    ).toHaveTextContent('Applies');
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Sneak Attack' })
    );
    expect(
      screen.getByRole('region', { name: 'Sneak Attack information' })
    ).toHaveTextContent('Depends on the target');
    fireEvent.click(screen.getByRole('button', { name: 'Close information' }));
    expect(
      screen.queryByRole('region', { name: 'Sneak Attack information' })
    ).not.toBeInTheDocument();
  });
  it('reads exact candidate answers, qualifies stale data, and removes withdrawn information', () => {
    const view = render(
      <DesktopEffects
        declaration={attack}
        authorityFresh={false}
        targetMember="skeleton-guard"
      />
    );
    fireEvent.focus(
      screen.getByRole('button', { name: 'Inspect Sneak Attack' })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Another enemy of the target is within 5 feet'
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('+1d6 damage');
    expect(screen.getByRole('tooltip')).toHaveTextContent('may be out of date');
    view.rerender(<DesktopEffects authorityFresh />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByText('No effect information')).toBeInTheDocument();
  });
  it('closes pinned details on an outside click or Escape without adding any action callback', () => {
    render(<DesktopEffects declaration={attack} authorityFresh />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Raging' }));
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole('region', { name: 'Raging information' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Raging' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inspect Raging' }), {
      key: 'Escape',
    });
    expect(
      screen.queryByRole('region', { name: 'Raging information' })
    ).not.toBeInTheDocument();
  });
});
