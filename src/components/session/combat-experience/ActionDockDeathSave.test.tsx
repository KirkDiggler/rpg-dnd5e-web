import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeathSaveRefSchema,
  DeclarationSchema,
  LifeState,
  MemberKind,
  ParticipantSchema,
  Slot,
  Standing,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';

const dying = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Aldric',
  kind: MemberKind.PLAYER,
  standing: Standing.DOWNED,
  active: true,
  lifeState: LifeState.DYING,
});

function declaration(available = true): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.death-save',
    verb: Verb.DEATH_SAVE,
    slot: Slot.NONE,
    available,
    targetKind: TargetKind.NONE,
    candidates: [],
    deathSave: create(DeathSaveRefSchema, { name: 'Death Save' }),
    why: available ? undefined : { text: 'death save capacity is spent' },
  });
}

function renderDock(
  declarations: readonly Declaration[],
  options: {
    authorityFresh?: boolean;
    onSelect?: (declaration: Declaration) => void;
  } = {}
) {
  const onSelect = options.onSelect ?? vi.fn();
  render(
    <ActionDock
      clock={ClockKind.TURN}
      viewerMember="fighter-1"
      participants={[dying]}
      declarations={declarations}
      authorityFresh={options.authorityFresh ?? true}
      onSelectDeclaration={onSelect}
      onEndTurn={vi.fn()}
    />
  );
  return onSelect;
}

describe('ActionDock Death Save declaration', () => {
  it('uses the provider label, Death Save icon, and SlotNone badge on the generic action button', () => {
    renderDock([declaration()]);

    const button = screen.getByRole('button', { name: /^Death Save/ });
    expect(button.textContent).toContain('✚');
    expect(button.querySelector('[data-cost="no-turn-slot"]')).not.toBeNull();
  });

  it('renders no Death Save when the exact declaration is absent, despite Dying state', () => {
    renderDock([]);
    expect(screen.queryByRole('button', { name: /death save/i })).toBeNull();
  });

  it.each([
    ['stale authority', declaration(), false],
    ['provider refusal', declaration(false), true],
  ])('disables dispatch for %s', (_label, offer, authorityFresh) => {
    const onSelect = renderDock([offer], { authorityFresh });
    const button = screen.getByRole('button', { name: /death save/i });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    [
      'missing DeathSaveRef',
      () => {
        const malformed = declaration();
        malformed.deathSave = undefined;
        return malformed;
      },
    ],
    [
      'nonempty candidates',
      () => {
        const malformed = declaration();
        malformed.candidates = [{ member: 'nobody', available: true }] as never;
        return malformed;
      },
    ],
  ] as const)('never offers or dispatches %s', (_label, makeDeclaration) => {
    const onSelect = renderDock([makeDeclaration()]);
    const malformedButton = screen.queryByRole('button', {
      name: /death save/i,
    });
    if (malformedButton) fireEvent.click(malformedButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('returns the exact no-target declaration through the one generic dock callback', () => {
    const offer = declaration();
    const onSelect = renderDock([offer]);
    fireEvent.click(screen.getByRole('button', { name: /^Death Save/ }));
    expect(onSelect).toHaveBeenCalledWith(offer);
  });
});
