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

export const TOOLKIT_SANDBOX_YAML = `version: 1
key: toolkit-contributor-sandbox
name: "Toolkit Contributor Sandbox"
theme: crypt
height: 1
canvas: { width: 12, height: 6 }
rooms: []
connectors: []
walls: []
wallLines: []
holes: []
start: [1, 3]
end: null
place:
  - { ref: "dnd5e:monsters:skeleton", at: [7, 2] }
  - { ref: "dnd5e:monsters:skeleton", at: [9, 4] }
`;
