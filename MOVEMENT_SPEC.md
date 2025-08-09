# D&D 5e Turn-Based Movement System Specification

## Overview

This document specifies the minimum requirements for implementing D&D 5e turn-based movement across the RPG ecosystem (rpg-toolkit, rpg-api, rpg-api-protos, rpg-dnd5e-web).

## D&D 5e Movement Rules Summary

### Initiative System

- **Initiative Roll**: 1d20 + Dexterity modifier
- **Turn Order**: Highest to lowest initiative
- **Tie Breaking**: Equal initiatives compare Dexterity scores, or DM decides
- **Round**: Complete when all creatures have taken their turn

### Movement Rules

- **Base Speed**: Characters typically have 30 feet of movement
- **Movement Actions**: Can split movement before/after actions
- **Difficult Terrain**: Costs 2 feet per 1 foot moved
- **Diagonal Movement** (Hex Grid): Each hex counts as 5 feet
- **Opportunity Attacks**: Triggered when leaving enemy's reach without Disengage

### Combat State Requirements

- Current round number
- Active combatant (whose turn it is)
- Initiative order list
- Movement remaining for active combatant
- Position of all combatants

## Architecture & Boundaries

### rpg-toolkit (Pure Game Logic)

**Responsibilities:**

- D&D 5e movement calculations
- Initiative roll logic
- Movement validation rules
- Turn order management algorithms
- Combat state transitions
- Event emissions for combat events

**Key Components Needed:**

```go
// In rulebooks/dnd5e/combat/
- initiative.go      // Initiative rolling and ordering
- movement.go        // Movement calculations and validation
- turn_manager.go    // Turn order and state management
- combat_state.go    // Combat state data structures
```

**ASSUMPTION**: Toolkit should contain pure game logic without persistence concerns

### rpg-api (Orchestration & Persistence)

**Responsibilities:**

- Store combat state persistently
- Orchestrate combat flow
- Manage entity positions in rooms
- Handle RPC requests/responses
- Coordinate with toolkit for rule validation

**Key Components Needed:**

```go
// In internal/orchestrators/encounter/
- combat_manager.go  // Manages persistent combat state
- movement.go        // Orchestrates movement requests
```

### rpg-api-protos (Service Contracts)

**New RPCs Needed in EncounterService:**

```proto
service EncounterService {
  // Existing
  rpc DungeonStart(DungeonStartRequest) returns (DungeonStartResponse);

  // New - Initiative & Turn Management
  rpc StartCombat(StartCombatRequest) returns (StartCombatResponse);
  rpc GetCombatState(GetCombatStateRequest) returns (GetCombatStateResponse);
  rpc EndTurn(EndTurnRequest) returns (EndTurnResponse);

  // New - Movement
  rpc MoveCharacter(MoveCharacterRequest) returns (MoveCharacterResponse);
  rpc GetMovementOptions(GetMovementOptionsRequest) returns (GetMovementOptionsResponse);
}
```

### rpg-dnd5e-web (UI & User Interaction)

**Responsibilities:**

- Display initiative order
- Show current turn indicator
- Highlight valid movement options
- Handle movement click/drag
- Display movement remaining
- WebSocket subscription for combat state updates

## Minimum Data Structures

### Combat State (Toolkit & API)

```go
type CombatState struct {
    EncounterID string
    Round       int
    TurnOrder   []InitiativeEntry
    ActiveIndex int // Index in TurnOrder
    Started     bool
    Ended       bool
}

type InitiativeEntry struct {
    EntityID   string
    EntityType string // "character", "monster"
    Initiative int    // Total initiative value
    Modifier   int    // Dexterity modifier
    HasActed   bool   // This round
}

type TurnState struct {
    EntityID         string
    MovementUsed     int
    MovementMax      int
    ActionUsed       bool
    BonusActionUsed  bool
    Position         Position
}
```

### Proto Messages

```proto
// Initiative & Combat State
message StartCombatRequest {
  string encounter_id = 1;
  repeated InitiativeRoll rolls = 2; // Optional pre-rolled
}

message InitiativeRoll {
  string entity_id = 1;
  int32 roll = 2;       // d20 result
  int32 modifier = 3;   // DEX modifier
}

message StartCombatResponse {
  CombatState combat_state = 1;
}

message CombatState {
  string encounter_id = 1;
  int32 round = 2;
  repeated InitiativeEntry turn_order = 3;
  int32 active_index = 4;
  TurnState current_turn = 5;
}

// Movement
message MoveCharacterRequest {
  string encounter_id = 1;
  string entity_id = 2;
  Position target_position = 3;
}

message MoveCharacterResponse {
  bool success = 1;
  string error_message = 2;
  int32 movement_remaining = 3;
  Room updated_room = 4;
}
```

## Implementation Plan

### Phase 1: Core Combat State [MINIMUM]

1. **rpg-toolkit**: Implement initiative system
   - Roll initiative (1d20 + DEX)
   - Sort combatants by initiative
   - Manage turn order

2. **rpg-api-protos**: Define StartCombat and GetCombatState RPCs

3. **rpg-api**: Implement combat state management
   - Store combat state in memory (initially)
   - StartCombat orchestration
   - Turn order tracking

4. **rpg-dnd5e-web**: Display initiative order
   - Show turn order list
   - Highlight active combatant

### Phase 2: Basic Movement [MINIMUM]

1. **rpg-toolkit**: Implement movement validation
   - Calculate movement cost
   - Check movement remaining
   - Validate path (no obstacles)

2. **rpg-api-protos**: Define MoveCharacter RPC

3. **rpg-api**: Implement movement orchestration
   - Update entity positions
   - Track movement used
   - Emit position change events

