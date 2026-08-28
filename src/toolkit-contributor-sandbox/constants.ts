export const TOOLKIT_SANDBOX_KEY = 'toolkit-contributor-sandbox' as const;

export const TOOLKIT_SANDBOX_FIGHTER = 'toolkit-sandbox-fighter' as const;
export const TOOLKIT_SANDBOX_BARBARIAN = 'toolkit-sandbox-barbarian' as const;

export type ToolkitSandboxPlayer =
  | typeof TOOLKIT_SANDBOX_FIGHTER
  | typeof TOOLKIT_SANDBOX_BARBARIAN;

export const TOOLKIT_SANDBOX_FIGHTER_LABEL = 'Fighter' as const;
export const TOOLKIT_SANDBOX_BARBARIAN_LABEL = 'Barbarian' as const;

export const TOOLKIT_SANDBOX_PARTY_ARRANGEMENTS = [
  {
    label: TOOLKIT_SANDBOX_FIGHTER_LABEL,
    players: [TOOLKIT_SANDBOX_FIGHTER],
  },
  {
    label: TOOLKIT_SANDBOX_BARBARIAN_LABEL,
    players: [TOOLKIT_SANDBOX_BARBARIAN],
  },
  {
    label: 'Fighter then Barbarian',
    players: [TOOLKIT_SANDBOX_FIGHTER, TOOLKIT_SANDBOX_BARBARIAN],
  },
  {
    label: 'Barbarian then Fighter',
    players: [TOOLKIT_SANDBOX_BARBARIAN, TOOLKIT_SANDBOX_FIGHTER],
  },
] as const;

/** A version-2 document (rpg-project#256): one 12×6 region with the
 * start on the left and two skeletons on the right, the same arena the
 * version-1 canvas described. */
export const TOOLKIT_SANDBOX_YAML = `version: 2
key: toolkit-contributor-sandbox
name: Toolkit Contributor Sandbox
orientation: pointy
void: opaque
regions:
  - id: arena
    name: Arena
    archetype: crypt
    lighting: { intensity: 0.6 }
    cells:
      - [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0]]
      - [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1]]
      - [[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2]]
      - [[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3]]
      - [[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4]]
      - [[0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5]]
start: [1, 3]
walls: []
doors: []
place:
  - { ref: "dnd5e:monsters:skeleton", at: [7,2] }
  - { ref: "dnd5e:monsters:skeleton", at: [9,4] }
`;
