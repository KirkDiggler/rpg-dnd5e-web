import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { isDeathSaveExecutableShape } from './deathSaveDeclaration';
import type { QuickOverflowGroup } from './quickOverflow';
import { isExecutableVerb } from './verbRegistry';

/**
 * Presentation-only ordering hints. They are supplied by the concept (or a
 * future caller), never derived from game refs, class, costs, or resources.
 * The server remains the source of membership and availability.
 */
export interface OrganizedActionPresentation {
  /** Declaration ids to place in the compact quick row, in this exact order. */
  quickDeclarationIds?: readonly string[];
  /** Explicit group facts for width-driven overflow; unknown offers are not guessed. */
  quickGroupByDeclarationId?: Readonly<Record<string, QuickOverflowGroup>>;
  /** Explicit concept-only section labels keyed by current declaration id. */
  sectionByDeclarationId?: Readonly<
    Record<string, 'spells' | 'abilities' | 'items' | 'actions'>
  >;
}

export type OrganizedActionSection =
  | 'spells'
  | 'abilities'
  | 'items'
  | 'actions';

export interface OrganizedDeclarations {
  quick: readonly Declaration[];
  sections: Readonly<Record<OrganizedActionSection, readonly Declaration[]>>;
}

const EMPTY_SECTIONS: Readonly<
  Record<OrganizedActionSection, readonly Declaration[]>
> = {
  spells: [],
  abilities: [],
  items: [],
  actions: [],
};

/**
 * Keeps the current Afford order intact. Availability deliberately does not
 * participate: a spent offer stays in its familiar place and only its provider
 * authored refusal changes. End Turn has its existing separate control.
 */
export function organizeDeclarations(
  declarations: readonly Declaration[],
  presentation: OrganizedActionPresentation | undefined
): OrganizedDeclarations {
  // ASKED OF THE ONE REGISTRY, not restated as a list (rpg-dnd5e-web#1104).
  // This filter decides what the dock DRAWS, so a verb missing from it is not
  // a dead button — it is no button at all, dropped before anything
  // downstream ever sees it. That was one of six hand-written lists; it is
  // now one question, and a verb the table does not know is a red test in
  // verbRegistry.test.ts rather than a missing row on a walk.
  //
  // THE DEATH-SAVE SHAPE CHECK STAYS HERE, deliberately. It is a fact about
  // one DECLARATION's shape rather than about the verb, so the registry has
  // no business answering it.
  const executable = declarations.filter(
    (declaration) =>
      isExecutableVerb(declaration.verb) &&
      (declaration.verb !== Verb.DEATH_SAVE ||
        isDeathSaveExecutableShape(declaration, 'display'))
  );
  const byId = new Map(
    executable.map((declaration) => [declaration.id, declaration])
  );
  const quick = (presentation?.quickDeclarationIds ?? [])
    .map((id) => byId.get(id))
    .filter(
      (declaration): declaration is Declaration => declaration !== undefined
    );
  const quickIds = new Set(quick.map((declaration) => declaration.id));
  const sections: Record<OrganizedActionSection, Declaration[]> = {
    spells: [],
    abilities: [],
    items: [],
    actions: [],
  };

  for (const declaration of executable) {
    if (quickIds.has(declaration.id)) continue;
    const hinted = presentation?.sectionByDeclarationId?.[declaration.id];
    const section =
      hinted ??
      (declaration.verb === Verb.CAST
        ? 'spells'
        : declaration.verb === Verb.ACTIVATE
          ? 'abilities'
          : 'actions');
    sections[section].push(declaration);
  }

  return { quick, sections: { ...EMPTY_SECTIONS, ...sections } };
}

/** Resolve an id against the current props at dispatch time, never a captured offer. */
export function currentExecutableDeclaration(
  declarations: readonly Declaration[],
  id: string
): Declaration | undefined {
  return declarations.find(
    (declaration) =>
      declaration.id === id &&
      declaration.available &&
      isExecutableVerb(declaration.verb) &&
      (declaration.verb !== Verb.DEATH_SAVE ||
        isDeathSaveExecutableShape(declaration, 'display'))
  );
}
