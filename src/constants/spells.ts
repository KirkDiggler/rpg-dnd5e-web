// Common cantrip spell IDs
// TODO: These should eventually come from the Spell enum in the proto
export const CANTRIP_SPELL_IDS = [
  'SPELL_ACID_SPLASH',
  'SPELL_FIRE_BOLT',
  'SPELL_POISON_SPRAY',
  'SPELL_MAGE_HAND',
  'SPELL_MINOR_ILLUSION',
  'SPELL_PRESTIDIGITATION',
  'SPELL_RAY_OF_FROST',
  'SPELL_LIGHT',
  'SPELL_MENDING',
  'SPELL_MESSAGE',
  'SPELL_SHOCKING_GRASP',
  'SPELL_CHILL_TOUCH',
  'SPELL_DANCING_LIGHTS',
  'SPELL_TRUE_STRIKE',
] as const;

// Helper function to check if a spell is a cantrip
export function isCantrip(spellId: string): boolean {
  return CANTRIP_SPELL_IDS.includes(
    spellId as (typeof CANTRIP_SPELL_IDS)[number]
  );
}

// Helper function to format spell name from ID
export function formatSpellName(spellId: string): string {
  return spellId
    .replace('SPELL_', '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// TODO: When spell level data is available in the API, replace this with dynamic lookup
export function getSpellLevel(spellId: string): number {
  if (isCantrip(spellId)) {
    return 0;
  }
  // For now, assume all non-cantrips are level 1
  // This will need to be updated when we have actual spell data
  return 1;
}
