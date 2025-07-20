# Claude AI Development Guidelines

## Project Overview

This is **rpg-dnd5e-web**, a React-based web UI for D&D 5e gameplay designed as a Discord Activity. It connects to the rpg-api gRPC server to provide character creation, combat, and game board visualization.

## 🚨 CRITICAL: Proto Updates Require Lock File Regeneration

When updating `@kirkdiggler/rpg-api-protos` version:

1. Update version in `package.json`
2. **MUST regenerate package-lock.json**: `rm -rf node_modules package-lock.json && npm install`
3. Verify the correct commit hash in package-lock.json
4. Commit BOTH package.json and package-lock.json

**Why**: GitHub dependencies with tags don't always update properly. The lock file might keep pointing to old commits even after package.json is updated. This causes CI to use the wrong proto version.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run pre-commit` - Run format, lint, and typecheck (use before committing!)
- `npm run ci-checks` - Run all CI checks (format:check, lint, typecheck, build)

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

## Connect RPC Configuration and API Patterns

### Connect RPC Client Setup

**Location**: `/src/api/client.ts`

- Uses `@connectrpc/connect` and `@connectrpc/connect-web` for gRPC-Web transport
- Configured with automatic Discord Activity proxy support (routes through `/.proxy` when hosted on discordsays.com)
- Includes a logging interceptor for debugging API calls in development mode
- Currently only exposes `characterClient` for the CharacterService

### API Hook Pattern

**Location**: `/src/api/hooks.ts`

- Consistent hook naming: `use{Action}{Resource}` (e.g., `useGetCharacter`, `useListCharacters`)
- Two types of hooks:
  1. **Query hooks** (auto-fetch on mount): Return `{ data, loading, error, refetch }`
  2. **Mutation hooks** (imperative): Return `{ action, loading, error }`
- Uses `@bufbuild/protobuf` for creating request objects with schemas
- All hooks handle loading states and errors consistently

### Protobuf Dependencies

- Uses `@kirkdiggler/rpg-api-protos` (v0.1.11) from GitHub
- Imports from `/gen/ts/dnd5e/api/v1alpha1/character_pb` for types and schemas
- Common imports: `Character`, `CharacterDraft`, `ClassInfo`, `RaceInfo`, etc.

### Equipment/Weapon Support Status

- **EquipmentChoice** type exists in protos and is used in `EquipmentChoiceSelector` component
- **No dedicated equipment/weapon API endpoints yet** - currently using hardcoded data
- TODO comment in code: `// TODO(#equipment-api): Replace with API call when equipment endpoints are available`
- Temporary weapon lists: `MARTIAL_MELEE_WEAPONS`, `SIMPLE_WEAPONS` arrays

### Adding New API Hooks Pattern

When adding new API endpoints (e.g., for equipment/weapons):

1. Import types and schemas from protos
2. Create query hooks with this structure:
   ```typescript
   export function useListEquipment(filters?, pageSize = 20) {
     const [state, setState] = useState<ListState<Equipment>>({
       data: [],
       loading: false,
       error: null,
     });
     // ... fetch logic using characterClient.listEquipment
     return { ...state, refetch, loadMore };
   }
   ```
3. Create mutation hooks for actions:
   ```typescript
   export function useEquipItem() {
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<Error | null>(null);
     const equipItem = useCallback(async (request) => {
       // ... mutation logic
     }, []);
     return { equipItem, loading, error };
   }
   ```
4. Export from `/src/api/index.ts`
