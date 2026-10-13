/**
 * The Speak row, at the level that decides whether it exists at all
 * (rpg-project#569; the Intimidate row before it, rpg-project#454).
 *
 * WHY THIS IS SEPARATE FROM `speakFlow.test.tsx`. That file drives the
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
  ShortfallReason,
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
 * The row Afford compiles for Speak: the standard action, a member target,
 * the targets with options as candidates, the lines as `speakOptions`, and NO
 * AttackRef or AbilityRef — Speak compiles no action definition.
 */
function speakRow(overrides: Record<string, unknown> = {}): Declaration {
  return {
    verb: Verb.SPEAK,
    slot: Slot.ACTION,
    available: true,
    id: 'v2.speak.sealed.1',
    targetKind: TargetKind.MEMBER,
    candidates: [{ member: 'skeleton-1', available: true }],
    speakOptions: [
      {
        target: { case: 'memberId', value: 'skeleton-1' },
        optionId: 'troupe',
        line: "We're the troupe for the feast.",
        available: true,
      },
    ],
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

describe('the dock draws Speak', () => {
  it('names the row itself — there is no server-authored label to read', () => {
    dockWith([speakRow()]);
    expect(screen.getByRole('button', { name: /Speak/ })).toBeTruthy();
  });

  it('carries the standard-action cost badge', () => {
    dockWith([speakRow()]);
    const button = screen.getByRole('button', { name: /Speak/ });
    expect(button.querySelector('[data-cost="action"]')).not.toBeNull();
  });

  it('hands the whole declaration back on click, selector included', () => {
    const declaration = speakRow();
    const onSelect = dockWith([declaration]);

    fireEvent.click(screen.getByRole('button', { name: /Speak/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe(declaration);
  });

  it('disables Speak on NO_OPTION and shows the server’s own words', () => {
    // NOBODY IN SIGHT OFFERS AN AVAILABLE LINE (SHORTFALL_REASON_NO_OPTION).
    // The dock treats it the way it treats every refused row: drawn, not
    // clickable, with the server's sentence — what is offered and why it is
    // refused are both the server's to say. The row cannot be armed, so no
    // target step and no line can open from it.
    const onSelect = dockWith([
      speakRow({
        available: false,
        candidates: [],
        speakOptions: [],
        why: {
          reason: ShortfallReason.NO_OPTION,
          text: 'nobody here has anything to say to you',
        },
      }),
    ]);

    const button = screen.getByRole('button', {
      name: /Speak/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      'nobody here has anything to say to you'
    );
  });

  it('draws no row for a retired social verb a server might still send', () => {
    // Intimidate and Persuade are options now (rpg-project#569). A row for
    // either is a verb with no RPC behind it here: drawn as nothing, never
    // as a dead button and never as the 'Move' fallthrough.
    dockWith([
      speakRow({ verb: Verb.INTIMIDATE, id: 'old.intimidate' }),
      speakRow({ verb: Verb.PERSUADE, id: 'old.persuade' }),
    ]);
    expect(screen.queryByRole('button', { name: /Intimidate/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Persuade/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Speak/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
  });

  it('does not draw as a move — the fallthrough this row used to hit', () => {
    // Both hand-written label functions default to 'Move' for a verb they do
    // not know, so an unlisted social verb did not merely go missing in one
    // of them: it drew as a move that was not one.
    dockWith([speakRow()]);
    // The row must EXIST and be called Speak. Asserting only the
    // absence of a Move button would pass against a dock that drew no row at
    // all, which is the other half of this bug.
    expect(screen.getByRole('button', { name: /Speak/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
  });
});
