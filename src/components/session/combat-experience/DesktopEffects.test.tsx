import { DESKTOP_HOTBAR_PROFILES } from '@/concepts/desktop-hotbar/fixtures';
import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  ShortfallSchema,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesktopEffects } from './DesktopEffects';
const profile = DESKTOP_HOTBAR_PROFILES[1]!;
const attack = profile.fixtures[0]!.declarations.find(
  (offer) => offer.verb === Verb.ATTACK
)!;

describe('DesktopEffects', () => {
  it('shows base attack information without effects and qualifies stale or refused data', () => {
    const plain = create(DeclarationSchema, {
      ...attack,
      effects: [],
      candidates: [],
      available: false,
      why: create(ShortfallSchema, { text: 'Provider refusal' }),
    });
    render(<DesktopEffects declaration={plain} authorityFresh={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Longsword' }));
    const card = screen.getByRole('region', { name: 'Longsword information' });
    expect(card).toHaveTextContent(/slashing/i);
    expect(card).toHaveTextContent('Costs');
    expect(card).toHaveTextContent('Action');
    expect(card).toHaveTextContent('Provider refusal');
    expect(card).toHaveTextContent('may be out of date');
    expect(screen.queryByRole('button', { name: 'Inspect Raging' })).toBeNull();
  });

  it('drops prior action details and effects when switching to a zero-effect action or idle', () => {
    const view = render(<DesktopEffects declaration={attack} authorityFresh />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Longsword' }));
    expect(
      screen.getByRole('region', { name: 'Longsword information' })
    ).toHaveTextContent('Raging');
    const plain = create(DeclarationSchema, {
      ...attack,
      id: 'plain',
      attack: { ...attack.attack!, name: 'Plain attack' },
      effects: [],
      candidates: [],
    });
    view.rerender(<DesktopEffects declaration={plain} authorityFresh />);
    expect(
      screen.queryByRole('region', { name: 'Longsword information' })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Plain attack' })
    );
    expect(
      screen.getByRole('region', { name: 'Plain attack information' })
    ).not.toHaveTextContent('Raging');
    view.rerender(<DesktopEffects authorityFresh />);
    expect(screen.queryByRole('button', { name: /Inspect/ })).toBeNull();
    expect(screen.getByText('Select an action to inspect')).toBeInTheDocument();
  });

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
    expect(screen.getByText('Select an action to inspect')).toBeInTheDocument();
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
