# Combat UI v2

A completely redesigned combat UI system with proper modularity, bulletproof visibility, and extensibility.

## Key Features

- **React Portal Rendering**: All panels render using `createPortal()` outside the normal DOM hierarchy
- **Bulletproof Visibility**: Components cannot be hidden by parent container styles
- **CSS Modules**: Isolated styling with explicit z-index management
- **Protobuf-Driven**: Uses protobuf types as single source of truth
- **Modular Architecture**: Easy to extend and test individual components

## Architecture

```
combat-v2/
├── panels/           # UI panel components
├── hooks/            # Custom React hooks for combat logic
├── styles/           # CSS modules for styling
└── index.ts          # Clean exports
```

## Components

### ActionPanel

The main combat action interface that appears at the bottom of the screen during player turns.

**Key Features:**

- Uses React Portal to render outside DOM hierarchy
- Fixed positioning with z-index 2500
- Debug mode for visibility testing
- Responsive design with mobile support

**Props:**

```typescript
interface ActionPanelProps {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  onMoveAction?: () => void;
  movementMode?: boolean;
  debug?: boolean; // Enable bright colors for testing
}
```

**Usage:**

```tsx
import { ActionPanel } from '@/components/combat-v2';

<ActionPanel
  combatState={combatState}
  encounterId={encounterId}
  selectedCharacters={playerCharacters}
  onMoveAction={handleMovement}
  movementMode={isInMovementMode}
  debug={false}
/>;
```

## Hooks

### usePlayerTurn

Encapsulates logic for determining player turn status and available resources.

**Returns:**

```typescript
interface PlayerTurnInfo {
  isPlayerTurn: boolean;
  currentCharacter: Character | null;
  currentTurn: CombatState['currentTurn'];
  resources: {
    hasAction: boolean;
    hasBonusAction: boolean;
    movementRemaining: number;
    movementMax: number;
  };
}
```

## Z-Index Management

The system uses explicit z-index values to prevent layering issues:

- Modal backdrop: 1000
- Modal content: 1010
- Combat overlays: 2000-2999
- Action panel: 2500
- Debug overlays: 9999

## CSS Variables

The system respects existing CSS variables while providing fallbacks:

- `--bg-primary`: Primary background color
- `--bg-secondary`: Secondary background color
- `--text-primary`: Primary text color
- `--text-muted`: Muted text color
- `--accent-primary`: Primary accent color
- `--border-color`: Border color

## Testing Visibility

Enable debug mode to test visibility:

```tsx
<ActionPanel debug={true} {...otherProps} />
```

Debug mode applies:

- Bright magenta background
- Yellow border
- High contrast text
- Green borders on buttons

## Future Extensions

The modular architecture supports easy addition of:

- `InitiativePanel`: Turn order display
- `ResourcePanel`: Health/spell slots tracking
- `CombatUIProvider`: Context for shared state
- `CombatUIContainer`: Layout coordinator
