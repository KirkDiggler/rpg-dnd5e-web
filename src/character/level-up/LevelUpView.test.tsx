import { create } from '@bufbuild/protobuf';
import {
  FeatureInfoSchema,
  GetNextLevelResponseSchema,
  HitPointMethod,
  LevelGainedSchema,
  LevelUpResponseSchema,
  ResourceMaximumChangeSchema,
  type LevelUpRequest,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  ChoiceSource,
  SpellOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelUpView } from './LevelUpView';

const api = vi.hoisted(() => ({
  getNextLevel: vi.fn(),
  levelUp: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  characterClient: {
    getNextLevel: api.getNextLevel,
    levelUp: api.levelUp,
  },
}));

vi.mock('../../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../../components/ui')>(
    '../../components/ui'
  );
  return { ...actual, useToast: () => ({ addToast: api.addToast }) };
});

const actionSurge = create(FeatureInfoSchema, {
  id: 'action-surge',
  name: 'Action Surge',
  description: 'Take one additional action on your turn.',
  level: 2,
});

const spellChoice = create(ChoiceSchema, {
  id: 'bard-spells-2',
  description: 'Choose 1 spell',
  chooseCount: 1,
  choiceType: ChoiceCategory.SPELLS,
  options: {
    case: 'spellOptions',
    value: create(SpellOptionsSchema, {
      availableRefs: ['dnd5e:spells:bane', 'dnd5e:spells:cure_wounds'],
    }),
  },
});

const cantripChoice = create(ChoiceSchema, {
  id: 'bard-cantrips-2',
  description: 'Choose 1 cantrip',
  chooseCount: 1,
  choiceType: ChoiceCategory.CANTRIPS,
  options: {
    case: 'spellOptions',
    value: create(SpellOptionsSchema, {
      availableRefs: ['dnd5e:spells:vicious_mockery'],
    }),
  },
});

function renderView() {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  render(
    <LevelUpView
      characterId="char-1"
      onCancel={onCancel}
      onComplete={onComplete}
    />
  );
  return { onComplete, onCancel };
}

function lastLevelUpRequest(): LevelUpRequest {
  const calls = api.levelUp.mock.calls;
  return calls[calls.length - 1][0] as LevelUpRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LevelUpView with a level that asks nothing', () => {
  beforeEach(() => {
    api.getNextLevel.mockResolvedValue(
      create(GetNextLevelResponseSchema, {
        level: 2,
        class: Class.FIGHTER,
        choices: [],
        features: [actionSurge],
        hitDie: 10,
      })
    );
  });

  it('is the same screen: the level it names, what it brings, and a method to choose', async () => {
    renderView();

    expect(await screen.findByTestId('level-up-title')).toHaveTextContent(
      'Level 2 Fighter'
    );
    expect(screen.getByTestId('level-up-feature')).toHaveTextContent(
      'Action Surge'
    );
    expect(screen.getByTestId('hit-point-method-rolled')).toHaveTextContent(
      'd10'
    );
    expect(screen.queryAllByTestId('level-up-choice')).toHaveLength(0);
  });

  it('holds the confirm until a hit-point method is chosen, then releases it', async () => {
    renderView();

    const confirm = await screen.findByTestId('level-up-confirm');
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByTestId('hit-point-method-average'));
    expect(confirm).toBeEnabled();
  });

  it('sends the chosen method with no choices at all', async () => {
    api.levelUp.mockResolvedValue(
      create(LevelUpResponseSchema, {
        gained: create(LevelGainedSchema, { level: 2, hitPointsGained: 6 }),
      })
    );
    renderView();

    fireEvent.click(await screen.findByTestId('hit-point-method-average'));
    fireEvent.click(screen.getByTestId('level-up-confirm'));

    await waitFor(() => expect(api.levelUp).toHaveBeenCalled());
    const request = lastLevelUpRequest();
    expect(request.characterId).toBe('char-1');
    expect(request.hitPointMethod).toBe(HitPointMethod.AVERAGE);
    expect(request.choices).toEqual([]);
  });
});

