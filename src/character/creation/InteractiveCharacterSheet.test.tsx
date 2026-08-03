import { create } from '@bufbuild/protobuf';
import {
  BackgroundInfoSchema,
  CharacterDraftSchema,
  ClassInfoSchema,
  RaceInfoSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSchema,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentOptionsSchema,
  EquipmentSelectionItemSchema,
  EquipmentSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterDraftState } from './CharacterDraftContextDef';
import { CharacterDraftContext } from './CharacterDraftContextDef';
import { InteractiveCharacterSheet } from './InteractiveCharacterSheet';

vi.mock('@/components/ProgressTracker', () => ({
  ProgressTracker: () => null,
}));
vi.mock('@/components/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => (
    <button>{children}</button>
  ),
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('./AppearanceSelectionModal', () => ({
  AppearanceSelectionModal: () => null,
}));
vi.mock('./BackgroundSelectionModal', () => ({
  BackgroundSelectionModal: () => null,
}));
vi.mock('./ClassSelectionModal', () => ({ ClassSelectionModal: () => null }));
vi.mock('./RaceSelectionModal', () => ({ RaceSelectionModal: () => null }));
vi.mock('./SpellSelectionModal', () => ({ SpellSelectionModal: () => null }));
vi.mock('./components/SpellInfoDisplay', () => ({
  SpellInfoDisplay: () => null,
}));
vi.mock('./sections/AbilityScoresSection', () => ({
  AbilityScoresSection: () => null,
}));

const declaredEquipmentChoice = create(ChoiceSchema, {
  id: 'fighter-starting-equipment',
  choiceType: ChoiceCategory.EQUIPMENT,
  options: {
    case: 'equipmentOptions',
    value: create(EquipmentOptionsSchema, {
      bundles: [
        create(EquipmentBundleSchema, {
          id: 'fighter-pack-a',
          categoryChoices: [
            create(EquipmentCategoryChoiceSchema, { choose: 2 }),
          ],
        }),
      ],
    }),
  },
});

function persistedDuplicateEquipmentChoice() {
  return create(ChoiceDataSchema, {
    choiceId: 'fighter-starting-equipment',
    optionId: 'fighter-pack-a',
    category: ChoiceCategory.EQUIPMENT,
    selection: {
      case: 'equipment',
      value: create(EquipmentSelectionSchema, {
        items: ['longsword-selection', 'longsword-selection'].map((id) =>
          create(EquipmentSelectionItemSchema, {
            equipment: { case: 'otherEquipmentId', value: id },
          })
        ),
      }),
    },
  });
}

function draftState(
  finalizeDraft: CharacterDraftState['finalizeDraft']
): CharacterDraftState {
  return {
    draftId: 'persisted-draft',
    draft: create(CharacterDraftSchema, {
      id: 'persisted-draft',
      name: 'Aria',
      baseAbilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
    }),
    raceInfo: create(RaceInfoSchema, { name: 'Human' }),
    classInfo: create(ClassInfoSchema, {
      name: 'Fighter',
      choices: [declaredEquipmentChoice],
    }),
    backgroundInfo: create(BackgroundInfoSchema, { name: 'Soldier' }),
    allProficiencies: new Set(),
    allLanguages: new Set(),
    raceChoices: [],
    classChoices: [persistedDuplicateEquipmentChoice()],
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
    finalizeDraft,
    addRaceChoice: vi.fn(),
    addClassChoice: vi.fn(),
    addBackgroundChoice: vi.fn(),
    getAvailableChoices: vi.fn(() => []),
    hasProficiency: vi.fn(() => false),
    hasLanguage: vi.fn(() => false),
    reset: vi.fn(),
  };
}

describe('InteractiveCharacterSheet persisted equipment guard', () => {
  it('disables finalization and does not invoke FinalizeDraft for a same-category legacy duplicate', () => {
    const finalizeDraft = vi.fn<() => Promise<string>>();
    render(
      <CharacterDraftContext.Provider value={draftState(finalizeDraft)}>
        <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
      </CharacterDraftContext.Provider>
    );

    const finalize = screen.getByRole('button', { name: /begin adventure/i });
    expect(finalize.getAttribute('disabled')).not.toBeNull();
    fireEvent.click(finalize);
    expect(finalizeDraft).not.toHaveBeenCalled();
  });
});
