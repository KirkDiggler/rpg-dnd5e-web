# Combat UI System

A clean, modular, and extensible combat interface system for D&D 5e encounters.

## Architecture Overview

The combat UI system follows React best practices and uses protobuf types as the single source of truth. It's designed to be:

- **Reliable**: Simple, predictable rendering without complex CSS dependencies
- **Extensible**: Easy to add new panels for future features
- **Type-safe**: Uses protobuf-generated types directly
- **Maintainable**: Clear separation of concerns and modular design

## Core Components

### CombatOverlay

The main orchestrator for all combat UI elements. Manages visibility and interaction of combat panels.

```tsx
<CombatOverlay
  combatState={combatState}
  encounterId={encounterId}
  selectedCharacters={selectedCharacters}
  movementMode={movementMode}
  onActionComplete={handleTurnComplete}
  onCombatStateUpdate={handleCombatStateUpdate}
  onMoveAction={handleMoveAction}
/>
```

**Key Features:**

- Only shows action panel during player turns
- Always shows auxiliary panels during combat
- Development debug panel in dev mode
- Extensible architecture for future panels

### CombatPanelBase

Base component providing consistent styling and behavior for all combat panels.

```tsx
<CombatPanelBase title="Panel Title" onClose={handleClose} collapsible={true}>
  {/* Panel content */}
</CombatPanelBase>
```

**Features:**

- Consistent styling across all panels
- Built-in close/collapse functionality
- Extensible for custom behaviors

### Panel Positioning System

Predefined positions for different types of panels:

- `bottom-center`: Main action panel
- `top-left`: Debug information
- `top-right`: Combat history
- `bottom-left`: Health tracking
- `bottom-right`: Timeline/turn order
- `center`: Modal dialogs

## Existing Panels

### 1. CombatActionPanel (Main)

The primary interface for player actions during their turn.

**Features:**

- Move, Attack, Spell, and Ability actions
- Resource tracking (Movement, Action, Bonus Action)
- Turn ending functionality
- Visual indicators for active actions

**Protobuf Usage:**

- `currentTurn.actionUsed` - Action availability
- `currentTurn.bonusActionUsed` - Bonus action availability
- `currentTurn.movementMax/movementUsed` - Movement tracking
- `character.currentHitPoints` - Health display
- `character.combatStats.armorClass` - AC display

### 2. DebugPanel (Development)

Shows technical information during development.

**Features:**

- Combat state inspection
- Turn order visualization
- Resource usage debugging
- Player character tracking

### 3. CombatHistoryPanel

Logs combat actions and provides turn history.

**Features:**

- Action logging with timestamps
- Collapsible interface
- Filterable by action type
- Round-based organization

### 4. HealthTrackingPanel

Manages health status for all characters.

**Features:**

- Visual health bars
- Quick heal actions
- Current turn highlighting
- AC display

## Adding New Panels

To add a new combat panel:

1. **Create the Panel Component**:

```tsx
// src/components/combat/panels/YourPanel.tsx
import { CombatPanelBase, getPanelPositionClasses } from '../CombatPanelBase';
import type { CombatState, Character } from '@kirkdiggler/rpg-api-protos/...';

export function YourPanel({ combatState, isVisible, onToggle }) {
  if (!isVisible) return null;

  return (
    <div
      className={getPanelPositionClasses('position')}
      style={{ zIndex: 900 }}
    >
      <CombatPanelBase title="Your Panel" onClose={onToggle}>
        {/* Your panel content */}
      </CombatPanelBase>
    </div>
  );
}
```

2. **Add to CombatOverlay**:

```tsx
// Add state
const [showYourPanel, setShowYourPanel] = useState(false);

// Add to auxiliary panels section
<YourPanel
  combatState={combatState}
  isVisible={showYourPanel}
  onToggle={() => setShowYourPanel(!showYourPanel)}
/>;
```

3. **Export from index.ts**:

```tsx
export { YourPanel } from './panels/YourPanel';
```

## Design Principles

### 1. Protobuf-First

Always use protobuf types directly:

```tsx
// ✅ Good - Direct protobuf usage
const hasAction = !currentTurn.actionUsed;
const hp = character.currentHitPoints;

// ❌ Avoid - Creating duplicate interfaces
interface LocalCharacter {
  name: string;
  hp: number;
}
```

### 2. Simple Styling

Use Tailwind classes directly, avoid complex CSS-in-JS:

```tsx
// ✅ Good - Simple, predictable
<div className="bg-slate-800 border-2 border-blue-500 rounded-xl">

// ❌ Avoid - Complex CSS-in-JS
<div style={{
  background: 'var(--complex-gradient)',
  border: '2px solid var(--dynamic-color)'
}}>
```

### 3. Reliable Positioning

Use the positioning system for consistent layout:

```tsx
// ✅ Good - Using position system
<div className={getPanelPositionClasses('top-right')}>

// ❌ Avoid - Manual positioning
<div className="absolute top-4 right-4" style={{ zIndex: 999999 }}>
```

### 4. Clear State Management

Keep panel visibility state in CombatOverlay:

```tsx
// ✅ Good - Centralized state
const [showPanel, setShowPanel] = useState(false);

// ❌ Avoid - Distributed state
// Each panel managing its own visibility separately
```

## Troubleshooting

### Panel Not Visible

1. Check z-index values (use 900-1000 range)
2. Verify panel visibility state
3. Ensure proper positioning classes
4. Check for CSS conflicts

### Protobuf Type Errors

1. Verify import paths match your protobuf package version
2. Use optional chaining for nullable fields: `character?.combatStats?.armorClass`
3. Provide defaults: `character.currentHitPoints || 0`

### Performance Issues

1. Use React.memo for expensive panels
2. Implement proper key props for list items
3. Debounce frequent updates
4. Consider virtualization for long lists

## Future Enhancements

Planned panel additions:

- **EncounterTimelinePanel**: Visual turn order timeline
- **SpellTrackingPanel**: Spell slot management
- **ConditionPanel**: Status effects and conditions
- **NotesPanel**: Combat notes and reminders
- **DiceHistoryPanel**: Roll history and statistics

The modular architecture makes these additions straightforward using the established patterns.
