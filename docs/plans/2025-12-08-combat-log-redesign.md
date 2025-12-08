# Combat Log Redesign

## Problem

The current combat log is too sparse to be useful. It shows:

- Action type (Attack Hit/Miss)
- Dice roll
- Target name
- Total damage with a small badge

Users can't understand _why_ an attack hit/missed or see the damage breakdown without hovering for a tooltip.

## Design

### Collapsed State (Default)

```
⚔️ Attack Hit                         Round 1
   19 +5 = 24 → Goblin (AC 15)  🔨5 +💪3 +⚔️2 = 10 bludg.
```

**Line 1:** Action icon + result text + round (right-aligned)

**Line 2:** Full attack and damage formula:

- `19` - Natural roll (styled: red for nat 1, gold for nat 20)
- `+5` - Attack modifier
- `= 24` - Total
- `→ Goblin (AC 15)` - Target with AC
- `🔨5 +💪3 +⚔️2` - Damage sources with icons and values
- `= 10 bludg.` - Total damage and type (abbreviated)

**Miss example:**

```
⚔️ Attack Miss                        Round 1
   4 +5 = 9 → Goblin (AC 15)
```

No damage section since it missed. Instantly clear why (9 < 15).

### Expanded State (Click to Toggle)

```
⚔️ Attack Hit                         Round 1
   19 +5 = 24 → Goblin (AC 15)
   ────────────────────
   🔨 Warhammer      (5)
   💪 Strength       +3
   ⚔️ Dueling        +2
   ────────────────────
   Total: 10 bludgeoning
```

- Full source names with values right-aligned
- Separator lines for visual clarity
- Full damage type name (not abbreviated)
- Click anywhere on entry to collapse

### Interaction

- **Click anywhere** on entry to expand/collapse
- Cursor changes to pointer on hover
- Only one entry can be expanded at a time (optional, can revisit)
- **Remove tooltip** - expanded view shows all the info

### Source Icons

| Source Type    | Icon | Example               |
| -------------- | ---- | --------------------- |
| Weapon         | 🔨   | Warhammer dice        |
| Strength       | 💪   | Ability modifier      |
| Dexterity      | 🎯   | Ability modifier      |
| Fighting Style | ⚔️   | Dueling, Great Weapon |
| Sneak Attack   | 🗡️   | Rogue feature         |
| Rage           | 💢   | Barbarian feature     |
| Spell          | ✨   | Spell damage          |

## Implementation Notes

### Data Available

From `CombatLogEntry.details.damageBreakdown.components`:

- `sourceRef` - Type-safe source (weapon/ability/condition/feature/spell)
- `finalDiceRolls` - Array of dice results
- `flatBonus` - Flat modifier
- `damageType` - Type of damage

From `CombatLogEntry.details`:

- `attackRoll` - Natural d20 roll
- `attackTotal` - Total after modifiers
- `targetAc` - Target's AC

### Files to Modify

1. `src/components/combat-v2/panels/CombatHistorySidebar.tsx`
   - Add `expanded` state tracking (entry ID or null)
   - Update entry rendering for collapsed/expanded views
   - Remove `title` attribute (tooltip)
   - Add click handler for toggle

2. `src/components/combat-v2/styles/combat.module.css`
   - Add styles for expanded state
   - Add separator line styles
   - Add cursor pointer for entries

3. Potentially extract `CombatLogEntry` component for cleaner code

### Edge Cases

- **Critical hits**: Show with special styling (gold border or glow)
- **Multiple damage types**: Show each type in breakdown
- **Very long weapon names**: Truncate with ellipsis in collapsed, full in expanded
- **No damage breakdown data**: Fall back to simple display (backwards compat)
