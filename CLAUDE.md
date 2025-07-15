# Claude AI Development Guidelines

## Project Overview

This is **rpg-dnd5e-web**, a React-based web UI for D&D 5e gameplay designed as a Discord Activity. It connects to the rpg-api gRPC server to provide character creation, combat, and game board visualization.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking

## Architecture Principles

### API Communication
- Use Connect RPC with `@kirkdiggler/rpg-api-protos`
- Follow the hook pattern from platform-admin-react:
  - `useGet*` for single entity fetching
  - `useList*` for collections
  - `do*` for imperative actions
  - `useStream*` for real-time updates

### State Management
- Use Zustand for global game state
- Local state with hooks for component-specific data
- Keep Discord activity state separate from game state

### Component Structure
- Feature-based folder organization
- Shared components in `common/`
- Custom hooks abstract API calls
- TypeScript for all components

### Styling Guidelines
- Tailwind CSS for utility-first styling
- Radix UI for accessible components
- Dark theme by default (game aesthetic)
- Mobile-first responsive design

### Character Creation Flow
- Draft-based system matching the API
- Section updates allow non-linear editing
- Visual progress indicators
- Validation at each step

### Game Board Considerations
- Canvas or SVG rendering (TBD)
- Turn-based, no real-time requirements
- Static animations for actions
- Mobile-friendly interactions

## Key Features for Phase 1

1. **Character Creation**
   - Name, race, class selection
   - Ability score generation
   - Skill selection
   - Background selection
   - Draft save/resume

2. **Character Sheet View**
   - Display all character stats
   - Equipment management
   - Level up interface

3. **Discord Integration**
   - Activity SDK setup
   - User authentication via Discord
   - Party invites

## Testing Approach

- Vitest for unit tests
- React Testing Library for components
- Mock Connect RPC calls
- E2E tests for critical flows

## Performance Considerations

- Lazy load game board components
- Optimize asset loading
- Minimize bundle size for Discord Activity
- Cache character data locally

## Security Notes

- No secrets in frontend code
- API authentication via Discord token
- Validate all user inputs
- Sanitize rendered content