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
export { ActionEconomyIndicators } from './panels/ActionEconomyIndicators';
export type { ActionEconomyIndicatorsProps } from './panels/ActionEconomyIndicators';
export { ActionPanel } from './panels/ActionPanel';
export type { ActionPanelProps } from './panels/ActionPanel';
export { CharacterInfoSection } from './panels/CharacterInfoSection';
export type { CharacterInfoSectionProps } from './panels/CharacterInfoSection';
export { CombatHistorySidebar } from './panels/CombatHistorySidebar';
export type {
  CombatHistorySidebarProps,
  CombatLogEntry,
  DiceRoll,
} from './panels/CombatHistorySidebar';
export { CombatPanel } from './panels/CombatPanel';
export type { CombatPanelProps } from './panels/CombatPanel';
export { DynamicActionButtons } from './panels/DynamicActionButtons';
export type { DynamicActionButtonsProps } from './panels/DynamicActionButtons';
export { EquipmentDisplay } from './panels/EquipmentDisplay';
export type { EquipmentDisplayProps } from './panels/EquipmentDisplay';

// Hooks
export { usePlayerTurn } from './hooks/usePlayerTurn';
export type { PlayerTurnInfo, UsePlayerTurnProps } from './hooks/usePlayerTurn';

// Future exports (when implemented):
// export { CombatUIProvider } from './CombatUIProvider';
// export { CombatUIContainer } from './CombatUIContainer';
// export { InitiativePanel } from './panels/InitiativePanel';
// export { ResourcePanel } from './panels/ResourcePanel';
