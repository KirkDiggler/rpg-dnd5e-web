import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  DeclarationSchema,
  EffectParticipation,
  EffectState,
  Slot,
  SpellRefSchema,
  TargetCandidateSchema,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapFirstTargeting } from './MapFirstTargeting';
import {
  toggleMemberTarget,
  type MemberTargetingInput,
} from './memberTargeting';
import { TargetSurface } from './TargetSurface';

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  cleanup();
  host.remove();
});
const names = new Map([
  ['a', 'Alpha'],
  ['b', 'Beta'],
  ['c', 'Gamma'],
]);
const offer = (name = 'Authored spell', verb = Verb.CAST) =>
  create(DeclarationSchema, {
    id: 'offer',
    verb,
    available: true,
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 2,
    spell: create(SpellRefSchema, { name }),
    ability: create(AbilityRefSchema, { name }),
    candidates: ['a', 'b', 'c'].map((member) =>
      create(TargetCandidateSchema, { member, available: true })
    ),
  });
function Harness({
  declaration = offer(),
  onChoose = () => {},
  onConfirm = () => {},
  initialSelected = [],
  authorityFresh = true,
}: {
  declaration?: ReturnType<typeof offer>;
  onChoose?: (member: string) => void;
  onConfirm?: () => void;
  initialSelected?: readonly string[];
  authorityFresh?: boolean;
}) {
  const [selected, setSelected] = useState(initialSelected);
  const input: MemberTargetingInput = {
    declaration,
    selectedMembers: selected,
    authorityFresh,
    turnAllowed: true,
  };
  return (
    <TargetSurface
      phase="targeting"
      selection={null}
      isViewerTurn
      showTurnNotice={false}
      memberNames={names}
      location={{ name: 'Room', area: '' }}
      mapFirst={input}
      mapFirstHost={host}
      renderMap={({ attackableTargets, selectedTargets, onTargetClick }) => (
        <div
          data-testid="map"
          data-selected={selectedTargets?.join(',')}
          data-offered={attackableTargets.join(',')}
        >
          {['a', 'b', 'c', 'foreign'].map((member) => (
            <button
              key={member}
              type="button"
              onClick={() => onTargetClick(member)}
            >
              Map {member}
            </button>
          ))}
        </div>
      )}
      onTargetClick={(member) => {
        onChoose(member);
        setSelected(
          (current) =>
            toggleMemberTarget({ ...input, selectedMembers: current }, member)
              .members
        );
      }}
      onConfirmTargets={onConfirm}
      onCancelSelection={() => setSelected([])}
    />
  );
}

const effectsOffer = () =>
  create(DeclarationSchema, {
    id: 'effect-offer',
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 2,
    spell: { name: 'Provider action', ref: 'fixture:spells:action' },
    information: {
      description: 'Provider base explanation.',
      details: [
        { label: 'Base damage', value: '1d8 + STR modifier (+3) · Slashing' },
        { label: 'Grip', value: 'One-handed' },
      ],
    },
    effects: [
      {
        id: 'actor-row',
        name: 'Actor effect',
        description: 'Provider actor description.',
        state: EffectState.DEPENDS,
        participation: EffectParticipation.CONTRIBUTES_NOW,
        reason: 'Choose a target.',
      },
    ],
    candidates: [
      {
        member: 'a',
        available: true,
        effects: [
          {
            id: 'actor-row',
            state: EffectState.APPLIES,
            reason: 'Alpha-specific answer.',
            benefit: '+2 supplied benefit',
          },
        ],
        heldEffects: [
          {
            id: 'held-a',
            name: 'Alpha-held effect',
            description: 'Observed Alpha effect.',
            state: EffectState.APPLIES,
            participation: EffectParticipation.CONTRIBUTES_NOW,
            reason: 'Alpha target-held answer.',
          },
        ],
      },
      {
        member: 'b',
        available: false,
        why: { text: 'Provider target refusal.' },
        effects: [
          {
            id: 'actor-row',
            state: EffectState.DOES_NOT_APPLY,
            reason: 'Beta-specific answer.',
          },
        ],
        heldEffects: [
          {
            id: 'held-b',
            name: 'Beta-held effect',
            description: 'Observed Beta effect.',
            state: EffectState.DEPENDS,
            participation: EffectParticipation.CONTRIBUTES_NOW,
            reason: 'Beta target-held answer.',
          },
        ],
      },
    ],
  });

