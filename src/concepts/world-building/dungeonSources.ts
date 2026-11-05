/**
 * THE FILES DRAFTS WERE READ FROM (rpg-project#857). A draft read from a
 * dungeon file carries the file's token as `sourceRef`; the encoder splices
 * the studio's changes into that file, so what the studio does not author, a
 * comment, the author's layout or a field it carries, is written back as it
 * was read. The token is the text's own hash, so the same bytes read twice are
 * the same draft.
 *
 * The text lives here, bounded (`MAX_SOURCES`, least recently used out), and
 * in the studio's storage beside the draft (`saveDungeonSource`), so a reload
 * finds it again. A draft whose text is in neither has LOST its source
 * (`dungeonSourceLost`): the studio says so and asks before a save writes the
 * canonical encoding over the file it was read from.
 */
import type { KeyValueStorage } from './types';

/** How many files the studio holds in memory at once. */
export const MAX_SOURCES = 8;

/** The storage key the open draft's file text is kept under, beside the
 * draft's own `ROOM_DRAFT_STORAGE_KEY`. */
export const DUNGEON_SOURCE_STORAGE_KEY =
  'rpg.concepts.world-building.room-draft-source.v1';

const sources = new Map<string, string>();

function tokenOf(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `src-${(hash >>> 0).toString(16)}-${source.length}`;
}

/** Remember a file and answer the token a draft read from it carries. */
export function rememberDungeonSource(source: string): string {
  const token = tokenOf(source);
  sources.delete(token);
  sources.set(token, source);
  while (sources.size > MAX_SOURCES)
    sources.delete(sources.keys().next().value as string);
  return token;
}

/** The file a token names, or `undefined` when the studio no longer holds
 * it. A lookup counts as a use. */
export function dungeonSourceOf(token: string | undefined): string | undefined {
  if (token === undefined) return undefined;
  const source = sources.get(token);
  if (source === undefined) return undefined;
  sources.delete(token);
  sources.set(token, source);
  return source;
}

/** A draft read from a file whose text the studio no longer holds: a save
 * would write the canonical encoding over that file. */
export function dungeonSourceLost(draft: { sourceRef?: string }): boolean {
  return draft.sourceRef !== undefined && !sources.has(draft.sourceRef);
}

/** Keep the draft's file text in storage under its token. A draft the studio
 * made keeps nothing. A quota failure is answered, not thrown: the draft itself
 * is saved either way, and a later load says the text is lost. */
export function saveDungeonSource(
  storage: KeyValueStorage,
  draft: { sourceRef?: string }
): string | null {
  try {
    const text = dungeonSourceOf(draft.sourceRef);
    // Nothing to keep: a stored text for another token is ignored on load.
    if (text === undefined) return null;
    const stored = storage.getItem(DUNGEON_SOURCE_STORAGE_KEY);
    if (stored !== null && stored.startsWith(`{"token":"${draft.sourceRef}"`))
      return null;
    storage.setItem(
      DUNGEON_SOURCE_STORAGE_KEY,
      JSON.stringify({ token: draft.sourceRef, text })
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Bring a stored draft's file text back into memory, when storage holds the
 * text its token names. Anything else in storage is ignored. */
export function loadDungeonSource(
  storage: KeyValueStorage,
  draft: { sourceRef?: string }
): void {
  if (draft.sourceRef === undefined || sources.has(draft.sourceRef)) return;
  try {
    const stored = storage.getItem(DUNGEON_SOURCE_STORAGE_KEY);
    if (stored === null) return;
    const { token, text } = JSON.parse(stored) as {
      token?: unknown;
      text?: unknown;
    };
    if (
      token === draft.sourceRef &&
      typeof text === 'string' &&
      tokenOf(text) === token
    )
      rememberDungeonSource(text);
  } catch {
    // Unreadable stored text is a lost source, which the studio announces.
  }
}

/** Forget every file (tests). */
export function forgetDungeonSources(): void {
  sources.clear();
}
