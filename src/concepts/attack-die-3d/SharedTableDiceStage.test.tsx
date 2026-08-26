import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceRollGroupPresentationProps } from '../../components/ui/dice/DiceTrayPresentation';
import type { RollGroupAttachmentDiagnostic } from '../../components/ui/dice/RollGroupPresentation';
import { SHARED_TABLE_DICE_SCENARIOS } from './sharedTableDiceFixtures';
import { SharedTableDiceStage } from './SharedTableDiceStage';

const presentationCalls: DiceRollGroupPresentationProps[] = [];
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext'
);

vi.mock('../../components/ui/dice/RollGroupPresentation', async (original) => {
  const actual =
    await original<
      typeof import('../../components/ui/dice/RollGroupPresentation')
    >();
  const ActualRollGroupPresentation = actual.RollGroupPresentation;
  return {
    ...actual,
    RollGroupPresentation: (props: DiceRollGroupPresentationProps) => {
      presentationCalls.push(props);
      return <ActualRollGroupPresentation {...props} />;
    },
  };
});

beforeEach(() => {
  presentationCalls.length = 0;
  delete window.__sharedTableDiceEvidence;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__sharedTableDiceEvidence;
  if (originalGetContext)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'getContext',
      originalGetContext
    );
});

function region(label: 'Roller' | 'Witness') {
  const witness = label === 'Roller' ? 'roller' : 'spectator';
  return document.querySelector<HTMLElement>(
    `[data-witness-pane="${witness}"]`
  )!;
}

function latest(role: 'roller' | 'spectator') {
  return [...presentationCalls]
    .reverse()
    .find((props) => props.witnessRole === role)!;
}

function generation(label: 'Roller' | 'Witness') {
  return Number(
    within(region(label))
      .getByTestId('roll-group-presentation')
      .getAttribute('data-renderer-generation')
  );
}

function complete(role: 'roller' | 'spectator', rendererGeneration: number) {
  const props = latest(role);
  const request = props.events.find(
    (event) => event.type === 'dice-roll-group-requested'
  );
  expect(request?.type).toBe('dice-roll-group-requested');
  if (request?.type !== 'dice-roll-group-requested') return;
  props.onComplete?.({
    presentationId: request.presentationId,
    groupKey: request.group.key,
    witnessRole: role,
    rendererGeneration,
    renderer: '3d',
  });
}

