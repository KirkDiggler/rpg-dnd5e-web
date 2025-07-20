# Next Session: Spell Lists & Background Equipment (Issue #60)

## 🚨 CRITICAL: Unified Choice System Update

**The proto structure has fundamentally changed in v0.1.12!**

The old `EquipmentChoice`, `ProficiencyChoice`, etc. types are GONE. There's now a unified `Choice` type for everything. Our current implementation is using the old structure and will not work with the new API.

**See `NEXT_SESSION_UNIFIED_CHOICES.md` for complete migration guide.**

Consider starting fresh with new components designed for the unified system rather than trying to retrofit the old ones.

## Current State

We just completed a major PR (#58) that implements character creation choices:

- Race/class selection with visual carousel
- Proficiency and language choices with duplicate prevention
- Equipment choices with weapon/item selection (✅ ALREADY DISPLAYING)
- Independent state management per class/race
- Fixed API breaking changes from proto v0.1.8

**Note**: Equipment selection and display is already implemented and working!

## Next Task: Spell Lists Display

**Issue**: #60 - feat: Add spell lists and background equipment to character sheet

### Requirements

1. **Spell Display** (for spellcasting classes) - PRIMARY FOCUS:
   - Show spellcasting ability and focus
   - Display cantrips known count
   - Display spells known/prepared count
   - Show spell slots available
   - Only visible for classes with spellcasting ability

2. **Background Equipment** (BLOCKED on #47):
   - Will add equipment from background selection
   - Integrate with existing equipment display
   - Need background selection implemented first

### Key Technical Points

#### Proto Support

The protos (v0.1.8) already have the data structures:

```typescript
// ClassInfo has:
starting_equipment: string[]
equipment_choices: EquipmentChoice[]
spellcasting: SpellcastingInfo

// BackgroundInfo has:
starting_equipment: string[]

// SpellcastingInfo has:
spellcasting_ability: string
ritual_casting: boolean
spellcasting_focus: string
cantrips_known: number
spells_known: number
spell_slots_level_1: number
```

#### Current Architecture

- **CharacterDraftContext**: Manages draft state with enum values for API
- **InteractiveCharacterSheet**: Main display component
- **Modals**: RaceSelectionModal, ClassSelectionModal handle choices
- **Equipment Choices**: Already tracked in `equipmentChoices` state

#### Files to Reference

1. `/src/character/creation/InteractiveCharacterSheet.tsx` - Main sheet
2. `/src/character/creation/CharacterDraftContext.tsx` - State management
3. `/src/character/creation/components/ProficiencyList.tsx` - Similar component pattern
4. `/src/character/creation/ClassSelectionModal.tsx` - Has equipment choice tracking

### Implementation Plan

1. **Add Equipment Section to Character Sheet**
   - Create new component similar to ProficiencyList
   - Pull equipment from:
     - `classInfo.startingEquipment`
     - `classInfo.equipmentChoices` + user selections
     - `backgroundInfo.startingEquipment` (when implemented)
   - Use existing dark card styling

2. **Add Spell Section**
   - Only render if `classInfo.spellcasting` exists
   - Show spellcasting details (ability, focus, etc.)
   - Display spell slot information
   - Prepare for future spell selection

3. **Update Context if Needed**
   - Equipment choices already tracked
   - May need to add spell choices later

### UI/UX Guidelines

- Follow existing patterns from ProficiencyList
- Use collapsible sections like current implementation
- Dark card theme with borders (--bg-secondary)
- Group by source (Class, Background, Chosen)
- Click to expand/collapse sections

### Current Equipment Choice State

Equipment choices are already being tracked in:

- `ClassSelectionModal`: `equipmentChoices` state
- Stored as `Record<number, string>` mapping choice index to selection
- Example: `{0: "greataxe", 1: "handaxe:2"}`

### Out of Scope for This Task

- Inventory management (drag/drop)
- Spell selection interface
- Equipment stats/details
- Spell descriptions
- Adding/removing items

This is display-only for Phase 1.

## Setup Commands

```bash
git checkout main
git pull
gh pr checkout 58  # or start fresh branch
npm install
npm run dev
```

## Testing Focus

1. Equipment displays correctly for martial classes
2. Spell info shows only for spellcasters
3. Equipment choices are reflected properly
4. UI matches existing dark card patterns
5. Sections are collapsible and organized

## Related Issues

- Epic #32: Equipment & Inventory Management (future work)
- Issue #47: Background selection (will add more equipment)
- Issue #56: Class-specific features (may overlap with spells)
