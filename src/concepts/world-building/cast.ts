/**
 * The cast: every monster ref the document uses, one member per ref
 * (rpg-project#575, design R3/R4).
 *
 * DERIVED, NEVER A SECOND LIST. A member is read from three places the
 * document already has: `scope.templates` (the stat block, followed by id),
 * `scene.creaturePalette` (the studio's defaults for new placements) and
 * `room.monsterDeclarations` (the placements). Nothing here stores a cast.
 *
 * THE WEB DOES NOT RESOLVE THE RULEBOOK. Whether a ref names a real monster,
 * and whether a template id shadows one, are the rulebook's questions. The
 * lists below only decide what the studio offers and what it warns about;
 * nothing here refuses on them.
 */
import { PALETTE_MONSTERS, paletteNameForRef } from '@/author/paletteData';
import {
  NPC_APPEARANCE_FAMILIES,
  type NpcAppearanceFamily,
} from '@/npc-appearances/npcAppearanceChoices';
import { parseRef } from '@/utils/refs';
import {
  setCreaturePalette,
  type CreaturePaletteEntry,
} from './creaturePalette';
import {
  validateMonsterTemplates,
  type MonsterTemplate,
  type SiteTemplates,
} from './monsterTemplates';
import type { RoomDraftDocument } from './roomDraft';
import type { IdFactory } from './types';

const MONSTER_PREFIX = 'dnd5e:monsters:';
const HUMAN_REF = 'dnd5e:monsters:human';

/** The rulebook monsters the studio lists: the palette's monsters plus
 * Human, the released base for custom stat blocks. A list to offer and warn
 * from, never a gate. */
export const RULEBOOK_MONSTER_REFS: readonly string[] = [
  ...PALETTE_MONSTERS.map((monster) => monster.ref),
  ...(PALETTE_MONSTERS.some((monster) => monster.ref === HUMAN_REF)
    ? []
    : [HUMAN_REF]),
];

export function rulebookMonsterName(ref: string): string {
  return ref === HUMAN_REF ? 'Human' : paletteNameForRef(ref);
}

export interface CastMember {
  /** dnd5e:monsters:<id>; the identity. */
  readonly ref: string;
  /** The ref's id after the type. */
  readonly id: string;
  /** template when templates[id] exists. */
  readonly source: 'template' | 'rulebook';
  readonly template?: Readonly<MonsterTemplate>;
  /** The first palette entry with this ref. */
  readonly defaults?: Readonly<CreaturePaletteEntry>;
  /** Later palette entries with this ref, shown as unused looks. */
  readonly unusedDefaults: readonly CreaturePaletteEntry[];
  /** The template id also names a listed rulebook monster; warned only. */
  readonly shadowsRulebook: boolean;
  /** monsterDeclarations[].id with this ref, in authored order. */
  readonly placements: readonly string[];
  /** template.name, else defaults.name, else the rulebook's name. */
  readonly name: string;
}

/** A cast member still has placements; deleting it would leave them naming
 * nothing. */
export class CastMemberInUse extends Error {
  readonly placements: readonly string[];
  constructor(name: string, placements: readonly string[]) {
    const count = placements.length;
    super(
      `${name} has ${count} placement${count === 1 ? '' : 's'}: ${placements.join(', ')}. Remove ${count === 1 ? 'it' : 'them'} from the map or change ${count === 1 ? 'its' : 'their'} cast member first.`
    );
    this.name = 'CastMemberInUse';
    this.placements = [...placements];
  }
}

function templateIdOf(
  ref: string,
  templates: SiteTemplates | undefined
): string | undefined {
  if (!ref.startsWith(MONSTER_PREFIX)) return undefined;
  const id = ref.slice(MONSTER_PREFIX.length);
  return templates && Object.hasOwn(templates, id) ? id : undefined;
}

/** One member per monster ref used by a template, a palette entry or a
 * placement. Order: templates in key order, then the other refs in the order
 * they are first mentioned (palette entries, then placements). Never writes. */
