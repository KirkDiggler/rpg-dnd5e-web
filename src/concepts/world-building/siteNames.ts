/**
 * THE NAMES THE FILE DEFINES, FOR A FORM TO OFFER (rpg-project#975). A
 * row's grant picks a record, a region or a holding by name; the form offers
 * what this site defines, never a free guess at an id:
 *
 * - records: the site's `intel` ids;
 * - regions: the site's regions, by id with their names;
 * - statuses: the site's `statuses`, by id with their names;
 * - topics: every topic the file mentions — given by a line's row or a
 *   conversation's outcome (`give: { topic }`), or asked for by a
 *   `noted:` requirement (rpg-project#1005). A topic is declared by
 *   mention, so the form also takes a new one typed.
 *
 * Provided once at the document's root (`WorldBuildingConcept`), as the
 * bundles are; a form outside it offers nothing and keeps what is written.
 */
import { createContext } from 'react';
import {
  grantedTopics,
  interactionIds,
  recipeBeats,
  recipeStates,
} from './interactionOutcomes';
import type { SiteScope } from './siteScope';

export interface SiteConversation {
  readonly id: string;
  /** The states its recipe declares, in the file's order. */
  readonly states: readonly string[];
  /** The beats its recipe listens for, in the file's order. */
  readonly beats: readonly string[];
}

export interface SiteNames {
  readonly records: readonly string[];
  readonly regions: readonly { readonly id: string; readonly name: string }[];
  /** Every topic the file mentions, given or asked for. Which of them
   * something gives is the engine's to say (a conversation's arrest gives
   * topics of its own): a requirement on one nothing gives is refused at
   * its field, in the engine's words. */
  readonly topics: readonly string[];
  /** The site's status effects (`statuses`, a mapping): each key with its
   * `name` when that is text, else the id; in the file's order. Empty when
   * `statuses` is anything else. */
  readonly statuses: readonly { readonly id: string; readonly name: string }[];
  /** The site's conversations (root `interactions`). */
  readonly conversations: readonly SiteConversation[];
  /** The site's doors — every wall opening's door — by id, in wall order:
   * what a post may hold (rpg-project#975 D). */
  readonly doors: readonly string[];
  /** Every fact the file mentions by name (`fact: <id>` anywhere — taught,
   * required, waited for), sorted: a fact is declared by mention, and a new
   * requirement starts on one (rpg-project#975 B). A pattern is not a
   * fact. */
  readonly facts: readonly string[];
}

export const NO_SITE_NAMES: SiteNames = Object.freeze({
  records: [],
  regions: [],
  topics: [],
  statuses: [],
  conversations: [],
  doors: [],
  facts: [],
});

export const SiteNamesContext = createContext<SiteNames>(NO_SITE_NAMES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every topic a list of lines gives or asks for. */
function lineTopics(options: unknown, into: Set<string>): void {
  if (!Array.isArray(options)) return;
  const asked = (requirement: unknown): void => {
    if (Array.isArray(requirement)) return requirement.forEach(asked);
    if (!isRecord(requirement)) return;
    if (typeof requirement.noted === 'string') into.add(requirement.noted);
    if (requirement.not !== undefined) asked(requirement.not);
  };
  for (const option of options) {
    if (!isRecord(option)) continue;
    asked(option.requires);
    for (const verdict of ['success', 'failure'] as const) {
      const rows = option[verdict];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const topic =
          isRecord(row) && isRecord(row.give) ? row.give.topic : undefined;
        if (typeof topic === 'string' && topic !== '') into.add(topic);
      }
    }
  }
}

/** Every `fact: <id>` a value holds, at any depth. */
function factsIn(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) return value.forEach((v) => factsIn(v, into));
  if (!isRecord(value)) return;
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'fact' && typeof inner === 'string') {
      if (inner !== '' && !inner.startsWith('/')) into.add(inner);
    } else factsIn(inner, into);
  }
}

/** The keys of a `statuses` mapping, each with its name. */
function statusesIn(statuses: unknown): { id: string; name: string }[] {
  if (!isRecord(statuses)) return [];
  return Object.entries(statuses).map(([id, written]) => {
    const name = isRecord(written) ? written.name : undefined;
    return { id, name: typeof name === 'string' ? name : id };
  });
}

export function siteNamesOf(
  scope: Readonly<SiteScope>,
  room: {
    readonly regions?: readonly { id: string; name?: string }[];
    readonly monsterBindings?: Readonly<Record<string, unknown>>;
    readonly walls?: readonly {
      readonly openings: readonly { readonly door?: { readonly id: string } }[];
    }[];
    readonly propBindings?: Readonly<Record<string, unknown>>;
    readonly doorBindings?: Readonly<Record<string, unknown>>;
  }
): SiteNames {
  const facts = new Set<string>();
  factsIn(
    [
      room.monsterBindings,
      room.propBindings,
      room.doorBindings,
      scope.factions,
      scope.dispositions,
      scope.intel,
      scope.endings,
      scope.unread?.interactions,
      // A conversation's lines written once (rpg-project#1025).
      scope.unread?.conversations,
    ],
    facts
  );
  const topics = new Set<string>(grantedTopics(scope));
  for (const binding of Object.values(room.monsterBindings ?? {}))
    if (isRecord(binding)) lineTopics(binding.options, topics);
  for (const faction of scope.factions ?? [])
    lineTopics((faction as { options?: unknown }).options, topics);
  const conversations = scope.unread?.conversations;
  if (isRecord(conversations))
    for (const conversation of Object.values(conversations))
      if (isRecord(conversation)) lineTopics(conversation.lines, topics);
  return {
    records: (scope.intel ?? []).map((record) => record.id),
    regions: (room.regions ?? []).map((region) => ({
      id: region.id,
      name: region.name || region.id,
    })),
    topics: [...topics].sort(),
    statuses: statusesIn(scope.unread?.statuses),
    doors: (room.walls ?? []).flatMap((wall) =>
      wall.openings.flatMap((opening) =>
        opening.door ? [opening.door.id] : []
      )
    ),
    facts: [...facts].sort(),
    conversations: interactionIds(scope).map((id) => ({
      id,
      states: recipeStates(scope, id),
      beats: recipeBeats(scope, id),
    })),
  };
}
