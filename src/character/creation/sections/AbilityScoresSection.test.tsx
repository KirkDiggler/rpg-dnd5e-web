import { create } from '@bufbuild/protobuf';
import {
  CharacterDraftSchema,
  UpdateAbilityScoresResponseSchema,
  type UpdateAbilityScoresRequest,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterDraftState } from '../CharacterDraftContextDef';
import { CharacterDraftContext } from '../CharacterDraftContextDef';
import { AbilityScoresSection } from './AbilityScoresSection';

const hoisted = vi.hoisted(() => ({
  updateAbilityScoresFn:
    vi.fn<(req: UpdateAbilityScoresRequest) => Promise<unknown>>(),
}));

vi.mock('../../../api/client', () => ({
  characterClient: {
    updateAbilityScores: hoisted.updateAbilityScoresFn,
  },
}));

function makeDraftContext(
  overrides: Partial<CharacterDraftState> = {}
): CharacterDraftState {
  return {
    draftId: 'draft-1',
    draft: create(CharacterDraftSchema, { id: 'draft-1' }),
    raceInfo: null,
    classInfo: null,
    backgroundInfo: null,
    allProficiencies: new Set(),
    allLanguages: new Set(),
    raceChoices: [],
    classChoices: [],
    backgroundChoices: [],
    loading: false,
    saving: false,
    error: null,
    createDraft: vi.fn(),
    loadDraft: vi.fn(),
    setRace: vi.fn(),
    setClass: vi.fn(),
    setBackground: vi.fn(),
    setName: vi.fn(),
    setAbilityScores: vi.fn(),
    updateAppearance: vi.fn(),
    finalizeDraft: vi.fn(),
    addRaceChoice: vi.fn(),
    addClassChoice: vi.fn(),
    addBackgroundChoice: vi.fn(),
    getAvailableChoices: vi.fn(() => []),
    hasProficiency: vi.fn(() => false),
    hasLanguage: vi.fn(() => false),
    reset: vi.fn(),
    ...overrides,
  };
}

function renderSection(contextOverrides: Partial<CharacterDraftState> = {}) {
  const context = makeDraftContext(contextOverrides);
  render(
    <CharacterDraftContext.Provider value={context}>
      <AbilityScoresSection />
    </CharacterDraftContext.Provider>
  );
  return context;
}

const ABILITIES = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

// Assign the standard array (15, 14, 13, 12, 10, 8) to the six abilities in
// order by clicking each score slot then its target ability slot.
function assignStandardArray() {
  const values = [15, 14, 13, 12, 10, 8];
  values.forEach((value, i) => {
    fireEvent.click(screen.getByTestId(`score-slot-${value}`));
    fireEvent.click(screen.getByTestId(`ability-slot-${ABILITIES[i]}`));
  });
}

describe('AbilityScoresSection', () => {
  beforeEach(() => {
    hoisted.updateAbilityScoresFn.mockReset();
    hoisted.updateAbilityScoresFn.mockResolvedValue(
      create(UpdateAbilityScoresResponseSchema, {
        draft: create(CharacterDraftSchema, {
          id: 'draft-1',
          baseAbilityScores: {
            strength: 15,
            dexterity: 14,
            constitution: 13,
            intelligence: 12,
            wisdom: 10,
            charisma: 8,
          },
        }),
      })
    );
  });

  it('does not show Confirm until all six abilities are assigned', () => {
    renderSection();

    expect(
      screen.queryByRole('button', { name: /confirm ability scores/i })
    ).toBeNull();

    fireEvent.click(screen.getByTestId('score-slot-15'));
    fireEvent.click(screen.getByTestId('ability-slot-strength'));

    expect(
      screen.queryByRole('button', { name: /confirm ability scores/i })
    ).toBeNull();
  });

  it('disables a score slot once assigned, preventing it from being used twice', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('score-slot-15'));
    fireEvent.click(screen.getByTestId('ability-slot-strength'));

    // The 15 slot is now assigned; clicking it again must not let it be
    // picked up for a second ability (guards against double-assigning it).
    fireEvent.click(screen.getByTestId('score-slot-15'));
    fireEvent.click(screen.getByTestId('ability-slot-dexterity'));

    expect(screen.getByTestId('ability-slot-dexterity').textContent).toContain(
      'Click to assign'
    );
  });

  it('submits ability_scores with the assigned values, not roll_assignments, once complete (#460)', async () => {
    renderSection();

    assignStandardArray();

    const confirmButton = screen.getByRole('button', {
      name: /confirm ability scores/i,
    });
    fireEvent.click(confirmButton);

    await vi.waitFor(() => {
      expect(hoisted.updateAbilityScoresFn).toHaveBeenCalledTimes(1);
    });

    const request = hoisted.updateAbilityScoresFn.mock.calls[0][0];
    expect(request.draftId).toBe('draft-1');
    expect(request.scoresInput.case).toBe('abilityScores');
    expect(request.scoresInput.value).toMatchObject({
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    });
  });
});
