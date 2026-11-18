/**
 * A LINE'S ROW GRANTS ONE THING, AND A LINE IS SAID AT A LOUDNESS
 * (rpg-project#975 A). The edits the form makes, as the engine reads them
 * (`dungeonspec` `AnswerSpec`, `GiveSpec`, `RelocateSpec`):
 *
 * - `give: { topic, to, about, heard_by? }` (rpg-project#1005; the retired
 *   `recognize` is never read and is kept as written) — to is always
 *   `spoken_to`; about is `party_in_sight` or `speaker`; `heard_by` is
 *   `carriers_who_witnessed` or absent;
 * - `tells: <intel record id>`;
 * - `relocate: { to: <region id>, words, rounds? }` — rounds absent is none;
 * - `loudness: whisper | speak | shout | scream`, absent for speak.
 *
 * A row has at most one grant: choosing one takes the others away, so the
 * form cannot write the engine's "a row grants one thing" refusal. Every
 * other key of the row is kept as written, in its place.
 */
import type { AnswerEntryShape } from './answerTableShape';
import type { SiteNames } from './siteNames';

export const ROW_GRANTS = ['give', 'tells', 'relocate'] as const;
export type RowGrant = (typeof ROW_GRANTS)[number];

export const GIVE_TO = 'spoken_to';
export const GIVE_ABOUT = ['party_in_sight', 'speaker'] as const;
export const GIVE_HEARD_BY = 'carriers_who_witnessed';

/** The four loudnesses, quietest first; absent is speak. */
export const LOUDNESSES = ['whisper', 'speak', 'shout', 'scream'] as const;

export interface GiveShape {
  topic: string;
  to: string;
  about: string;
  heard_by?: string;
}

export interface RelocationShape {
  to: string;
  words: string;
  rounds?: number;
}

/** A row as the grant edits read it. */
export type GrantingRow = AnswerEntryShape & {
  give?: GiveShape;
  tells?: string;
  relocate?: RelocationShape;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The grant a row holds, or undefined for none. */
export function grantOf(row: AnswerEntryShape): RowGrant | undefined {
  const raw = row as Record<string, unknown>;
  return ROW_GRANTS.find((grant) => raw[grant] !== undefined);
}

/** The row with exactly this grant (or none), started from what the site
 * defines: its first topic, record or region. */
export function withGrant(
  row: AnswerEntryShape,
  grant: RowGrant | undefined,
  names: SiteNames
): GrantingRow {
  if (grant !== undefined && grantOf(row) === grant) return row;
  const next = { ...row } as Record<string, unknown>;
  for (const key of ROW_GRANTS) delete next[key];
  switch (grant) {
    case 'give':
      next.give = {
        topic: names.topics[0] ?? '',
        to: GIVE_TO,
        about: GIVE_ABOUT[0],
      } satisfies GiveShape;
      break;
    case 'tells':
      next.tells = names.records[0] ?? '';
      break;
    case 'relocate':
      next.relocate = {
        to: names.regions[0]?.id ?? '',
        words: '',
      } satisfies RelocationShape;
      break;
  }
  return next as GrantingRow;
}

/** The row's give with one field changed, the others as written. */
export function withGive(
  row: GrantingRow,
  patch: { topic?: string; about?: string; heard?: boolean }
): GrantingRow {
  const was = isRecord(row.give) ? row.give : undefined;
  const next: GiveShape = {
    ...(was as GiveShape | undefined),
    topic: patch.topic ?? was?.topic ?? '',
    to: GIVE_TO,
    about: patch.about ?? was?.about ?? GIVE_ABOUT[0],
  };
  if (patch.heard === true) next.heard_by = GIVE_HEARD_BY;
  if (patch.heard === false) delete next.heard_by;
  return { ...row, give: next };
}

/** The row telling this record. */
export function withTells(row: GrantingRow, record: string): GrantingRow {
  return { ...row, tells: record };
}

/** The row's relocation with one field changed; rounds absent is none. */
export function withRelocation(
  row: GrantingRow,
  patch: { to?: string; words?: string; rounds?: number | null }
): GrantingRow {
  const was = isRecord(row.relocate) ? row.relocate : undefined;
  const next: RelocationShape = {
    ...(was as RelocationShape | undefined),
    to: patch.to ?? was?.to ?? '',
    words: patch.words ?? was?.words ?? '',
  };
  if (patch.rounds === null) delete next.rounds;
  else if (patch.rounds !== undefined) next.rounds = patch.rounds;
  return { ...row, relocate: next };
}

/** A line or row said at this loudness: '' is speak, written as nothing.
 * A new `loudness` is placed right after `say`, where the castle writes it;
 * an existing one keeps its place. */
export function withLoudness<T extends { loudness?: string }>(
  body: T,
  word: string
): T {
  const raw = body as Record<string, unknown>;
  if (word === '') {
    const next = { ...raw };
    delete next.loudness;
    return next as T;
  }
  if ('loudness' in raw) return { ...raw, loudness: word } as T;
  const next: Record<string, unknown> = {};
  let placed = false;
  for (const [key, value] of Object.entries(raw)) {
    next[key] = value;
    if (key === 'say') {
      next.loudness = word;
      placed = true;
    }
  }
  if (!placed) next.loudness = word;
  return next as T;
}

/** Whether a line names a conversation — it advances one, or requires one
 * (under a `not:` too): only then has a give other carriers who
 * witnessed it (`heard_by`). */
export function lineNamesConversation(option: unknown): boolean {
  if (!isRecord(option)) return false;
  if (option.advance !== undefined) return true;
  const names = (requirement: unknown): boolean => {
    if (Array.isArray(requirement)) return requirement.some(names);
    if (!isRecord(requirement)) return false;
    if (requirement.interaction !== undefined) return true;
    return requirement.not !== undefined && names(requirement.not);
  };
  return names(option.requires);
}