4. **rpg-dnd5e-web**: Enable click-to-move
   - Click hex to move character
   - Show movement remaining
   - Highlight valid movement hexes

### Phase 3: Turn Management [MINIMUM]

1. **rpg-toolkit**: Implement turn transitions
   - End turn logic
   - Reset movement for next turn
   - Advance to next combatant

2. **rpg-api-protos**: Define EndTurn RPC

3. **rpg-api**: Implement turn flow
   - Handle end turn requests
   - Update combat state
   - Broadcast turn changes

4. **rpg-dnd5e-web**: Add turn controls
   - End Turn button
   - Turn timer (optional)
   - Action/movement indicators

### Phase 4: Target Dummy [MINIMUM]

1. **rpg-toolkit**: Define static enemy
   - No AI/actions needed
   - Just has HP and AC
   - Occupies space

2. **rpg-api**: Place dummy in encounters
   - Add to DungeonStart
   - Include in initiative (roll 10 + 0)

3. **rpg-dnd5e-web**: Display dummy
   - Show as red hex
   - Display HP bar
   - Clickable for targeting

## Event Bus Integration

### Combat Events (Toolkit → API → Web)

```go
// Toolkit events
EventTypeCombatStarted
EventTypeInitiativeRolled
EventTypeTurnStarted
EventTypeTurnEnded
EventTypeMovement
EventTypeRoundStarted
EventTypeRoundEnded

// Event payloads
type CombatStartedEvent struct {
    EncounterID string
    Combatants  []string
}

type TurnStartedEvent struct {
    EncounterID string
    EntityID    string
    Round       int
}

type MovementEvent struct {
    EncounterID string
    EntityID    string
    From        Position
    To          Position
    Cost        int
}
```

## Movement Validation Rules

### Toolkit Movement Validator

```go
type MovementValidator interface {
    // Check if movement is valid
    ValidateMovement(
        entity Entity,
        from Position,
        to Position,
        movementRemaining int,
        room *RoomData,
    ) error

    // Calculate movement cost
    CalculateCost(
        from Position,
        to Position,
        room *RoomData,
    ) int

    // Get all valid movement positions
    GetValidMoves(
        entity Entity,
        from Position,
        movementRemaining int,
        room *RoomData,
    ) []Position
}
```

### Validation Checks

1. **Distance**: Target within movement range
2. **Path**: No blocked hexes in path
3. **Occupied**: Target hex not occupied by blocking entity
4. **Terrain**: Account for difficult terrain
5. **Boundaries**: Stay within room bounds

## API Response Patterns

### Success Response

```json
{
  "success": true,
  "combat_state": { ... },
  "room": { ... },
  "events": [
    {"type": "movement", "data": { ... }}
  ]
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_MOVEMENT",
    "message": "Not enough movement remaining",
    "details": {
      "movement_cost": 30,
      "movement_remaining": 25
    }
  }
}
```

## WebSocket Updates

### Combat State Subscription

```typescript
// Subscribe to combat updates
subscribeToEncounter(encounterId: string) {
  return {
    onCombatStateChange: (state: CombatState) => { ... },
    onMovement: (event: MovementEvent) => { ... },
    onTurnChange: (event: TurnChangeEvent) => { ... },
  }
}
```

## Testing Strategy

### Unit Tests

- **Toolkit**: Initiative ordering, movement calculations
- **API**: State management, orchestration logic
- **Web**: Component rendering, user interactions

### Integration Tests

- Full combat flow: Start → Initiative → Turns → Movement
- Multi-character scenarios
- Edge cases: ties, invalid moves, turn timeouts

### E2E Test Scenario

1. Create encounter with 3 characters
2. Start combat
3. Roll initiative for all
4. First character moves toward dummy
5. End turn
6. Second character moves
7. Continue until dummy reached

## Success Criteria

### Minimum Viable Features

- [x] Characters appear on hex grid
- [ ] Combat can be initiated
- [ ] Initiative order displayed
- [ ] Current turn highlighted
- [ ] Character can move on their turn
- [ ] Movement remaining tracked
- [ ] Turn can be ended
- [ ] Next character's turn starts
- [ ] Target dummy visible
- [ ] Characters can move toward dummy

### Non-Goals (Future Work)

- Complex monster AI
- Attack actions
- Damage calculation
- Spell casting
- Reactions
- Opportunity attacks
- Conditions/status effects
- Combat log
- Undo/redo
- Save/load combat state

## Implementation Priority

1. **CRITICAL**: Initiative system (toolkit + API)
2. **CRITICAL**: Turn order management
3. **CRITICAL**: Basic movement validation
4. **CRITICAL**: Movement RPC implementation
5. **IMPORTANT**: UI turn indicators
6. **IMPORTANT**: Movement highlighting
7. **NICE**: Movement animation
8. **NICE**: Turn timer

## Questions Resolved

1. **Where does turn management live?**
   - Logic in toolkit (pure calculations)
   - State in API (persistence)
   - UI in web (display only)

2. **How to handle movement validation?**
   - Toolkit validates rules
   - API orchestrates and persists
   - Web shows valid options proactively

3. **What events flow through toolkit bus?**
   - All combat state changes
   - Movement events
   - Turn transitions
   - Initiative rolls

4. **Minimum for initiative/turn order?**
   - Roll initiative on combat start
   - Sort by total (roll + modifier)
   - Track active index
   - Advance on EndTurn

5. **How to track combat state?**
   - In-memory in API (initially)
   - Future: Redis or database
   - Broadcast changes via WebSocket

6. **What RPCs needed?**
   - StartCombat
   - GetCombatState
   - MoveCharacter
   - EndTurn
   - GetMovementOptions (optional)
