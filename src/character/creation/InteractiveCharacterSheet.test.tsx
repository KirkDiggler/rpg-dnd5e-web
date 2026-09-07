import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  AppearanceSchema,
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
  EquipmentItemSchema,
  EquipmentOptionsSchema,
  EquipmentSelectionItemSchema,
  EquipmentSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Armor,
  Class,
  Race,
  Weapon,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
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
  finalizeDraft: CharacterDraftState['finalizeDraft'],
  overrides: Partial<
    Pick<
      CharacterDraftState,
      'draft' | 'raceInfo' | 'classInfo' | 'classChoices'
    >
  > = {}
): CharacterDraftState {
  return {
    draftId: 'persisted-draft',
    draft:
      overrides.draft ??
      create(CharacterDraftSchema, {
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
    raceInfo: overrides.raceInfo ?? create(RaceInfoSchema, { name: 'Human' }),
    classInfo:
      overrides.classInfo ??
      create(ClassInfoSchema, {
        name: 'Fighter',
        choices: [declaredEquipmentChoice],
      }),
    backgroundInfo: create(BackgroundInfoSchema, { name: 'Soldier' }),
    allProficiencies: new Set(),
    allLanguages: new Set(),
    raceChoices: [],
    classChoices: overrides.classChoices ?? [
      persistedDuplicateEquipmentChoice(),
    ],
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

describe('InteractiveCharacterSheet profile-driven appearance entry', () => {
  const dwarf = create(RaceInfoSchema, {
    name: 'Dwarf',
    raceId: Race.DWARF,
  });

  it.each([
    [dwarf, 'Dwarf'],
    [create(RaceInfoSchema, { name: 'Human', raceId: Race.HUMAN }), 'Human'],
    [
      create(RaceInfoSchema, { name: 'Half-Orc', raceId: Race.HALF_ORC }),
      'Half-Orc',
    ],
  ])(
    'offers the accessible %s hair picker after a supported class is selected',
    (raceInfo, label) => {
      render(
        <CharacterDraftContext.Provider
          value={draftState(vi.fn(), {
            raceInfo,
            classInfo: create(ClassInfoSchema, {
              name: 'Rogue',
              classId: Class.ROGUE,
            }),
            classChoices: [],
          })}
        >
          <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
        </CharacterDraftContext.Provider>
      );

      expect(
        screen.getByRole('button', { name: `Customize ${label} appearance` })
      ).not.toBeNull();
    }
  );

  it.each([
    [create(RaceInfoSchema, { name: 'Dragonborn' }), 'Fighter'],
    [dwarf, 'Wizard'],
  ])(
    'does not offer the picker for an unsupported race/class pair',
    (raceInfo, className) => {
      render(
        <CharacterDraftContext.Provider
          value={draftState(vi.fn(), {
            raceInfo,
            classInfo: create(ClassInfoSchema, { name: className }),
            classChoices: [],
          })}
        >
          <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
        </CharacterDraftContext.Provider>
      );

      expect(
        screen.queryByRole('button', { name: /Customize .* appearance/ })
      ).toBeNull();
      expect(screen.queryByText('Customize Appearance')).toBeNull();
    }
  );

  it('summarizes persisted style, none, black, and zero roughness without legacy swatches', () => {
    const appearance = create(AppearanceSchema, {
      hair: create(HairCustomizationSchema, {
        scalp: create(StyleSelectionSchema, {
          selection: {
            case: 'styleRef',
            value: 'modular-fantasy-hero:hair:38',
          },
        }),
        facialHair: create(StyleSelectionSchema, {
          selection: { case: 'none', value: create(EmptySchema) },
        }),
        colorSrgb: 0,
        roughness: 0,
      }),
    });
    render(
      <CharacterDraftContext.Provider
        value={draftState(vi.fn(), {
          draft: create(CharacterDraftSchema, {
            id: 'persisted-draft',
            appearance,
          }),
          raceInfo: dwarf,
          classInfo: create(ClassInfoSchema, {
            name: 'Fighter',
            classId: Class.FIGHTER,
          }),
          classChoices: [],
        })}
      >
        <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
      </CharacterDraftContext.Provider>
    );

    expect(screen.getByText('Scalp: Hair 38')).not.toBeNull();
    expect(screen.getByText('Facial: None')).not.toBeNull();
    expect(screen.getByText('#000000 · roughness 0.00')).not.toBeNull();
    expect(screen.queryByTitle('Skin Tone')).toBeNull();
    expect(screen.queryByTitle('Primary Color')).toBeNull();
  });
});

describe('InteractiveCharacterSheet persisted equipment guard', () => {
  it('allows finalization for a same-category repeated equipment selection', () => {
    const finalizeDraft = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue('char-1');
    render(
      <CharacterDraftContext.Provider value={draftState(finalizeDraft)}>
        <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
      </CharacterDraftContext.Provider>
    );

    const finalize = screen.getByRole('button', { name: /begin adventure/i });
    expect(finalize.getAttribute('disabled')).toBeNull();
    fireEvent.click(finalize);
    expect(finalizeDraft).toHaveBeenCalled();
  });
});

describe('InteractiveCharacterSheet persisted mixed-bundle round trip (rpg-toolkit real wire shape)', () => {
  // A fixed bundle item (shield) plus one enum-backed category selection
  // (longsword) — the real toolkit build order and the real proto enums
  // rpg-api attaches, not a test-only `otherEquipmentId` shortcut.
  const mixedBundle = create(EquipmentBundleSchema, {
    id: 'fighter-pack-a',
    items: [
      create(EquipmentItemSchema, {
        selectionId: 'shield',
        typeHint: { case: 'armor', value: Armor.SHIELD },
      }),
    ],
    categoryChoices: [
      create(EquipmentCategoryChoiceSchema, {
        choose: 1,
        options: [
          create(EquipmentItemSchema, {
            selectionId: 'longsword',
            typeHint: { case: 'weapon', value: Weapon.LONGSWORD },
          }),
        ],
      }),
    ],
  });

  const declaredMixedChoice = create(ChoiceSchema, {
    id: 'fighter-starting-equipment',
    choiceType: ChoiceCategory.EQUIPMENT,
    options: {
      case: 'equipmentOptions',
      value: create(EquipmentOptionsSchema, { bundles: [mixedBundle] }),
    },
  });

  function persistedMixedChoice(withTrailingExtra: boolean) {
    return create(ChoiceDataSchema, {
      choiceId: 'fighter-starting-equipment',
      optionId: 'fighter-pack-a',
      category: ChoiceCategory.EQUIPMENT,
      selection: {
        case: 'equipment',
        value: create(EquipmentSelectionSchema, {
          items: [
            create(EquipmentSelectionItemSchema, {
              equipment: { case: 'armor', value: Armor.SHIELD },
            }),
            create(EquipmentSelectionItemSchema, {
              equipment: { case: 'weapon', value: Weapon.LONGSWORD },
            }),
            ...(withTrailingExtra
              ? [
                  create(EquipmentSelectionItemSchema, {
                    equipment: { case: 'weapon', value: Weapon.DAGGER },
                  }),
                ]
              : []),
          ],
        }),
      },
    });
  }

  const classInfoWithMixedBundle = create(ClassInfoSchema, {
    name: 'Fighter',
    choices: [declaredMixedChoice],
  });

  it('allows finalization for a valid fixed-item + enum-backed category selection, offset and mapped correctly', () => {
    const finalizeDraft = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue('char-1');
    render(
      <CharacterDraftContext.Provider
        value={draftState(finalizeDraft, {
          classInfo: classInfoWithMixedBundle,
          classChoices: [persistedMixedChoice(false)],
        })}
      >
        <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
      </CharacterDraftContext.Provider>
    );

    const finalize = screen.getByRole('button', { name: /begin adventure/i });
    expect(finalize.getAttribute('disabled')).toBeNull();
    fireEvent.click(finalize);
    expect(finalizeDraft).toHaveBeenCalled();
  });

  it('blocks finalization once a delayed hydration reveals an unconsumed trailing persisted item, without a remount', () => {
    const finalizeDraft = vi.fn<() => Promise<string>>();
    const { rerender } = render(
      <CharacterDraftContext.Provider
        value={draftState(finalizeDraft, {
          classInfo: classInfoWithMixedBundle,
          classChoices: [persistedMixedChoice(false)],
        })}
      >
        <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
      </CharacterDraftContext.Provider>
    );

    expect(
      screen
        .getByRole('button', { name: /begin adventure/i })
        .getAttribute('disabled')
    ).toBeNull();

    // The draft context refreshes after mount (e.g. the persisted draft
    // finishes loading) and now carries a trailing item this reconstruction
    // can't account for. Finalize must react and block immediately.
    rerender(
      <CharacterDraftContext.Provider
        value={draftState(finalizeDraft, {
          classInfo: classInfoWithMixedBundle,
          classChoices: [persistedMixedChoice(true)],
        })}
      >
        <InteractiveCharacterSheet onComplete={vi.fn()} onCancel={vi.fn()} />
      </CharacterDraftContext.Provider>
    );

    const finalize = screen.getByRole('button', { name: /begin adventure/i });
    expect(finalize.getAttribute('disabled')).not.toBeNull();
    fireEvent.click(finalize);
    expect(finalizeDraft).not.toHaveBeenCalled();
  });
});
