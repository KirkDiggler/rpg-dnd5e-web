import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from '@/concepts/world-building/roomDraft';
import { MAX_JSON_LENGTH } from '@/concepts/world-building/serialization';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';

export const ROOM_DOCUMENT_KIND = 'room-authoring-draft' as const;
export const ROOM_DOCUMENT_VERSION = 2 as const;

export function isRoomDocumentJson(json: string): boolean {
  try {
    const value = JSON.parse(json) as { kind?: unknown };
    return value.kind === ROOM_DOCUMENT_KIND;
  } catch {
    return false;
  }
}

export function encodeRoomDocument(draft: RoomDraft): string {
  const validated = JSON.parse(stringifyRoomDraft(draft)) as {
    draft: RoomDraft;
  };
  const encoded = JSON.stringify(
    {
      kind: ROOM_DOCUMENT_KIND,
      version: ROOM_DOCUMENT_VERSION,
      draft: validated.draft,
    },
    null,
    2
  );
  if (encoded.length > MAX_JSON_LENGTH) {
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  }
  return encoded;
}

export function decodeRoomDocumentJson(json: string): RoomDraft {
  if (json.length > MAX_JSON_LENGTH)
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  const envelope = JSON.parse(json) as {
    kind?: unknown;
    version?: unknown;
    draft?: unknown;
  };
  if (envelope.kind !== ROOM_DOCUMENT_KIND)
    throw new Error('Expected a room authoring snapshot.');
  if (envelope.version !== 1 && envelope.version !== 2)
    throw new Error('Unsupported room snapshot version.');
  const draft = envelope.draft as Record<string, unknown> | undefined;
  if (!draft) throw new Error('Room snapshot draft is missing.');
  /** Envelope version 1 historically carried a draft version 2; the current
   * envelope version 2 carries draft version 3. Mismatched, invalid or newer
   * combinations are refused rather than reinterpreted, and the room document
   * envelope never absorbs a draft version that was never written under it. */
  if (envelope.version === 1 && draft.version !== 2)
    throw new Error(
      'Expected a version 2 room draft in a version 1 room snapshot.'
    );
  if (envelope.version === 2 && draft.version !== 3)
    throw new Error(
      'Expected a version 3 room draft in a version 2 room snapshot.'
    );
  return parseRoomDraftJson(
    JSON.stringify({
      kind: 'rpg-room-authoring-draft',
      version: envelope.version === 1 ? 2 : 3,
      draft,
    })
  );
}

export function isRoomDocument(composition: Composition): boolean {
  return isRoomDocumentJson(composition.json);
}
