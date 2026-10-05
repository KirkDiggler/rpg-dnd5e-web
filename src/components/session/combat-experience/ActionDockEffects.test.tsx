import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  EffectParticipation,
  EffectRowSchema,
  EffectState,
  Slot,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';

const fixture = SESSION_COMBAT_FIXTURES[0]!;

describe('the classic dock tooltip card', () => {
  it('renders the effect rows the declaration carries', () => {
    const onSelect = vi.fn();
    const declaration = create(DeclarationSchema, {
      id: 'v1.attack',
      verb: Verb.ATTACK,
      slot: Slot.ACTION,
      available: true,
      targetKind: TargetKind.MEMBER,
      effects: [
        create(EffectRowSchema, {
          id: 'a',
          ref: 'fixture:a',
          name: 'Alpha Effect',
          description: 'Alpha, authored beside its rule.',
          state: EffectState.DOES_NOT_APPLY,
          reason: 'Needs a melee weapon',
          participation: EffectParticipation.CONTRIBUTES_NOW,
        }),
      ],
    });
    const { container } = render(
      <ActionDock
        clock={fixture.clock}
        viewerMember={fixture.viewerMember}
        participants={fixture.participants}
        declarations={[declaration]}
        authorityFresh
        onSelectDeclaration={onSelect}
        onEndTurn={vi.fn()}
      />
    );
    // The card is aria-hidden (the button's description carries the same
    // facts), so it is found by its rendered rows.
    const row = container.querySelector('[data-effect-tone="does-not-apply"]');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Alpha Effect');
    expect(row).toHaveTextContent('Does not apply');
    expect(row).toHaveTextContent('Needs a melee weapon');
    expect(row).toHaveTextContent('Alpha, authored beside its rule.');
    fireEvent.click(screen.getByRole('button', { name: /Attack/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
