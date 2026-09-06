import { create } from '@bufbuild/protobuf';
import {
  AttackRefSchema,
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  ReactChoice,
  ReactionRefSchema,
  Slot,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';

/** The initiative is the SKELETON's — which is the whole point: a reaction
 * window is posed on somebody else's turn, and the dock's own "Watching"
 * panel would otherwise be all the fighter ever saw. */
const mover = create(ParticipantSchema, {
  member: 'skeleton-1',
  name: 'Skeleton Guard',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: true,
});
const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Aldric',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: false,
});

const memberNames = new Map([
  ['fighter-1', 'Aldric'],
  ['skeleton-1', 'Skeleton Guard'],
]);

function windowDeclaration(
  overrides: { available?: boolean } = {}
): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.window.1',
    verb: Verb.REACT,
    slot: Slot.REACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'skeleton-1', available: true }),
    ],
    reaction: create(ReactionRefSchema, {
      ref: 'dnd5e:conditions:opportunity_attack',
      name: 'Opportunity Attack',
    }),
    ...overrides,
  });
}

function attackDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.attack.1',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: false,
    targetKind: TargetKind.MEMBER,
    attack: create(AttackRefSchema, { name: 'Longsword' }),
    why: { text: 'a reaction window is open' },
  });
}

function renderDock(
  declarations: readonly Declaration[],
  options: { authorityFresh?: boolean } = {}
) {
  const onSelect = vi.fn();
  render(
    <ActionDock
      clock={ClockKind.TURN}
      viewerMember="fighter-1"
      participants={[mover, fighter]}
      declarations={declarations}
      authorityFresh={options.authorityFresh ?? true}
      memberNames={memberNames}
      onSelectDeclaration={onSelect}
      onEndTurn={vi.fn()}
    />
  );
  return onSelect;
}

describe('the reaction window panel', () => {
  it('is drawn on the mover’s turn, where the "Watching" panel would otherwise be', () => {
    renderDock([windowDeclaration(), attackDeclaration()]);

    expect(screen.getByTestId('reaction-window').textContent).toContain(
      'Opportunity Attack'
    );
    expect(screen.getByTestId('reaction-window').textContent).toContain(
      'Skeleton Guard is leaving your reach'
    );
    expect(screen.queryByText(/Another participant/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Longsword/ })).toBeNull();
  });

  it('sends the window’s own selector with the chosen answer, and never guesses one', () => {
    const declaration = windowDeclaration();
    const onSelect = renderDock([declaration]);

    fireEvent.click(screen.getByTestId('reaction-strike'));
    expect(onSelect).toHaveBeenCalledWith(declaration, ReactChoice.STRIKE);

    fireEvent.click(screen.getByTestId('reaction-hold'));
    expect(onSelect).toHaveBeenCalledWith(declaration, ReactChoice.HOLD);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('holding carries no cost badge; striking spends the reaction and says so', () => {
    renderDock([windowDeclaration()]);

    expect(
      screen
        .getByTestId('reaction-strike')
        .querySelector('[data-cost="reaction"]')
    ).not.toBeNull();
    expect(
      screen.getByTestId('reaction-hold').querySelector('[data-cost]')
    ).toBeNull();
  });

  it('refuses both answers while the authority is stale', () => {
    renderDock([windowDeclaration()], { authorityFresh: false });

    expect(
      (screen.getByTestId('reaction-strike') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByTestId('reaction-hold') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('draws nothing of its own for a window that is not offered', () => {
    renderDock([windowDeclaration({ available: false }), attackDeclaration()]);
    expect(screen.queryByTestId('reaction-window')).toBeNull();
    expect(screen.getByText(/Skeleton Guard’s turn/)).toBeTruthy();
  });
});
