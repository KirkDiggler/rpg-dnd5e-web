/**
 * THE DRAFT AS A FILE (rpg-project#578, H7, H8). Export writes exactly the
 * bytes `encodeSingleRoomDungeon` produces, the file the decoder, the API
 * registry and publishing all read. Import goes through the one decoder,
 * `readSingleRoomDungeon`, then the owner's `importCanonicalRoomYaml`. There
 * is no second codec here.
 */
import type { RoomDraft, RoomDraftDocument } from '../world-building/roomDraft';
import {
  encodeSingleRoomDungeon,
  readSingleRoomDungeon,
} from '../world-building/singleRoomDungeon';
import {
  renderScope,
  scopeFrom,
  type SiteScope,
} from '../world-building/siteScope';
import { defaultDungeonKeyForRoom } from '../world-building/useRoomPublishing';

/** The encoder's exact bytes for this document under `key`. Throws the
 * encoder's sentence for a document it refuses. */
export function exportDraftYaml(
  document: Readonly<RoomDraftDocument>,
  key: string
): string {
  return encodeSingleRoomDungeon({
    key,
    draft: document.draft,
    ...renderScope(document.scope),
  });
}

/** The export key when no file was imported for this draft (S4-Q2): a slug
 * of the draft's name, lower-case words joined by dashes, else the room
 * id's default key, else "encounter". */
export function defaultDraftKey(document: Readonly<RoomDraftDocument>): string {
  const slug = document.draft.name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || defaultDungeonKeyForRoom(document.draft.id) || 'encounter';
}

export type DraftFileRead =
  | {
      ok: true;
      key: string;
      draft: RoomDraft;
      scope: SiteScope;
    }
  | { ok: false; refusal: string };

export type ImportResult =
  | { ok: true; key: string }
  /** One sentence naming the field, or the dialect sentence. */
  | { ok: false; refusal: string };

/** Read a file without changing anything: the decoder's first refusal,
 * naming its field, or the dialect sentence for a multi-room file. */
export function readDraftYaml(text: string): DraftFileRead {
  let read: ReturnType<typeof readSingleRoomDungeon>;
  try {
    read = readSingleRoomDungeon(text);
  } catch (error) {
    return {
      ok: false,
      refusal: `Could not import: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (read.dialect === 'other')
    return {
      ok: false,
      refusal: `This file is a version ${read.version} dungeon, the multi-room dialect. The studio opens single-room files, version 3 or 4.`,
    };
  return { ok: true, key: read.key, draft: read.draft, scope: scopeFrom(read) };
}

/** Read the file and, if it decodes, replace the draft with it in one
 * undoable step. */
export function importDraftYaml(
  text: string,
  session: {
    importDocument(draft: RoomDraft, scope: SiteScope): boolean;
  }
): ImportResult {
  const read = readDraftYaml(text);
  if (!read.ok) return read;
  return session.importDocument(read.draft, read.scope)
    ? { ok: true, key: read.key }
    : {
        ok: false,
        refusal:
          'Could not import: the studio refused the document; the notice says why.',
      };
}
