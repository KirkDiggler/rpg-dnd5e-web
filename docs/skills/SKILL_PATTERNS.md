# Skill Patterns for rpg-dnd5e-web

This document captures common patterns and friction points discovered during development that should be codified into reusable skills or templates.

## Background

Similar to how `rpg-api` and `rpg-toolkit` have skill systems for common patterns, we need to create a skill system for the React frontend to reduce boilerplate and ensure consistency.

## Discovered Patterns

### Pattern 1: Modal Selection Integration

**Use Case**: Adding a new selection modal (Race, Class, Background, etc.)

**Current Friction**:

- Requires 6-8 separate code additions across the file
- Easy to miss a step or get naming inconsistent
- Lots of boilerplate that's nearly identical each time

**Repeated Code Pattern**:

```typescript
// 1. Import the modal component
import { XSelectionModal } from '../XSelectionModal';

// 2. Import necessary types
import type { XInfo } from '@kirkdiggler/rpg-api-protos/...';

// 3. Add state for modal visibility
const [showXModal, setShowXModal] = useState(false);

// 4. Add state for selected data
const [selectedXData, setSelectedXData] = useState<XInfo | null>(null);

// 5. Add handler function
const handleXSelect = async (xData: XInfo) => {
  setSelectedXData(xData);
  await setX(xData);
  setShowXModal(false);
};

// 6. Add clickable card
<motion.div
  whileHover={{ scale: 1.02 }}
  className="cursor-pointer"
  onClick={() => setShowXModal(true)}
>
  {/* Card content */}
</motion.div>

// 7. Add modal component
<XSelectionModal
  isOpen={showXModal}
  currentX={selectedXData?.name}
  onSelect={handleXSelect}
  onClose={() => setShowXModal(false)}
/>
```

**Skill Suggestion**:

- Skill name: `add-modal-selection`
- Input: entity name (e.g., "Background"), proto type
- Output: All boilerplate code generated with proper naming

---

### Pattern 2: Proto Enum Display

**Use Case**: Converting proto enums to display strings

**Current Friction**:

- Every enum needs manual conversion logic
- UNSPECIFIED case handling is repetitive
- Formatting (underscores, capitalization) is manual

**Repeated Code Pattern**:

```typescript
// Common pattern for enum display
function getXDisplayName(xEnum: XEnum): string {
  const xNames: Record<XEnum, string> = {
    [XEnum.UNSPECIFIED]: 'Unknown',
    [XEnum.VALUE_ONE]: 'Value One',
    [XEnum.VALUE_TWO]: 'Value Two',
    // ...
  };
  return xNames[xEnum] || 'Unknown';
}

// Alternative: Object.entries approach
Object.entries(XEnum)
  .filter(([_, value]) => value !== XEnum.UNSPECIFIED)
  .map(([key, value]) => ({
    value,
    label: key
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase()),
  }));
```

**Skill Suggestion**:

- Skill name: `proto-enum-display`
- Input: enum type from protos
- Output: Display conversion utility or hook
- Alternative: Could be a general utility in `src/utils/enumDisplay.ts` that's extended

---

### Pattern 3: Card-Based Selection UI

**Use Case**: Creating selection cards (Race, Class, Background cards)

**Current Friction**:

- Each card has same structure but implemented separately
- Conditional styling is repetitive
- Badge display pattern is duplicated

**Repeated Code Pattern**:

```typescript
<motion.div
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  className="cursor-pointer"
  onClick={() => setShowModal(true)}
>
  <div
    className="game-card p-6 border-2"
    style={{
      borderColor: selected ? 'var(--accent-primary)' : 'var(--border-primary)',
      backgroundColor: selected ? 'var(--card-bg)' : 'var(--bg-secondary)',
    }}
  >
    {/* Icon/Emoji */}
    <div className="text-4xl mb-4">{icon}</div>

    {/* Title */}
    <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
      {selected ? selected.name : 'Choose X'}
    </h3>

    {/* Traits/Badges */}
    {selected && (
      <div className="flex flex-wrap gap-2 mt-4">
        {traits.map(trait => (
          <TraitBadge key={trait} name={trait} type="..." icon="..." />
        ))}
      </div>
    )}

    {/* Helper text */}
    <p className="text-xs text-muted">
      {selected ? 'Click to change' : 'Select your X'}
    </p>
  </div>
</motion.div>
```

**Skill Suggestion**:

- Component name: `SelectionCard`
- Props: `{ icon, title, selected, traits, onSelect, emptyText }`
- Handles all conditional styling and layout

---

### Pattern 4: API-Driven Progress Tracking

**Use Case**: Creating progress steps that reflect API state

**Current Friction**:

- Manually tracking completion state is error-prone
- Computing step status based on previous steps is repetitive
- Dependency arrays get complex

**Repeated Code Pattern**:

```typescript
const steps = useMemo<Step[]>(() => {
  const progress = draft.draft?.progress;

  return [
    {
      id: 'step1',
      label: 'Step 1',
      status: progress?.hasStep1 ? 'completed' : 'current',
    },
    {
      id: 'step2',
      label: 'Step 2',
      status: progress?.hasStep2
        ? 'completed'
        : progress?.hasStep1
          ? 'current'
          : 'upcoming',
    },
    // ... more steps
  ];
}, [draft.draft?.progress]);
```

**Skill Suggestion**:

- Helper name: `useProgressSteps`
- Input: progress object from API, step definitions
- Output: Computed step array with correct statuses

---

### Pattern 5: Context Migration

**Use Case**: Migrating from old context pattern to new pattern

**Current Friction**:

- Have to find all usages manually
- Easy to miss a call or import
- Dependency arrays need updating

**Steps Required**:

1. Find all usages of old context hook
2. Remove old context import
3. Remove old context hook call
4. Remove all calls to old context methods
5. Update dependency arrays to remove old methods

**Skill Suggestion**:

- Skill name: `migrate-context`
- Type: Codemod or automated refactor script
- Input: old context name, new context name, method mapping
- Output: Automated migration

---

## Key Metrics

From the background selection feature implementation:

- **Code Reduction**: InteractiveCharacterSheet reduced from 1660 to 749 lines (55% reduction)
- **Dead Code Found**:
  - 7 unused helper functions
  - 5 unused imports
  - 2 unused state variables
- **Repeated Patterns**: Modal selection pattern used 3 times (Race, Class, Background)

## Priority for Skill Development

1. **High Priority**: Modal Selection Integration (most common, most boilerplate)
2. **High Priority**: Card-Based Selection UI (used everywhere, easy to make reusable)
3. **Medium Priority**: Proto Enum Display (useful utility, could be in toolkit)
4. **Medium Priority**: API-Driven Progress (specific to this app, but valuable)
5. **Low Priority**: Context Migration (one-time need, but automatable)

## Implementation Notes

- Skills should follow the same pattern as `rpg-api` and `rpg-toolkit`
- Could be implemented as:
  - Plop templates for code generation
  - Custom React hooks for reusable logic
  - Shared components in `src/components/common/`
  - CLI tools for migrations/refactors

## Next Steps

1. Review these patterns with the team
2. Decide on skill implementation approach (Plop vs hooks vs components)
3. Start with highest priority patterns
4. Document in main `CLAUDE.md` when available
