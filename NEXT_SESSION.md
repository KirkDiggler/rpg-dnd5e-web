# Next Session Notes

## Current State

- ✅ PR #12 (Discord Activity integration) - Merged
- ✅ PR #13 (rpg-api-protos integration) - Merged
- Both PRs resolved deployment blockers and established foundational infrastructure

## Immediate Next Steps

### 1. Character Creation UI (Priority: HIGH)

Now that we have the API client hooks ready, we should build the character creation flow:

- Start with a simple character list view using `useListCharacters()`
- Add a "Create Character" button that uses `useCreateDraft()`
- Build the step-by-step creation wizard components:
  - Name input
  - Race selection (with subrace when applicable)
  - Class selection
  - Background selection
  - Ability score generation/assignment
  - Skill selection
  - Language selection
  - Review and finalize

### 2. Design System Setup (Priority: MEDIUM)

Before building too many UI components, establish the design foundation:

- Set up Tailwind CSS (already in package.json but needs config)
- Consider adding Radix UI for accessible components
- Define color scheme for dark theme (D&D aesthetic)
- Create basic component library (Button, Card, Select, etc.)

### 3. State Management (Priority: MEDIUM)

- Set up Zustand for global state (game state, character drafts)
- Decide on state architecture:
  - Discord state (from SDK)
  - Game/session state
  - UI state (modals, selections)

### 4. Discord Activity Features (Priority: LOW)

- Add party invite functionality
- Show other players in the activity
- Implement activity-specific commands

## Technical Debt to Address

- No tests yet - consider adding Vitest and React Testing Library
- No error boundaries or error handling UI
- Need loading states and skeletons for better UX
- Should add pre-commit hooks (Husky is installed but not configured)

## Questions for User

1. UI framework preference - should we use Radix UI, or another component library?
2. Design direction - how closely should we match D&D Beyond's aesthetic vs creating something unique?
3. Mobile-first or desktop-first design approach?
4. Should we add Storybook for component development?

## Development Approach

The user prefers:

- Production deployment focus over local development tricks
- Practical solutions that work in real environments
- Avoiding rebasing in favor of merging
- Following existing patterns from platform-admin-react

## File to Review

- `/home/kirk/personal/rpg-dnd5e-web/src/api/hooks.ts` - Contains all the API hooks ready to use
- `/home/kirk/personal/rpg-dnd5e-web/CLAUDE.md` - Project guidelines and architecture decisions