export function castOf(document: Readonly<RoomDraftDocument>): CastMember[] {
  const templates = document.scope.templates;
  const palette = document.draft.scene.creaturePalette ?? [];
  const declarations = document.draft.room.monsterDeclarations;
  const refs = [
    ...Object.keys(templates ?? {}).map((id) => `${MONSTER_PREFIX}${id}`),
  ];
  for (const ref of [
    ...palette.map((entry) => entry.ref),
    ...declarations.map((monster) => monster.ref),
  ])
    if (!refs.includes(ref)) refs.push(ref);
  return refs.map((ref) => {
    const templateId = templateIdOf(ref, templates);
    const template =
      templateId === undefined ? undefined : templates![templateId];
    const entries = palette.filter((entry) => entry.ref === ref);
    const defaults = entries[0];
    return {
      ref,
      id: parseRef(ref)?.id ?? ref,
      source: template ? 'template' : 'rulebook',
      ...(template ? { template } : {}),
      ...(defaults ? { defaults } : {}),
      unusedDefaults: entries.slice(1),
      shadowsRulebook: !!template && RULEBOOK_MONSTER_REFS.includes(ref),
      placements: declarations
        .filter((monster) => monster.ref === ref)
        .map((monster) => monster.id),
      name: template?.name || defaults?.name || rulebookMonsterName(ref),
    };
  });
}

export function castMemberOf(
  document: Readonly<RoomDraftDocument>,
  ref: string
): CastMember | undefined {
  return castOf(document).find((member) => member.ref === ref);
}

/** A placement's stat block is in the cast when its ref names a template or
 * a listed rulebook monster. Anything else is warned, never refused. */
export function statBlockIsKnown(
  document: Readonly<RoomDraftDocument>,
  ref: string
): boolean {
  return (
    templateIdOf(ref, document.scope.templates) !== undefined ||
    RULEBOOK_MONSTER_REFS.includes(ref)
  );
}

function requireMember(
  document: Readonly<RoomDraftDocument>,
  ref: string
): CastMember {
  const member = castMemberOf(document, ref);
  if (!member) throw new Error(`${ref} is not in the cast.`);
  return member;
}

function withTemplates(
  document: Readonly<RoomDraftDocument>,
  templates: SiteTemplates
): RoomDraftDocument {
  const valid = validateMonsterTemplates(templates);
  const scope = { ...document.scope };
  if (Object.keys(valid).length) scope.templates = valid;
  else delete scope.templates;
  return { draft: document.draft, scope };
}

function withPalette(
  document: Readonly<RoomDraftDocument>,
  entries: readonly CreaturePaletteEntry[]
): RoomDraftDocument {
  return {
    scope: document.scope,
    draft: {
      ...document.draft,
      scene: setCreaturePalette(document.draft.scene, entries),
    },
  };
}

/** Move every placement and palette entry from one ref to another, keeping
 * order. Placement ids, looks, cells and bindings are untouched. */
function moveRefs(
  document: Readonly<RoomDraftDocument>,
  from: string,
  to: string
): RoomDraftDocument {
  const next = withPalette(
    document,
    (document.draft.scene.creaturePalette ?? []).map((entry) =>
      entry.ref === from ? { ...entry, ref: to } : entry
    )
  );
  return {
    scope: next.scope,
    draft: {
      ...next.draft,
      room: {
        ...next.draft.room,
        monsterDeclarations: next.draft.room.monsterDeclarations.map(
          (monster) =>
            monster.ref === from ? { ...monster, ref: to } : monster
        ),
      },
    },
  };
}

function requireFreshTemplateId(
  document: Readonly<RoomDraftDocument>,
  toId: string,
  fromRef?: string
): string {
  const ref = `${MONSTER_PREFIX}${toId}`;
  const parsed = parseRef(ref);
  if (!parsed || parsed.idParts.length !== 1)
    throw new Error(`templates.${toId}: id must be one reference segment`);
  if (Object.hasOwn(document.scope.templates ?? {}, toId))
    throw new Error(`templates.${toId}: a stat block with this id exists`);
  if (ref !== fromRef && castMemberOf(document, ref))
    throw new Error(`${ref} is already a cast member.`);
  return ref;
}

/** Save a member's stat block and/or its defaults. A new ref with a template
 * creates a template member. A default faction must name a declared faction;
 * a default look must be a published appearance family. */
