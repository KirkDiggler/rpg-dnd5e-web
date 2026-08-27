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

function activation(overrides: Partial<Declaration> = {}): Declaration {
  return {
    verb: Verb.ACTIVATE,
    slot: Slot.ACTION,
    available: true,
    id: 'v1.dodge',
    targetKind: TargetKind.NONE,
    candidates: [],
    ability: { ref: 'dnd5e:combat_abilities:dodge', name: 'Dodge' },
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

describe('ActionDock renders what a member can activate', () => {
  // THE LABEL COMES FROM THE SERVER. There is no ref-to-name table in this
  // client, so an ability renamed upstream renames the button with no client
  // change at all.
  it('labels an activation with the name the server authored', () => {
    dockWith([activation()]);
    expect(screen.getByRole('button', { name: /Dodge/ })).toBeTruthy();
  });

  it('renders many rows for one verb, each with its own slot badge', () => {
    dockWith([
      activation({ id: 'v1.dodge' }),
      activation({
        id: 'v1.rage',
        slot: Slot.BONUS,
        ability: { ref: 'dnd5e:features:rage', name: 'Rage' },
      } as Partial<Declaration>),
    ]);

    // One verb, two shapes, live at the same moment — the case that forces
    // multiple declarations per verb rather than making it a preference.
    expect(screen.getByRole('button', { name: /Dodge/ })).toBeTruthy();
    const rage = screen.getByRole('button', { name: /Rage/ });
    expect(rage).toBeTruthy();
    expect(rage.querySelector('[data-cost="bonus-action"]')).not.toBeNull();
  });

  it('disables a refused activation and shows the server’s own words', () => {
    dockWith([
      activation({
        id: 'v1.rage',
        available: false,
        why: { text: 'no rage uses remaining' },
        ability: { ref: 'dnd5e:features:rage', name: 'Rage' },
      } as Partial<Declaration>),
    ]);

    const rage = screen.getByRole('button', { name: /Rage/ });
    expect((rage as HTMLButtonElement).disabled).toBe(true);
    expect(rage.getAttribute('title')).toBe('no rage uses remaining');
  });

  it('hands the whole declaration back on click, selector included', () => {
    const dodge = activation();
    const onSelect = dockWith([dodge]);

    fireEvent.click(screen.getByRole('button', { name: /Dodge/ }));

    expect(onSelect).toHaveBeenCalledWith(dodge);
  });

  // Help asks for an ally, and its declaration does not yet carry a candidate
  // universe (rpg-project#300). Drawing the button would arm targeting against
  // an empty list — a control nothing can drive.
  it('does not draw an activation it cannot yet operate', () => {
    dockWith([
      activation(),
      activation({
        id: 'v1.help',
        targetKind: TargetKind.MEMBER,
        ability: { ref: 'dnd5e:combat_abilities:help', name: 'Help' },
      } as Partial<Declaration>),
    ]);

    expect(screen.getByRole('button', { name: /Dodge/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Help/ })).toBeNull();
  });
});
