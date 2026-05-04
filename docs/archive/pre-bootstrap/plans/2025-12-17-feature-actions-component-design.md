# Feature Actions Component Design

**Date:** 2025-12-17
**Status:** Approved
**Scope:** Combat panel refactor for class feature activation

## Problem

The current combat UI has issues:

- Hardcoded `classActions.ts` arrays show features regardless of character level (e.g., level 1 barbarian sees Reckless Attack)
- Class-specific logic scattered across components
- Panel is crowded with duplicated character info and oversized equipment slots
- No display of active conditions

## Solution

Replace hardcoded class action logic with generic components that render from API data. The API is the source of truth for what features a character can activate.

## Data Model

### What the API sends

```typescript
// character.features[] - what you CAN activate
CharacterFeature {
  id: string              // "rage"
  name: string            // "Rage"
  description: string     // Full text
  source: string          // "dnd5e:classes:barbarian" (ref format)
  level: number           // Level gained
  action_type: string     // "bonus_action", "action", "reaction", "free"
  data: object            // { uses_remaining: 2, max_uses: 3 } (via #303)
}

// character.active_conditions[] - what's AFFECTING you
ActiveCondition {
  id: string              // "raging"
  name: string            // "Raging"
  source: string          // "dnd5e:classes:barbarian"
}
```

### Client-side lookup (presentation only)

```typescript
// Icons keyed by feature/condition id
const FEATURE_ICONS: Record<string, string> = {
  rage: '🔥',
  reckless_attack: '💥',
  second_wind: '💨',
  sneak_attack: '🗡️',
};
```

### Deriving category from source ref

Parse the second segment of the ref to determine styling:

- `dnd5e:classes:*` → class feature styling
- `dnd5e:fighting-styles:*` → passive/always-on styling
- `dnd5e:conditions:*` → debuff styling

## Component Structure

```
src/components/features/
├── FeatureActions.tsx      # Renders activatable features as buttons
├── FeatureActionButton.tsx # Single button with icon, label, usage
├── ConditionsDisplay.tsx   # Shows active conditions on character
├── ConditionBadge.tsx      # Single condition with styling by source type
├── EquipmentSlots.tsx      # Compact icons with tooltips
└── featureIcons.ts         # Client-side icon lookup map
```

### FeatureActions.tsx

- Takes `features: CharacterFeature[]` from character
- Groups by `action_type` for visual organization
- Renders `FeatureActionButton` for each
- Handles click → dispatches activation to API

### FeatureActionButton.tsx

- Shows icon (from lookup), name, usage if applicable ("2/3")
- Disabled state when `uses_remaining === 0`
- Single click to activate (one-shot, no toggle)

### ConditionsDisplay.tsx

- Takes `active_conditions: ActiveCondition[]` from character
- Renders `ConditionBadge` for each
- Display only (no dismiss for MVP)

### ConditionBadge.tsx

- Parses source ref to determine styling
- Shows icon, name

### EquipmentSlots.tsx

- Compact icons for Main Hand / Off Hand
- Tooltip shows item name + stats on hover
- Empty slot = dimmed/outline icon

## Data Flow

### Activation flow

```
FeatureActionButton (click)
    ↓
dispatch activateFeature({ featureId: 'rage', characterId })
    ↓
API call: ActivateFeature RPC
    ↓
API/Toolkit applies "raging" condition to character
    ↓
Response or refetch GetCharacter
    ↓
character.active_conditions now includes "raging"
    ↓
ConditionsDisplay updates to show Raging badge
character.features[rage].data.uses_remaining decrements
```

## Combat Panel Layout

```
┌─────────────────────────────────────────────────────────┐
│  Standre The Giant                    HP ████████ 15/15 │
│  Level 1 Barbarian    AC 12   [🗡️] [🛡️]   [CON] [STR]  │
│                                 ↑     ↑                 │
│                          Main  Off (tooltips on hover)  │
├─────────────────────────────────────────────────────────┤
│  [🔥 Raging] [💪 GWF]                                   │  ← Conditions row
├─────────────────────────────────────────────────────────┤
│  MOVEMENT          ACTION      BONUS      REACTION      │
│  ████░░ 20/30ft      ●          ●           ●          │
├─────────────────────────────────────────────────────────┤
│  ⚔️ Attack    🚶 Move    🔥 Rage (3/3)    🎒 Inventory  │
│                                                         │
│                     [End Turn]                          │
└─────────────────────────────────────────────────────────┘
```

## What Gets Modified

### New components

- `FeatureActions.tsx`
- `FeatureActionButton.tsx`
- `ConditionsDisplay.tsx`
- `ConditionBadge.tsx`
- `EquipmentSlots.tsx`
- `featureIcons.ts`

### Modified

- `ActionPanel.tsx` - new layout using above components

### Deleted

- `classActions.ts` - hardcoded action arrays
- `DynamicActionButtons.tsx` - replaced by FeatureActions

## API Dependencies

- `action_type` field on `CharacterFeature` (needed to group buttons)
- Issue #303 for usage data (can stub for MVP)

## Out of Scope

- Condition dismiss functionality
- Character sheet conditions display (combat panel first)

## Classes Supported (MVP)

- Fighter
- Barbarian
- Monk
- Rogue
