# RPG D&D 5e Web

A web-based D&D 5e game interface designed to run as a Discord Activity, providing a rich visual experience for turn-based gameplay.

## Overview

This React application serves as the primary UI for the RPG API's D&D 5e implementation. It provides:

- Character creation and management
- Turn-based combat with visual board
- Integration with Discord for multiplayer sessions
- Rich, game-like UI with animations and effects

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Radix UI
- **State Management**: Zustand
- **API Communication**: Connect RPC (via @kirkdiggler/rpg-api-protos)
- **Platform**: Discord Activities SDK

## Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn
- Access to rpg-api server

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Pull Request Checks

Use an explicit focused test file and watch mode during the edit-test-edit loop.
For example, run `src/utils/money.test.ts` or
`src/hooks/useEncounterState.test.ts` directly; see
[Running Vitest](docs/how-to/run-vitest.md) for the commands and their limits.

Before opening or updating a pull request, run one complete local gate:

```bash
npm run ci-check
```

Do not run it after every edit, commit, or push, and do not run a standalone full
test suite immediately before it because the gate already includes the suite.
Pull-request CI remains authoritative.

There is no pre-push hook. The pre-commit hook runs `lint-staged` automatically;
do not replace it by manually running `npm run pre-commit`, and never bypass it
with `--no-verify`.

### Building

```bash
npm run build
```

## Project Structure

```
src/
  character/      # Character creation and management
  game/           # Core game mechanics
    board/        # Game board rendering
    combat/       # Combat system
    dice/         # Dice rolling
  common/         # Shared components and utilities
  discord/        # Discord Activity integration
  hooks/          # Custom React hooks
  store/          # Zustand state management
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
