/**
 * Action-bar icon lookup for EncounterDock's ActionMenu + End Turn button
 * (rpg-dnd5e-web#497, following #473's status-icon wiring precedent in
 * conditionIcons.ts). rpg-game-assets#3 (closes #490) shipped all 9 icons
 * at harness/models/synty/ui/actions/<action>.png, synced here via
 * `npm run assets:sync` to public/models/synty/ui/actions/, named by
 * action key so this lookup is a direct id -> filename map, not a
 * synonym table like conditionIcons.ts needed.
 *
 * Server-authored action refs (AvailableAction.ref.id) drive the lookup —
 * this never decides which actions exist or what they do, only which icon
 * (if any) represents a known key. Unmapped keys (class features without a
 * dedicated icon, e.g. Second Wind) return undefined — callers MUST fall
 * back to text-only rendering, never a broken image.
 */

const SYNTY_ACTION_ICON_BASE = '/models/synty/ui/actions';

/** The 9 action-bar icons rpg-game-assets#3 shipped, named by action key. */
const ACTION_ICON_KEYS = new Set([
  'attack',
  'dash',
  'dodge',
  'disengage',
  'help',
  'hide',
  'rage',
  'move',
  'end-turn',
]);

/**
 * Resolve a Synty action-bar icon URL for a server action ref id, if one is
 * mapped. Case-insensitive (server ref ids are lowercase snake/kebab today,
 * but this doesn't assume it). Returns undefined for anything unmapped —
 * callers render text-only in that case.
 *
 * @example
 * ```typescript
 * getActionIconUrl('attack');
 * // '/models/synty/ui/actions/attack.png'
 * getActionIconUrl('second-wind');
 * // undefined — no dedicated icon, caller falls back to text-only
 * ```
 */
export function getActionIconUrl(actionRefId: string): string | undefined {
  const normalized = actionRefId.trim().toLowerCase();
  if (!ACTION_ICON_KEYS.has(normalized)) return undefined;
  return `${SYNTY_ACTION_ICON_BASE}/${normalized}.png`;
}
