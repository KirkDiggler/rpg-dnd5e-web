/**
 * THE KEY THIS DRAFT WAS LAST SAVED UNDER (R16, S6-T7). "Once per key per
 * editor session" means per draft, not per React mount: an author who
 * plays, comes back and plays again is still in the same session, so the
 * overwrite ask must not return. The studio keeps one record beside the
 * local draft: the draft id and the key its last successful server save
 * wrote. It is studio state, never a document field. A missing, unreadable
 * or malformed record is no record.
 */
import type { KeyValueStorage } from '../world-building/types';

export const PUBLICATION_STORAGE_KEY =
  'rpg.concepts.encounter-studio.publication.v1';

export interface PublicationRecord {
  roomId: string;
  key: string;
}

/** The browser's storage, the same store the owner defaults to. */
export const browserPublicationStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

export function readPublication(
  storage: KeyValueStorage
): PublicationRecord | null {
  try {
    const text = storage.getItem(PUBLICATION_STORAGE_KEY);
    if (!text) return null;
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as PublicationRecord).roomId === 'string' &&
      typeof (value as PublicationRecord).key === 'string' &&
      (value as PublicationRecord).roomId !== '' &&
      (value as PublicationRecord).key !== ''
    ) {
      const { roomId, key } = value as PublicationRecord;
      return { roomId, key };
    }
    return null;
  } catch {
    return null;
  }
}

/** False when the store refused the write; the save itself stands. */
export function writePublication(
  storage: KeyValueStorage,
  record: PublicationRecord
): boolean {
  try {
    storage.setItem(PUBLICATION_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Forget the remembered save (an import is a different file). The store
 * has no remove, so the record becomes one `readPublication` ignores. */
export function clearPublication(storage: KeyValueStorage): boolean {
  try {
    storage.setItem(PUBLICATION_STORAGE_KEY, 'null');
    return true;
  } catch {
    return false;
  }
}
