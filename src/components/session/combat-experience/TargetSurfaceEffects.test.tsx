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

// A row Goblin A itself holds. Its id deliberately matches the actor row's,
// so a join by id would show on screen.
const faerie = (overrides: Partial<{ name: string; reason: string }> = {}) =>
  create(EffectRowSchema, {
    id: ROW_ID,
    ref: 'fixture:held',
    name: overrides.name ?? 'Held Effect',
    description: 'Held, authored beside its rule.',
    state: EffectState.APPLIES,
    reason: overrides.reason ?? 'The target is outlined',
    participation: EffectParticipation.CONTRIBUTES_NOW,
    benefit: 'Advantage on the attack roll',
  });
const holding = (
  declaration: Declaration,
  member: string,
  rows: ReturnType<typeof faerie>[]
): Declaration =>
  create(DeclarationSchema, {
    ...declaration,
    candidates: declaration.candidates.map((candidate) =>
      candidate.member === member
        ? create(TargetCandidateSchema, { ...candidate, heldEffects: rows })
        : candidate
    ),
  });
const select = (declaration: Declaration) => ({
  selection: { declaration, candidate: null, whyText: null },
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
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(panel()).toHaveTextContent('+1d6 damage');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(panel()).toHaveTextContent('Depends on the target');
    // The panel's own Close returns to the declaration's rows.
    fireEvent.click(toggle);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
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
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    mouse(row, 'pointerover');
    // Hover previews the rows; only the press pins.
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
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
    ).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(panel()).toHaveAccessibleName('Attack effects');
    expect(panel()).toHaveTextContent('Depends on the target');
    expect(onTargetClick).not.toHaveBeenCalled();
  });

  it('a keyboard press on Effects changes the pinned state a screen reader hears', () => {
    const { onTargetClick } = renderSurface();
    const toggleA = screen.getByRole('button', {
      name: 'Effects against Goblin A',
    });
    act(() => toggleA.focus());
    // Focus previews the rows, but the toggle is not pressed until pressed.
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
    expect(toggleA).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(toggleA, { key: 'Enter' });
    fireEvent.click(toggleA);
    expect(toggleA).toHaveAttribute('aria-pressed', 'true');
    // The pin holds while focus moves on to another candidate.
    act(() =>
      screen.getByRole('button', { name: /Goblin B: Available/ }).focus()
    );
    expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
    expect(toggleA).toHaveAttribute('aria-pressed', 'true');
    act(() => toggleA.focus());
    fireEvent.click(toggleA);
    expect(toggleA).toHaveAttribute('aria-pressed', 'false');
    expect(onTargetClick).not.toHaveBeenCalled();
  });

  it('a touch pointer entering a candidate does not preview it', () => {
    renderSurface();
    const row = screen
      .getByRole('button', { name: /Goblin A: Available/ })
      .closest('li')!;
    fireEvent(
      row,
      Object.assign(new Event('pointerover', { bubbles: true }), {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      })
    );
    expect(panel()).toHaveAccessibleName('Attack effects');
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

  describe('the target’s held rows', () => {
    const heading = () => within(panel()).queryByText('On this target');
    const heldList = () =>
      within(panel()).queryByRole('list', { name: 'On this target' });

    it('candidate hover shows that target’s held rows after the actor’s, under their heading', () => {
      const { onTargetClick } = renderSurface(
        select(holding(attack(), 'g1', [faerie()]))
      );
      // Nothing is inspected yet: no held rows, no heading.
      expect(heading()).toBeNull();
      mouse(
        screen.getByRole('button', { name: /Goblin A: Available/ }),
        'pointerover'
      );
      expect(heading()).toBeVisible();
      const lists = within(panel()).getAllByRole('list');
      expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual([
        'Effects',
        'On this target',
      ]);
      // The heading sits between the actor's rows and the target's.
      expect(
        lists[0]!.compareDocumentPosition(heading()!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        heading()!.compareDocumentPosition(lists[1]!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      const held = within(lists[1]!).getByRole('listitem');
      expect(held).toHaveTextContent('Held Effect');
      expect(held).toHaveTextContent('Applies');
      expect(held).toHaveTextContent('The target is outlined');
      expect(held).toHaveTextContent('Advantage on the attack roll');
      expect(held).toHaveTextContent('Held, authored beside its rule.');
      expect(onTargetClick).not.toHaveBeenCalled();
    });

    it('shows no heading for a candidate holding nothing', () => {
      renderSurface(select(holding(attack(), 'g1', [faerie()])));
      mouse(
        screen.getByRole('button', { name: /Goblin B: Available/ }),
        'pointerover'
      );
      expect(panel()).toHaveAccessibleName('Attack effects against Goblin B');
      expect(heading()).toBeNull();
      expect(heldList()).toBeNull();
      expect(panel()).not.toHaveTextContent('Held Effect');
    });

    it('never merges a held row into the actor row that shares its id', () => {
      renderSurface(select(holding(attack(), 'g1', [faerie()])));
      mouse(
        screen.getByRole('button', { name: /Goblin A: Available/ }),
        'pointerover'
      );
      const [actor, held] = within(panel()).getAllByRole('list');
      // The actor row reads the candidate's answer for it, untouched.
      const actorRow = within(actor!).getByRole('listitem');
      expect(actorRow).toHaveTextContent('Alpha Effect');
      expect(actorRow).toHaveTextContent('+1d6 damage');
      expect(actorRow).not.toHaveTextContent('Held Effect');
      expect(actorRow).not.toHaveTextContent('outlined');
      // The held row is its own row, not overlaid by that answer.
      const heldRow = within(held!).getByRole('listitem');
      expect(heldRow).toHaveTextContent('The target is outlined');
      expect(heldRow).not.toHaveTextContent('+1d6 damage');
    });

    it('a refreshed declaration replaces the held rows wholesale', () => {
      const first = holding(attack(), 'g1', [faerie()]);
      const { props, view } = renderSurface(select(first));
      const toggle = screen.getByRole('button', {
        name: 'Effects against Goblin A',
      });
      fireEvent.click(toggle);
      expect(heldList()).toHaveTextContent('Held Effect');
      // Same declaration id, new answer from the server.
      view.rerender(
        <TargetSurface
          {...props}
          {...select(
            holding(attack(), 'g1', [
              faerie({ name: 'Other Effect', reason: 'Something else' }),
            ])
          )}
        />
      );
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(within(heldList()!).getAllByRole('listitem')).toHaveLength(1);
      expect(heldList()).toHaveTextContent('Other Effect');
      expect(panel()).not.toHaveTextContent('Held Effect');
      // A refresh that holds nothing drops the group, heading and all.
      view.rerender(<TargetSurface {...props} {...select(attack())} />);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(heading()).toBeNull();
      expect(heldList()).toBeNull();
    });

    it('offers the panel for a holding target when the actor has no rows', () => {
      const { onTargetClick, props, view } = renderSurface(
        select(holding(attack(false), 'g1', [faerie()]))
      );
      // Only the target holding something can be inspected.
      expect(
        screen.getByRole('button', { name: 'Effects against Goblin A' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Effects against Goblin B' })
      ).toBeNull();
      expect(panel()).toHaveAccessibleName('Attack effects');
      expect(heading()).toBeNull();
      // Keyboard focus previews it; the actor list is simply absent.
      act(() =>
        screen.getByRole('button', { name: /Goblin A: Available/ }).focus()
      );
      expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
      expect(within(panel()).getAllByRole('list')).toHaveLength(1);
      expect(heldList()).toHaveTextContent('Advantage on the attack roll');
      // A canvas hover on a target holding nothing keeps the last inspected.
      view.rerender(<TargetSurface {...props} hoveredTarget="g2" />);
      expect(panel()).toHaveAccessibleName('Attack effects against Goblin A');
      // Click still acts, unchanged.
      fireEvent.click(
        screen.getByRole('button', { name: /Goblin A: Available/ })
      );
      expect(onTargetClick).toHaveBeenCalledWith('g1');
    });
  });
});
