# Unified Choice System Migration Guide

## What We Accomplished Today

1. **Updated proto to v0.1.12** ✅
2. **Integrated equipment API** ✅
   - Added `useListEquipmentByType` hook
   - Equipment selection now fetches real data from API
   - Removed hardcoded weapon lists
3. **Discovered the breaking change** ⚠️
   - Old choice types are gone
   - Everything uses unified `Choice` type now
   - Our components still expect old structure

## Current Situation (as of v0.1.12)

The rpg-api-protos have been updated with a **unified Choice system** that replaces all the separate choice types (EquipmentChoice, ProficiencyChoice, LanguageChoice, etc.) with a single, flexible `Choice` type.

### What Changed in the API

1. **Old Structure (REMOVED)**:

   ```typescript
   // These types NO LONGER EXIST in v0.1.12+
   EquipmentChoice;
   ProficiencyChoice;
   LanguageChoice;
   SkillChoice;
   ```

2. **New Unified Structure**:

   ```typescript
   export type Choice = {
     id: string;
     description: string;
     chooseCount: number;
     choiceType: ChoiceType; // EQUIPMENT, PROFICIENCY, LANGUAGE, etc.
     optionSet: ExplicitOptions | CategoryFilter;
   };

   export type ChoiceOption = {
     optionType:
       | { value: ItemReference; case: 'item' }
       | { value: ItemGroup; case: 'group' }
       | { value: NestedChoice; case: 'nestedChoice' };
   };
   ```

3. **Where Choices Live Now**:
   - `ClassInfo.choices: Choice[]` (ALL choices including equipment)
   - `RaceInfo.choices: Choice[]`
   - `Feature.choices: Choice[]`
   - `SubraceInfo.choices: Choice[]`

## Our Current Implementation Status

### What We Have

1. **Equipment API Integration** ✅
   - `useListEquipmentByType` hook works correctly
   - Can fetch weapons by type from the API

2. **Outdated Components** ❌
   - `EquipmentChoiceSelector` expects old `EquipmentChoice[]` type
   - `ClassSelectionModal` tries to access `classInfo.equipmentChoices` (doesn't exist)
   - `InteractiveCharacterSheet` tracks choices in old structure

### The Problem

Our components are built around the old structure where each choice type had its own array and type. Now everything is unified under a single `choices` array that must be filtered by `choiceType`.

## Recommendation: Start Fresh

### Why Start Fresh?

1. **Clean Architecture** - The unified system requires a fundamentally different approach
2. **Type Safety** - New components can be built with proper TypeScript types from the start
3. **Consistency** - All choice types can share the same base components
4. **Less Technical Debt** - Avoid retrofitting old assumptions into new paradigm

### Proposed New Architecture

```
/src/character/creation/choices/
├── UnifiedChoiceSelector.tsx       # Base component for any choice type
├── ChoiceRenderer.tsx              # Renders a single Choice based on type
├── ChoiceOptionRenderer.tsx        # Renders individual options
├── hooks/
│   ├── useChoices.ts              # Filter choices by type from data
│   └── useChoiceSelection.ts      # Handle selection state
└── utils/
    ├── choiceFilters.ts           # Filter choices by ChoiceType
    └── choiceValidation.ts        # Validate selections
```

### Implementation Strategy

1. **Phase 1: Build New Components**

   ```typescript
   // UnifiedChoiceSelector.tsx
   interface UnifiedChoiceSelectorProps {
     choices: Choice[];
     choiceType?: ChoiceType; // Optional filter
     selections: Record<string, string[]>; // choiceId -> selected values
     onSelectionChange: (choiceId: string, values: string[]) => void;
   }
   ```

2. **Phase 2: Create Type-Specific Wrappers**

   ```typescript
   // EquipmentChoices.tsx
   export function EquipmentChoices({ choices, selections, onChange }) {
     const equipmentChoices = choices.filter(c => c.choiceType === ChoiceType.EQUIPMENT);
     return <UnifiedChoiceSelector ... />;
   }
   ```

3. **Phase 3: Update Parent Components**
   - Update `ClassSelectionModal` to use `classInfo.choices`
   - Update selection state to use choice IDs instead of array indices
   - Update draft updates to match new structure

### Migration Checklist

- [ ] Create new unified choice components
- [ ] Update TypeScript types/interfaces
- [ ] Create choice filtering utilities
- [ ] Update ClassSelectionModal
- [ ] Update RaceSelectionModal
- [ ] Update InteractiveCharacterSheet state
- [ ] Update character draft context
- [ ] Remove old choice components
- [ ] Test all choice types thoroughly

## Key Decisions for Next Session

1. **Start Fresh or Refactor?**
   - **Recommendation**: Start fresh with new components
   - Keep old components temporarily for reference
   - Delete old components once new ones are working

2. **State Management**
   - Move from index-based (`equipmentChoices[0]`) to ID-based (`choices['fighter-equipment-1']`)
   - Store selections by choice.id for better tracking

3. **API Integration**
   - Equipment API is ready (`useListEquipmentByType`)
   - May need similar hooks for other choice types

## Next Steps

1. **Create Base Components**
   - Start with `UnifiedChoiceSelector`
   - Build reusable `ChoiceOptionRenderer`

2. **Test with Equipment First**
   - We already have the equipment API working
   - Good test case for the new structure

3. **Expand to Other Types**
   - Proficiencies, Languages, Skills, etc.
   - Each should reuse the same base components

## Code to Reference

The new Choice type structure is in:

- `node_modules/@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb.ts`

Look for:

- `Choice` type definition
- `ChoiceType` enum
- `ChoiceOption` structure
- `ExplicitOptions` vs `CategoryFilter`

## Final Thoughts

This is a significant architectural change that affects the entire character creation flow. Starting fresh with components designed for the unified system will result in cleaner, more maintainable code. The old components can serve as a reference for business logic, but the structure should be completely new.

The unified system is actually more flexible and will make it easier to add new choice types in the future. It's worth taking the time to implement it properly.
