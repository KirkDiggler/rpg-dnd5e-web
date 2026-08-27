import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceRollGroupDie, DiceRollGroupInput } from './diceRollGroup';
import type { RerollBatch } from './rollGroupPresentationModel';
import {
  createRollGroupPresentationState,
  reduceRollGroupPresentation,
  type RollGroupPresentationState,
} from './rollGroupPresentationState';
import { SemanticRollGroup } from './SemanticRollGroup';

const mocks = vi.hoisted(() => ({
  dieProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('./RollGroupDie3D', () => ({
  RollGroupDie3D: (props: Record<string, unknown>) => {
    mocks.dieProps.push(props);
    const die = props.die as DiceRollGroupDie;
    return <div data-testid={`mock-group-die-${die.id}`} />;
  },
}));

function die(input: {
  id: string;
  originalFace: number;
  finalFace: number;
  rerolls?: DiceRollGroupDie['rerolls'];
}): DiceRollGroupDie {
  return {
    id: input.id,
    kind: 'd4',
    presetId: 'dice.original.carved.d4',
    setId: 'set:1',
    originalFace: input.originalFace,
    finalFace: input.finalFace,
    rerolls: input.rerolls ?? [],
    disposition: 'counted',
    sourceRef: 'source:1',
    sourceLabel: 'Source',
    contributorMemberId: 'member:1',
    purpose: 'base',
  };
}

const group: DiceRollGroupInput = {
  key: 'damage',
  dice: [
    die({ id: 'die:three', originalFace: 3, finalFace: 3 }),
    die({
      id: 'die:rerolled',
      originalFace: 1,
      finalFace: 4,
      rerolls: [
        {
          before: 1,
          after: 4,
          reasonRef: 'reason:1',
          displayLabel: 'Great Weapon Fighting',
        },
      ],
    }),
  ],
  modifiers: [],
};
const ACTIVE_BATCH: RerollBatch = {
  occurrenceKey: 'reroll-step:0:batch:0',
  displayLabel: 'Great Weapon Fighting',
  entries: [
    {
      dieId: 'die:rerolled',
      step: group.dice[1].rerolls[0],
    },
  ],
  dieIds: ['die:rerolled'],
};

function releasedState(): RollGroupPresentationState {
  let state = createRollGroupPresentationState({
    released: false,
    hydrated: false,
    rerollCount: 1,
    modifierCount: 0,
  });
  state = reduceRollGroupPresentation(
    state,
    { type: 'release-delivered' },
    { rerollCount: 1, modifierCount: 0 }
  );
  state = reduceRollGroupPresentation(
    state,
    { type: 'originals-settled' },
    { rerollCount: 1, modifierCount: 0 }
  );
  return state;
}

function rerollingState(): RollGroupPresentationState {
  let state = releasedState();
  state = reduceRollGroupPresentation(
    state,
    { type: 'reroll-flash-complete' },
    { rerollCount: 1, modifierCount: 0 }
  );
  return reduceRollGroupPresentation(
    state,
    { type: 'reroll-flash-complete' },
    { rerollCount: 1, modifierCount: 0 }
  );
}

function completeState(): RollGroupPresentationState {
  const state = rerollingState();
  return reduceRollGroupPresentation(
    state,
    { type: 'reroll-settled' },
    { rerollCount: 1, modifierCount: 0 }
  );
}

beforeEach(() => {
  mocks.dieProps = [];
});

describe('SemanticRollGroup', () => {
  it('offers an explicit semantic release request while armed without advancing itself', () => {
    const onReleaseRequest = vi.fn();
    const armed = createRollGroupPresentationState({
      released: false,
      hydrated: false,
      rerollCount: 1,
      modifierCount: 0,
    });
    const releaseProps = {
      group,
      presentation: armed,
      onReleaseRequest,
    } as React.ComponentProps<typeof SemanticRollGroup> & {
      readonly onReleaseRequest: () => void;
    };
    render(<SemanticRollGroup {...releaseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('d4 ?')).toHaveLength(2);
  });

  it('keeps concealed d4 labels truthful without drawing the legacy d20 polygon', () => {
    render(
      <SemanticRollGroup
        group={group}
        presentation={createRollGroupPresentationState({
          released: false,
          hydrated: false,
          rerollCount: 1,
          modifierCount: 0,
        })}
      />
    );

    expect(screen.getAllByText('d4 ?')).toHaveLength(2);
    expect(screen.queryByTestId('d20-die')).toBeNull();
    expect(document.querySelector('polygon')).toBeNull();
    expect(mocks.dieProps).toHaveLength(0);
  });

  it('shows original d4 faces after the originals settle', () => {
    const view = render(
      <SemanticRollGroup group={group} presentation={releasedState()} />
    );

    expect(screen.getByText('d4 3')).toBeTruthy();
    expect(screen.getByText('d4 1')).toBeTruthy();
    expect(screen.queryByText(/Reroll/)).toBeNull();
    expect(mocks.dieProps.map((props) => props.displayedFace)).toEqual([3, 1]);

    view.rerender(
      <SemanticRollGroup
        group={group}
        presentation={rerollingState()}
        activeRerollBatch={ACTIVE_BATCH}
        displayedFaces={{ 'die:three': 3, 'die:rerolled': 4 }}
      />
    );
    expect(screen.getByText('Great Weapon Fighting: d4 1 → 4')).toBeTruthy();
    expect(mocks.dieProps.at(-1)?.displayedFace).toBe(4);
  });

  it('renders reroll semantics from the active supplied batch instead of a per-die global index', () => {
    const firstStep = {
      before: 1,
      after: 4,
      reasonRef: 'reason:first',
      displayLabel: 'Great Weapon Fighting',
    } as const;
    const secondStep = {
      before: 2,
      after: 3,
      reasonRef: 'reason:second',
      displayLabel: 'Savage Attacker',
    } as const;
    const batchGroup: DiceRollGroupInput = {
      key: 'damage',
      dice: [
        die({
          id: 'die:first-batch',
          originalFace: 1,
          finalFace: 4,
          rerolls: [firstStep],
        }),
        die({
          id: 'die:second-batch',
          originalFace: 2,
          finalFace: 3,
          rerolls: [secondStep],
        }),
      ],
      modifiers: [],
    };
    const activeBatch: RerollBatch = {
      occurrenceKey: 'reroll-step:0:batch:1',
      displayLabel: 'Savage Attacker',
      entries: [{ dieId: 'die:second-batch', step: secondStep }],
      dieIds: ['die:second-batch'],
    };

    render(
      <SemanticRollGroup
        group={batchGroup}
        presentation={{
          phase: 'rerolling',
          rerollIndex: 1,
          modifierIndex: 0,
          hydrated: false,
        }}
        activeRerollBatch={activeBatch}
        displayedFaces={{ 'die:first-batch': 4, 'die:second-batch': 3 }}
      />
    );

    expect(screen.getByText('Savage Attacker: d4 2 → 3')).toBeTruthy();
    expect(screen.queryByText(/Great Weapon Fighting/)).toBeNull();
    expect(screen.getByText('d4 4')).toBeTruthy();
    expect(screen.getByText('d4 3')).toBeTruthy();
  });

  it('renders final reroll labels and no d20 fallback in the complete state', () => {
    render(<SemanticRollGroup group={group} presentation={completeState()} />);

    expect(screen.getByText('d4 3')).toBeTruthy();
    expect(screen.getByText('d4 4')).toBeTruthy();
    expect(screen.queryByTestId('d20-die')).toBeNull();
    expect(document.querySelector('polygon')).toBeNull();
    expect(mocks.dieProps.map((props) => props.displayedFace)).toEqual([3, 4]);
  });
});
