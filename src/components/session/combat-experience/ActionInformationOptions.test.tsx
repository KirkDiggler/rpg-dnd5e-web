import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeclarationSchema,
  ParticipantSchema,
  ReactChoice,
  Slot,
  TargetKind,
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';
import { OrganizedActionSurface } from './OrganizedActionSurface';

const base = {
  clock: ClockKind.TURN,
  viewerMember: 'actor',
  participants: [
    create(ParticipantSchema, { member: 'actor', name: 'Actor', active: true }),
  ],
  authorityFresh: true,
  onEndTurn: vi.fn(),
};
afterEach(cleanup);

describe('provider option information in legacy/mobile and reaction controls', () => {
  it('lets the pointer enter an inspection and keyboard-pin it above an open menu without selecting', () => {
    const offers = ['First spell', 'Second spell'].map((name, index) =>
      create(DeclarationSchema, {
        id: `offer-${index}`,
        verb: Verb.CAST,
        available: true,
        slot: Slot.ACTION,
        targetKind: TargetKind.NONE,
        spell: { ref: `provider:spells:fixture-${index}`, name },
        information: { description: `Provider explanation for ${name}.` },
      })
    );
    const select = vi.fn();
    render(
      <OrganizedActionSurface
        declarations={offers}
        authorityFresh
        presentation={{}}
        onSelectDeclaration={select}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Spells/ }));
    const button = screen.getByRole('button', { name: /^First spell\./ });
    const over = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(over, 'pointerType', { value: 'mouse' });
    fireEvent(button, over);
    const preview = screen.getByRole('tooltip', {
      name: 'First spell details',
    });
    expect(preview).toHaveAttribute('data-above-menu', 'true');
    fireEvent(
      button,
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: preview })
    );
    expect(
      screen.getByRole('tooltip', { name: 'First spell details' })
    ).toBeVisible();
    fireEvent.focus(preview);
    const pinned = screen.getByRole('region', { name: 'First spell details' });
    expect(pinned).toHaveAttribute('data-above-menu', 'true');
    expect(
      screen.getByRole('region', { name: 'Spells collection' })
    ).toBeVisible();
    fireEvent.click(pinned);
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(
      within(pinned).getByRole('button', { name: 'Close details' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^First spell\./ }));
    expect(select).toHaveBeenCalledExactlyOnceWith(offers[0]);
  });
  it('keeps End Turn information read-only and echoes its existing declaration on click', () => {
    const offer = create(DeclarationSchema, {
      id: 'end',
      verb: Verb.END_TURN,
      slot: Slot.NONE,
      available: true,
      targetKind: TargetKind.NONE,
      information: {
        description: 'Provider end-turn explanation.',
        details: [{ label: 'Provider detail', value: 'Verbatim' }],
      },
    });
    const end = vi.fn();
    render(
      <ActionDock
        {...base}
        declarations={[offer]}
        onSelectDeclaration={vi.fn()}
        onEndTurn={end}
      />
    );
    const button = screen.getByRole('button', { name: 'End turn' });
    expect(button.getAttribute('title')).toContain(
      'Provider end-turn explanation.'
    );
    expect(button.getAttribute('aria-description')).toContain('Verbatim');
    fireEvent.focus(button);
    expect(end).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(end).toHaveBeenCalledExactlyOnceWith(offer);
  });

  it('shows cast option meaning before touch/click and preserves the submitted ID', () => {
    const offer = create(DeclarationSchema, {
      id: 'cast',
      verb: Verb.CAST,
      available: true,
      slot: Slot.ACTION,
      spell: { name: 'Provider spell', ref: 'provider:spells:example' },
      options: [
        {
          id: 'mode-a',
          label: 'Mode A',
          description: 'Provider description before selection.',
        },
      ],
    });
    const select = vi.fn();
    render(
      <ActionDock
        {...base}
        declarations={[offer]}
        optionDeclarationId="cast"
        onSelectDeclaration={vi.fn()}
        onSelectCastOption={select}
      />
    );
    const choices = within(screen.getByTestId('cast-options'));
    expect(
      choices.getByText('Provider description before selection.')
    ).toBeVisible();
    expect(choices.getByRole('button', { name: 'Mode A' })).toHaveAttribute(
      'aria-description',
      'Provider description before selection.'
    );
    fireEvent.click(
      choices.getByRole('region', { name: 'Mode A description' })
    );
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(choices.getByRole('button', { name: 'Mode A' }));
    expect(select).toHaveBeenCalledExactlyOnceWith('mode-a');
  });

  it('keeps reaction explanations readable while stale and uses unchanged intent when current', () => {
    const offer = create(DeclarationSchema, {
      id: 'reaction',
      verb: Verb.REACT,
      available: true,
      slot: Slot.REACTION,
      targetKind: TargetKind.NONE,
      reaction: {
        name: 'Provider reaction',
        ref: 'provider:reactions:example',
      },
      information: { description: 'Provider base reaction explanation.' },
      options: [
        {
          id: 'provided-choice',
          label: 'Provided choice',
          description: 'A provider-authored reaction explanation.',
        },
      ],
    });
    const select = vi.fn();
    const view = render(
      <ActionDock
        {...base}
        declarations={[offer]}
        authorityFresh={false}
        onSelectDeclaration={select}
      />
    );
    expect(
      screen.getByText('Provider base reaction explanation.')
    ).toBeVisible();
    expect(
      screen.getByText('A provider-authored reaction explanation.')
    ).toBeVisible();
    const button = screen.getByTestId('reaction-option-provided-choice');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(select).not.toHaveBeenCalled();
    view.rerender(
      <ActionDock
        {...base}
        declarations={[offer]}
        onSelectDeclaration={select}
      />
    );
    fireEvent.click(screen.getByTestId('reaction-option-provided-choice'));
    expect(select).toHaveBeenCalledExactlyOnceWith(
      offer,
      ReactChoice.STRIKE,
      'provided-choice'
    );
  });
});
