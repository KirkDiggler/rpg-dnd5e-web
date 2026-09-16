/**
 * The Intimidate row, at the level that decides whether it exists at all
 * (rpg-project#454).
 *
 * WHY THIS IS SEPARATE FROM `intimidateFlow.test.tsx`. That file drives the
 * hook directly and proves the arm, the pick and the send. It cannot see this
 * bug, because the dock filters declarations by verb BEFORE any of that runs:
 * an unlisted verb is dropped there and never becomes a button, so every
 * assertion downstream still passes against a dock that draws nothing. Two
 * separate hand-written verb lists gate it — `ActionDock`'s own
 * `executableDeclarations` and `organizeDeclarations` behind the organized
 * surface — and this file is what says both are wired.
 */
import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import {
  Slot,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';

const fixture = SESSION_COMBAT_FIXTURES[0]!;

/**
 * The row Afford compiles for a threat: the standard action, a member target,
 * the witnesses as candidates, and NO AttackRef or AbilityRef — the seam
 * sends a sealed selector variant because a threat compiles no action
 * definition.
 */
function threat(overrides: Record<string, unknown> = {}): Declaration {
  return {
    verb: Verb.INTIMIDATE,
    slot: Slot.ACTION,
    available: true,
    id: 'v2.intimidate.sealed.1',
    targetKind: TargetKind.MEMBER,
    candidates: [{ member: 'skeleton-1', available: true }],
    ...overrides,
  } as unknown as Declaration;
}

function dockWith(declarations: Declaration[], onSelect = vi.fn()) {
  render(
    <ActionDock
      clock={fixture.clock}
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

describe('the dock draws a threat', () => {
  it('names the row itself — there is no server-authored label to read', () => {
    dockWith([threat()]);
    expect(screen.getByRole('button', { name: /Intimidate/ })).toBeTruthy();
  });

  it('carries the standard-action cost badge', () => {
    dockWith([threat()]);
    const button = screen.getByRole('button', { name: /Intimidate/ });
    expect(button.querySelector('[data-cost="action"]')).not.toBeNull();
  });

  it('hands the whole declaration back on click, selector included', () => {
    const declaration = threat();
    const onSelect = dockWith([declaration]);

    fireEvent.click(screen.getByRole('button', { name: /Intimidate/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe(declaration);
  });

  it('disables a refused threat and shows the server’s own words', () => {
    // The refusal a member meets when nobody can see them: the row is still
    // drawn, because what is offered and why it is refused are both the
    // server's to say, and a client that hid the row would leave the player
    // wondering whether the verb exists.
    dockWith([
      threat({
        available: false,
        candidates: [],
        why: { text: 'nobody can see you to be threatened' },
      }),
    ]);

    const button = screen.getByRole('button', {
      name: /Intimidate/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      'nobody can see you to be threatened'
    );
  });

  it('does not draw as a move — the fallthrough this row used to hit', () => {
    // Both hand-written label functions default to 'Move' for a verb they do
    // not know, so an unlisted Intimidate did not merely go missing in one of
    // them: it drew as a move that was not one.
    dockWith([threat()]);
    // The row must EXIST and be called Intimidate. Asserting only the
    // absence of a Move button would pass against a dock that drew no row at
    // all, which is the other half of this bug.
    expect(screen.getByRole('button', { name: /Intimidate/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
  });
});
