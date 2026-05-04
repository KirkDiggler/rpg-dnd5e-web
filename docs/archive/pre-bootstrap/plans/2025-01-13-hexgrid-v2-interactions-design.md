# HexGridV2 Interactions Design

## Overview

Enhance HexGridV2 with tactical RPG-style movement and combat interactions. The goal is an intuitive "always ready" system where clicking the map handles movement and attacks directly, with rich visual feedback.

## Core Interaction Model

### The "Always Ready" Turn System

When it's your turn, you're immediately ready to act. No mode buttons needed.

**Hover behavior:**

- Hover empty hex → path preview highlights (hex-by-hex route)
- Hover enemy → path to nearest adjacent hex + attack indicator on enemy
- Path preview respects remaining movement (won't show paths beyond range)

**Click behavior:**

- Click empty hex → execute move along the previewed path
- Click enemy → move to adjacent hex, then attack
- Click ally → select them (for inspection, future healing spells, etc.)

**Movement tracking:**

- Each hex moved costs 5ft
- Path is recorded for trap detection (server receives full path, not just destination)
- Movement remaining updates in real-time as you move

## Visual Elements

### Movement Range Border

A glowing perimeter around all reachable hexes:

- Calculated from current position + remaining movement
- Only outward-facing edges of boundary hexes glow (continuous border line)
- Updates dynamically as you move (shrinks as movement depletes)
- Color: soft blue/cyan glow

### Path Preview

When hovering:

- Hexes along the path get a subtle highlight
- Direction arrows or stepping stones effect (optional)
- Final destination hex has stronger highlight

### Attack Indicator

When hovering an enemy within move+attack range:

- Path shows to adjacent hex
- Enemy gets red tint or crosshair/sword icon overlay
- Clear visual: "click = move AND attack"

### Out-of-Range Feedback

When hovering beyond movement range:

- No path preview shown (or faded/red path)
- Cursor indicates "can't reach"

## Turn Order Overlay

### Compact Horizontal Strip at Top

Position: top-center of hex grid canvas, floating over the map

**Layout:**

- Current turn combatant in center (larger, highlighted)
- 2-3 upcoming turns to the right (smaller)
- 1-2 previous turns to the left (smaller, slightly faded)

**Each combatant shows:**

- Class emoji for players (⚔️ Fighter, 🪓 Barbarian, etc.)
- Monster-specific emoji when available (💀 skeleton, 👺 goblin) or generic 👹
- Name underneath
- HP bar (thin strip below)
- Active turn indicator (glow/border on current)

**Turn Transition Animation:**

- When turn changes, strip slides left (carousel effect)
- New current combatant scales up to center position

**Minimal footprint:**

- Semi-transparent background
- ~60-80px tall
- Doesn't obscure much of the map

## Action Panel (Bottom)

Simplified from existing ActionPanel - map handles move/attack directly now.

**Left Section - Character Status:**

- Name + class emoji
- HP / AC
- Saving throw modifiers
- Active conditions as badges (Dueling, Raging, etc.)

**Center Section - Resources:**

- Movement bar (visual bar showing remaining/max)
- Action indicator (✓ or ✗)
- Bonus Action indicator (✓ or ✗)

**Right Section - Actions:**

- 🎒 Backpack button
- End Turn button
- Future: class feature buttons (Rage, Second Wind, etc.)

**Combat Log:**

- Scrollable history below/beside the panel
- Shows attack results, damage, movement, etc.

## Data Flow & API

### Path Execution

When player clicks to move:

1. Client sends full path (array of cube coords) to server
2. Server processes each step (checks for traps, opportunity attacks)
3. Server returns: final position, triggered events, updated combat state
4. Client updates entity position and resources

### Attack Execution

When player clicks enemy:

1. Client sends: path to adjacent hex + attack target
2. Server: executes move, then processes attack
3. Server returns: move result, attack result, updated state

### State Source of Truth

- Server owns all game state
- Client shows optimistic path preview but waits for server confirmation
- CombatState protobuf remains the contract

## Implementation Scope

### Must Have (Core v2)

1. Path preview on hover (A\* pathfinding)
2. Click-to-move execution
3. Click-enemy for move + attack
4. Movement range border (glowing perimeter)
5. Turn order overlay (horizontal strip at top)

### Should Have

1. Attack indicator on enemy hover
2. Turn carousel animation
3. Out-of-range visual feedback

### Nice to Have (defer)

1. Monster-specific emojis (start with generic)
2. Smooth path animation (entity slides vs teleports)

### Already Exists (reuse)

- ActionPanel structure (slim down buttons)
- usePlayerTurn hook
- Combat log
- hexMath utilities (cubeToWorld, worldToCube, hexDistance)
