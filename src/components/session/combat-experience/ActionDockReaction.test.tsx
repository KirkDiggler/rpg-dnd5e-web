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

describe('a free-roam roll window (rpg-project#924)', () => {
  /** The viewer's own waiting roll: a post-roll window naming nobody. */
  function rollWindow(): Declaration {
    return create(DeclarationSchema, {
      id: 'selector.window.roll',
      verb: Verb.REACT,
      slot: Slot.NONE,
      available: true,
      targetKind: TargetKind.NONE,
      reaction: create(ReactionRefSchema, {
        ref: 'dnd5e:features:bardic_inspiration',
        name: 'Bardic Inspiration',
      }),
    });
  }
  function speakRow(): Declaration {
    return create(DeclarationSchema, {
      id: 'selector.speak.1',
      verb: Verb.SPEAK,
      slot: Slot.NONE,
      available: true,
      targetKind: TargetKind.MEMBER,
    });
  }
  function renderWorldDock(declarations: readonly Declaration[]) {
    const onSelect = vi.fn();
    render(
      <ActionDock
        clock={ClockKind.WORLD}
        viewerMember="fighter-1"
        participants={[]}
        declarations={declarations}
        authorityFresh
        memberNames={memberNames}
        onSelectDeclaration={onSelect}
        onEndTurn={vi.fn()}
      />
    );
    return onSelect;
  }

  it('is drawn BESIDE the live world actions, not in place of them', () => {
    const speak = speakRow();
    const window = rollWindow();
    const onSelect = renderWorldDock([speak, window]);

    expect(screen.getByTestId('reaction-window')).toBeTruthy();
    const actions = screen.getByTestId('world-clock-actions');
    const speakButton = actions.querySelector('button');
    expect(speakButton).not.toBeNull();
    expect((speakButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(speakButton!);
    expect(onSelect).toHaveBeenCalledWith(speak);
    fireEvent.click(screen.getByTestId('reaction-hold'));
    expect(onSelect).toHaveBeenCalledWith(window, ReactChoice.HOLD);
  });

  it('does not say the fight waits: nothing is frozen in free roam', () => {
    renderWorldDock([speakRow(), rollWindow()]);

    expect(screen.getByTestId('reaction-window').textContent).toContain(
      'Spend it, or keep it.'
    );
    expect(screen.getByTestId('reaction-window').textContent).not.toContain(
      'The fight waits on you'
    );
  });

  it('the HOLDER’s dock stays as the server froze it, and the row leaves cleanly when the roll is closed', () => {
    // The holder's other rows arrive refused (window_open); the client draws
    // what Afford sent and un-freezes nothing.
    const frozenSpeak = create(DeclarationSchema, {
      id: 'selector.speak.1',
      verb: Verb.SPEAK,
      slot: Slot.NONE,
      available: false,
      targetKind: TargetKind.MEMBER,
      why: { text: 'a roll is waiting on you' },
    });
    const onSelect = vi.fn();
    const props = {
      clock: ClockKind.WORLD,
      viewerMember: 'fighter-1',
      participants: [],
      authorityFresh: true,
      memberNames,
      onSelectDeclaration: onSelect,
      onEndTurn: vi.fn(),
    };
    const { rerender } = render(
      <ActionDock {...props} declarations={[frozenSpeak, rollWindow()]} />
    );
    expect(screen.getByTestId('reaction-window')).toBeTruthy();
    const speakButton = screen
      .getByTestId('world-clock-actions')
      .querySelector('button') as HTMLButtonElement;
    fireEvent.click(speakButton);
    expect(onSelect).not.toHaveBeenCalledWith(frozenSpeak);

    // Walked out of reach: the next Afford poses no window.
    rerender(<ActionDock {...props} declarations={[frozenSpeak]} />);
    expect(screen.queryByTestId('reaction-window')).toBeNull();
    expect(screen.queryByTestId('roll-window-settling')).toBeNull();
  });
});
