import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  EffectParticipation,
  EffectRowSchema,
  EffectState,
  ShortfallSchema,
  Slot,
  TargetCandidateSchema,
  TargetEffectSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TargetSurface, type TargetSurfaceProps } from './TargetSurface';

const ROW_ID = 'row-a';
const attack = (effects = true): Declaration =>
  create(DeclarationSchema, {
    id: 'v1.attack',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    effects: effects
      ? [
          create(EffectRowSchema, {
            id: ROW_ID,
            ref: 'fixture:a',
            name: 'Alpha Effect',
            description: 'Alpha, authored beside its rule.',
            state: EffectState.DEPENDS,
            reason: 'Depends on the target',
            participation: EffectParticipation.CONTRIBUTES_NOW,
          }),
        ]
      : [],
    candidates: [
      create(TargetCandidateSchema, {
        member: 'g1',
        available: true,
        effects: [
          create(TargetEffectSchema, {
            id: ROW_ID,
            state: EffectState.APPLIES,
            reason: 'Another enemy of the target is within 5 feet',
            benefit: '+1d6 damage',
          }),
        ],
      }),
      create(TargetCandidateSchema, {
        member: 'g2',
        available: true,
        effects: [
          create(TargetEffectSchema, {
            id: ROW_ID,
            state: EffectState.DEPENDS,
            reason: 'Needs advantage or another enemy of the target nearby',
          }),
        ],
      }),
      create(TargetCandidateSchema, {
        member: 'g3',
        available: false,
        why: create(ShortfallSchema, { text: 'Out of reach.' }),
      }),
    ],
  });

function renderSurface(overrides: Partial<TargetSurfaceProps> = {}) {
  const onTargetClick = vi.fn();
  const declaration = overrides.selection?.declaration ?? attack();
  const props: TargetSurfaceProps = {
    phase: 'targeting',
    selection: { declaration, candidate: null, whyText: null },
    isViewerTurn: true,
    showTurnNotice: false,
    memberNames: new Map([
      ['g1', 'Goblin A'],
      ['g2', 'Goblin B'],
      ['g3', 'Goblin C'],
    ]),
    location: { name: 'Room', area: 'Area' },
    renderMap: () => null,
    onTargetClick,
    ...overrides,
  };
  const view = render(<TargetSurface {...props} />);
  return { onTargetClick, props, view };
}

const panel = () => screen.getByRole('region', { name: /effects/ });
const mouse = (target: Element, type: string) =>
  fireEvent(
    target,
    Object.assign(new Event(type, { bubbles: true }), {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    })
  );

describe('TargetSurface effect rows', () => {
  it('shows the declaration rows before any target is inspected', () => {
    renderSurface();
    expect(panel()).toHaveTextContent('Depends on the target');
    expect(panel()).toHaveTextContent('Alpha, authored beside its rule.');
  });

  it('candidate hover shows overlaid rows', () => {
    const { onTargetClick } = renderSurface();
    mouse(
      screen.getByRole('button', { name: /Goblin A: Available/ }),
      'pointerover'
    );
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
    expect(panel()).toHaveTextContent('Applies');
    expect(panel()).toHaveTextContent('+1d6 damage');
    // The declaration keeps the description.
    expect(panel()).toHaveTextContent('Alpha, authored beside its rule.');
    // The inspected target stays shown while the pointer travels to the rows.
    mouse(
      screen.getByRole('button', { name: /Goblin A: Available/ }),
      'pointerout'
    );
    expect(panel()).toHaveTextContent('+1d6 damage');
    mouse(
      screen.getByRole('button', { name: /Goblin B: Available/ }),
      'pointerover'
    );
    expect(panel()).toHaveTextContent('Needs advantage or another enemy');
    expect(onTargetClick).not.toHaveBeenCalled();
  });

  it('keyboard focus on a candidate shows its rows', () => {
    renderSurface();
    act(() =>
      screen.getByRole('button', { name: /Goblin B: Available/ }).focus()
    );
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin B');
  });

  it('effects toggle is read-only and does not call onTargetClick', () => {
    const { onTargetClick } = renderSurface();
    const toggle = screen.getByRole('button', {
      name: 'Effects against Goblin A',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toHaveTextContent('+1d6 damage');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toHaveTextContent('Depends on the target');
    // The panel's own Close returns to the declaration's rows.
    fireEvent.click(toggle);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // An unavailable candidate's rows are readable too.
    const unavailable = screen.getByRole('button', {
      name: 'Effects against Goblin C',
    });
    expect(unavailable).toBeEnabled();
    fireEvent.click(unavailable);
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin C');
    expect(onTargetClick).not.toHaveBeenCalled();
  });

  it('a mouse click on Effects pins the hovered candidate open, and a second click closes it', () => {
    const { onTargetClick } = renderSurface();
    const row = screen
      .getByRole('button', { name: /Goblin A: Available/ })
      .closest('li')!;
    const toggle = screen.getByRole('button', {
      name: 'Effects against Goblin A',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    mouse(row, 'pointerover');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
    expect(panel()).toHaveTextContent('+1d6 damage');
    // Pinned wins over hover until it is closed.
    mouse(
      screen
        .getByRole('button', { name: /Goblin B: Available/ })
        .closest('li')!,
      'pointerover'
    );
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
    expect(
      screen.getByRole('button', { name: 'Effects against Goblin B' })
    ).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toHaveAccessibleName('Attack effects');
    expect(panel()).toHaveTextContent('Depends on the target');
    expect(onTargetClick).not.toHaveBeenCalled();
  });

  it('candidate click calls onTargetClick unchanged', () => {
    const { onTargetClick } = renderSurface();
    const button = screen.getByRole('button', { name: /Goblin A: Available/ });
    mouse(button, 'pointerover');
    fireEvent.click(button);
    expect(onTargetClick).toHaveBeenCalledTimes(1);
    expect(onTargetClick).toHaveBeenCalledWith('g1');
  });

  it('canvas hoveredTarget shows that candidate’s rows', () => {
    const { props, view } = renderSurface();
    view.rerender(<TargetSurface {...props} hoveredTarget="g2" />);
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin B');
    // Leaving the creature for the floor keeps the last inspected target.
    view.rerender(<TargetSurface {...props} hoveredTarget={null} />);
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin B');
    // A hovered member who is not a candidate changes nothing.
    view.rerender(<TargetSurface {...props} hoveredTarget="someone-else" />);
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin B');
    expect(props.onTargetClick).not.toHaveBeenCalled();
  });

  it('adds no toggle and no panel when the declaration carries no rows', () => {
    renderSurface({
      selection: { declaration: attack(false), candidate: null, whyText: null },
    });
    expect(screen.queryByRole('button', { name: /^Effects/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /effects/ })).toBeNull();
    const list = screen.getByRole('list', { name: 'Attack targets' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
  });
});