describe('SharedTableDiceStage', () => {
  it('renders the complete keyboard-accessible feel bench and two literal shared witnesses', () => {
    render(<SharedTableDiceStage />);

    expect(
      screen.getByRole('heading', { name: 'Shared table dice feel lab' })
    ).toBeTruthy();
    for (const candidate of ['Weighty', 'Energetic', 'Physical'])
      expect(screen.getByRole('radio', { name: candidate })).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: 'Physical' }) as HTMLInputElement)
        .checked
    ).toBe(true);

    const scenario = screen.getByRole('combobox', { name: 'Scenario' });
    expect(
      within(scenario)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value'))
    ).toEqual(Object.keys(SHARED_TABLE_DICE_SCENARIOS));
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: 'Reduced motion' })
    ).toBeTruthy();

    expect(screen.getByText('Fixture data')).toBeTruthy();
    expect(screen.getByText('Simulated delivery')).toBeTruthy();
    expect(screen.getByText('Provisional non-d20 assets')).toBeTruthy();
    expect(screen.getByText(/Aria/)).toBeTruthy();
    expect(screen.getByText(/Bram/)).toBeTruthy();
    expect(screen.getByText(/Obsidian carved set/)).toBeTruthy();
    expect(screen.getByText(/Ivory carved set/)).toBeTruthy();
    expect(region('Roller')).toBeTruthy();
    expect(region('Witness')).toBeTruthy();

    const roller = latest('roller');
    const witness = latest('spectator');
    expect(roller.mode).toBe('roll-group');
    expect(witness.mode).toBe('roll-group');
    expect(roller.events).toBe(witness.events);
    expect(roller.onMount).toEqual(expect.any(Function));
    expect(witness.onMount).toEqual(expect.any(Function));
    expect(roller.onComplete).toEqual(expect.any(Function));
    expect(witness.onComplete).toEqual(expect.any(Function));
    expect(roller.forceFailure).toBe('webgl');
    expect(witness.forceFailure).toBe('webgl');
    expect(roller.onReleaseRequest).toEqual(expect.any(Function));
    expect(witness.onReleaseRequest).toBeUndefined();
    expect(
      within(region('Witness')).queryByRole('button', { name: 'Roll dice' })
    ).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Weighty' }));
    expect(
      (screen.getByRole('radio', { name: 'Weighty' }) as HTMLInputElement)
        .checked
    ).toBe(true);
  });

  it('links the mobile tabs to labeled tabpanels while keeping both desktop panes mounted', () => {
    render(<SharedTableDiceStage />);

    const rollerTab = screen.getByRole('tab', { name: 'Roller' });
    const witnessTab = screen.getByRole('tab', { name: 'Witness' });
    const rollerPanel = screen.getByRole('tabpanel', { name: 'Roller' });
    const witnessPanel = screen.getByRole('tabpanel', { name: 'Witness' });

    expect(rollerTab.id).not.toBe('');
    expect(witnessTab.id).not.toBe('');
    expect(rollerTab.id).not.toBe(witnessTab.id);
    expect(rollerTab.getAttribute('aria-controls')).toBe(rollerPanel.id);
    expect(witnessTab.getAttribute('aria-controls')).toBe(witnessPanel.id);
    expect(rollerPanel.getAttribute('aria-labelledby')).toBe(rollerTab.id);
    expect(witnessPanel.getAttribute('aria-labelledby')).toBe(witnessTab.id);
    expect(rollerPanel.hidden).toBe(false);
    expect(witnessPanel.hidden).toBe(false);

    fireEvent.click(witnessTab);

    expect(rollerTab.getAttribute('aria-selected')).toBe('false');
    expect(witnessTab.getAttribute('aria-selected')).toBe('true');
    expect(rollerPanel.hidden).toBe(false);
    expect(witnessPanel.hidden).toBe(false);
    expect(document.body.contains(rollerPanel)).toBe(true);
    expect(document.body.contains(witnessPanel)).toBe(true);
  });

  it('synchronizes later inherited reduced motion without resetting the active bench state', () => {
    const view = render(<SharedTableDiceStage reducedMotion={false} />);
    const scenario = screen.getByRole('combobox', { name: 'Scenario' });

    fireEvent.change(scenario, { target: { value: 'ordinary-damage' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Weighty' }));
    const presentationId = latest('roller').events[0]?.presentationId;

    view.rerender(<SharedTableDiceStage reducedMotion={true} />);

    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Reduced motion',
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect((scenario as HTMLSelectElement).value).toBe('ordinary-damage');
    expect(
      (screen.getByRole('radio', { name: 'Weighty' }) as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(latest('roller').reducedMotion).toBe(true);
    expect(latest('roller').events[0]?.presentationId).toBe(presentationId);

    view.rerender(<SharedTableDiceStage reducedMotion={false} />);

    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Reduced motion',
        }) as HTMLInputElement
      ).checked
    ).toBe(false);
    expect(latest('roller').reducedMotion).toBe(false);
    expect(latest('roller').events[0]?.presentationId).toBe(presentationId);
  });

  it('advances only after exact mounted generations complete the two-witness barrier', () => {
    vi.useFakeTimers();
    render(<SharedTableDiceStage />);

    const rollerGeneration = generation('Roller');
    const witnessGeneration = generation('Witness');
    expect(rollerGeneration).not.toBe(witnessGeneration);

    act(() => complete('roller', rollerGeneration - 10_000));
    expect(screen.getByTestId('shared-table-dice-phase').textContent).toContain(
      '0 of 2'
    );

    act(() => complete('roller', rollerGeneration));
    expect(screen.getByTestId('shared-table-dice-phase').textContent).toContain(
      '1 of 2'
    );
    expect(screen.queryByText('Miss')).toBeNull();

    act(() => complete('spectator', witnessGeneration));
    expect(screen.getByText('Miss')).toBeTruthy();
    expect(screen.getByTestId('shared-table-dice-phase').textContent).toContain(
      'both witnesses'
    );
  });

  it('shows fixture reroll facts and shares one accepted delivery while rejecting a duplicate exercise', () => {
    render(<SharedTableDiceStage />);
    const select = screen.getByRole('combobox', { name: 'Scenario' });

    fireEvent.change(select, { target: { value: 'great-weapon-fighting' } });
    expect(screen.getByText('Reroll cue · Great Weapon Fighting')).toBeTruthy();
    fireEvent.click(
      within(region('Roller')).getByRole('button', { name: 'Roll dice' })
    );
    expect(latest('roller').events).toBe(latest('spectator').events);
    expect(latest('roller').events.map((event) => event.type)).toEqual([
      'dice-roll-group-requested',
      'dice-roll-group-released',
    ]);

    fireEvent.change(select, { target: { value: 'duplicate-release' } });
    fireEvent.click(
      within(region('Roller')).getByRole('button', { name: 'Roll dice' })
    );
    expect(latest('roller').events.map((event) => event.type)).toEqual([
      'dice-roll-group-requested',
      'dice-roll-group-released',
    ]);
  });

  it('shows supplied totals, modifier toast content, and truthful fallback status without witness controls', () => {
    vi.useFakeTimers();
    render(<SharedTableDiceStage />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Scenario' }), {
      target: { value: 'provider-failure' },
    });

    const witness = region('Witness');
    expect(within(witness).queryByRole('button')).toBeNull();
    fireEvent.click(
      within(region('Roller')).getByRole('button', { name: 'Roll dice' })
    );

    expect(
      within(region('Roller')).getByText(
        'Shared table Roller attack dice complete · semantic fallback'
      )
    ).toBeTruthy();
    expect(
      within(witness).getByText(
        'Shared table Witness attack dice complete · semantic fallback'
      )
    ).toBeTruthy();
    expect(
      screen.getAllByLabelText('Final total').map((node) => node.textContent)
    ).toEqual(['21', '21']);
    expect(screen.getAllByText(/Attack bonus/)).toHaveLength(2);
    expect(screen.getByLabelText('Fallback status').textContent).toContain(
      'semantic fallback exercise'
    );
  });

  it('cancels old missing-release delivery on candidate/scenario reset and clears it on replay', () => {
    vi.useFakeTimers();
    render(<SharedTableDiceStage />);
    const select = screen.getByRole('combobox', { name: 'Scenario' });
    fireEvent.change(select, { target: { value: 'missing-release' } });

    const oldRoller = latest('roller');
    const oldPresentationId = oldRoller.events[0]?.presentationId;
    expect(oldRoller.events).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2_999));

    fireEvent.click(screen.getByRole('radio', { name: 'Weighty' }));
    const resetRoller = latest('roller');
    expect(resetRoller.events).toHaveLength(1);
    expect(resetRoller.events[0]?.presentationId).not.toBe(oldPresentationId);

    act(() => vi.advanceTimersByTime(1));
    expect(oldRoller.events).toHaveLength(1);
    expect(latest('roller').events).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2_999));
    expect(latest('roller').events.map((event) => event.type)).toEqual([
      'dice-roll-group-requested',
      'dice-roll-group-released',
    ]);

    const deliveredId = latest('roller').events[0]?.presentationId;
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(latest('roller').events).toHaveLength(1);
    expect(latest('roller').events[0]?.presentationId).not.toBe(deliveredId);
    expect(window.__sharedTableDiceEvidence).toBeUndefined();
  });

  it('resets delivery when reduced motion changes and publishes only current attachment generations', () => {
    render(<SharedTableDiceStage />);
    const rollerBefore = latest('roller');
    const oldId = rollerBefore.events[0]?.presentationId;
    const oldGeneration = generation('Roller');

    act(() =>
      rollerBefore.onAttachmentDiagnostic?.({
        presentationId: oldId!,
        groupKey: 'attack',
        witnessRole: 'roller',
        rendererGeneration: oldGeneration,
        dieId: SHARED_TABLE_DICE_SCENARIOS['single-d20'].attack.dice[0].id,
        projectedAnchor: [12, 18],
        heldPoseApplied: true,
        frameSequence: 1,
      } satisfies RollGroupAttachmentDiagnostic)
    );
    expect(window.__sharedTableDiceEvidence?.presentationId).toBe(oldId);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Reduced motion' }));
    const rollerAfter = latest('roller');
    expect(rollerAfter.reducedMotion).toBe(true);
    expect(rollerAfter.events[0]?.presentationId).not.toBe(oldId);
    expect(window.__sharedTableDiceEvidence).toBeUndefined();

    act(() =>
      rollerBefore.onAttachmentDiagnostic?.({
        presentationId: oldId!,
        groupKey: 'attack',
        witnessRole: 'roller',
        rendererGeneration: oldGeneration,
        dieId: SHARED_TABLE_DICE_SCENARIOS['single-d20'].attack.dice[0].id,
        projectedAnchor: [19, 20],
        heldPoseApplied: true,
        frameSequence: 2,
      })
    );
    expect(window.__sharedTableDiceEvidence).toBeUndefined();
  });
});
