import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrganizedActionSurface } from './OrganizedActionSurface';

const offer = (id: string, verb: Verb, available = true) =>
  create(DeclarationSchema, {
    id,
    verb,
    slot: Slot.ACTION,
    available,
    targetKind: TargetKind.NONE,
    why: available
      ? undefined
      : create(ShortfallSchema, {
          reason: ShortfallReason.NO_BUDGET,
          text: 'Action spent.',
        }),
  });

describe('OrganizedActionSurface', () => {
  it('inspects a collection without dispatching and closes it before selection', () => {
    const onSelect = vi.fn();
    render(
      <OrganizedActionSurface
        declarations={[offer('move', Verb.MOVE), offer('dash', Verb.ACTIVATE)]}
        authorityFresh
        presentation={{ quickDeclarationIds: ['move'] }}
        onSelectDeclaration={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /abilities 1/i }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByRole('region', { name: 'Abilities collection' })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ability/i }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dash' })
    );
    expect(
      screen.queryByRole('region', { name: 'Abilities collection' })
    ).toBeNull();
  });

  it('visibly inspects a denied offer without hover or dispatch', () => {
    const onSelect = vi.fn();
    render(
      <OrganizedActionSurface
        declarations={[offer('attack', Verb.ATTACK, false)]}
        authorityFresh
        presentation={{ quickDeclarationIds: ['attack'] }}
        onSelectDeclaration={onSelect}
      />
    );
    const button = screen.getByRole('button', { name: /attack/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(
      screen.getByRole('region', { name: 'Attack details' })
    ).toHaveTextContent('Unavailable: Action spent.');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders an explicit cancel for an armed action', () => {
    const onCancel = vi.fn();
    render(
      <OrganizedActionSurface
        declarations={[offer('move', Verb.MOVE)]}
        authorityFresh
        armedDeclarationId="move"
        presentation={{ quickDeclarationIds: ['move'] }}
        onSelectDeclaration={vi.fn()}
        onCancelSelection={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not leave an empty tray when the open section is withdrawn', () => {
    const view = render(
      <OrganizedActionSurface
        declarations={[offer('dash', Verb.ACTIVATE)]}
        authorityFresh
        onSelectDeclaration={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /abilities 1/i }));
    expect(
      screen.getByRole('region', { name: 'Abilities collection' })
    ).toBeTruthy();
    view.rerender(
      <OrganizedActionSurface
        declarations={[]}
        authorityFresh
        onSelectDeclaration={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('region', { name: 'Abilities collection' })
    ).toBeNull();
  });
});
