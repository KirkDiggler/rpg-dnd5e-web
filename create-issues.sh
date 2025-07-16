#!/bin/bash

# Script to create GitHub issues for Phase 1 milestone

MILESTONE="Phase 1: Interactive Character Creation Foundation"

echo "Creating GitHub issues for $MILESTONE..."

# Issue 1: ChoiceCard Component
gh issue create \
  --title "Create ChoiceCard Component" \
  --milestone "$MILESTONE" \
  --label "enhancement,component,ui" \
  --body "Large, interactive card component for selecting races, classes, and backgrounds. Replaces dropdown-based selection with engaging visual experience.

**Requirements:**
- Large card format (minimum 200px width)
- Image/icon placeholder, title, subtitle, preview text
- Rarity-based visual styling and hover animations
- Selected and disabled states
- Click handlers for selection and detail modal
- Keyboard navigation and accessibility support
- Loading and error states

**Priority:** High
**Estimated effort:** 2-3 days"

# Issue 2: DetailModal Component
gh issue create \
  --title "Create DetailModal Component with Carousel" \
  --milestone "$MILESTONE" \
  --label "enhancement,component,ui,modal" \
  --body "Full-screen modal displaying detailed information about character options with carousel for browsing between options.

**Requirements:**
- Full-screen overlay with smooth animations
- Horizontal carousel with touch/swipe support
- Hero image, detailed description, mechanics section
- Features list with expand/collapse
- Navigation controls and keyboard support
- Mobile-friendly responsive design

**Priority:** High
**Estimated effort:** 4-5 days"

# Issue 3: AnimatedStat Component
gh issue create \
  --title "Create AnimatedStat Component" \
  --milestone "$MILESTONE" \
  --label "enhancement,component,ui,animation" \
  --body "Animated component for displaying ability scores with smooth transitions, bonus indicators, and visual feedback.

**Requirements:**
- Circular or card-based stat display
- Number count-up animation when value changes
- Bonus/penalty slide-in animations
- Glow effect for modified stats
- Click for bonus breakdown, hover tooltip
- Loading shimmer for undefined values

**Priority:** High
**Estimated effort:** 2-3 days"

# Issue 4: TraitBadge Component
gh issue create \
  --title "Create TraitBadge Component" \
  --milestone "$MILESTONE" \
  --label "enhancement,component,ui" \
  --body "Visual component for displaying character traits, features, and abilities as attractive badges.

**Requirements:**
- Compact badge format with icon and text
- Color coding by trait type (racial, class, background, feat)
- Rarity-based styling and hover states
- Click to select/deselect, hover tooltip
- Animation effects for appearance/removal

**Priority:** Medium
**Estimated effort:** 1-2 days"

# Issue 5: Character Builder Context
gh issue create \
  --title "Create Character Builder Context and State Management" \
  --milestone "$MILESTONE" \
  --label "enhancement,state-management,context" \
  --body "React context and hooks for managing character creation state, including draft synchronization, section navigation, and preview mode.

**Requirements:**
- CharacterCreationProvider context
- useCharacterBuilder hook for state management
- Section navigation with validation
- Preview mode for trying options without committing
- Optimistic updates with server sync
- Error handling and retry logic

**Priority:** High
**Estimated effort:** 3-4 days"

# Issue 6: Update Wizard
gh issue create \
  --title "Update Character Creation Wizard to Use New Components" \
  --milestone "$MILESTONE" \
  --label "enhancement,refactor,integration" \
  --body "Refactor existing CharacterCreationWizard to use new interactive components while maintaining existing functionality.

**Requirements:**
- Replace dropdown race/class selection with ChoiceCard grids
- Integrate DetailModal for option exploration
- Update ability score display to use AnimatedStat
- Maintain existing API integration
- Preserve accessibility and mobile support
- Smooth migration path from current implementation

**Priority:** Medium
**Estimated effort:** 2-3 days"

# Issue 7: Interactive Character Sheet
gh issue create \
  --title "Create Interactive Character Sheet Component" \
  --milestone "$MILESTONE" \
  --label "enhancement,component,ui" \
  --body "Enhanced character sheet that serves as a live preview during character creation.

**Requirements:**
- Real-time updates as selections change
- AnimatedStat integration for ability scores
- TraitBadge lists for features and traits
- Collapsible sections for organization
- Highlight new/changed elements
- Print-friendly styling option

**Priority:** Medium
**Estimated effort:** 3-4 days"

# Issue 8: Theme System Updates
gh issue create \
  --title "Add Theme System Support for New Components" \
  --milestone "$MILESTONE" \
  --label "enhancement,theme,styling" \
  --body "Extend existing theme system to support new interactive components with proper color schemes and animations.

**Requirements:**
- Rarity-based color definitions
- Glow effect CSS variables
- Animation timing constants
- Component-specific theme tokens
- Dark/light mode support
- Accessibility contrast compliance

**Priority:** Medium
**Estimated effort:** 1-2 days"

echo "All issues created successfully!"
echo "View milestone: https://github.com/KirkDiggler/rpg-dnd5e-web/milestone/2"