/**
 * Combat v2 - Modular Combat UI System
 *
 * This is a complete redesign of the combat UI with proper modularity,
 * bulletproof visibility, and extensibility.
 *
 * Key features:
 * - React Portal rendering for guaranteed visibility
 * - CSS Modules for isolated styling
 * - Protobuf types as single source of truth
 * - Modular panel system for easy extension
 * - Explicit z-index management
 */

// Panels
export { ActionPanel } from './panels/ActionPanel';
export type { ActionPanelProps } from './panels/ActionPanel';

// Components
export { AttackResultToast } from './AttackResultToast';
export type { AttackResultToastProps } from './AttackResultToast';

// Hooks
export { usePlayerTurn } from './hooks/usePlayerTurn';
export type { PlayerTurnInfo, UsePlayerTurnProps } from './hooks/usePlayerTurn';

// Future exports (when implemented):
// export { CombatUIProvider } from './CombatUIProvider';
// export { CombatUIContainer } from './CombatUIContainer';
// export { InitiativePanel } from './panels/InitiativePanel';
// export { ResourcePanel } from './panels/ResourcePanel';
