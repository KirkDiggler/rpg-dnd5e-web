# Lobby UI Design

**Date:** 2025-12-14
**Status:** Approved
**Related:** rpg-api-protos PR #89 (Multiplayer streaming support)

## Overview

Add multiplayer lobby functionality to the web client, allowing players to create or join game sessions before starting combat together.

## User Flow

### Entry Point

The current `EncounterDemo` shows a new choice screen before `PartySetupPanel`:

- **Solo Play** → Goes directly to current `PartySetupPanel` (unchanged)
- **Multiplayer** → Goes to new `LobbyScreen`

### Lobby Screen (Tabbed)

Single screen with two tabs:

**"Create Game" tab:**

- Shows your available characters to select
- "Create Lobby" button → calls `CreateEncounter` RPC
- After creation: switches to waiting room view with join code

**"Join Game" tab:**

- Text input for 6-character join code
- "Join" button → calls `JoinEncounter` RPC
- After joining: switches to waiting room view

### Waiting Room

Once in a lobby, both host and players see:

- Join code prominently displayed (with copy button)
- List of party members showing:
  - Player name
  - Selected character (or "Selecting..." if none yet)
  - Ready status indicator (checkmark or waiting)
- Character selector dropdown (your own character)
- "Ready" toggle button
- "Start Combat" button (host only, enabled when all ready)
- "Leave" button

### Ready/Start Flow

1. Each player selects a character from their available characters
2. Each player clicks "Ready" when satisfied with their choice
3. Host clicks "Start Combat" when all players are ready
4. Combat begins for all players

## Component Structure

```
src/components/lobby/
├── GameModeSelector.tsx    # Solo vs Multiplayer choice
├── LobbyScreen.tsx         # Main tabbed container
├── CreateGameTab.tsx       # Character select + create button
├── JoinGameTab.tsx         # Join code input
├── WaitingRoom.tsx         # The lobby after create/join
├── PartyMemberCard.tsx     # Shows player + character + ready status
└── JoinCodeDisplay.tsx     # Code with copy button
```

### Component Responsibilities

| Component          | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `GameModeSelector` | Two-button choice (Solo/Multiplayer), entry point in `EncounterDemo` |
| `LobbyScreen`      | Manages tab state, holds lobby state (code, members, etc.)           |
| `CreateGameTab`    | Reuses `CharacterCard` pattern from `PartySetupPanel`                |
| `JoinGameTab`      | Minimal: input field + join button                                   |
| `WaitingRoom`      | Core lobby view, shows party members, handles ready state            |
| `PartyMemberCard`  | Displays one player: name, character preview, ready indicator        |
| `JoinCodeDisplay`  | Shows code with copy-to-clipboard button                             |

### State Management

Local React state (no global store needed):

```typescript
interface LobbyState {
  lobbyState: 'selecting' | 'creating' | 'joining' | 'waiting';
  encounterId: string | null;
  joinCode: string;
  partyMembers: PartyMember[];
  selectedCharacterId: string | null;
  isReady: boolean;
  isHost: boolean;
}
```

## API Integration

### New Hooks

Create `src/api/lobbyHooks.ts`:

```typescript
useCreateEncounter(); // Returns { createEncounter, loading, error }
useJoinEncounter(); // Returns { joinEncounter, loading, error }
useSetReady(); // Returns { setReady, loading }
useStartCombat(); // Returns { startCombat, loading }
useLeaveEncounter(); // Returns { leaveEncounter, loading }
```

### Data Flow

**Create Game:**

1. User selects character → clicks "Create Lobby"
2. `createEncounter(characterId)` → returns `{ encounterId, joinCode }`
3. Transition to WaitingRoom with `isHost: true`

**Join Game:**

1. User enters code → clicks "Join"
2. `joinEncounter(joinCode)` → returns `{ encounterId, room, partyMembers, encounterState }`
3. Transition to WaitingRoom with `isHost: false`
4. User selects character from dropdown

**In Waiting Room:**

1. Select character → `setReady(encounterId, characterId, true)`
2. Toggle ready off → `setReady(encounterId, characterId, false)`
3. Host clicks Start → `startCombat(encounterId)`

### Proto Types Used

From rpg-api-protos (PR #89):

- `PartyMember` - player info with character and ready status
- `EncounterState` enum - WAITING, ACTIVE, PAUSED, COMPLETED
- `CreateEncounterRequest/Response`
- `JoinEncounterRequest/Response`
- `SetReadyRequest/Response`
- `StartCombatRequest/Response`
- `LeaveEncounterRequest/Response`

### Future: Event Streaming

Real-time updates via `StreamEncounterEvents` will be added in a follow-up phase. For initial implementation, the UI structure is built first, then streaming is wired in to receive:

- `PlayerJoinedEvent`
- `PlayerLeftEvent`
- `PlayerReadyEvent`
- `CombatStartedEvent`

## Visual Design

### Styling Approach

Follow existing patterns from `PartySetupPanel`:

- Use CSS variables (`--card-bg`, `--text-primary`, `--accent-primary`, etc.)
- Tailwind utilities for layout
- Dark theme by default
- Rounded cards with borders

### Key Visual Elements

**Game Mode Selector:**

- Two large cards/buttons side by side
- Subtle hover effects
- Clear visual distinction between options

**Join Code Display:**

- Large monospace font (easy to read aloud)
- Copy button with "Copied!" feedback
- Example: `[ ABC123 ] [Copy]`

**Party Member Cards:**

- Player name (from Discord identity)
- Character info: "Theron - Level 3 Fighter"
- Ready indicator: ✓ green checkmark or ⏳ waiting icon
- Host badge for the lobby creator

**Ready/Start Buttons:**

- Ready toggle: changes color when active (green when ready)
- Start Combat: prominent, disabled until all ready
- Visual feedback: "Waiting for 2 players to ready up..."

**Layout:**

- Centered container, max-width ~600px
- Stacked vertically on mobile
- Party members in scrollable list if many players

## Implementation Phases

### Phase 1: UI Shell (This PR)

- GameModeSelector component
- LobbyScreen with tabs
- CreateGameTab and JoinGameTab
- WaitingRoom with mock data
- All visual components

### Phase 2: API Integration

- Update proto dependency
- Implement lobby hooks
- Wire up create/join/ready/start/leave

### Phase 3: Event Streaming

- Add streaming hook for real-time updates
- Handle lobby events (player joined/left/ready)
- Handle combat started transition

## Out of Scope

- Party composition analysis (tank/healer roles)
- Shareable URLs (`app.com/join/ABC123`)
- Discord "Share to Channel" integration
- Spectator mode
- DM role
- In-game chat

These can be added in future iterations.