describe('read-only target-hover effects', () => {
  it('shows each hovered candidate answer and held rows separately without picking, confirming or moving focus', () => {
    const choose = vi.fn(),
      confirm = vi.fn(),
      cancel = vi.fn();
    const selected = Object.freeze(['a']);
    const props = {
      input: {
        declaration: effectsOffer(),
        selectedMembers: selected,
        authorityFresh: true,
        turnAllowed: true,
      },
      host,
      memberNames: names,
      onChoose: choose,
      onConfirm: confirm,
      onCancel: cancel,
    };
    const view = render(<MapFirstTargeting {...props} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const focused = document.activeElement;
    view.rerender(<MapFirstTargeting {...props} hoveredTarget="a" />);
    const alpha = screen.getByRole('tooltip', {
      name: 'Alpha target information',
    });
    expect(alpha).toHaveAttribute('data-preview', 'true');
    const baseDamage = within(alpha).getByText(
      '1d8 + STR modifier (+3) · Slashing'
    );
    expect(baseDamage).toBeVisible();
    expect(
      baseDamage.compareDocumentPosition(
        within(alpha).getByText('Alpha-held effect')
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(alpha).toHaveTextContent('One-handed');
    expect(
      within(alpha).getByRole('list', { name: 'Your action effects' })
    ).toHaveTextContent('Alpha-specific answer.');
    expect(
      within(alpha).getByRole('list', { name: 'On this target' })
    ).toHaveTextContent('Alpha-held effect');
    expect(within(alpha).queryByRole('button')).toBeNull();
    expect(alpha).not.toHaveTextContent('Provider base explanation.');
    expect(document.activeElement).toBe(focused);
    view.rerender(<MapFirstTargeting {...props} hoveredTarget="b" />);
    const beta = screen.getByRole('tooltip', {
      name: 'Beta target information',
    });
    expect(beta).toHaveTextContent('Beta-specific answer.');
    expect(beta).toHaveTextContent('1d8 + STR modifier (+3) · Slashing');
    expect(beta).not.toHaveTextContent('1d8 +5');
    expect(beta).toHaveTextContent('Beta-held effect');
    expect(beta).toHaveTextContent('Provider target refusal.');
    expect(beta).not.toHaveTextContent('Alpha-specific answer.');
    expect(selected).toEqual(['a']);
    expect(choose).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('keeps a peek readable and preserves explicit full inspection until closed', () => {
    const cancel = vi.fn(),
      choose = vi.fn();
    const props = {
      input: {
        declaration: effectsOffer(),
        selectedMembers: [],
        authorityFresh: true,
        turnAllowed: true,
      },
      host,
      memberNames: names,
      onChoose: choose,
      onCancel: cancel,
    };
    const view = render(<MapFirstTargeting {...props} hoveredTarget="a" />);
    view.rerender(<MapFirstTargeting {...props} hoveredTarget={null} />);
    expect(
      screen.getByRole('tooltip', { name: 'Alpha target information' })
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect target' }));
    const full = screen.getByRole('region', {
      name: 'Alpha target information',
    });
    expect(full).toHaveTextContent('Provider base explanation.');
    expect(full).toHaveFocus();
    view.rerender(<MapFirstTargeting {...props} hoveredTarget="b" />);
    expect(
      screen.getByRole('region', { name: 'Alpha target information' })
    ).toBeVisible();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.keyDown(full, { key: 'Escape' });
    expect(
      screen.queryByRole('region', { name: 'Alpha target information' })
    ).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
  });

  it('lets the player focus, scroll and click a hover window without choosing or confirming', () => {
    const choose = vi.fn(),
      confirm = vi.fn(),
      cancel = vi.fn();
    const props = {
      input: {
        declaration: effectsOffer(),
        selectedMembers: [],
        authorityFresh: true,
        turnAllowed: true,
      },
      host,
      memberNames: names,
      onChoose: choose,
      onConfirm: confirm,
      onCancel: cancel,
    };
    const view = render(<MapFirstTargeting {...props} hoveredTarget="a" />);
    view.rerender(<MapFirstTargeting {...props} hoveredTarget={null} />);
    const card = screen.getByRole('tooltip', {
      name: 'Alpha target information',
    });
    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.focus(card);
    fireEvent.wheel(card, { deltaY: 120 });
    fireEvent.click(card);
    expect(card).toBeVisible();
    expect(choose).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close target preview' })
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('ignores foreign hover while retaining the named reader, drops invalid current candidates, and labels missing data', () => {
    const declaration = effectsOffer();
    const props = {
      input: {
        declaration,
        selectedMembers: [],
        authorityFresh: false,
        turnAllowed: true,
      },
      host,
      memberNames: names,
      onChoose: vi.fn(),
    };
    const view = render(
      <MapFirstTargeting {...props} hoveredTarget="foreign" />
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(<MapFirstTargeting {...props} hoveredTarget="a" />);
    const alpha = screen.getByRole('tooltip');
    expect(alpha).toHaveTextContent('may be out of date');
    view.rerender(<MapFirstTargeting {...props} hoveredTarget="foreign" />);
    expect(
      screen.getByRole('tooltip', { name: 'Alpha target information' })
    ).toBeVisible();
    expect(screen.getByRole('tooltip')).toBe(alpha);
    const duplicate = create(DeclarationSchema, {
      ...declaration,
      candidates: [declaration.candidates[0], declaration.candidates[0]],
    });
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{ ...props.input, declaration: duplicate }}
        hoveredTarget="a"
      />
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(<MapFirstTargeting {...props} hoveredTarget="a" />);
    expect(screen.getByRole('tooltip')).toBeVisible();
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{
          ...props.input,
          declaration: create(DeclarationSchema, {
            ...declaration,
            candidates: [],
          }),
        }}
        hoveredTarget="a"
      />
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{ ...props.input, declaration: offer() }}
        hoveredTarget="a"
      />
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No effect information supplied for this target.'
    );
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{
          ...props.input,
          declaration: create(DeclarationSchema, { ...declaration, id: '' }),
        }}
        hoveredTarget="a"
      />
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{
          ...props.input,
          declaration: create(DeclarationSchema, {
            ...declaration,
            targetKind: TargetKind.NONE,
          }),
        }}
        hoveredTarget="a"
      />
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{ ...props.input, declaration: undefined }}
        hoveredTarget={null}
      />
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('refreshes target answers and held descriptions under a sticky peek without a scope reset', () => {
    const choose = vi.fn();
    const props = {
      input: {
        declaration: effectsOffer(),
        selectedMembers: [],
        authorityFresh: true,
        turnAllowed: true,
      },
      host,
      memberNames: names,
      onChoose: choose,
      hoveredTarget: 'a',
    };
    const view = render(<MapFirstTargeting {...props} />);
    const original = screen.getByRole('tooltip', {
      name: 'Alpha target information',
    });
    const refreshed = effectsOffer();
    refreshed.effects[0]!.description = 'Refreshed actor description.';
    // The candidate answer, not the generic declaration reason, owns this target.
    refreshed.candidates[0]!.effects[0]!.reason = 'Refreshed Alpha answer.';
    refreshed.candidates[0]!.heldEffects[0]!.description =
      'Refreshed observed effect.';
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{ ...props.input, declaration: refreshed }}
      />
    );
    const current = screen.getByRole('tooltip', {
      name: 'Alpha target information',
    });
    expect(current).toBe(original);
    expect(current).toHaveAttribute('data-preview', 'true');
    expect(current).toHaveTextContent('Refreshed Alpha answer.');
    expect(current).toHaveTextContent('Refreshed actor description.');
    expect(current).toHaveTextContent('Refreshed observed effect.');
    expect(current).not.toHaveTextContent('Alpha-specific answer.');
    expect(choose).not.toHaveBeenCalled();
  });

  it('re-evaluates the same hovered member under a new action without retaining old rows', () => {
    const choose = vi.fn();
    const props = {
      input: {
        declaration: effectsOffer(),
        selectedMembers: [],
        authorityFresh: true,
        turnAllowed: true,
      },
      host,
      memberNames: names,
      onChoose: choose,
      hoveredTarget: 'a',
    };
    const view = render(<MapFirstTargeting {...props} />);
    const next = effectsOffer();
    next.id = 'next-action';
    next.spell!.name = 'Next provider action';
    next.effects[0]!.name = 'Next action effect';
    next.candidates[0]!.effects[0]!.reason = 'Next action target answer.';
    next.candidates[0]!.heldEffects = [];
    view.rerender(
      <MapFirstTargeting
        {...props}
        input={{ ...props.input, declaration: next }}
      />
    );
    const current = screen.getByRole('tooltip', {
      name: 'Alpha target information',
    });
    expect(current).toHaveTextContent('For Next provider action');
    expect(current).toHaveTextContent('Next action effect');
    expect(current).toHaveTextContent('Next action target answer.');
    expect(current).not.toHaveTextContent('Alpha-specific answer.');
    expect(current).not.toHaveTextContent('Alpha-held effect');
    expect(current).toHaveAttribute('data-preview', 'true');
    expect(choose).not.toHaveBeenCalled();
  });

  it('does not let a sticky target peek cover another dock control inspection', () => {
    const dock = document.createElement('div');
    dock.dataset.desktopDock = 'true';
    const action = document.createElement('button');
    dock.append(action);
    document.body.append(dock);
    try {
      const choose = vi.fn();
      render(
        <MapFirstTargeting
          input={{
            declaration: effectsOffer(),
            selectedMembers: ['a'],
            authorityFresh: true,
            turnAllowed: true,
          }}
          host={host}
          memberNames={names}
          onChoose={choose}
          hoveredTarget="a"
        />
      );
      expect(
        screen.getByRole('tooltip', { name: 'Alpha target information' })
      ).toBeVisible();
      const over = (element: HTMLElement) => {
        const event = new MouseEvent('pointerover', { bubbles: true });
        Object.defineProperty(event, 'pointerType', { value: 'mouse' });
        fireEvent(element, event);
      };
      const chip = screen.getByRole('button', {
        name: 'Inspect selected Alpha',
      });
      const peekId = screen.getByRole('tooltip', {
        name: 'Alpha target information',
      }).id;
      expect(chip).toHaveAttribute('aria-describedby', peekId);
      over(action);
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(chip).not.toHaveAttribute('aria-describedby');
      over(document.body);
      expect(
        screen.getByRole('tooltip', { name: 'Alpha target information' })
      ).toBeVisible();
      expect(chip).toHaveAttribute('aria-describedby', peekId);
      fireEvent.focusIn(action);
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(chip).not.toHaveAttribute('aria-describedby');
      fireEvent.focusIn(screen.getByRole('button', { name: 'Targets (2)' }));
      expect(
        screen.getByRole('tooltip', { name: 'Alpha target information' })
      ).toBeVisible();
      expect(chip).toHaveAttribute('aria-describedby', peekId);
      expect(choose).not.toHaveBeenCalled();
    } finally {
      dock.remove();
    }
  });

  it('inspects selected chips without toggling the selected member', () => {
    const choose = vi.fn();
    const selected = Object.freeze(['a']);
    render(
      <MapFirstTargeting
        input={{
          declaration: effectsOffer(),
          selectedMembers: selected,
          authorityFresh: true,
          turnAllowed: true,
        }}
        host={host}
        memberNames={names}
        onChoose={choose}
      />
    );
    const chip = screen.getByRole('button', { name: 'Inspect selected Alpha' });
    fireEvent.focus(chip);
    const peek = screen.getByRole('tooltip', {
      name: 'Alpha target information',
    });
    expect(peek).toHaveTextContent('Alpha-specific answer.');
    expect(peek.id).not.toBe('');
    expect(chip).toHaveAttribute('aria-describedby', peek.id);
    fireEvent.click(chip);
    expect(chip).not.toHaveAttribute('aria-describedby');
    expect(
      screen.getByRole('region', { name: 'Alpha target information' })
    ).toHaveTextContent('Provider base explanation.');
    expect(selected).toEqual(['a']);
    expect(choose).not.toHaveBeenCalled();
  });

  it('uses mouse/pen row hover and keyboard focus for inspection, but not touch entry', () => {
    const choose = vi.fn();
    render(
      <MapFirstTargeting
        input={{
          declaration: effectsOffer(),
          selectedMembers: [],
          authorityFresh: true,
          turnAllowed: true,
        }}
        host={host}
        memberNames={names}
        onChoose={choose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Targets (2)' }));
    const info = screen.getByRole('button', { name: 'Inspect Beta target' });
    const enter = (pointerType: string) => {
      const event = new MouseEvent('pointerover', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      fireEvent(info, event);
    };
    enter('touch');
    expect(screen.queryByRole('tooltip')).toBeNull();
    enter('mouse');
    expect(
      screen.getByRole('tooltip', { name: 'Beta target information' })
    ).toBeVisible();
    fireEvent.focus(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(
      screen.getByRole('tooltip', { name: 'Alpha target information' })
    ).toBeVisible();
    expect(choose).not.toHaveBeenCalled();
  });
});

describe('map-first member targeting', () => {
  it('does not open a list/effects window automatically and keeps the map mounted', () => {
    render(<Harness />);
    expect(
      screen.getByRole('region', { name: 'Targeting' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Authored spell targets' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Choose a target')).not.toBeInTheDocument();
    const map = screen.getByTestId('map');
    fireEvent.click(screen.getByRole('button', { name: 'Targets (3)' }));
    expect(
      screen.getByRole('region', { name: 'Authored spell targets' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBe(map);
  });
  it.each(['Bane', 'Bless', 'A new provider spell'])(
    'synchronizes map, list and chips for %s, and confirms only explicitly',
    (name) => {
      const confirm = vi.fn();
      const choose = vi.fn();
      render(
        <Harness
          declaration={offer(name)}
          onConfirm={confirm}
          onChoose={choose}
        />
      );
      expect(
        screen.getByRole('button', { name: `Cast ${name}` })
      ).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Map a' }));
      expect(
        screen.getByRole('button', { name: 'Remove Alpha' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'a');
      fireEvent.click(screen.getByRole('button', { name: 'Targets (3)' }));
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'a,b');
      expect(screen.getByRole('checkbox', { name: 'Gamma' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Map c' }));
      expect(choose).toHaveBeenCalledTimes(2);
      expect(confirm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
      expect(screen.getByRole('checkbox', { name: 'Alpha' })).not.toBeChecked();
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'b');
      fireEvent.click(screen.getByRole('button', { name: `Cast ${name}` }));
      expect(confirm).toHaveBeenCalledOnce();
    }
  );
  it('presents a generic non-CAST multi-member confirmation and honors its supplied minimum', () => {
    const declaration = create(DeclarationSchema, {
      ...offer('Shared Ward', Verb.ACTIVATE),
      minTargets: 3,
      maxTargets: 3,
    });
    const confirm = vi.fn();
    render(<Harness declaration={declaration} onConfirm={confirm} />);
    for (const member of ['a', 'b'])
      fireEvent.click(screen.getByRole('button', { name: `Map ${member}` }));
    expect(
      screen.getByRole('button', { name: 'Confirm Shared Ward' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Map c' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Shared Ward' })
    );
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('keeps stale/withdrawn selections removable but cannot confirm or dispatch a foreign target', () => {
    const choose = vi.fn();
    const confirm = vi.fn();
    render(
      <Harness
        authorityFresh={false}
        initialSelected={['a', 'gone']}
        onChoose={choose}
        onConfirm={confirm}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Cast Authored spell' })
    ).toBeDisabled();
    expect(screen.getByTestId('map')).toHaveAttribute('data-offered', '');
    fireEvent.click(screen.getByRole('button', { name: 'Map foreign' }));
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Target 2' }));
    expect(
      screen.queryByRole('button', { name: 'Remove Target 2' })
    ).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('keeps prior picks visible and removable when the whole action is withdrawn', () => {
    const choose = vi.fn();
    render(
      <MapFirstTargeting
        input={{
          declaration: undefined,
          selectedMembers: ['a', 'b'],
          authorityFresh: true,
          turnAllowed: true,
        }}
        host={host}
        memberNames={names}
        onChoose={choose}
        onCancel={() => {}}
      />
    );
    expect(
      screen.getByText('This action is no longer available')
    ).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(choose).toHaveBeenCalledWith('a');
    expect(
      screen.queryByRole('button', { name: /^Cast |^Confirm / })
    ).not.toBeInTheDocument();
  });

  it('keeps single-target callback behavior and makes details an explicit read-only operation', () => {
    const declaration = create(DeclarationSchema, {
      ...offer(),
      maxTargets: 1,
    });
    const choose = vi.fn();
    render(<Harness declaration={declaration} onChoose={choose} />);
    expect(
      screen.queryByRole('button', { name: 'Cast Authored spell' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Targets (3)' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Alpha target' })
    );
    expect(
      screen.getByRole('region', { name: 'Alpha target information' })
    ).toBeInTheDocument();
    expect(choose).not.toHaveBeenCalled();
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Close information' }),
      { key: 'Escape' }
    );
    expect(
      screen.queryByRole('region', { name: 'Alpha target information' })
    ).not.toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Authored spell targets' });
    fireEvent.click(within(list).getByRole('button', { name: /^Alpha/ }));
    expect(choose).toHaveBeenCalledWith('a');
  });
});
