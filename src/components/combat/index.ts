export { CombatActionPanel } from '../CombatActionPanel';
export { CombatOverlay } from './CombatOverlay';
export { CombatPanelBase } from './CombatPanelBase';
export type { CombatPanelProps } from './CombatPanelBase';
export { getPanelPositionClasses } from './utils';
export type { CombatPanelPosition } from './utils';

// Panel exports for extensibility
export {
  CombatHistoryPanel,
  type CombatHistoryEntry,
  type CombatHistoryHandle,
} from './panels/CombatHistoryPanel';
export { DebugPanel } from './panels/DebugPanel';
export { HealthTrackingPanel } from './panels/HealthTrackingPanel';
