# Hover Info Panel Design

## Overview

Add a hover info panel to the left side of the bottom action panel. Shows tactical information about entities on the hex grid.

## Behavior

- **Default (not hovering)**: Shows current turn character info
- **On hover**: Switches to show hovered entity info
- **Color-coded border**: Red for enemies, blue/green for allies

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│                      Battle Map                              │
├──────────────┬─────────────────────────┬────────────────────┤
│  Hover Info  │  Character Status/Actions │   Combat Log     │
│  (Left)      │       (Center)            │    (Right)       │
└──────────────┴─────────────────────────┴────────────────────┘
```

## Content Display

### Player Characters (current turn or allies)

```
┌─────────────────┐
│ Gruk the Strong │  ← Name
│ Fighter · Lvl 3 │  ← Class/Level
│ ♥ 28/32  AC 16  │  ← HP and AC
│ 🔥 Raging       │  ← Active conditions (if any)
└─────────────────┘
```

Border: Blue/green

### Monsters/Enemies

```
┌─────────────────┐
│ Goblin          │  ← Name (formatted from entityId)
│ Enemy           │  ← Type label
└─────────────────┘
```

Border: Red

## Data Flow

1. `HexGrid` already tracks `hoveredEntity: { id: string; type: string }` via `useHexInteraction`
2. Surface `hoveredEntity` up to `EncounterDemo` via new callback prop
3. Pass to `ActionPanelV2` along with character/monster lookup data
4. `HoverInfoPanel` component renders the appropriate content

## Implementation

1. Add `onHoverChange` callback to `HexGrid` props
2. Create `HoverInfoPanel` component in `combat-v2/panels/`
3. Integrate into `ActionPanelV2` layout (left section)
4. Wire up in `EncounterDemo`

## Future Enhancements (not in scope)

- Monster conditions display
- Attack of opportunity indicators
- Threat range visualization
- HP bars for monsters (fog of war reveal)
