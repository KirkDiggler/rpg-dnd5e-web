import {
  NPC_APPEARANCE_CATALOG,
  type GeneratedNpcAppearance,
} from '@/generated/npcAppearanceCatalog';

export interface NpcAppearanceFamily {
  readonly ref: string;
  readonly defaultLook: GeneratedNpcAppearance;
  readonly looks: readonly GeneratedNpcAppearance[];
}

/** Family/default identity comes from provider metadata, never ref suffixes. */
export function buildNpcAppearanceFamilies(
  catalog: readonly GeneratedNpcAppearance[]
): readonly NpcAppearanceFamily[] {
  const byRef = new Map(catalog.map((look) => [look.assetRef, look]));
  const groups = new Map<string, GeneratedNpcAppearance[]>();
  for (const look of catalog) {
    const familyRef = look.look?.familyRef ?? look.assetRef;
    const members = groups.get(familyRef) ?? [];
    members.push(look);
    groups.set(familyRef, members);
  }
  return [...groups].map(([ref, looks]) => {
    const defaultLook = byRef.get(ref);
    if (!defaultLook) throw new Error(`Missing default appearance: ${ref}`);
    return { ref, defaultLook, looks };
  });
}

export const NPC_APPEARANCE_FAMILIES = buildNpcAppearanceFamilies(
  NPC_APPEARANCE_CATALOG
);

/** Resolve one deliberate control change to one complete, published look ref. */
export function chooseNpcAppearance(
  input: {
    currentRef?: string;
    control: 'family' | 'style' | 'skinPalette';
    value: string;
  },
  families: readonly NpcAppearanceFamily[] = NPC_APPEARANCE_FAMILIES
): string {
  if (input.control === 'family' && input.value === '') return '';
  const current = families
    .flatMap((family) => family.looks)
    .find((look) => look.assetRef === input.currentRef);
  const familyRef =
    input.control === 'family'
      ? input.value
      : (current?.look?.familyRef ?? current?.assetRef);
  const family = families.find((candidate) => candidate.ref === familyRef);
  if (!family) throw new Error('Choose an available appearance first.');
  if (input.control === 'family') {
    const retained =
      current?.look &&
      family.looks.find(
        (look) =>
          look.look?.style === current.look!.style &&
          look.look?.skinPalette === current.look!.skinPalette
      );
    return retained?.assetRef ?? family.defaultLook.assetRef;
  }
  if (!current?.look || !family.defaultLook.look)
    throw new Error('This appearance has no published palette choices.');
  const style = input.control === 'style' ? input.value : current.look.style;
  const skinPalette =
    input.control === 'skinPalette' ? input.value : current.look.skinPalette;
  const selected = family.looks.find(
    (look) =>
      look.look?.style === style && look.look?.skinPalette === skinPalette
  );
  if (!selected)
    throw new Error('That style and skin palette combination is unavailable.');
  return selected.assetRef;
}
