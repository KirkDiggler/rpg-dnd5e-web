# Claude AI Development Guidelines

## 🚨 CRITICAL: ALWAYS RUN CI CHECKS BEFORE PUSHING 🚨

**MANDATORY before EVERY push:**

```bash
npm run ci-check  # MUST PASS before pushing
```

This catches:

- Formatting issues (Prettier)
- Lint errors (ESLint)
- TypeScript errors
- Build failures

**The pre-push hook will enforce this, but run it manually to save time!**

## 🚨 CRITICAL: NEVER Use --no-verify 🚨

**NEVER use `--no-verify` on git commit or git push.**

```bash
# ❌ NEVER DO THIS
git commit --no-verify
git push --no-verify

# ✅ ALWAYS DO THIS - wait for hooks to complete
git commit -m "message"
git push
```

**Why this matters:**

- Pre-commit and pre-push hooks exist as safety nets
- "I just ran the checks manually" is not an excuse - hooks catch what you might have missed
- Bypassing hooks normalizes skipping safeguards
- If hooks are slow or hanging, investigate why - don't bypass them

**If you find yourself wanting to use --no-verify, STOP and ask:**

1. Why am I trying to skip the safety checks?
2. Did something change after I ran checks manually?
3. Is there an actual problem with the hooks I should fix?

## Project Overview

This is **rpg-dnd5e-web**, a React-based web UI for D&D 5e gameplay designed as a Discord Activity. It connects to the rpg-api gRPC server to provide character creation, combat, and game board visualization.

## 🚨 CRITICAL: CI Pre-flight Checks

**ALWAYS run CI checks locally before pushing to prevent CI failures:**

```bash
npm run ci-check  # Quick summary of all checks
npm run ci-fix    # Auto-fix issues where possible
```

The `ci-check` script runs:

- Format check (Prettier)
- Lint check (ESLint)
- Type check (TypeScript)
- Build verification
- Test suite

If any check fails, fix the issues before pushing. This prevents:

- Broken CI builds
- Failed PRs
- Wasted time debugging CI failures
- Blocked deployments

## 🚨 CRITICAL: Proto Updates Require Lock File Regeneration

When updating `@kirkdiggler/rpg-api-protos` version:

```bash
# Install specific version (preferred method)
npm i --save github:KirkDiggler/rpg-api-protos#v0.1.56

# Or if that doesn't work, regenerate everything:
rm -rf node_modules package-lock.json && npm install
```

1. Update version in `package.json` or use the npm install command above
2. Verify the correct commit hash in package-lock.json
3. Commit BOTH package.json and package-lock.json

**Checking latest proto version:** Proto types are installed locally from GitHub. Use `gh` CLI to check the latest release:

```bash
# Check latest proto version available
gh release list -R KirkDiggler/rpg-api-protos --limit 5

# Check what version we have installed
grep rpg-api-protos package.json
```

**Why**: GitHub dependencies with tags don't always update properly. The lock file might keep pointing to old commits even after package.json is updated. This causes CI to use the wrong proto version.

## 🚨 IMPORTANT: React StrictMode and Double API Calls

**In development, you will see double API calls - this is NORMAL and EXPECTED.**

React StrictMode (enabled in `src/main.tsx`) intentionally double-mounts components in development to help detect side effects and prepare your code for React's concurrent features.

**What this means:**

- Components mount → unmount → mount again in development
- useEffect hooks run twice
- API calls happen twice
- This ONLY happens in development, NOT in production

**What NOT to do:**

- Don't try to "fix" it with AbortController for simple API calls
- Don't disable StrictMode - it helps catch bugs
- Don't worry about the double calls - they're harmless

**What TO do:**

- Make your API operations idempotent
- Focus on real issues, not development quirks
- Read the journey doc at `docs/journey/2025-08-04-strictmode-double-calls-and-abort-controller.md` for the full story

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

### Asset Pipeline

Source assets live in `rpg-project/assets/`. This is how they map here:

| Source                    | Destination                                 | Notes                  |
| ------------------------- | ------------------------------------------- | ---------------------- |
| `assets/models/body/`     | `public/models/characters/`                 | OBJ body parts         |
| `assets/models/heads/`    | `public/models/characters/`                 | Race head variants     |
| `assets/models/weapons/`  | `public/models/characters/`                 | Weapon OBJs            |
| `assets/textures/medium/` | `public/models/characters/textures/medium/` | Per-class textures     |
| `assets/textures/base/`   | `public/models/characters/textures/base/`   | Bare skin fallbacks    |
| `assets/coords/`          | Consumed by `src/config/characterModels.ts` | Position/rotation JSON |
| `assets/shaders/`         | Adapted into `src/shaders/*.ts`             | JS → TypeScript        |

**Key files:**

- `src/config/characterModels.ts` - Model paths, part positions/rotations (Blender Z-up → Three.js Y-up)
- `src/config/characterTextures.ts` - Texture resolution with fallback chain (class → base → solid color)
- `src/shaders/AdvancedCharacterShader.ts` - Marker color detection + runtime swapping
- `src/shaders/OutlineShader.ts` - Cel-shading outline effect
- `src/components/hex-grid/MediumHumanoid.tsx` - Assembles 12 OBJ parts with textures + shaders

**Texture marker colors** (shader detects and replaces at runtime):

- `#FFFFFF` → Skin color
- `#F704FF` (Magenta) → Primary armor color
- `#E5FF02` (Yellow) → Secondary accent
- `#1EDFFF` (Cyan) → Tertiary details
- `#2BFF06` (Green) → Fine decorative elements

**Loading pattern:** `useLoader(OBJLoader, path)` from React Three Fiber. Textures use `NearestFilter` + `NoColorSpace` for pixel art + accurate shader color detection.

**Adding new assets:**

1. Copy from `rpg-project/assets/` to `public/models/characters/`
2. Update `KNOWN_TEXTURES` in `src/config/characterTextures.ts`
3. Add coordinate configs to `src/config/characterModels.ts` if new model parts

### Game Board

- React Three Fiber for 3D hex-grid rendering
- Cube coordinates (q, r, s) for hex positioning
- Turn-based, no real-time requirements
- Voxel aesthetic with shader-based customization
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

## Common CI Issues and Solutions

### TypeScript Errors

- **Missing imports**: Use `create()` from `@bufbuild/protobuf` for proto messages
- **Type mismatches**: Check proto-generated types match your usage
- **Missing schemas**: Import `*Schema` types when using `create()`

### Build Failures

- **Large chunks**: Ignore the warning about chunks > 500KB (expected for proto libraries)
- **Import errors**: Ensure all imports use correct paths (use `@/` alias)
- **Missing dependencies**: Run `npm install` after pulling changes

### Format/Lint Issues

- **Auto-fix**: Run `npm run format` and `npm run lint --fix`
- **Pre-commit hook**: Runs automatically via husky
- **CI mismatch**: Ensure local prettier/eslint configs match CI

### Best Practices

1. Always run `npm run ci-check` before pushing
2. Fix issues locally - don't rely on CI to catch them
3. Keep dependencies up to date with lock file
4. Write tests for new features
5. Use the CI check script added in `scripts/ci-check.sh`

## PR Review Workflow

### Checking for Review Comments

After creating a PR, always check for automated review comments from tools like Copilot:

```bash
# View all PR comments
gh pr view <PR_NUMBER> --comments

# Check for inline review comments
gh api repos/KirkDiggler/rpg-dnd5e-web/pulls/<PR_NUMBER>/comments
```

### Common Review Feedback

1. **Code Duplication**: Extract repeated logic into utilities
2. **Complex Logic**: Break down into smaller, testable functions
3. **Type Safety**: Ensure proper TypeScript types and null checks
4. **Performance**: Consider memoization for expensive calculations
5. **Readability**: Add comments for complex algorithms

### Addressing Review Comments

1. **Create a todo list** for all review items
2. **Address each comment** systematically
3. **Test changes** with `npm run ci-check`
4. **Update PR** with fixes
5. **Respond to comments** explaining changes made

### Example Review Response

```bash
# After addressing all comments
git add -A
git commit -m "refactor: Address PR review feedback

- Extract dice calculation logic into utility functions
- Improve duplicate roll prevention with full equality check
- Simplify player ID resolution logic
- Add helper function for dropped dice indices"

git push
```
