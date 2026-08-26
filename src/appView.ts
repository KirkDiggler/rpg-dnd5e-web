export const APP_VIEWS = [
  'home',
  'character-creation',
  'character-sheet',
  'lobby',
  'concepts',
  'author',
] as const;

export type AppView = (typeof APP_VIEWS)[number];

/**
 * Global development controls belong to the app shell, not Concepts Lab.
 * Use the same gate for the floating buttons and an already-open debug panel.
 */
export function shouldRenderGlobalDevTools(
  mode: string,
  currentView: AppView
): boolean {
  return mode === 'development' && currentView !== 'concepts';
}
