/**
 * Temporary presentation-only bridge for rpg-api#903's reference-tomb demo.
 *
 * The API already places this exact member; this table does not create an NPC,
 * infer its rules/template from its name, or change its interaction behavior.
 * rpg-game-assets#148 owns the exact appearance key and private GLB.
 *
 * Remove the member-id bridge when Kirk adds authored NPC appearance selection.
 * Do not grow this into a general member-name/prefix fallback or a Builder API.
 */
const NPC_APPEARANCE_URLS = {
  'dnd5e:npcs:bartender:01': '/models/synty/npcs/bartender-01.glb',
} as const;

const DEMO_APPEARANCES = new Map<string, keyof typeof NPC_APPEARANCE_URLS>([
  ['demo-merchant-1', 'dnd5e:npcs:bartender:01'],
]);

/** Caller must restrict this explicit demo bridge to non-combatant NPCs. */
export function resolveDemoNpcModelUrl(memberId: string): string | undefined {
  const appearance = DEMO_APPEARANCES.get(memberId);
  return appearance === undefined ? undefined : NPC_APPEARANCE_URLS[appearance];
}
