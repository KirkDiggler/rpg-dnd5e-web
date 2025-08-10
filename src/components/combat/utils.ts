/**
 * Panel positioning types for the combat UI system
 */
export type CombatPanelPosition =
  | 'bottom-center' // Main action panel
  | 'top-left' // Debug info
  | 'top-right' // Combat history
  | 'bottom-left' // Health tracking
  | 'bottom-right' // Timeline/turn order
  | 'center'; // Modal dialogs

/**
 * Get positioning classes for a panel based on its intended position
 */
export function getPanelPositionClasses(position: CombatPanelPosition): string {
  switch (position) {
    case 'bottom-center':
      return 'fixed bottom-4 left-1/2 transform -translate-x-1/2 max-w-2xl w-full px-4';
    case 'top-left':
      return 'fixed top-4 left-4 max-w-md';
    case 'top-right':
      return 'fixed top-4 right-4 max-w-md';
    case 'bottom-left':
      return 'fixed bottom-4 left-4 max-w-sm';
    case 'bottom-right':
      return 'fixed bottom-4 right-4 max-w-sm';
    case 'center':
      return 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 max-w-lg w-full px-4';
    default:
      return 'fixed bottom-4 left-1/2 transform -translate-x-1/2 max-w-2xl w-full px-4';
  }
}

/**
 * Helper styles for consistent panel content styling
 */
export const panelStyles = {
  section: 'mb-3 last:mb-0',
  label: 'text-xs text-slate-400 mb-1',
  value: 'text-sm text-white',
  divider: 'border-t border-slate-700 my-2',
  badge:
    'inline-block px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 mr-1',
};