export function saveCastMember(
  document: Readonly<RoomDraftDocument>,
  input: {
    ref: string;
    template?: MonsterTemplate;
    defaults?: Omit<CreaturePaletteEntry, 'id' | 'ref'>;
  },
  idFactory: IdFactory,
  families: readonly NpcAppearanceFamily[] = NPC_APPEARANCE_FAMILIES
): RoomDraftDocument {
  let next: RoomDraftDocument = document;
  if (input.template) {
    if (!input.ref.startsWith(MONSTER_PREFIX))
      throw new Error(`${input.ref} cannot have a stat block.`);
    const id = input.ref.slice(MONSTER_PREFIX.length);
    const templates = { ...(next.scope.templates ?? {}) };
    if (!Object.hasOwn(templates, id))
      requireFreshTemplateId(next, id, input.ref);
    templates[id] = input.template;
    next = withTemplates(next, templates);
  }
  if (input.defaults) {
    const { faction, modelRef, name } = input.defaults;
    if (
      faction !== undefined &&
      !(next.scope.factions ?? []).some((entry) => entry.id === faction)
    )
      throw new Error(
        `Default faction ${faction} is not a faction in this encounter.`
      );
    if (!families.some((family) => family.ref === modelRef))
      throw new Error(`Default look ${modelRef} is not a published NPC model.`);
    const entries = next.draft.scene.creaturePalette ?? [];
    const index = entries.findIndex((entry) => entry.ref === input.ref);
    const entry: CreaturePaletteEntry = {
      id: index >= 0 ? entries[index]!.id : idFactory(),
      name,
      ref: input.ref,
      modelRef,
      ...(faction !== undefined ? { faction } : {}),
    };
    next = withPalette(
      next,
      index >= 0
        ? entries.map((item, at) => (at === index ? entry : item))
        : [...entries, entry]
    );
  }
  return next;
}

/** Rename a template member's id: the template key (kept in its place),
 * every placement's ref and every palette entry's ref, in one document. */
export function renameCastMember(
  document: Readonly<RoomDraftDocument>,
  from: string,
  toId: string
): RoomDraftDocument {
  const member = requireMember(document, from);
  if (member.source !== 'template')
    throw new Error(
      "A rulebook monster's id is its kind. Give it a stat block to rename it."
    );
  if (toId === member.id) return document as RoomDraftDocument;
  const to = requireFreshTemplateId(document, toId);
  const templates = Object.fromEntries(
    Object.entries(document.scope.templates ?? {}).map(([id, template]) =>
      id === member.id ? [toId, template] : [id, template]
    )
  );
  return moveRefs(withTemplates(document, templates), from, to);
}

/** Give a rulebook member a stat block: templates[templateId] = { base: ref },
 * and its placements and defaults move to the new ref, so the kind and its
 * placements stay one member. */
export function adoptCastMember(
  document: Readonly<RoomDraftDocument>,
  ref: string,
  templateId: string
): RoomDraftDocument {
  const member = requireMember(document, ref);
  if (member.source !== 'rulebook')
    throw new Error(`${member.name} already has a stat block.`);
  const to = requireFreshTemplateId(document, templateId);
  const templates = {
    ...(document.scope.templates ?? {}),
    [templateId]: { base: ref },
  };
  return moveRefs(withTemplates(document, templates), ref, to);
}

/** Delete a member with no placements: its template and every palette entry
 * with its ref. A member with placements throws CastMemberInUse. */
export function removeCastMember(
  document: Readonly<RoomDraftDocument>,
  ref: string
): RoomDraftDocument {
  const member = requireMember(document, ref);
  if (member.placements.length)
    throw new CastMemberInUse(member.name, member.placements);
  let next: RoomDraftDocument = document;
  if (member.source === 'template') {
    const templates = { ...(document.scope.templates ?? {}) };
    delete templates[member.id];
    next = withTemplates(next, templates);
  }
  return withPalette(
    next,
    (next.draft.scene.creaturePalette ?? []).filter(
      (entry) => entry.ref !== ref
    )
  );
}

/** Remove one unused palette entry (a later recipe on a member's ref). The
 * member's defaults entry is not removable here. */
export function removeUnusedLook(
  document: Readonly<RoomDraftDocument>,
  ref: string,
  entryId: string
): RoomDraftDocument {
  const member = requireMember(document, ref);
  if (!member.unusedDefaults.some((entry) => entry.id === entryId))
    throw new Error('That look is not an unused look of this cast member.');
  return withPalette(
    document,
    (document.draft.scene.creaturePalette ?? []).filter(
      (entry) => entry.id !== entryId
    )
  );
}

/** The appearance family a member's default look belongs to. */
export function defaultLookFamily(
  member: Pick<CastMember, 'defaults'>,
  families: readonly NpcAppearanceFamily[] = NPC_APPEARANCE_FAMILIES
): NpcAppearanceFamily | undefined {
  const modelRef = member.defaults?.modelRef;
  return modelRef === undefined
    ? undefined
    : families.find((family) => family.ref === modelRef);
}
