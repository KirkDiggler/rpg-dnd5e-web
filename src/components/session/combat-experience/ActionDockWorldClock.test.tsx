/**
 * The dock on the WORLD clock (rpg-project#457 R3, rpg-project#458).
 *
 * Afford used to return an empty list outside a fight, so this branch of the
 * dock drew a message and nothing else and that was the whole truth. It now
 * returns the social verbs — the front room goblin is standing in the doorway
 * and the entire scenario is talking to it — and a branch that still drew only
 * the message would hide rows the SERVER SENT.
 *
 * WHY THIS IS SEPARATE FROM `persuadeFlow.test.tsx`. That file drives the hook
 * and proves the arm, the click and the send. It cannot see this bug: the dock
 * returns early on the world clock long before any of that runs, so every
 * assertion downstream still passes against a dock that draws nothing.
 */
import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import {
  ClockKind,
  Slot,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';

const fixture = SESSION_COMBAT_FIXTURES[0]!;

/** A social row as Afford sends it on the world clock: free, at Slot.NONE. */
function socialRow(
  verb: Verb,
  overrides: Record<string, unknown> = {}
): Declaration {
  return {
    verb,
    slot: Slot.NONE,
    available: true,
    id: `v2.${verb === Verb.PERSUADE ? 'persuade' : 'intimidate'}.sealed.1`,
    targetKind: TargetKind.MEMBER,
    candidates: [{ member: 'front-goblin', available: true }],
    ...overrides,
  } as unknown as Declaration;
}

function worldDock(declarations: Declaration[], onSelect = vi.fn()) {
  render(
    <ActionDock
      clock={ClockKind.WORLD}
      viewerMember={fixture.viewerMember}
      participants={fixture.participants}
      declarations={declarations}
      authorityFresh
      onSelectDeclaration={onSelect}
      onEndTurn={vi.fn()}
    />
  );
  return onSelect;
}

describe('the dock outside a fight', () => {
  it('draws both social rows the server sent', () => {
    worldDock([socialRow(Verb.INTIMIDATE), socialRow(Verb.PERSUADE)]);

    expect(screen.getByRole('button', { name: /Intimidate/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Persuade/ })).toBeTruthy();
  });

  it('shows NO PRICE on a row the server sent at no cost', () => {
    // A badge here would invent an economy. The world clock has none —
    // Move's own rule, not a discount — and "No turn slot" would imply a
    // budget the player could run out of.
    worldDock([socialRow(Verb.PERSUADE)]);

    const button = screen.getByRole('button', { name: /Persuade/ });
    expect(button.querySelector('[data-cost]')).toBeNull();
  });

  it('still draws a badge on a row that DID arrive priced', () => {
    // The suppression reads what the server sent rather than applying a
    // blanket rule about the clock, so a priced row keeps its badge and the
    // player is never told something is free when it is not.
    worldDock([socialRow(Verb.PERSUADE, { slot: Slot.ACTION })]);

    const button = screen.getByRole('button', { name: /Persuade/ });
    expect(button.querySelector('[data-cost="action"]')).not.toBeNull();
  });

  it('keeps the exploration message beside the rows, not instead of them', () => {
    // Movement on this clock is still the floor click, and the rows do not
    // replace that instruction — the two affordances coexist.
    worldDock([socialRow(Verb.PERSUADE)]);

    expect(screen.getByText('Click the floor to move')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Persuade/ })).toBeTruthy();
  });

  it('hands the whole declaration back on click', () => {
    const declaration = socialRow(Verb.PERSUADE);
    const onSelect = worldDock([declaration]);

    fireEvent.click(screen.getByRole('button', { name: /Persuade/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe(declaration);
  });

  it('draws no Move row — the floor click is movement here', () => {
    // NOT THIS CLIENT WITHHOLDING AN AFFORDANCE. On the world clock the view
    // sends an empty move selector precisely because there is no Move
    // declaration to echo, and the message above the rows already says how to
    // move. A Move row would be a second, competing affordance for it.
    worldDock([
      socialRow(Verb.PERSUADE),
      {
        verb: Verb.MOVE,
        slot: Slot.NONE,
        available: true,
        id: 'move.1',
      } as unknown as Declaration,
    ]);

    expect(screen.getByRole('button', { name: /Persuade/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
  });

  it('draws the message alone when the server sent no rows', () => {
    // The state every dungeon without a social creature in it is in, and the
    // one this branch was written for originally. It must not regress into a
    // stray empty "Actions" label.
    worldDock([]);

    expect(screen.getByText('Click the floor to move')).toBeTruthy();
    expect(screen.queryByText('Actions')).toBeNull();
  });

  it('disables a refused row and keeps drawing it', () => {
    // What is offered and why it is refused are both the server's to say. A
    // client that hid the row would leave the player wondering whether they
    // can talk to the goblin at all.
    worldDock([
      socialRow(Verb.PERSUADE, {
        available: false,
        candidates: [],
        why: { text: 'nobody can see you to be spoken to' },
      }),
    ]);

    const button = screen.getByRole('button', {
      name: /Persuade/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