describe('LevelUpView with a level that asks two questions', () => {
  beforeEach(() => {
    api.getNextLevel.mockResolvedValue(
      create(GetNextLevelResponseSchema, {
        level: 2,
        class: Class.BARD,
        choices: [spellChoice, cantripChoice],
        features: [],
        hitDie: 8,
      })
    );
  });

  it('renders one renderer per returned choice, whatever the choices are', async () => {
    renderView();

    await screen.findByTestId('level-up-title');
    expect(screen.getAllByTestId('level-up-choice')).toHaveLength(2);
    expect(screen.getByText('Bane')).toBeInTheDocument();
    expect(screen.getByText('Vicious Mockery')).toBeInTheDocument();
  });

  it('holds the confirm until every returned choice has been answered', async () => {
    renderView();

    const confirm = await screen.findByTestId('level-up-confirm');
    fireEvent.click(screen.getByTestId('hit-point-method-rolled'));
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByText('Bane'));
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByText('Vicious Mockery'));
    expect(confirm).toBeEnabled();
  });

  it('sends the choices it was asked for, as class choices, and nothing else', async () => {
    api.levelUp.mockResolvedValue(
      create(LevelUpResponseSchema, {
        gained: create(LevelGainedSchema, { level: 2, hitPointsGained: 5 }),
      })
    );
    renderView();

    fireEvent.click(await screen.findByTestId('hit-point-method-rolled'));
    fireEvent.click(screen.getByText('Cure Wounds'));
    fireEvent.click(screen.getByText('Vicious Mockery'));
    fireEvent.click(screen.getByTestId('level-up-confirm'));

    await waitFor(() => expect(api.levelUp).toHaveBeenCalled());
    const request = lastLevelUpRequest();

    expect(request.hitPointMethod).toBe(HitPointMethod.ROLLED);
    expect(request.choices.map((choice) => choice.choiceId).sort()).toEqual([
      'bard-cantrips-2',
      'bard-spells-2',
    ]);
    request.choices.forEach((choice) =>
      expect(choice.source).toBe(ChoiceSource.CLASS)
    );

    const spells = request.choices.find(
      (choice) => choice.choiceId === 'bard-spells-2'
    );
    expect(
      spells?.selection.case === 'spells'
        ? spells.selection.value.spellRefs
        : null
    ).toEqual(['dnd5e:spells:cure_wounds']);
  });
});

describe('LevelUpView after the level is taken', () => {
  beforeEach(() => {
    api.getNextLevel.mockResolvedValue(
      create(GetNextLevelResponseSchema, {
        level: 2,
        class: Class.BARD,
        choices: [],
        features: [],
        hitDie: 8,
      })
    );
  });

  it('shows the pools the engine reported as changed', async () => {
    api.levelUp.mockResolvedValue(
      create(LevelUpResponseSchema, {
        gained: create(LevelGainedSchema, {
          level: 2,
          hitPointsGained: 5,
          resourceChanges: [
            create(ResourceMaximumChangeSchema, {
              key: 'spell_slot_level_1',
              name: '1st-level spell slots',
              previousMaximum: 2,
              newMaximum: 3,
            }),
          ],
        }),
      })
    );
    renderView();

    fireEvent.click(await screen.findByTestId('hit-point-method-average'));
    fireEvent.click(screen.getByTestId('level-up-confirm'));

    expect(await screen.findByTestId('resource-change')).toHaveTextContent(
      '1st-level spell slots 2 → 3'
    );
    expect(screen.getByTestId('hit-points-gained')).toHaveTextContent('5');
  });

  it("surfaces the engine's refusal and stays on the form", async () => {
    api.levelUp.mockRejectedValue(
      new Error('character has 120 experience; level 2 requires 300')
    );
    renderView();

    fireEvent.click(await screen.findByTestId('hit-point-method-average'));
    fireEvent.click(screen.getByTestId('level-up-confirm'));

    await waitFor(() =>
      expect(api.addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'character has 120 experience; level 2 requires 300',
        })
      )
    );
    expect(screen.queryByTestId('level-gained')).not.toBeInTheDocument();
  });
});
