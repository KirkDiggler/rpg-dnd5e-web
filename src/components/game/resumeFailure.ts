/**
 * A running encounter whose game view failed to render is not resumed
 * automatically again (rpg-project#1004). Resume-after-refresh (#444)
 * routes every load into the player's running encounter, so one that
 * cannot render would otherwise trap every later load. The player can still
 * enter it on purpose (Play); only the automatic resume skips it.
 */
const KEY = 'rpg.game.resumeFailed';

export function rememberFailedResume(encounterId: string): void {
  try {
    window.localStorage.setItem(KEY, encounterId);
  } catch {
    // Storage unavailable: the boundary's way out still works this load.
  }
}

export function isFailedResume(encounterId: string): boolean {
  try {
    return window.localStorage.getItem(KEY) === encounterId;
  } catch {
    return false;
  }
}
